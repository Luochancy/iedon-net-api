/*
*******************************************************************
app.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
/**
 * ===========================
 *        PEERHUB-API       
 *          Bootstrap         
 * ===========================
 */

import pkg from './package.json' with { type: "json" };
import localSettings from './config.js';

import { useLogger } from './providers/logger/logger.js';
import { useMail } from './providers/mail/mail.js';
import { useWhois } from './providers/whois/whois.js';
import { useFetch } from './providers/fetch/fetch.js'
import { useToken } from './providers/token/token.js';
import { useDbContext } from './db/dbContext.js';
import { useRedisContext } from './db/redisContext.js';
import { useOpenAuth } from './providers/openAuth/openAuth.js';
import { useProbeServer } from './providers/probeServer/probeServer.js';

import { registerRoutes } from './routes.js';
import { requestMiddleware } from './request.js';

import { Hono } from 'hono';

// Initialize app object
const app = {
  server: new Hono(),
  settings: localSettings,
  ready: false
};

// Initialize routes and core middleware
requestMiddleware(app, app.settings.tokenSettings);
registerRoutes(app);

// Main async function to bootstrap the application
(async () => {
  try {
    // Initialize logger
    await useLogger(app, localSettings.loggerSettings);
    const appLogger = app.logger.getLogger('app');
    appLogger.info(`${pkg.name}/${pkg.version} started.`);

    // Initialize dependencies
    await Promise.all([
      useDbContext(app, app.settings.dbSettings),
      useRedisContext(app, app.settings.redisSettings),
      useMail(app, app.settings.mailSettings),
      useWhois(app, app.settings.whoisSettings),
      useFetch(app, app.settings.fetchSettings),
      useToken(app, app.settings.tokenSettings),
      useOpenAuth(app, app.settings.openAuthSettings)
    ]);

    await useProbeServer(app, app.settings.probeServerSettings);

    app.ready = true;
  } catch (error) {
    console.error('Error during bootstrap: ', error);
  }
})();

// Export module with server fetch method and other settings
const serverModule = {
  fetch: app.server.fetch,
  port: localSettings.listen.port,
  hostname: localSettings.listen.hostname,
};

// Add Unix socket path if applicable
if (localSettings.listen.type === 'unix') {
  serverModule.unix = localSettings.listen.path;
}

const isProduction = (process.env?.NODE_ENV || '').toLowerCase() === 'production';
serverModule.development = !isProduction;

export default serverModule;
