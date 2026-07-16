require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize } = require('../inventory/models');

// Adds a composite index on warehouse_items(source, "createdAt") so the Ship /
// Dispatched list query (`WHERE source = ? ORDER BY "createdAt" DESC`) is served
// straight from the index instead of a scan + sort. Idempotent (CREATE INDEX IF
// NOT EXISTS) — safe to run more than once. Run after deploy:
//   node backend/migrations/add_warehouse_items_perf_index.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  try {
    // "createdAt" is a camelCase Postgres column, so it must be quoted.
    await sequelize.query(
      'CREATE INDEX IF NOT EXISTS warehouse_items_source_created_idx ON warehouse_items ("source", "createdAt");'
    );
    console.log('✅ warehouse_items_source_created_idx ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
