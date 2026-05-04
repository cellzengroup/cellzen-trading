#!/usr/bin/env node
// One-off schema sync for production.
//
// Server.js skips `sequelize.sync()` in production for safety. Run this script
// manually after a deploy that introduces new models/columns:
//
//   node backend/scripts/sync-db.js          # alter mode (default — additive, safe)
//   node backend/scripts/sync-db.js --force  # drop + recreate (destructive)
//
// On Render: open the service shell and run `node backend/scripts/sync-db.js`.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize } = require('../inventory/models');

const force = process.argv.includes('--force');

(async () => {
  if (!sequelize) {
    console.error('❌ Sequelize is not configured (missing DATABASE_URL?)');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection OK');

    if (force) {
      console.log('⚠️  Running sync with { force: true } — existing tables will be dropped.');
    } else {
      console.log('🔄 Running sync with { alter: true } — additive schema changes only.');
    }

    await sequelize.sync(force ? { force: true } : { alter: true });
    console.log('✅ Schema sync complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Schema sync failed:', error.message);
    process.exit(1);
  }
})();
