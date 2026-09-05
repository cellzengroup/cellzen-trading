require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds supplier_orders.dispatched_at — when the parcel this 1688 line travels in
// left the warehouse. Stamped by POST /items/:id/ship from that moment on; this
// script backfills the rows that shipped before it existed.
//
// Why the column has to exist at all: the two retention windows outlive each
// other. The Dispatched panel deletes its warehouse_items row 30 days after
// dispatch, while the 1688 row is kept for 60 — so the sweep that prunes the
// 1688 panel can no longer read the dispatch date off warehouse_items, because
// that row was deleted a month earlier. Without this column the 1688 rows would
// simply never be pruned.
//
// The backfill takes the LATEST shipped_at of the boxes matching each tracking
// number: a tracking can be re-used across boxes (a returned parcel put away
// again), and the most recent dispatch is the one the retention clock should run
// from — never an older one, which could delete a row early.
//
// Idempotent — safe to run more than once. Run after deploy:
//   node backend/migrations/add_supplier_orders_dispatched_at.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  const table = 'supplier_orders';

  try {
    const desc = await qi.describeTable(table);
    if (desc.dispatched_at) {
      console.log('- dispatched_at already exists');
    } else {
      await qi.addColumn(table, 'dispatched_at', { type: DataTypes.DATE, allowNull: true });
      console.log('✅ added dispatched_at');
    }

    // The retention sweep filters on this column alone, so it is worth an index.
    await sequelize.query(
      'CREATE INDEX IF NOT EXISTS supplier_orders_dispatched_at ON supplier_orders (dispatched_at);'
    );
    console.log('✅ dispatched_at index ready');

    // Backfill from the warehouse rows that are still around. Only rows with no
    // date yet are touched, so re-running can never move a date that is already
    // set (and therefore can never bring a deletion forward).
    const [, meta] = await sequelize.query(`
      UPDATE supplier_orders so
         SET dispatched_at = w.shipped_at
        FROM (
              SELECT tracking_number, MAX(shipped_at) AS shipped_at
                FROM warehouse_items
               WHERE status = 'shipped'
                 AND shipped_at IS NOT NULL
                 AND tracking_number IS NOT NULL
               GROUP BY tracking_number
             ) w
       WHERE so.dispatched_at IS NULL
         AND so.china_tracking_no = w.tracking_number
    `);
    console.log(`✅ backfilled dispatched_at for ${meta?.rowCount ?? 0} row(s) from warehouse_items`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
