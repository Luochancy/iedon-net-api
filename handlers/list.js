/*
*******************************************************************
handlers/list.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { nullOrEmpty } from "../common/helper.js";
import { makeResponse, RESPONSE_CODE } from "../common/packet.js";
import sequelize from "sequelize";

/*
    "REQUEST": {
        "type": "routers" | "posts"
    },

    "RESPSONE": { // if type === routers
        "routers": [
            {
                "uuid": "1a2b3c4d5e6f1a2b3c4d5e6f",
                "name": "JP-TYO",
                "description": "Tokyo, Japan",
                "location": "JP",
                "openPeering": true,
                "sessionCapacity": 30,
                "sessionCount": 1
            },
            // ...
        ]
    },

    "RESPSONE": { // if type === posts
        "posts": [
            {
                "postId": 0,
                "category": "announcement",
                "title": "aaaaaa",
                "content": "bbbbbbb",
                "createdAt": "xxxxxTxxxxxZ",
                "updatedAt": "xxxxxTxxxxxZ",
            },
            // ...
        ]
    },

*/

export default async function (c) {
  const { type, postId } = c.req.param();
  if (type !== "post" && !nullOrEmpty(postId))
    return makeResponse(c, RESPONSE_CODE.NOT_FOUND);

  switch (type) {
    case "routers":
      return await routers(c);
    case "posts":
      return await posts(c);
    case "post":
      return await post(c, postId);
    case "config":
      return await config(c);
    default:
      return makeResponse(c, RESPONSE_CODE.NOT_FOUND);
  }
}

async function routers(c) {
  const routers = [];
  try {
    const result = await c.var.app.models.routers.findAll({
      attributes: [
        "uuid",
        "name",
        "description",
        "location",
        "open_peering",
        "auto_peering",
        "session_capacity",
        "ipv4",
        "ipv6",
        "ipv6_link_local",
        "link_types",
        "extensions",
        "allowed_policies",
      ],
      where: {
        public: true,
      },
    });

    // Batch session count via GROUP BY
    const routerUuids = result.map((r) => r.dataValues.uuid);
    const sessionCounts = new Map();
    if (routerUuids.length > 0) {
      const counts = await c.var.app.models.bgpSessions.findAll({
        attributes: [
          "router",
          [sequelize.fn("COUNT", sequelize.col("uuid")), "cnt"],
        ],
        where: { router: { [sequelize.Op.in]: routerUuids } },
        group: ["router"],
        raw: true,
      });
      for (const row of counts) {
        sessionCounts.set(row.router, Number(row.cnt));
      }
    }

    // Batch Redis metric fetches
    const metricPromises = routerUuids.map((uuid) =>
      c.var.app.redis
        .getData(`router:${uuid}`)
        .then((m) => [uuid, m || null])
    );
    const metricResults = await Promise.allSettled(metricPromises);
    const metrics = new Map();
    for (const r of metricResults) {
      if (r.status === "fulfilled") metrics.set(r.value[0], r.value[1]);
    }

    for (const router of result) {
      const uuid = router.dataValues.uuid;
      const data = {
        uuid,
        name: router.dataValues.name,
        description: router.dataValues.description,
        location: router.dataValues.location,
        openPeering: !!router.dataValues.open_peering,
        autoPeering: !!router.dataValues.auto_peering,
        sessionCapacity: router.dataValues.session_capacity,
        sessionCount: sessionCounts.get(uuid) || 0,
        ipv4: router.dataValues.ipv4 || "",
        ipv6: router.dataValues.ipv6 || "",
        ipv6LinkLocal: router.dataValues.ipv6_link_local || "",
        linkTypes: router.dataValues.link_types
          ? JSON.parse(router.dataValues.link_types)
          : [],
        extensions: router.dataValues.extensions
          ? JSON.parse(router.dataValues.extensions)
          : [],
        allowedPolicies: router.dataValues.allowed_policies
          ? JSON.parse(router.dataValues.allowed_policies)
          : [],
      };
      const metric = metrics.get(uuid);
      if (metric) data.metric = metric;
      routers.push(data);
    }
  } catch (error) {
    c.var.app.logger.getLogger("app").error(error);
  }
  return makeResponse(c, RESPONSE_CODE.OK, { routers });
}

async function posts(c) {
  const posts = [];
  try {
    (
      await c.var.app.models.posts.findAll({
        attributes: [
          "post_id",
          "category",
          "title",
          "created_at",
          "updated_at",
        ],
      })
    ).forEach((e) => {
      posts.push({
        postId: e.dataValues.post_id,
        category: e.dataValues.category,
        title: e.dataValues.title,
        createdAt: e.dataValues.created_at,
        updatedAt: e.dataValues.updated_at,
      });
    });
  } catch (error) {
    c.var.app.logger.getLogger("app").error(error);
  }
  return makeResponse(c, RESPONSE_CODE.OK, { posts });
}

async function post(c, postId) {
  if (isNaN(Number(postId))) return makeResponse(c, RESPONSE_CODE.NOT_FOUND);

  let post = null;
  try {
    const result = await c.var.app.models.posts.findOne({
      attributes: [
        "post_id",
        "category",
        "title",
        "content",
        "created_at",
        "updated_at",
      ],
      where: {
        post_id: Number(postId),
      },
    });
    if (result) {
      post = {
        postId: result.dataValues.post_id,
        category: result.dataValues.category,
        title: result.dataValues.title,
        content: result.dataValues.content,
        createdAt: result.dataValues.created_at,
        updatedAt: result.dataValues.updated_at,
      };
    } else {
      return makeResponse(c, RESPONSE_CODE.NOT_FOUND);
    }
  } catch (error) {
    c.var.app.logger.getLogger("app").error(error);
  }
  return makeResponse(c, RESPONSE_CODE.OK, post);
}

async function config(c) {
  let config = null;
  try {
    const rows = await c.var.app.models.settings.findAll({
      attributes: ["key", "value"],
      where: {
        key: {
          [sequelize.Op.in]: [
            "NET_ASN",
            "NET_NAME",
            "NET_DESC",
            "FOOTER_TEXT",
            "MAINTENANCE_TEXT",
          ],
        },
      },
    });
    const map = {};
    for (const row of rows) {
      map[row.dataValues.key] = row.dataValues.value || "";
    }
    config = {
      netAsn: map.NET_ASN || "",
      netName: map.NET_NAME || "",
      netDesc: map.NET_DESC || "",
      footerText: map.FOOTER_TEXT || "",
      maintenanceText: map.MAINTENANCE_TEXT || "",
    };
  } catch (error) {
    c.var.app.logger.getLogger("app").error(error);
  }
  return makeResponse(c, RESPONSE_CODE.OK, config);
}
