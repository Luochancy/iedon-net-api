/*
*******************************************************************
handlers/auth.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { makeResponse, RESPONSE_CODE } from "../common/packet.js";
import {
  nullOrEmpty,
  signAsync,
  verifyAsync,
  getRandomCode,
  getRandomBase64,
  getRandomOTP,
  bcryptCompare,
  ASN_MIN,
  ASN_MAX,
  MAIL_REGEX,
} from "../common/helper.js";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import * as openpgp from "openpgp";
import { sendAuthMail } from "./services/mailService.js";

/*
    "REQUEST": {
        "action": "query"
        "asn": "4242422189"
    },
    
    "RESPONSE": {
        "person": "iEdon",
        "authState": "1a2b3c4d5e6f",
        "availableAuthMethods": [
            {
                id: 0,
                type: "mail",
                name: "xxx@localhost.localdomain"
            },
            {
                id: 1,
                type: "pgp-fingerprint",
                name: "FINGERPRINT"
            }
        ]
    },

    "REQUEST": {
        "action": "request",
        "authState": "1a2b3c4d5e6f",
        "authMethod": 0
    },

    "RESPONSE": {
        "authState": "6f5e4d3c2b1a",
        "authChallenge": "xxx@localhost.localdomain" | "encrypt this message with your key"
    },

    "REQUEST": {
        "action": "challenge"
        "authState": "6f5e4d3c2b1a",
        "data": "123456" | "====== PGP KEY ========"
    },

    "RESPONSE": {
        "authResult": true | false,
        "token": "ffffffffffffffffffffffffffffffffffff"
    }
*/

export default async function (c) {
  const action = c.var.body.action;
  switch (action) {
    case "query":
      return await query(c);
    case "request":
      return await request(c);
    case "challenge":
      return await challenge(c);
    case "open":
      return await open(c);
    default:
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }
}

const SupportedAuthType = {
  PASSWORD: 0,
  PGP_ASCII_ARMORED_CLEAR_SIGN: 1,
  EMAIL: 2,
  SSH: 3,
};

// Pending challenges live in redis rather than inside the signed state, which is
// signed but NOT encrypted. Keep the TTL in step with authHandler.stateSignOptions.
const AUTH_STATE_TTL_SECONDS = 600; // 10 minutes
const AUTH_STATE_MAX_ATTEMPTS = 5;

const authStateKey = (stateId) => `authstate:${stateId}`;

function checkAsn(asn) {
  if (nullOrEmpty(asn)) return false;
  const _asn = Number(asn);
  if (isNaN(_asn) || _asn < ASN_MIN || _asn > ASN_MAX) return false;
  return true;
}

