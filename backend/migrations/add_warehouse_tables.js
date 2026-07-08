require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize, Rack, WarehouseItem } = require('../inventory/models');

// Creates the warehouse tables — racks + warehouse_items (idempotent). Run once
// after deploying the warehouse feature:
//   node backend/migrations/add_warehouse_tables.js
// Rack MUST sync before WarehouseItem so the racks table exists for the
// warehouse_items.rack_id foreign key.
async function migrate() {
  if (!sequelize || !Rack || !WarehouseItem) {
    console.error('Database not configured');
    return;
  }
  try {
    await Rack.sync();          // CREATE TABLE IF NOT EXISTS racks (parent first)
    await WarehouseItem.sync(); // CREATE TABLE IF NOT EXISTS warehouse_items
    console.log('✅ racks + warehouse_items tables ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
