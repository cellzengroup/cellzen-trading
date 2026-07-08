const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// A single physical item stored in the warehouse. Shared across all staff
// (no per-user scoping). `code` is the generated internal WH-XXXXXX label; the
// created_by_*/shipped_by_* fields are an audit stamp only (who put it away /
// shipped it) and must NOT be used to filter reads.
const WarehouseItem = sequelize
  ? sequelize.define('WarehouseItem', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // internal generated code, e.g. WH-8K3F2A
      },
      tracking_number: {
        type: DataTypes.STRING,
        allowNull: true, // whatever was on the original shipment label — any format
      },
      rack_id: {
        type: DataTypes.STRING,
        allowNull: true, // FK to racks.id (the shelf code)
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'in_stock', // 'in_stock' | 'shipped'
      },
      created_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_by_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      shipped_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      shipped_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      shipped_by_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      tableName: 'warehouse_items',
      timestamps: true,
      indexes: [
        { fields: ['rack_id'] },
        { fields: ['status'] },
        { fields: ['created_by_user_id'] },
        // Atomic dedupe backstop: a tracking number can only be IN STOCK once at
        // a time. Partial unique index → concurrent double-scans that slip past
        // the app-level check fail at the DB and are mapped to a 409.
        {
          name: 'warehouse_items_in_stock_tracking_unique',
          unique: true,
          fields: ['tracking_number'],
          where: { status: 'in_stock' },
        },
      ],
    })
  : null;

module.exports = WarehouseItem;
