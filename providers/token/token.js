/*
*******************************************************************
providers/token/token.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export async function useToken(app, tokenSettings = {}) {
  const providerName = tokenSettings.provider || 'default';
  const handlerName = `${providerName.charAt(0).toUpperCase()}${providerName.slice(1)}TokenProvider`;

  try {
    const { [handlerName]: TokenProvider } = await import(`./${providerName}TokenProvider.js`);
    app.token = new TokenProvider(app, tokenSettings);
  } catch (error) {
    app.logger.getLogger('app').error(`Failed to load token provider: ${handlerName}`, error);
  }
};