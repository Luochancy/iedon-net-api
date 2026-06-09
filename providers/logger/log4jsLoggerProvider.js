/*
*******************************************************************
providers/logger/log4jsLoggerProvider.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import { DefaultLoggerProvider } from './defaultLoggerProvider.js';
import log4js from 'log4js';

export class Log4jsLoggerProvider extends DefaultLoggerProvider {
  constructor(app, loggerSettings) {
    super(app, loggerSettings);
    log4js.configure(this.loggerSettings.log4js);
  }

  getLogger(loggerName) {
    return log4js.getLogger(loggerName);
  }
}
