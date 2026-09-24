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
      // gtradea's PER-ITEM id (procurement_item.item_code, e.g. GTI-100119) —
      // the "Product ID" column of gtradea's own China Operations table. This,
      // not job_code, is the id staff read everywhere now: one job_code (PR-1006)
      // covers every line of a procurement request, while item_code names ONE
      // line, so two variants of the same product are finally distinguishable.
      item_code: { type: DataTypes.STRING, allowNull: true },
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
      shipping_mode: { type: DataTypes.STRING, allowNull: true },  // air | sea | land, as gtradea recorded it
      // Staff correction of the mode the dangerous-goods classifier works out
      // from product_name (see services/shipmentMode.js): 'air' | 'land', or
      // NULL meaning "no correction — use whatever the classifier says".
      //
      // Deliberately stores ONLY the override and not the computed answer: the
      // classifier is deterministic and re-runs on every read, so improving the
      // lexicon or corpus immediately re-rates every historical row instead of
      // leaving thousands of stale cached verdicts behind. What a human decided
      // is the only part that can't be recomputed, so it's the only part stored.
      ship_mode_override: { type: DataTypes.STRING, allowNull: true },
      // Weight of this line's goods in KG, typed in by warehouse staff on the 1688
      // tab as the goods are weighed. gtradea publishes no weight, so this is not
      // synced — the poller's upsert never lists it, which is what keeps a
      // re-sync from wiping a figure someone entered. NULL = not weighed yet.
      // DECIMAL comes back from pg as a string; the routes convert it to a number.
      kg: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
      order_status: { type: DataTypes.STRING, allowNull: true },
      order_total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      // The two halves of gtradea's "Net unit ¥" — the per-piece cost its China
      // Operations panel prices every line at, and the figure the 1688 tab shows
      // as Unit Price (with Total Price = it x quantity):
      //
      //   net unit = unit_price_cny + frt_per_unit_cny
      //
      // Both come straight off the procurement item (`unit_price_cny`,
      // `frt_per_unit_cny`) rather than being divided out of paid_amount, which
      // is a 1688-ORDER-level total that can cover several lines — dividing it
      // by one line's quantity would overstate that line whenever an order
      // bundles more than one. Four decimals because gtradea prices the freight
      // share to four (¥0.3500), and rounding it to two would make
      // unit x qty stop matching the panel's own total.
      //
      // Stored (not recomputed on read) because it is gtradea's number, not
      // ours: a line repriced there must show the new figure, and a line it has
      // not priced yet stays NULL — "not priced", never a made-up 0.
      unit_price_cny: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
      frt_per_unit_cny: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
      // How much was actually PAID for this item's own 1688 order — gtradea's
      // "Pay 1688 Supplier Orders" total (sumPaymentCents / 100), keyed by the
      // item's supplier_order_id. NOT order.advance_amount, which is a job-level
      // figure covering every 1688 order the job bundles, and not order_total,
      // which is the full value regardless of payment progress.
      //
      // This is the figure the downloaded reports bill from (the packing list's
      // Amount column, the billing report's Total Price), and it comes from a
      // DIFFERENT gtradea endpoint than the rest of this row — so it can be NULL
      // on an otherwise complete row when only the job details were available.
      // See services/gtradeaSync.js (PAYMENTS_PATH, ingestDetails).
      paid_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      // When the parcel this line travels in was DISPATCHED from the warehouse
      // — stamped by POST /items/:id/ship, matched on china_tracking_no.
      //
      // Duplicates warehouse_items.shipped_at on purpose. The two retention
      // windows outlive each other: the Dispatched panel drops its row 30 days
      // after dispatch, while this row is kept for 60, so by the time the 1688
      // sweep runs the warehouse row it would have read the date from is long
      // gone. NULL means "never dispatched" — a received-but-unshipped line, or
      // one still on the shelf — and the retention sweep only ever deletes rows
      // where this is set, which is what keeps stock out of its reach.
      dispatched_at: { type: DataTypes.DATE, allowNull: true },
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
        { fields: ['item_code'] },         // scanning a label resolves by this id
        { fields: ['order_number'] },
        { fields: ['status'] },
        { fields: ['ordered_at'] }, // newest-order-first listing
        // Idempotent-poll backstop: one row per gtradea procurement item.
        { name: 'supplier_orders_source_item_unique', unique: true, fields: ['source_item_id'] },
      ],
    })
  : null;

module.exports = SupplierOrder;