async function queryAuthMethods(c, asn) {
  let availableAuthMethods = [];
  const addAuthMethods = (element) => {
    if (
      !availableAuthMethods.some(
        (entry) => entry.type === element.type && entry.data === element.data
      )
    ) {
      availableAuthMethods.push(element);
    }
  };

  const findAndAddAuthMethods = async (whoisData) => {
    const person = whoisData.person?.trim() || "";

    const addAuthMethod = (type, data) => {
      addAuthMethods({
        id: availableAuthMethods.length,
        type,
        data:
          type === SupportedAuthType.EMAIL
            ? data.trim().toLowerCase()
            : data.trim(),
      });
    };

    if (c.var.app.settings.mailSettings.enableLoginByMail) {
      const possibleEmailEntries = ["contact", "e-mail", "email", "mail"];

      for (const key of possibleEmailEntries) {
        const values = Array.isArray(whoisData[key])
          ? whoisData[key]
          : whoisData[key]
          ? [whoisData[key]]
          : [];

        for (const value of values) {
          const matches = value.trim().toLowerCase().match(MAIL_REGEX);
          if (matches)
            matches.forEach((mail) =>
              addAuthMethod(SupportedAuthType.EMAIL, mail)
            );
        }
      }
    }

    const pgpFingerprints = Array.isArray(whoisData["pgp-fingerprint"])
      ? whoisData["pgp-fingerprint"]
      : whoisData["pgp-fingerprint"]
      ? [whoisData["pgp-fingerprint"]]
      : [];

    pgpFingerprints.forEach((fingerprint) => {
      if (fingerprint.trim()) {
        addAuthMethod(
          SupportedAuthType.PGP_ASCII_ARMORED_CLEAR_SIGN,
          fingerprint
        );
      }
    });

    const sshPublicKeys = Array.isArray(whoisData["ssh-public-key"])
      ? whoisData["ssh-public-key"]
      : whoisData["ssh-public-key"]
      ? [whoisData["ssh-public-key"]]
      : [];

    sshPublicKeys.forEach((sshKey) => {
      if (sshKey.trim()) {
        addAuthMethod(SupportedAuthType.SSH, sshKey.trim());
      }
    });

    const authEntries = Array.isArray(whoisData.auth)
      ? whoisData.auth
      : whoisData.auth
      ? [whoisData.auth]
      : [];

    // DN42 registry stores auth credentials in `auth:` attributes, e.g.
    //   auth: pgp-fingerprint AABBCC...
    //   auth: ssh-ed25519 AAAAC3Nza... user@host
    for (const auth of authEntries) {
      const line = auth.trim();
      const splits = line.split(/\s+/);
      const scheme = splits[0]?.trim() || "";

      if (scheme === "pgp-fingerprint" && splits[1]) {
        addAuthMethod(
          SupportedAuthType.PGP_ASCII_ARMORED_CLEAR_SIGN,
          splits[1]
        );
      } else if (
        /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-|sk-(ssh-ed25519|ecdsa))/.test(
          scheme
        ) &&
        splits[1]
      ) {
        // Store the full public key line (type + base64 [+ comment]); the SSH
        // challenge handler splits it back into type/key to build allowed_signers.
        addAuthMethod(SupportedAuthType.SSH, line);
      }
    }

    return {
      person,
      adminC: whoisData["admin-c"],
      mntBy: whoisData["mnt-by"],
    };
  };

  const originalHash = await c.var.app.models.peerPreferences.findOne({
    attributes: ["password"],
    where: {
      asn: Number(asn),
    },
  });

  if (originalHash && originalHash.dataValues.password)
    addAuthMethods({
      id: availableAuthMethods.length,
      type: SupportedAuthType.PASSWORD,
    });

  let _person = "";
  try {
    const asnWhois = await c.var.app.whois.lookup(`AS${asn}`);
    const { person, adminC, mntBy } = await findAndAddAuthMethods(
      parseWhois(asnWhois)
    );
    _person = person;

    const _adminCArr =
      typeof adminC === "string"
        ? [adminC]
        : Array.isArray(adminC)
        ? adminC
        : [];
    const _mntByArr =
      typeof mntBy === "string" ? [mntBy] : Array.isArray(mntBy) ? mntBy : [];

    const lookup = async (arr) => {
      for (const item of arr) {
        const { person } = await findAndAddAuthMethods(
          parseWhois(await c.var.app.whois.lookup(item))
        );
        if (person) _person = person;
      }
    };

    // Run both lookups in parallel using Promise.all()
    await Promise.all([lookup(_adminCArr), lookup(_mntByArr)]);
  } catch (error) {
    c.var.app.logger
      .getLogger("app")
      .error(`Error during ASN lookup or processing: ${error.message}`, error);
  }

  if (_person === "") _person = `AS${asn}`;

  return {
    person: _person,
    availableAuthMethods,
  };
}

async function query(c) {
  if (!checkAsn(c.var.body.asn))
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  const asn = String(c.var.body.asn).trim();

  let { person, availableAuthMethods } = await queryAuthMethods(c, asn);

  let authState = "";
  try {
    authState = await signAsync(
      {
        asn,
        person,
        availableAuthMethods,
      },
      c.var.app.settings.authHandler.stateSignSecret,
      c.var.app.settings.authHandler.stateSignOptions
    );
  } catch (error) {
    availableAuthMethods = [];
    c.var.app.logger.getLogger("app").error(error);
  }
  return makeResponse(c, RESPONSE_CODE.OK, {
    person,
    authState,
    availableAuthMethods,
  });
}

