/*
*******************************************************************
providers/fetch/fetch.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export async function useFetch(app, fetchSettings = {}) {
  const pn = `${fetchSettings.provider || 'default'}FetchProvider`;
  const handlerName = pn.charAt(0).toUpperCase() + pn.slice(1);
  app.fetch = new (await import(`./${pn}.js`))[handlerName](app, fetchSettings);
};
