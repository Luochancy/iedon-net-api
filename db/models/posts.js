/*
*******************************************************************
db/models/posts.js

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

export const initModel = sequelize => sequelize.define('posts', {
  postId: {
    field: 'post_id',
    primaryKey: true,
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true
  },
  category: {
    field: 'category',
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Default',
  },
  title: {
    field: 'title',
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    field: 'content',
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  indexes: [
    {
      unique: false,
      name: 'idx_posts_title',
      fields: ['title']
    },
    {
      unique: false,
      name: 'idx_posts_category',
      fields: ['category']
    }
  ],
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});
