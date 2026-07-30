require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize } = require('../inventory/models');

// Boxes belonging to the same 1688 order now intentionally share one goods
// number (warehouse_items.code — see generateItemCode() in routes/warehouse.js),
// so the column can no longer be unique. Looks up whatever Postgres actually
// named the constraint (varies by how the table was created) and drops it.
// Idempotent — safe to run more than once. Run after deploying this change:
//   node backend/migrations/drop_warehouse_items_code_unique.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  try {
    const [rows] = await sequelize.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = 'warehouse_items'
        AND att.attname = 'code'
        AND con.contype = 'u'
    `);
    if (!rows.length) {
      console.log('No unique constraint found on warehouse_items.code (already dropped?)');
    }
    for (const row of rows) {
      await sequelize.query(`ALTER TABLE warehouse_items DROP CONSTRAINT IF EXISTS "${row.conname}";`);
      console.log(`✅ dropped unique constraint ${row.conname} on warehouse_items.code`);
    }

    // Sequelize's unique:true can also surface as a plain unique INDEX rather
    // than a table constraint, depending on how the table was first created.
    const [idxRows] = await sequelize.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'warehouse_items' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(code)%'
    `);
    for (const row of idxRows) {
      await sequelize.query(`DROP INDEX IF EXISTS "${row.indexname}";`);
      console.log(`✅ dropped unique index ${row.indexname} on warehouse_items.code`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
