import { makeResponse, RESPONSE_CODE } from "../common/packet.js";
import { getRouterCbParams } from "./services/peeringService.js";

// GET /lg/protocols — public, aggregate from all public routers
async function listProtocols(c) {
  let routers;
  try {
    routers = await c.var.app.models.routers.findAll({
      attributes: ["uuid", "name", "callback_url"],
      where: { public: true },
    });
  } catch (error) {
    c.var.app.logger.getLogger("app").error(error);
    return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
  }

  if (!routers || routers.length === 0) {
    return makeResponse(c, RESPONSE_CODE.OK, { routers: [] });
  }

  const results = await Promise.allSettled(
    routers.map(async (router) => {
      const routerUuid = router.dataValues.uuid;
      const routerName = router.dataValues.name;
      const callbackUrl = router.dataValues.callback_url;

      try {
        const response = await c.var.app.fetch.get(
          `${callbackUrl}/lg/protocols`,
          "json"
        );
        if (response && response.status === 200 && response.data) {
          const protocols = response.data.data || response.data;
          return { routerUuid, routerName, protocols: Array.isArray(protocols) ? protocols : [] };
        }
        return { routerUuid, routerName, protocols: [] };
      } catch (error) {
        c.var.app.logger
          .getLogger("fetch")
          .error(`Failed to fetch /lg/protocols from router ${routerUuid}: ${error}`);
        return { routerUuid, routerName, protocols: [] };
      }
    })
  );

  const routerResults = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { routerUuid: "", routerName: "", protocols: [] }
  );

  return makeResponse(c, RESPONSE_CODE.OK, { routers: routerResults });
}

// GET /lg/protocols/:name — authenticated, verify ASN ownership
async function getProtocolDetail(c) {
  const name = c.req.param("name");
  if (!name) return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

  const userAsn = Number(c.var.state.asn);

  let session;
  try {
    session = await c.var.app.models.bgpSessions.findOne({
      attributes: ["asn", "router", "interface"],
      where: { interface: name },
    });
  } catch (error) {
    c.var.app.logger.getLogger("app").error(error);
    return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
  }

  if (!session) return makeResponse(c, RESPONSE_CODE.NOT_FOUND);

  // Verify the session belongs to the logged-in user's ASN
  if (session.dataValues.asn !== userAsn) {
    return makeResponse(c, RESPONSE_CODE.NOT_FOUND);
  }

  const routerUuid = session.dataValues.router;
  const [url, agentSecret] = await getRouterCbParams(c, routerUuid);
  if (!url || !agentSecret) {
    return makeResponse(c, RESPONSE_CODE.ROUTER_NOT_AVAILABLE);
  }

  try {
    const response = await c.var.app.fetch.get(
      `${url}/lg/protocols/${encodeURIComponent(name)}`,
      "json"
    );
    if (!response || response.status !== 200 || !response.data) {
      c.var.app.logger
        .getLogger("fetch")
        .error(
          `Failed to fetch /lg/protocols/${name} from router ${routerUuid}: ${
            response ? `HTTP ${response.status}` : "Null response"
          }`
        );
      return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
    }

    const data = response.data.data || response.data;
    return makeResponse(c, RESPONSE_CODE.OK, data);
  } catch (error) {
    c.var.app.logger
      .getLogger("fetch")
      .error(`Failed to fetch /lg/protocols/${name} from router ${routerUuid}: ${error}`);
    return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
  }
}

