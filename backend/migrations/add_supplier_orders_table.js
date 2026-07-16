require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize, SupplierOrder } = require('../inventory/models');

// Creates the supplier_orders table (idempotent). Run once after deploying the
// gtradea 1688 sync feature:  node backend/migrations/add_supplier_orders_table.js
async function migrate() {
  if (!sequelize || !SupplierOrder) {
    console.error('Database not configured');
    return;
  }
  try {
    await SupplierOrder.sync(); // CREATE TABLE IF NOT EXISTS
    console.log('✅ supplier_orders table ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
