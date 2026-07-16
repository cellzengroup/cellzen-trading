require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds source / order_number / product_name to warehouse_items so the GtradeA
// warehouse section can tag its items and denormalize the linked 1688 order.
// Idempotent — safe to run more than once. Run after deploy:
//   node backend/migrations/add_warehouse_source_columns.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  const table = 'warehouse_items';

  const addIfMissing = async (name, spec) => {
    const desc = await qi.describeTable(table);
    if (desc[name]) {
      console.log(`- ${name} already exists`);
      return;
    }
    await qi.addColumn(table, name, spec);
    console.log(`✅ added ${name}`);
  };

  try {
    await addIfMissing('source', { type: DataTypes.STRING, allowNull: false, defaultValue: 'cellzen' });
    await addIfMissing('order_number', { type: DataTypes.STRING, allowNull: true });
    await addIfMissing('product_name', { type: DataTypes.TEXT, allowNull: true });
    console.log('✅ warehouse_items source columns ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
