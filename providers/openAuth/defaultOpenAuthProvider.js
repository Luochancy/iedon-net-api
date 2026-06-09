/*
*******************************************************************
providers/openAuth/defaultOpenAuthProvider.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export class DefaultOpenAuthProvider {
  constructor(app, openAuthSettings) {
    this.app = app;
    this.openAuthSettings = openAuthSettings;
    this.logger = this.app.logger.getLogger('auth');
  }

  // return false or { asn: XXXXX, ...(customData) }
  authenticate(_) {
    this.logger.info('Dummy Open Auth used. Rejecting authentication request.');
    return false;
  }
}
