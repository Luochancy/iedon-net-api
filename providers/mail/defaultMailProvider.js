/*
*******************************************************************
providers/mail/defaultMailProvider.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export class DefaultMailProvider {
  constructor(app, mailSettings) {
    this.app = app;
    this.mailSettings = mailSettings;
    this.logger = this.app.logger.getLogger("mail");
  }
  async send(to, subject, content, _) {
    if (this.mailSettings.logging)
      this.logger.info(
        `[DefaultMailProvider] Mail provider is not configured. Suppressing mail to ${to}, subject: ${subject}, content: ${content}`
      );
    return true;
  }
}
