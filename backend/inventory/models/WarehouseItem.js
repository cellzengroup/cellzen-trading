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
      // The gtradea PROCUREMENT REQUEST id (supplier_orders.job_code, e.g.
      // PR-1029) for the matched 1688 order. NO LONGER the displayed id — see
      // item_code below, which replaced it on the label, the barcode and every
      // panel. Still captured because it's the only link back to the
      // procurement JOB a box belongs to (item_code names a single line), which
      // is what you need to look the box up on gtradea's job page.
      pr_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // The gtradea PER-ITEM id (supplier_orders.item_code, e.g. GTI-100119) —
      // gtradea's own "Product ID". This is what the printed label, its barcode
      // and every panel now show, so a box on the shelf carries the same id as
      // the China Operations row on gtradea. Denormalized at put-away (and
      // resolved on read for pre-existing rows) so printing never waits on a
      // second lookup. Null for cellzen items and for a 1688 order gtradea
      // hasn't given an item code.
      //
      // CAVEAT, inherent to the id: a warehouse item is keyed by CN TRACKING,
      // and one tracking number can carry several procurement items (e.g.
      // GTI-100117 and GTI-100118 are two variants in one parcel). job_code was
      // unambiguous there — every item of a job shares it — but item_code is
      // not, so the resolution picks the LOWEST item_code for the tracking.
      // Lowest, not "first row seen": the pick has to be stable, or the same box
      // would print a different id depending on which row the query returned.
      item_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // The id of the BOX itself — GTP-000123, minted here and nowhere else.
      // This, not a product id, is what the label's barcode carries.
      //
      // Why a box needs its own id: a parcel can hold several products, so no
      // product id can honestly name the box. item_code below names ONE of them;
      // this names the thing the sticker is stuck to. Deliberately the same
      // shape as a product id — three letters, a dash, six digits — so the
      // barcode is exactly as wide as it has always been, whatever the box holds.
      //
      // Unique: two boxes sharing a barcode would be unresolvable at the scanner.
      box_code: {
        type: DataTypes.STRING,
        allowNull: true,
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
        // One box, one barcode — the scanner has to land on exactly one row.
        { name: 'warehouse_items_box_code_unique', unique: true, fields: ['box_code'] },
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
