require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize, WarehouseQcImage } = require('../inventory/models');

// Creates the warehouse_qc_images table (idempotent) — the QC photos staff take of
// a parcel's goods at the shelf, kept as bytes in the table itself.
//
// An earlier build of this table pointed at Supabase Storage (an image_url
// column). If that shape is found and the table holds no photos, it is dropped and
// re-created; if it holds photos it is left alone and this says so — nothing is
// ever thrown away here. Server start also ensures the table (see server.js), so
// this is only for running it by hand:
//   node backend/migrations/add_warehouse_qc_images_table.js
async function migrate() {
  if (!sequelize || !WarehouseQcImage) {
    console.error('Database not configured');
    return;
  }
  try {
    const desc = await sequelize.getQueryInterface().describeTable('warehouse_qc_images').catch(() => null);
    if (desc && !desc.data) {
      const [[{ n }]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM warehouse_qc_images');
      if (n > 0) {
        console.error(`warehouse_qc_images has the old shape and holds ${n} row(s) — not touching it.`);
        process.exitCode = 1;
        return;
      }
      await sequelize.query('DROP TABLE warehouse_qc_images');
      console.log('- dropped the empty old-shape table');
    }
    await WarehouseQcImage.sync(); // CREATE TABLE IF NOT EXISTS (+ its tracking index)
    console.log('✅ warehouse_qc_images table ready');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
