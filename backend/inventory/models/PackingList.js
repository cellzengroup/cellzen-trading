const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// A Packing List groups the physical cartons of a shipment. Each carton (stored
// in `data.cartons`) carries its OWN packed weight / size / CBM plus the product
// line-items inside it. Owned per-staff via created_by_user_id (same scoping as
// invoices): staff see only their own, admins see all.
const PackingList = sequelize
  ? sequelize.define('PackingList', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      packing_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      reference: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      customer_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      marka: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Draft',
      },
      total_cartons: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_weight: {
        type: DataTypes.DECIMAL(14, 3),
        allowNull: false,
        defaultValue: 0,
      },
      total_cbm: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0,
      },
      created_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_by_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    }, {
      tableName: 'packing_lists',
      timestamps: true,
      indexes: [
        { fields: ['created_by_user_id'] },
      ],
    })
  : null;

module.exports = PackingList;
