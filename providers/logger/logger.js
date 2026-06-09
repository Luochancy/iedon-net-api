/*
*******************************************************************
providers/logger/logger.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export async function useLogger(app, loggerSettings = {}) {
  const providerName = loggerSettings.provider || 'default';
  const handlerName = `${providerName.charAt(0).toUpperCase()}${providerName.slice(1)}LoggerProvider`;

  try {
    const { [handlerName]: LoggerProvider } = await import(`./${providerName}LoggerProvider.js`);
    app.logger = new LoggerProvider(app, loggerSettings);
  } catch (error) {
    console.error(`Logger provider ${handlerName} could not be loaded.`, error);
  }
}