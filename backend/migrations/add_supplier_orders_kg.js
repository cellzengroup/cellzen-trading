require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds supplier_orders.kg — the weight staff type into the KG column of the
// warehouse "1688 Orders" table. gtradea publishes no weight, so there is nothing
// to backfill: every existing row starts as NULL ("not weighed yet").
//
// Run this BEFORE (or together with) deploying the code that reads the column.
// Production does not run sequelize.sync(), and the model now lists `kg` in every
// SELECT it issues, so the 1688 panel errors out on a database that lacks it.
//
// Idempotent — safe to run more than once:
//   node backend/migrations/add_supplier_orders_kg.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();

  try {
    const desc = await qi.describeTable('supplier_orders');
    if (desc.kg) {
      console.log('- kg already exists');
    } else {
      await qi.addColumn('supplier_orders', 'kg', { type: DataTypes.DECIMAL(10, 3), allowNull: true });
      console.log('✅ added kg');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