async function request(c) {
  let authState = c.var.body.authState;
  let authMethod = c.var.body.authMethod;
  if (
    c.var.body.action !== "request" ||
    nullOrEmpty(authState) ||
    typeof authState !== "string" ||
    nullOrEmpty(authMethod) ||
    typeof authMethod !== "number" ||
    authMethod < 0
  ) {
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }

  try {
    authState = await verifyAsync(
      authState,
      c.var.app.settings.authHandler.stateSignSecret,
      c.var.app.settings.authHandler.stateSignOptions
    );
    if (authMethod >= authState.availableAuthMethods.length)
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  } catch {
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }

  for (let i = 0; i < authState.availableAuthMethods.length; i++) {
    if (authState.availableAuthMethods[i].id === authMethod) {
      authMethod = authState.availableAuthMethods[i];
      break;
    }
  }

  let authChallenge = "";
  let code = "";
  if (authMethod.type === SupportedAuthType.PASSWORD) {
    code = getRandomCode();
    authChallenge = authState.asn;
  } else if (authMethod.type === SupportedAuthType.EMAIL) {
    code = getRandomOTP();
    authChallenge = c.var.app.settings.mailSettings.senderEmailAddress;
  } else if (
    authMethod.type === SupportedAuthType.PGP_ASCII_ARMORED_CLEAR_SIGN
  ) {
    code = getRandomCode();
    authChallenge = code;
  } else if (authMethod.type === SupportedAuthType.SSH) {
    code = getRandomBase64(32);
    authChallenge = code;
  }

  // The state returned below is signed, not encrypted - anything placed in it is
  // readable by whoever requested it. For e-mail sign-in the code is the only
  // secret, so it is kept server side and referenced by an unguessable id.
  const stateId = randomUUID();
  const stateStored = await c.var.app.redis.setDataEx(
    authStateKey(stateId),
    { code, asn: authState.asn, type: authMethod.type },
    AUTH_STATE_TTL_SECONDS
  );
  if (!stateStored) {
    c.var.app.logger
      .getLogger("app")
      .error("Failed to persist pending auth state to redis.");
    return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
  }

  // Send the mail only once the challenge is safely stored, otherwise the user
  // would receive a code that can never be redeemed.
  if (authMethod.type === SupportedAuthType.EMAIL) {
    await sendAuthMail(
      c,
      authMethod.data,
      authState.person || authState.asn,
      code
    );
  }

  try {
    authState = await signAsync(
      {
        asn: authState.asn,
        person: authState.person,
        authMethod,
        stateId,
      },
      c.var.app.settings.authHandler.stateSignSecret,
      c.var.app.settings.authHandler.stateSignOptions
    );
  } catch (error) {
    authChallenge = "";
    c.var.app.logger.getLogger("app").error(error);
  }

  if (authChallenge === "") authState = "";
  return makeResponse(c, RESPONSE_CODE.OK, {
    authState,
    authChallenge,
  });
}

