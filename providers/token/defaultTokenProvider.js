/*
*******************************************************************
providers/token/defaultTokenProvider.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { signAsync, verifyAsync } from "../../common/helper.js";

export class DefaultTokenProvider {
  constructor(app, tokenSettings) {
    this.app = app;
    this.tokenSettings = tokenSettings;
    this.logger = this.app.logger.getLogger('auth');
  }

  async generateToken(state) {
    try {
      return await signAsync(state, this.tokenSettings.jwt.secret, this.tokenSettings.jwt.options);
    } catch (error) {
      if (this.tokenSettings.logging) this.logger.error(error);
      return null;
    }
  }

  async verify(token) {
    try {
      return await verifyAsync(token, this.tokenSettings.jwt.secret, this.tokenSettings.jwt.options);
    } catch (error) {
      if (error.name !== 'TokenExpiredError') {
        if (this.tokenSettings.logging) this.logger.error(error);
      }
      return null;
    }
  }

}
