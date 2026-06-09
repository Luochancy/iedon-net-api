/*
*******************************************************************
providers/openAuth/openAuth.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export async function useOpenAuth(app, openAuthSettings = {}) {
  app.openAuthProviders = {};
  if (!openAuthSettings.providers || !Array.isArray(openAuthSettings.providers)) return;
  
  for (let i = 0; i < openAuthSettings.providers.length; i++) {
    const p = openAuthSettings.providers[i];
    const handlerName = `${p.charAt(0).toUpperCase()}${p.slice(1)}OpenAuthProvider`;
    try {
      const { [handlerName]: OpenAuthProvider } = await import(`./${p}OpenAuthProvider.js`);
      const provider = new OpenAuthProvider(app, openAuthSettings[p]);
      app.openAuthProviders[p] = provider;
    } catch (error) {
      console.error(`Open Auth provider ${handlerName} could not be loaded.`, error);
    }
  }
}
