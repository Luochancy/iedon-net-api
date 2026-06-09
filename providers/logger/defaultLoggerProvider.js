/*
*******************************************************************
providers/logger/defaultLoggerProvider.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
export class DefaultLoggerProvider {
  constructor(app, loggerSettings) {
    this.app = app;
    this.loggerSettings = loggerSettings;
    this.logger = {
      trace: log => console.trace(`[TRACE] ${log}`),
      debug: log => console.debug(`[DEBUG] ${log}`),
      info: log => console.info(`[INFO] ${log}`),
      warn: log => console.warn(`[WARN] ${log}`),
      error: log => console.error(`[ERROR] ${log}`),
      fatal: log => console.fatal(`[FATAL] ${log}`)
    };
  }
  getLogger(loggerName) {
    switch (loggerName) {
      default: return this.logger;
    }
  }
}
