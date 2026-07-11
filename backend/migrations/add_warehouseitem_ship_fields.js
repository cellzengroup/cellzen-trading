require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize, WarehouseItem } = require('../inventory/models');

// Adds the logistics_name + shipment_from columns to warehouse_items, captured
// (required) when an item is marked shipped. Idempotent — only adds missing
// columns, so it's safe to re-run. Run once after deploying the ship-details
// feature:
//   node backend/migrations/add_warehouseitem_ship_fields.js
const NEW_COLUMNS = {
  logistics_name: { type: DataTypes.STRING, allowNull: true },
  shipment_from: { type: DataTypes.STRING, allowNull: true },
};

async function migrate() {
  if (!sequelize || !WarehouseItem) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  try {
    await WarehouseItem.sync(); // CREATE TABLE IF NOT EXISTS (no-op if it exists)
    const table = await qi.describeTable('warehouse_items');
    for (const [name, spec] of Object.entries(NEW_COLUMNS)) {
      if (table[name]) {
        console.log(`↷ ${name} already present — skipping`);
        continue;
      }
      await qi.addColumn('warehouse_items', name, spec);
      console.log(`✅ added ${name}`);
    }
    console.log('✅ warehouse_items ship fields ready');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
