const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// One row per PROCUREMENT ITEM pulled from the external gtradea 1688 dashboard.
// Stored per-item because the CN tracking number (china_tracking_no) is a
// per-item value and one gtradea order (order_number) can contain several items
// / tracking numbers. Deliberately holds NO customer PII — only the order
// number, tracking, product and status the warehouse team needs. Shared across
// all staff (never scoped by user). Upserted by the background poller keyed on
// source_item_id (the gtradea procurement_item id).
const SupplierOrder = sequelize
  ? sequelize.define('SupplierOrder', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'gtradea',
      },
      // The gtradea procurement_item id — the stable upsert key (unique index below).
      source_item_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      job_id: { type: DataTypes.STRING, allowNull: true },        // gtradea procurement job id
      job_code: { type: DataTypes.STRING, allowNull: true },      // e.g. PR-1006
      order_number: { type: DataTypes.STRING, allowNull: true },  // e.g. ORD-20260714-553812
      gtradea_order_id: { type: DataTypes.STRING, allowNull: true },
      // Normalised (trim + UPPERCASE) so it matches directly against
      // warehouse_items.tracking_number, which the warehouse also uppercases.
      china_tracking_no: { type: DataTypes.STRING, allowNull: true },
      nepal_tracking_no: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.STRING, allowNull: true },        // e.g. SUPPLIER_SHIPPED
      // Product names / URLs can exceed 255 chars → TEXT, not VARCHAR(255).
      product_name: { type: DataTypes.TEXT, allowNull: true },
      product_image: { type: DataTypes.TEXT, allowNull: true },
      supplier_url: { type: DataTypes.TEXT, allowNull: true },
      source_product_id: { type: DataTypes.STRING, allowNull: true }, // 1688 offer id
      quantity: { type: DataTypes.INTEGER, allowNull: true },
      shipping_mode: { type: DataTypes.STRING, allowNull: true },  // air | sea | land
      order_status: { type: DataTypes.STRING, allowNull: true },
      order_total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      // How much of order_total has actually been paid to the supplier so far
      // (gtradea's order.advance_amount) — NOT the same as order_total, which is
      // the full order value regardless of payment progress.
      paid_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      // When the order was placed on gtradea (the procurement job's created_at,
      // which lines up with the date encoded in order_number, e.g.
      // ORD-20260717-908966 -> 2026-07-17). NOT the same as synced_at, which is
      // just when we last polled.
      ordered_at: { type: DataTypes.DATE, allowNull: true },
      // Full source item payload for future-proofing / audit.
      raw: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      synced_at: { type: DataTypes.DATE, allowNull: true },
    }, {
      tableName: 'supplier_orders',
      timestamps: true,
      indexes: [
        { fields: ['china_tracking_no'] }, // drives the warehouse-match lookup
        { fields: ['order_number'] },
        { fields: ['status'] },
        { fields: ['ordered_at'] }, // newest-order-first listing
        // Idempotent-poll backstop: one row per gtradea procurement item.
        { name: 'supplier_orders_source_item_unique', unique: true, fields: ['source_item_id'] },
      ],
    })
  : null;

module.exports = SupplierOrder;
