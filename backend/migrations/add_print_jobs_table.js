require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize, PrintJob } = require('../inventory/models');

// Creates the print_jobs table (idempotent). Run once after deploying the
// remote-print feature:
//   node backend/migrations/add_print_jobs_table.js
async function migrate() {
  if (!sequelize || !PrintJob) {
    console.error('Database not configured');
    return;
  }
  try {
    await PrintJob.sync(); // CREATE TABLE IF NOT EXISTS print_jobs
    console.log('✅ print_jobs table ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
