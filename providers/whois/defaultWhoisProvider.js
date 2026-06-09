/*
*******************************************************************
providers/whois/defaultWhoisProvider.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { lookup as whoisLookup } from 'whois';

export class DefaultWhoisProvider {
  constructor(app, whoisSettings) {
    this.app = app;
    this.whoisSettings = whoisSettings;
    this.logger = this.app.logger.getLogger('whois');
    this._lookup = (name, settings) => new Promise((resolve, reject) =>
      whoisLookup(name, settings, (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(data);
      })
    );
  }

  async lookup(domainName) {
    try {
      return await this._lookup(domainName, this.whoisSettings.whois);
    } catch (error) {
      if (this.whoisSettings.logging) this.logger.error(error);
      return null;
    }
  }
}
