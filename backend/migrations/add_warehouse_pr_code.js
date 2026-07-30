require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds warehouse_items.pr_code — the gtradea PR id (supplier_orders.job_code,
// e.g. PR-1029) for the 1688 order a stored box belongs to. That id is what the
// label, its barcode and the GtradeA panel now show instead of the internal
// CZN-xxxxx goods number, so it has to be on the item itself (printing must not
// wait on a second lookup).
//
// Also backfills every already-stored gtradea item by matching its tracking
// number against supplier_orders.china_tracking_no — the same join the put-away
// route does. Idempotent: safe to run more than once (the backfill only fills
// rows that are still NULL). Run after deploy:
//   node backend/migrations/add_warehouse_pr_code.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  const table = 'warehouse_items';

  try {
    const desc = await qi.describeTable(table);
    if (desc.pr_code) {
      console.log('- pr_code already exists');
    } else {
      await qi.addColumn(table, 'pr_code', { type: DataTypes.STRING, allowNull: true });
      console.log('✅ added pr_code');
    }

    // Backfill from the live 1688 rows. One tracking number can appear on
    // several supplier_orders rows (a multi-item shipment); they all belong to
    // the same procurement job, so any non-null job_code for that tracking is
    // the right answer — MIN() just picks one deterministically.
    const [, meta] = await sequelize.query(`
      UPDATE warehouse_items w
         SET pr_code = s.job_code
        FROM (
          SELECT china_tracking_no, MIN(job_code) AS job_code
            FROM supplier_orders
           WHERE china_tracking_no IS NOT NULL
             AND job_code IS NOT NULL
           GROUP BY china_tracking_no
        ) s
       WHERE w.pr_code IS NULL
         AND w.tracking_number = s.china_tracking_no
    `);
    console.log(`✅ backfilled pr_code on ${meta?.rowCount ?? 0} item(s)`);
    console.log('✅ warehouse_items pr_code ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
