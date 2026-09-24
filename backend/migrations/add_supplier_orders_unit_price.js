require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds supplier_orders.unit_price_cny + supplier_orders.frt_per_unit_cny — the
// two halves of the "Net unit ¥" gtradea's China Operations panel prices every
// procurement line at. Together they are the Unit Price the 1688 tab's product
// popup shows, and Total Price is that x quantity.
//
// Nothing to backfill from data already here: neither figure was ever stored,
// and paid_amount can't stand in for them (it is a 1688-ORDER total that may
// cover several lines). Every existing row therefore starts NULL and fills in on
// the next gtradea sync, which is at most 90 seconds away.
//
// Run this BEFORE (or together with) deploying the code that reads the columns.
// Production does not run sequelize.sync(), and the model now lists both in
// every SELECT it issues, so the 1688 panel errors out on a database that lacks
// them.
//
// Idempotent — safe to run more than once:
//   node backend/migrations/add_supplier_orders_unit_price.js
const COLUMNS = {
  // DECIMAL(12, 4), not (12, 2): gtradea prices the freight share to four
  // decimals (¥0.3500), and rounding it to two would make unit x qty stop
  // matching the total its own panel prints.
  unit_price_cny: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
  frt_per_unit_cny: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
};

async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();

  try {
    const desc = await qi.describeTable('supplier_orders');
    for (const [name, spec] of Object.entries(COLUMNS)) {
      if (desc[name]) {
        console.log(`- ${name} already exists`);
      } else {
        await qi.addColumn('supplier_orders', name, spec);
        console.log(`✅ added ${name}`);
      }
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