async function challenge(c) {
  let authState = c.var.body.authState;
  const authData = c.var.body.data;
  if (
    c.var.body.action !== "challenge" ||
    nullOrEmpty(authState) ||
    typeof authState !== "string"
  ) {
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }

  try {
    authState = await verifyAsync(
      authState,
      c.var.app.settings.authHandler.stateSignSecret,
      c.var.app.settings.authHandler.stateSignOptions
    );
  } catch {
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }

  // Redeem the pending challenge. This burns one attempt and fails closed when
  // the state expired, was already used, or ran out of attempts.
  if (nullOrEmpty(authState.stateId) || typeof authState.stateId !== "string")
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

  const stateKey = authStateKey(authState.stateId);
  const pendingState = await c.var.app.redis.consumeAuthState(
    stateKey,
    AUTH_STATE_MAX_ATTEMPTS
  );

  if (pendingState.status !== "ok") {
    if (pendingState.status === "locked")
      c.var.app.logger
        .getLogger("auth")
        .warn(
          `AS${authState.asn} - Authentication state discarded after ${AUTH_STATE_MAX_ATTEMPTS} failed attempts.`
        );
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }

  // Defense in depth: the id is unguessable, but never let a state be redeemed
  // for an ASN other than the one it was issued for.
  if (String(pendingState.asn) !== String(authState.asn)) {
    await c.var.app.redis.deleteData(stateKey);
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }

  let authResult = false;
  let token = "";
  let authMethod = "";
  const type = authState.authMethod.type;
  const code = pendingState.code;

  if (type === SupportedAuthType.PASSWORD) {
    authMethod = "password";
    if (nullOrEmpty(authData) || typeof authData !== "string")
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    const rawPassword = authData.trim();
    try {
      const hash = await c.var.app.models.peerPreferences.findOne({
        attributes: ["password"],
        where: {
          asn: Number(authState.asn),
        },
      });
      if (await bcryptCompare(rawPassword, hash.dataValues.password))
        authResult = true;
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
    }
  } else if (type === SupportedAuthType.EMAIL) {
    authMethod = "e-mail";
    if (nullOrEmpty(authData) || typeof authData !== "string")
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    if (authData.trim().toUpperCase() === code.toUpperCase()) authResult = true;
  } else if (type === SupportedAuthType.PGP_ASCII_ARMORED_CLEAR_SIGN) {
    authMethod = "pgp";
    if (
      !authData ||
      !authData.publicKey ||
      typeof authData.publicKey !== "string" ||
      !authData.signedMessage ||
      typeof authData.signedMessage !== "string"
    ) {
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    }

    if (authData.signedMessage.indexOf(code) !== -1) {
      try {
        const publicKey = await openpgp.readKey({
          armoredKey: authData.publicKey.trim(),
        });
        if (
          publicKey.getFingerprint().toLowerCase() !==
          authState.authMethod.data.toLowerCase()
        )
          throw new Error("Invalid public key");

        const signedMessage = await openpgp.readCleartextMessage({
          cleartextMessage: authData.signedMessage.trim(),
        });
        const { verified } = (
          await openpgp.verify({
            message: signedMessage,
            verificationKeys: publicKey,
          })
        ).signatures[0];

        authResult = await verified; // throws on invalid signature
      } catch {
        // supress invalid signature exception
      }
    }
  } else if (type === SupportedAuthType.SSH) {
    authMethod = "ssh";
    if (nullOrEmpty(authData) || typeof authData !== "string")
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

    const signature = authData.trim();
    const publicKey = authState.authMethod.data.trim(); // "ssh-ed25519 AAAA... comment"
    const challengeText = code; // code is the original Base64 challenge text
    const namespace = "peerhub"; // must match the namespace the client signs with (-n peerhub)
    const principal = "peer@dn42"; // arbitrary identity; only needs to match -I and the allowed_signers line

    // Write temp files for ssh-keygen. Use pid + timestamp to avoid collisions between concurrent requests.
    const tmp = tmpdir();
    const uniq = `${process.pid}_${Date.now()}`;
    const sigFile = join(tmp, `ssh_sig_${uniq}.sig`);
    const signersFile = join(tmp, `ssh_signers_${uniq}`);

    try {
      // ssh-keygen -Y verify expects an allowed_signers file: "<principal> <keytype> <base64key>".
      // Keep only the type + key fields so a trailing comment can't break the format.
      const [keyType, keyData] = publicKey.split(/\s+/);
      if (!keyType || !keyData) throw new Error("Invalid ssh public key format");
      const allowedSigners = `${principal} ${keyType} ${keyData}\n`;

      await writeFile(sigFile, signature, "utf-8");
      await writeFile(signersFile, allowedSigners, "utf-8");

      const sshKeygenPath = c.var.app.settings.authHandler.sshKeygenPath || "ssh-keygen";
      const verifyProc = spawn(sshKeygenPath, [
        "-Y", "verify",
        "-f", signersFile,
        "-I", principal,
        "-n", namespace,
        "-s", sigFile,
      ]);

      const output = await new Promise((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          verifyProc.kill("SIGKILL");
          reject(new Error("ssh-keygen verify timed out"));
        }, 5000);
        verifyProc.stdout.on("data", d => stdout += d);
        verifyProc.stderr.on("data", d => stderr += d);
        verifyProc.on("close", exitCode => { clearTimeout(timer); resolve({ code: exitCode, stdout, stderr }); });
        verifyProc.on("error", err => { clearTimeout(timer); reject(err); });
        // ssh-keygen -Y verify reads the signed message from stdin (no trailing newline, matching `echo -n`).
        verifyProc.stdin.write(challengeText);
        verifyProc.stdin.end();
      });

      if (output.code === 0) authResult = true;
      else c.var.app.logger.getLogger("auth").info(`SSH signature verify rejected for AS${authState.asn}: ${output.stderr.trim()}`);
    } catch (error) {
      c.var.app.logger.getLogger("auth").error(`SSH signature verify failed: ${error.message}`);
    } finally {
      // Clean up temp files
      try { await unlink(sigFile); } catch {}
      try { await unlink(signersFile); } catch {}
    }
  }

  if (authResult) {
    // Single use: a redeemed challenge must not be replayable within its TTL.
    await c.var.app.redis.deleteData(stateKey);
    token = await c.var.app.token.generateToken({
      asn: authState.asn,
      person: authState.person,
    });
    c.var.app.logger
      .getLogger("auth")
      .info(
        `AS${authState.asn} - Authentication successful via ${
          authMethod || "<Unknown>"
        }.`
      );
  }

  return makeResponse(c, RESPONSE_CODE.OK, { authResult, token });
}

