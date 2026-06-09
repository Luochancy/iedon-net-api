/*
*******************************************************************
db/models/settings.js

Copyright (C) 2024 iEdon
Copyright (C) 2026 Luochancy

This file is part of a project derived from iedon-net-api.
Modified by Luochancy on 2026-06.

Licensed under the GNU General Public License v3.0.
See the LICENSE file in the project root for details.
*******************************************************************
*/
import sequelize from 'sequelize';
const { DataTypes } = sequelize;

export const initModel = sequelize => sequelize.define('settings', {
  key: {
    field: 'key',
    primaryKey: true,
    type: DataTypes.STRING,
    allowNull: false
  },
  value: {
    field: 'value',
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null
  }
}, {
  timestamps: false
});
