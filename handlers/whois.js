/*
*******************************************************************
handlers/whois.js

Copyright (C) 2026 Luochancy

Licensed under the GNU General Public License v3.0.
See LICENSE in the project root.
*******************************************************************
*/
import { makeResponse, RESPONSE_CODE } from "../common/packet.js";

function parseWhois(whoisText) {
  if (!whoisText) return null;
  const lines = whoisText.split("\n");
  const parsedData = {};

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith("%") || line === "") return;
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();
    if (!key) return;

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

export default async function whoisHandler(c) {
  try {
    const asn = c.var.state?.asn;
    if (!asn) return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

    const whoisRaw = await c.var.app.whois.lookup(`AS${asn}`);
    if (!whoisRaw) return makeResponse(c, RESPONSE_CODE.NOT_FOUND);

    const parsed = parseWhois(whoisRaw);
    if (!parsed) return makeResponse(c, RESPONSE_CODE.NOT_FOUND);

    return makeResponse(c, RESPONSE_CODE.OK, {
      asn: parsed["aut-num"] || `AS${asn}`,
      asName: parsed["as-name"] || "",
      descr: parsed["descr"] || "",
      country: parsed["country"] || "",
      org: parsed["org"] || "",
      adminC: parsed["admin-c"] || "",
      techC: parsed["tech-c"] || "",
      mntBy: parsed["mnt-by"] || "",
      mntLower: parsed["mnt-lower"] || "",
      mntRoutes: parsed["mnt-routes"] || "",
      status: parsed["status"] || "",
      source: parsed["source"] || "",
      remarks: parsed["remarks"] || "",
      notify: parsed["notify"] || "",
    });
  } catch (error) {
    c.var.app.logger?.getLogger("whois")?.error(error);
    return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
  }
}
