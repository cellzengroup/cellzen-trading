require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds supplier_orders.ordered_at — when the order was placed on gtradea (the
// procurement job's created_at). Needed for the Date column in the 1688 orders
// table; synced_at can't stand in for it because it's identical for every row a
// sync touches.
//
// Existing rows are backfilled from the date encoded in order_number
// (ORD-20260717-908966 -> 2026-07-17) so the column isn't empty before the next
// poll; the poller then overwrites it with the exact timestamp.
//
// Idempotent — safe to run more than once. Run after deploy:
//   node backend/migrations/add_supplier_orders_ordered_at.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  const table = 'supplier_orders';

  try {
    const desc = await qi.describeTable(table);
    if (desc.ordered_at) {
      console.log('- ordered_at already exists');
    } else {
      await qi.addColumn(table, 'ordered_at', { type: DataTypes.DATE, allowNull: true });
      console.log('✅ added ordered_at');
    }

    await sequelize.query(
      'CREATE INDEX IF NOT EXISTS supplier_orders_ordered_at ON supplier_orders (ordered_at);'
    );
    console.log('✅ ordered_at index ready');

    // Backfill only rows that have no date yet, from the ORD-YYYYMMDD-xxxxxx
    // pattern. Guarded by the regex so a differently-shaped order_number is left
    // alone rather than turning into an invalid date.
    const [, meta] = await sequelize.query(`
      UPDATE supplier_orders
         SET ordered_at = to_date(substring(order_number from 5 for 8), 'YYYYMMDD')
       WHERE ordered_at IS NULL
         AND order_number ~ '^ORD-[0-9]{8}-'
    `);
    console.log(`✅ backfilled ordered_at for ${meta?.rowCount ?? 0} row(s) from order_number`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
