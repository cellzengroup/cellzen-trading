require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize, PrintJob } = require('../inventory/models');

// Adds the pre-rendered-label columns to print_jobs so a phone-queued job can
// carry the full 60x80mm shipment-label image and print byte-identical to one
// printed on the warehouse PC. Idempotent — only adds columns that are missing,
// so it's safe to re-run. Run once after deploying the new label design:
//   node backend/migrations/add_printjob_bitmap_columns.js
const NEW_COLUMNS = {
  bitmap_data: { type: DataTypes.TEXT, allowNull: true },
  bitmap_width_bytes: { type: DataTypes.INTEGER, allowNull: true },
  bitmap_height: { type: DataTypes.INTEGER, allowNull: true },
};

async function migrate() {
  if (!sequelize || !PrintJob) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  try {
    // Ensure the table exists first (no-op if it already does).
    await PrintJob.sync();
    const table = await qi.describeTable('print_jobs');
    for (const [name, spec] of Object.entries(NEW_COLUMNS)) {
      if (table[name]) {
        console.log(`↷ ${name} already present — skipping`);
        continue;
      }
      await qi.addColumn('print_jobs', name, spec);
      console.log(`✅ added ${name}`);
    }
    console.log('✅ print_jobs bitmap columns ready');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