// GET /lg/routes/:prefix — authenticated, verify ASN ownership via protocol lookup
async function getRoutes(c, prefix) {
  if (!prefix) return makeResponse(c, RESPONSE_CODE.BAD_REQUEST);

  const userAsn = Number(c.var.state.asn);

  // Check if any BGP session belongs to this user on any router
  let sessions;
  try {
    sessions = await c.var.app.models.bgpSessions.findAll({
      attributes: ["asn", "router", "interface"],
      where: { asn: userAsn },
    });
  } catch (error) {
    c.var.app.logger.getLogger("app").error(error);
    return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
  }

  if (!sessions || sessions.length === 0) {
    // No sessions for this ASN — fall back to all public routers
    let publicRouters;
    try {
      publicRouters = await c.var.app.models.routers.findAll({
        attributes: ["uuid"],
        where: { public: true },
      });
    } catch (error) {
      c.var.app.logger.getLogger("app").error(error);
      return makeResponse(c, RESPONSE_CODE.SERVER_ERROR);
    }
    if (!publicRouters || publicRouters.length === 0) {
      return makeResponse(c, RESPONSE_CODE.NOT_FOUND);
    }
    // Collect all valid router UUIDs
    for (const r of publicRouters) {
      const [url, agentSecret] = await getRouterCbParams(c, r.dataValues.uuid);
      if (!url || !agentSecret) continue;
      try {
        const response = await c.var.app.fetch.get(
          `${url}/lg/routes/${encodeURIComponent(prefix)}`,
          "json"
        );
        if (response && response.status === 200 && response.data) {
          const data = response.data.data || response.data;
          return makeResponse(c, RESPONSE_CODE.OK, data);
        }
      } catch (error) {
        c.var.app.logger
          .getLogger("fetch")
          .error(
            `Failed to fetch /lg/routes/${prefix} from router ${r.dataValues.uuid}: ${error}`
          );
        continue;
      }
    }
    return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
  }

  // Collect unique routers the user has sessions on
  const routerUuids = [...new Set(sessions.map((s) => s.dataValues.router))];

  // Try each router until we get a successful response
  for (const routerUuid of routerUuids) {
    const [url, agentSecret] = await getRouterCbParams(c, routerUuid);
    if (!url || !agentSecret) continue;

    try {
      const response = await c.var.app.fetch.get(
        `${url}/lg/routes/${encodeURIComponent(prefix)}`,
        "json"
      );
      if (response && response.status === 200 && response.data) {
        const data = response.data.data || response.data;
        return makeResponse(c, RESPONSE_CODE.OK, data);
      }
    } catch (error) {
      c.var.app.logger
        .getLogger("fetch")
        .error(
          `Failed to fetch /lg/routes/${prefix} from router ${routerUuid}: ${error}`
        );
      continue;
    }
  }

  return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
}

// GET /lg/ping?target=<ip>[&router=<uuid>] — authenticated
async function handlePing(c) {
  const target = c.req.query("target");
  if (!target) return makeResponse(c, RESPONSE_CODE.BAD_REQUEST, null, "Missing 'target' query parameter");

  const routerUuid = c.req.query("router");
  if (routerUuid) {
    // Verify user has a session on this router
    const userAsn = Number(c.var.state.asn);
    try {
      const session = await c.var.app.models.bgpSessions.findOne({
        attributes: ["router"],
        where: { asn: userAsn, router: routerUuid },
      });
      if (!session) return makeResponse(c, RESPONSE_CODE.NOT_FOUND);
    } catch (_) {}
    const [url, agentSecret] = await getRouterCbParams(c, routerUuid);
    if (!url || !agentSecret) return makeResponse(c, RESPONSE_CODE.ROUTER_NOT_AVAILABLE);
    try {
      const response = await c.var.app.fetch.get(
        `${url}/lg/ping?target=${encodeURIComponent(target)}`,
        "json"
      );
      if (response && response.status === 200 && response.data) {
        return makeResponse(c, RESPONSE_CODE.OK, response.data.data || response.data);
      }
      return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
    } catch (error) {
      c.var.app.logger.getLogger("fetch").error(`Ping failed on router ${routerUuid}: ${error}`);
      return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
    }
  }

  // No router specified — try user's routers, then fall back to public
  const userAsn = Number(c.var.state.asn);
  let routerUuids = [];
  try {
    const sessions = await c.var.app.models.bgpSessions.findAll({
      attributes: ["router"],
      where: { asn: userAsn },
    });
    if (sessions && sessions.length > 0) {
      routerUuids = [...new Set(sessions.map(s => s.dataValues.router))];
    }
  } catch (_) {}

  if (routerUuids.length === 0) {
    try {
      const publicRouters = await c.var.app.models.routers.findAll({
        attributes: ["uuid"],
        where: { public: true },
      });
      if (publicRouters && publicRouters.length > 0) {
        routerUuids = publicRouters.map(r => r.dataValues.uuid);
      }
    } catch (_) {}
  }

  if (routerUuids.length === 0) return makeResponse(c, RESPONSE_CODE.ROUTER_NOT_AVAILABLE);

  // Try each router
  for (const rid of routerUuids) {
    const [url, agentSecret] = await getRouterCbParams(c, rid);
    if (!url || !agentSecret) continue;
    try {
      const response = await c.var.app.fetch.get(
        `${url}/lg/ping?target=${encodeURIComponent(target)}`,
        "json"
      );
      if (response && response.status === 200 && response.data) {
        const data = response.data.data || response.data;
        data.router = rid;
        return makeResponse(c, RESPONSE_CODE.OK, data);
      }
    } catch (error) {
      continue;
    }
  }

  return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
}

