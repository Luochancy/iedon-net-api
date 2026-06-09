/*
*******************************************************************
db/models/peerPreferences.js

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

export const initModel = sequelize => sequelize.define('peer_preferences', {
  asn: {
    field: 'asn',
    primaryKey: true,
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false
  },
  password: {
    field: 'password',
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});
