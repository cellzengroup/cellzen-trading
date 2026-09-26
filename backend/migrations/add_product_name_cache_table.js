require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize, ProductNameCache } = require('../inventory/models');

// Creates the product_name_cache table (idempotent) — the resolved Product Name
// for each 1688 listing title, so the packing list names the same goods the same
// way on every export and a human correction is permanent.
//
// Server start also ensures the table (see server.js), so this is only for
// running it by hand:
//   node backend/migrations/add_product_name_cache_table.js
//
// Populate it afterwards with:
//   node backend/scripts/refresh-product-names.js
async function migrate() {
  if (!sequelize || !ProductNameCache) {
    console.error('Database not configured');
    return;
  }
  try {
    await ProductNameCache.sync(); // CREATE TABLE IF NOT EXISTS
    const [[{ n }]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM product_name_cache');
    console.log(`✅ product_name_cache table ready (${n} name${n === 1 ? '' : 's'} cached)`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
