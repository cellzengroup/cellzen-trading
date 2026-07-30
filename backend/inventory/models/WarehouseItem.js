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
        // Internal generated code, e.g. CZN-00001. NOT unique: every box that
        // belongs to the same 1688 order (order_number) intentionally shares
        // the same code — see generateItemCode() in routes/warehouse.js.
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
      // Captured (required) when the item is marked shipped.
      logistics_name: {
        type: DataTypes.STRING,
        allowNull: true, // e.g. "RK Logistics" — free text with suggestions
      },
      // The shipment mode: "By Air" | "By Land". Set as soon as the item exists
      // (defaults here), changeable when the label is printed, and carried
      // through unchanged when the item ships — printing and shipping always
      // agree because they read/write this one column.
      shipment_from: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'By Air',
      },
      // Which warehouse section stored this item: 'cellzen' (default, free-form
      // tracking) or 'gtradea' (tracking MUST match a 1688 supplier order; the
      // linked order # + product are denormalized below for the shipment panel).
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'cellzen',
      },
      order_number: {
        type: DataTypes.STRING,
        allowNull: true, // 1688 ORD-… linked at put-away (gtradea items only)
      },
      product_name: {
        type: DataTypes.TEXT,
        allowNull: true, // denormalized product name from the matched 1688 order
      },
    }, {
      tableName: 'warehouse_items',
      timestamps: true,
      indexes: [
        { fields: ['rack_id'] },
        { fields: ['status'] },
        { fields: ['source'] },
        { fields: ['created_by_user_id'] },
        // The list endpoint's hot path is `WHERE source = ? ORDER BY "createdAt"
        // DESC` (Ship / Dispatched panels). This composite lets Postgres satisfy
        // the filter + sort straight from the index instead of scanning + sorting.
        { name: 'warehouse_items_source_created_idx', fields: ['source', 'createdAt'] },
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