function parseWhois(whoisText) {
  if (!whoisText) return null;
  // Split the WHOIS text by new lines
  const lines = whoisText.split("\n");

  // Initialize an object to store the parsed data
  const parsedData = {};

  // Iterate through each line
  lines.forEach((line) => {
    // Trim any leading/trailing whitespace
    line = line.trim();

    // Skip comments (lines starting with %)
    if (line.startsWith("%") || line === "") {
      return;
    }

    // Split the line into key and value by the first occurrence of ":"
    const [key, ...valueParts] = line.split(":");

    // Join the value parts back together and trim any extra spaces
    const value = valueParts.join(":").trim();

    // If the key already exists in the parsedData, convert it into an array (to handle multiple values for the same key)
    if (parsedData[key]) {
      if (Array.isArray(parsedData[key])) {
        parsedData[key].push(value);
      } else {
        parsedData[key] = [parsedData[key], value];
      }
    } else {
      parsedData[key] = value;
    }
  });

  return parsedData;
}

async function open(c) {
  const type = c.var.body.type;
  if (!type) return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

  const authProvider = c.var.app.openAuthProviders[type];
  if (!authProvider) return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

  let token = "";
  let asn = 0;
  let authResult = false;
  let _person = "";
  let _email = "";
  const result = authProvider.authenticate(c.var.body.data);
  if (result) {
    asn = Number(result.asn.trim()) || 0;
    if (!asn) {
      c.var.app.logger
        .getLogger("app")
        .error(`Failed to get ASN from Open Auth provider(${type}).`);
    } else {
      const { person, email } = result;
      if (person && email) {
        _person = person;
        _email = email;
      } else {
        const query = await queryAuthMethods(c, asn.toString());
        _person = query.person;
        query.availableAuthMethods.forEach((m) => {
          if (m && m.type === SupportedAuthType.EMAIL && m.data)
            _email = m.data;
        });
      }

      authResult = true;
      token = await c.var.app.token.generateToken({
        asn: asn.toString(),
        person: _person,
      });

      c.var.app.logger
        .getLogger("auth")
        .info(`AS${asn} - Authentication successful via Open Auth(${type}).`);
    }
  }

  return makeResponse(c, RESPONSE_CODE.OK, {
    authResult,
    token,
    asn,
    person: _person,
    email: _email,
  });
}