// GET /lg/traceroute?target=<ip>[&router=<uuid>] — authenticated
async function handleTraceroute(c) {
  const target = c.req.query("target");
  if (!target) return makeResponse(c, RESPONSE_CODE.BAD_REQUEST, null, "Missing 'target' query parameter");

  const routerUuid = c.req.query("router");
  if (routerUuid) {
    // Verify user has a session on this router
    const userAsn = Number(c.var.state.asn);
    try {
      const session = await c.var.app.models.bgpSessions.findOne({
        attributes: ["router"],
        where: { asn: userAsn, router: routerUuid },
      });
      if (!session) return makeResponse(c, RESPONSE_CODE.NOT_FOUND);
    } catch (_) {}
    const [url, agentSecret] = await getRouterCbParams(c, routerUuid);
    if (!url || !agentSecret) return makeResponse(c, RESPONSE_CODE.ROUTER_NOT_AVAILABLE);
    try {
      const response = await c.var.app.fetch.get(
        `${url}/lg/traceroute?target=${encodeURIComponent(target)}`,
        "json"
      );
      if (response && response.status === 200 && response.data) {
        return makeResponse(c, RESPONSE_CODE.OK, response.data.data || response.data);
      }
      return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
    } catch (error) {
      c.var.app.logger.getLogger("fetch").error(`Traceroute failed on router ${routerUuid}: ${error}`);
      return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
    }
  }

  // No router specified — try user's routers, then fall back to public
  const userAsn = Number(c.var.state.asn);
  let routerUuids = [];
  try {
    const sessions = await c.var.app.models.bgpSessions.findAll({
      attributes: ["router"],
      where: { asn: userAsn },
    });
    if (sessions && sessions.length > 0) {
      routerUuids = [...new Set(sessions.map(s => s.dataValues.router))];
    }
  } catch (_) {}

  if (routerUuids.length === 0) {
    try {
      const publicRouters = await c.var.app.models.routers.findAll({
        attributes: ["uuid"],
        where: { public: true },
      });
      if (publicRouters && publicRouters.length > 0) {
        routerUuids = publicRouters.map(r => r.dataValues.uuid);
      }
    } catch (_) {}
  }

  if (routerUuids.length === 0) return makeResponse(c, RESPONSE_CODE.ROUTER_NOT_AVAILABLE);

  for (const rid of routerUuids) {
    const [url, agentSecret] = await getRouterCbParams(c, rid);
    if (!url || !agentSecret) continue;
    try {
      const response = await c.var.app.fetch.get(
        `${url}/lg/traceroute?target=${encodeURIComponent(target)}`,
        "json"
      );
      if (response && response.status === 200 && response.data) {
        const data = response.data.data || response.data;
        data.router = rid;
        return makeResponse(c, RESPONSE_CODE.OK, data);
      }
    } catch (error) {
      continue;
    }
  }

  return makeResponse(c, RESPONSE_CODE.ROUTER_OPERATION_FAILED);
}

export default async function (c) {
  const path = c.req.path;

  // GET /lg/protocols — public
  if (path === "/lg/protocols" || path === "/lg/protocols/") {
    return await listProtocols(c);
  }

  // GET /lg/protocols/:name — authenticated
  const protocolMatch = path.match(/^\/lg\/protocols\/([^/]+)$/);
  if (protocolMatch) {
    return await getProtocolDetail(c);
  }

  // GET /lg/routes/:prefix — authenticated (prefix may contain slashes)
  const routesMatch = path.match(/^\/lg\/routes\/(.+)$/);
  if (routesMatch) {
    return await getRoutes(c, decodeURIComponent(routesMatch[1]));
  }

  // GET /lg/ping?target=... — authenticated
  if (path === "/lg/ping" || path === "/lg/ping/") {
    return await handlePing(c);
  }

  // GET /lg/traceroute?target=... — authenticated
  if (path === "/lg/traceroute" || path === "/lg/traceroute/") {
    return await handleTraceroute(c);
  }

  return makeResponse(c, RESPONSE_CODE.NOT_FOUND);
}
