require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize, PackingList } = require('../inventory/models');

// Creates the packing_lists table (idempotent). Run once after deploying the
// Packing List feature:  node backend/migrations/add_packing_lists_table.js
async function migrate() {
  if (!sequelize || !PackingList) {
    console.error('Database not configured');
    return;
  }
  try {
    await PackingList.sync(); // CREATE TABLE IF NOT EXISTS
    console.log('✅ packing_lists table ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
