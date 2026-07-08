const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// A physical warehouse rack/shelf. The shelf code itself IS the
// primary key (e.g. 'CZN01-01-0001' or 'CZN01') — deliberately a user-supplied
// STRING PK rather than the usual UUID, because items reference shelves by code.
// Shared across all staff (not per-user scoped).
const Rack = sequelize
  ? sequelize.define('Rack', {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      note: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      tableName: 'racks',
      timestamps: true, // createdAt / updatedAt (repo convention: no underscored)
    })
  : null;

module.exports = Rack;
