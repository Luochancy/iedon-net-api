/*
*******************************************************************
handlers/admin.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { makeResponse, RESPONSE_CODE } from "../common/packet.js";
import { nullOrEmpty, ASN_MIN, ASN_MAX } from "../common/helper.js";
import {
  enumPeeringSessions,
  queryPeeringSession,
  generalAgentHandler,
  isUserAdmin,
} from "./services/peeringService.js";

export default async function (c) {
  if (!(await isUserAdmin(c))) {
    return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
  }
  const action = c.var.body.action;
  return handlers[action]
    ? await handlers[action](c)
    : makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
}

const handlers = {
  async setPost(c) {
    const { type, postId, category, title, content } = c.var.body;
    if (
      nullOrEmpty(category) ||
      typeof category !== "string" ||
      nullOrEmpty(title) ||
      typeof title !== "string" ||
      nullOrEmpty(content) ||
      typeof content !== "string" ||
      (type !== "add" && type !== "update")
    ) {
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    }

    // Sanitize: strip HTML tags to prevent stored XSS
    const sanitize = (str) => str.replace(/<[^>]*>/g, "");

    if (type === "update") {
      if (nullOrEmpty(postId) || typeof postId !== "number")
        return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    }

    try {
      const model = {
        category: sanitize(category),
        title: sanitize(title),
        content,
      };

      if (type === "update") {
        await c.var.app.models.posts.update(model, {
          where: { post_id: postId },
        });
      } else if (type === "add") {
        await c.var.app.models.posts.create(model);
      }
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
      return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
    }
    return makeResponse(c, RESPONSE_CODE.OK);
  },

  async deletePost(c) {
    const postId = c.var.body.postId;
    if (nullOrEmpty(postId) || typeof postId !== "number")
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

    try {
      const rows = await c.var.app.models.posts.destroy({
        where: {
          post_id: postId,
        },
      });
      if (rows !== 1) throw new Error(`Unexpected affected rows. ${rows}`);
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
      return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
    }
    return makeResponse(c, RESPONSE_CODE.OK);
  },

  async enumRouters(c) {
    const routers = [];
    try {
      const result = await c.var.app.models.routers.findAll({
        attributes: [
          "uuid",
          "name",
          "description",
          "location",
          "public",
          "open_peering",
          "auto_peering",
          "session_capacity",
          "callback_url",
          "ipv4",
          "ipv6",
          "ipv6_link_local",
          "link_types",
          "extensions",
          "agent_secret",
          "allowed_policies",
        ],
      });
      const BATCH_SIZE = 50;
      for (let i = 0; i < result.length; i += BATCH_SIZE) {
        const batch = result.slice(i, i + BATCH_SIZE);
        const routerData = [];

        const sessionCountPromises = batch.map((r) =>
          c.var.app.models.bgpSessions.count({
            where: { router: r.dataValues.uuid },
          }).then((count) => {
            r._sessionCount = count;
          })
        );

        const metricPromises = batch.map((r) =>
          c.var.app.redis.getData(`router:${r.dataValues.uuid}`).then((metric) => {
            r._metric = metric || null;
          })
        );

        await Promise.allSettled([
          ...sessionCountPromises,
          ...metricPromises,
        ]);

        for (const r of batch) {
          routerData.push({
            uuid: r.dataValues.uuid,
            name: r.dataValues.name,
            description: r.dataValues.description,
            location: r.dataValues.location,
            public: !!r.dataValues.public,
            openPeering: !!r.dataValues.open_peering,
            autoPeering: !!r.dataValues.auto_peering,
            sessionCapacity: r.dataValues.session_capacity,
            callbackUrl: r.dataValues.callback_url,
            sessionCount: r._sessionCount || 0,
            ipv4: r.dataValues.ipv4 || "",
            ipv6: r.dataValues.ipv6 || "",
            ipv6LinkLocal: r.dataValues.ipv6_link_local || "",
            linkTypes: r.dataValues.link_types
              ? JSON.parse(r.dataValues.link_types)
              : [],
            extensions: r.dataValues.extensions
              ? JSON.parse(r.dataValues.extensions)
              : [],
            agentSecret: "",
            allowedPolicies: r.dataValues.allowed_policies
              ? JSON.parse(r.dataValues.allowed_policies)
              : [],
            metric: r._metric,
          });
        }
        routers.push(...routerData);
      }
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
    }
    return makeResponse(c, RESPONSE_CODE.OK, { routers });
  },

  async setRouter(c) {
    const {
      type,
      router,
      name,
      description,
      location,
      openPeering,
      autoPeering,
      sessionCapacity,
      callbackUrl,
      ipv4,
      ipv6,
      ipv6LinkLocal,
      linkTypes,
      extensions,
      agentSecret,
      allowedPolicies,
    } = c.var.body;
    const _public = c.var.body.public;
    if (
      typeof name !== "string" ||
      typeof _public !== "boolean" ||
      typeof openPeering !== "boolean" ||
      typeof autoPeering !== "boolean" ||
      typeof agentSecret !== "string" ||
      nullOrEmpty(name) ||
      nullOrEmpty(sessionCapacity) ||
      typeof sessionCapacity !== "number" ||
      typeof callbackUrl !== "string" ||
      nullOrEmpty(callbackUrl) ||
      !Array.isArray(linkTypes) ||
      linkTypes.some((e) => typeof e !== "string") ||
      (!nullOrEmpty(extensions) &&
        (!Array.isArray(extensions) ||
          extensions.some((e) => typeof e !== "string"))) ||
      (!nullOrEmpty(allowedPolicies) &&
        (!Array.isArray(allowedPolicies) ||
          allowedPolicies.some((e) => typeof e !== "number" || isNaN(e)))) ||
      (!nullOrEmpty(description) && typeof description !== "string") ||
      (!nullOrEmpty(location) && typeof location !== "string") ||
      (!nullOrEmpty(ipv4) && typeof ipv4 !== "string") ||
      (!nullOrEmpty(ipv6) && typeof ipv6 !== "string") ||
      (!nullOrEmpty(ipv6LinkLocal) && typeof ipv6LinkLocal !== "string") ||
      (type !== "add" && type !== "update")
    ) {
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    }

    if (type === "add") {
      if (nullOrEmpty(agentSecret))
        return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    }

    if (type === "update") {
      if (nullOrEmpty(router) || typeof router !== "string")
        return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
    }

    try {
      const model = {
        name,
        description,
        location,
        public: _public,
        openPeering,
        autoPeering,
        sessionCapacity,
        callbackUrl,
        ipv4,
        ipv6,
        ipv6LinkLocal,
        linkTypes: JSON.stringify(linkTypes),
        extensions: JSON.stringify(extensions),
        allowedPolicies: JSON.stringify(allowedPolicies),
      };

      if (type === "update" && !nullOrEmpty(agentSecret)) {
        model.agentSecret = agentSecret;
      }

      if (type === "add") {
        model.agentSecret = agentSecret;
      }

      if (type === "update") {
        await c.var.app.models.routers.update(model, {
          where: { uuid: router },
        });
      } else if (type === "add") {
        await c.var.app.models.routers.create(model);
      }
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
      return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
    }
    return makeResponse(c, RESPONSE_CODE.OK);
  },

  async deleteRouter(c) {
    const routerUuid = c.var.body.router;
    if (nullOrEmpty(routerUuid) || typeof routerUuid !== "string")
      return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

    try {
      const rows = await c.var.app.models.routers.destroy({
        where: {
          uuid: routerUuid,
        },
      });
      if (rows !== 1) throw new Error(`Unexpected affected rows. ${rows}`);
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
      return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
    }
    return makeResponse(c, RESPONSE_CODE.OK);
  },

  async config(c) {
    try {
      const { netAsn, netName, netDesc, footerText, maintenanceText } =
        c.var.body;
      if (
        nullOrEmpty(netAsn) ||
        typeof netAsn !== "string" ||
        nullOrEmpty(netName) ||
        typeof netName !== "string" ||
        isNaN(Number(netAsn)) ||
        Number(netAsn) < ASN_MIN ||
        Number(netAsn) > ASN_MAX
      ) {
        return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);
      }
      await c.var.app.models.settings.update(
        { value: netAsn },
        { where: { key: "NET_ASN" } }
      );
      await c.var.app.models.settings.update(
        { value: netName },
        { where: { key: "NET_NAME" } }
      );
      await c.var.app.models.settings.update(
        { value: netDesc || null },
        { where: { key: "NET_DESC" } }
      );
      await c.var.app.models.settings.update(
        { value: footerText || null },
        { where: { key: "FOOTER_TEXT" } }
      );
      await c.var.app.models.settings.update(
        { value: maintenanceText || null },
        { where: { key: "MAINTENANCE_TEXT" } }
      );
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
      return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
    }
    return makeResponse(c, RESPONSE_CODE.OK);
  },

  async enumSessions(c) {
    return await enumPeeringSessions(c, true);
  },

  async approveSession(c) {
    return await generalAgentHandler(c, "approve");
  },

  async teardownSession(c) {
    return await generalAgentHandler(c, "teardown");
  },

  async deleteSession(c) {
    return await generalAgentHandler(c, "delete");
  },

  async enableSession(c) {
    return await generalAgentHandler(c, "enable");
  },

  async disableSession(c) {
    return await generalAgentHandler(c, "disable");
  },

  async querySession(c) {
    return await queryPeeringSession(c);
  },
};
