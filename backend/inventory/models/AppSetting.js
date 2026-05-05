const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// Generic key/value store for application-wide settings (exchange rates, etc.).
// Value is stored as JSONB so callers can persist arbitrary structured data
// without schema changes.
const AppSetting = sequelize
  ? sequelize.define('AppSetting', {
      key: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
      },
      value: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
    }, {
      tableName: 'app_settings',
      timestamps: true,
    })
  : null;

module.exports = AppSetting;
