/*
*******************************************************************
routes.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import adminHandler from './handlers/admin.js';
import authHandler from './handlers/auth.js';
import listHandler from './handlers/list.js';
import tokenHandler from './handlers/token.js';
import peeringHandler from './handlers/peering.js';
import settingsHandler from './handlers/settings.js';
import agentHandler from './handlers/agent.js';
import metricsHandler from './handlers/metrics.js';
import lgHandler from './handlers/lg.js';
import whoisHandler from './handlers/whois.js';

export function registerRoutes(app) {
  app.server.post('/admin', adminHandler)
  .post('/auth', authHandler)
  .get('/list/:type/:postId?', listHandler)
  .get('/token', tokenHandler)
  .post('/session', peeringHandler)
  .post('/settings', settingsHandler)
  .get('/agent/:router/:action', agentHandler)
  .post('/agent/:router/:action', agentHandler)
  .get('/metrics', metricsHandler)
  .get('/whois', whoisHandler)
  .get('/lg/protocols', lgHandler)
  .get('/lg/protocols/:name', lgHandler)
  .get('/lg/routes/:prefix', lgHandler)
  .get('/lg/ping', lgHandler)
  .get('/lg/traceroute', lgHandler);
}
