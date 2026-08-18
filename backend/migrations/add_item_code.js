require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds the gtradea ITEM CODE (GTI-100119) in the two places it's needed, and
// backfills both from data that is already on disk:
//
//   supplier_orders.item_code  — gtradea's own per-item "Product ID". The sync
//     has always stored the whole procurement_item payload in `raw`, so every
//     historical row already carries its item code at raw->>'item_code'; the
//     backfill lifts it out of there rather than waiting for a re-sync.
//   warehouse_items.item_code  — denormalized onto the stored box so printing a
//     label never waits on a lookup, exactly as pr_code was before it.
//
// This id REPLACES the PR id (job_code / pr_code) everywhere staff see one: the
// label and its barcode, the warehouse panels, the packing list's Goods No. and
// the billing report. pr_code is deliberately left in place — it still names the
// procurement JOB a box belongs to, which is how you find it on gtradea, and
// boxes labelled before this change are still on the shelves.
//
// Idempotent: safe to run more than once (each backfill only fills NULLs).
// Run after deploy:
//   node backend/migrations/add_item_code.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();

  try {
    // ---------------------------------------------------- supplier_orders
    const so = await qi.describeTable('supplier_orders');
    if (so.item_code) {
      console.log('- supplier_orders.item_code already exists');
    } else {
      await qi.addColumn('supplier_orders', 'item_code', { type: DataTypes.STRING, allowNull: true });
      console.log('✅ added supplier_orders.item_code');
    }

    // Lift the code out of the raw payload the sync already stored. Guarded on
    // jsonb_typeof so a row whose `raw` is an empty object (or was written before
    // gtradea emitted the field) is skipped rather than filled with the string
    // "null".
    const [, soMeta] = await sequelize.query(`
      UPDATE supplier_orders
         SET item_code = raw->>'item_code'
       WHERE item_code IS NULL
         AND raw IS NOT NULL
         AND jsonb_typeof(raw->'item_code') = 'string'
    `);
    console.log(`✅ backfilled supplier_orders.item_code on ${soMeta?.rowCount ?? 0} row(s) from raw`);

    await sequelize.query(
      'CREATE INDEX IF NOT EXISTS supplier_orders_item_code ON supplier_orders (item_code)'
    );
    console.log('✅ supplier_orders.item_code indexed');

    // ---------------------------------------------------- warehouse_items
    const wi = await qi.describeTable('warehouse_items');
    if (wi.item_code) {
      console.log('- warehouse_items.item_code already exists');
    } else {
      await qi.addColumn('warehouse_items', 'item_code', { type: DataTypes.STRING, allowNull: true });
      console.log('✅ added warehouse_items.item_code');
    }

    // Backfill from the live 1688 rows, joined on tracking number — the same join
    // the put-away route does.
    //
    // MIN() is NOT an arbitrary tie-break here the way it was for pr_code. One
    // tracking number can carry several procurement items and their item codes
    // DIFFER (e.g. GTI-100117 and GTI-100118, two variants in one parcel), so
    // this genuinely picks one of several. MIN matches the ORDER BY item_code
    // ASC that both the put-away route and the list route use, so a box gets the
    // same code here as it would from either of those paths — pick a different
    // rule in any one of the three and the label stops matching the panel.
    const [, wiMeta] = await sequelize.query(`
      UPDATE warehouse_items w
         SET item_code = s.item_code
        FROM (
          SELECT china_tracking_no, MIN(item_code) AS item_code
            FROM supplier_orders
           WHERE china_tracking_no IS NOT NULL
             AND item_code IS NOT NULL
           GROUP BY china_tracking_no
        ) s
       WHERE w.item_code IS NULL
         AND w.tracking_number = s.china_tracking_no
    `);
    console.log(`✅ backfilled warehouse_items.item_code on ${wiMeta?.rowCount ?? 0} item(s) by tracking`);

    // Second pass, by ORDER NUMBER, for boxes the tracking join couldn't reach —
    // gtradea sometimes stops publishing a tracking number it once had, and the
    // box on the shelf outlives that. Without this they keep falling back to the
    // PR id, which is exactly the id this change exists to retire.
    //
    // This is order-level rather than parcel-level, so it can name the wrong LINE
    // of a multi-line order. That is not a step down in precision: pr_code was
    // order-level too (one procurement request covers every line), so these boxes
    // are no worse identified than they were — just expressed in the new id.
    // Deliberately runs after the tracking pass so an exact parcel match always
    // wins, and MIN keeps the pick identical to every other resolution path.
    const [, wiOrderMeta] = await sequelize.query(`
      UPDATE warehouse_items w
         SET item_code = s.item_code
        FROM (
          SELECT order_number, MIN(item_code) AS item_code
            FROM supplier_orders
           WHERE order_number IS NOT NULL
             AND item_code IS NOT NULL
           GROUP BY order_number
        ) s
       WHERE w.item_code IS NULL
         AND w.order_number = s.order_number
    `);
    console.log(`✅ backfilled warehouse_items.item_code on ${wiOrderMeta?.rowCount ?? 0} more item(s) by order number`);

    const [[left]] = await sequelize.query(
      "SELECT COUNT(*)::int AS n FROM warehouse_items WHERE item_code IS NULL AND source='gtradea'"
    );
    if (left?.n) console.log(`⚠ ${left.n} gtradea box(es) still have no item code — they fall back to the PR id`);

    // How many stored boxes are genuinely ambiguous — worth knowing, because for
    // those the label names one of the items in the parcel and not the others.
    const [[amb]] = await sequelize.query(`
      SELECT COUNT(*)::int AS n
        FROM (
          SELECT china_tracking_no
            FROM supplier_orders
           WHERE china_tracking_no IS NOT NULL AND item_code IS NOT NULL
           GROUP BY china_tracking_no
          HAVING COUNT(DISTINCT item_code) > 1
        ) t
       WHERE t.china_tracking_no IN (SELECT tracking_number FROM warehouse_items)
    `);
    if (amb?.n) {
      console.log(`⚠ ${amb.n} stored tracking number(s) carry more than one item code — each box's label shows the lowest of them`);
    }

    console.log('✅ item_code ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
