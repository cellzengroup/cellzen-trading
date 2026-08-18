require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds warehouse_items.box_code — the id of the BOX itself (GTP-000123), which
// is what the printed label's barcode now carries.
//
// Why a box needs its own id: a parcel can hold several products, so no product
// id can honestly name it. item_code names ONE of the products inside; box_code
// names the thing the sticker is stuck to. It is deliberately the same shape as
// a product id (three letters, a dash, six digits) so the barcode is exactly as
// wide for a box of four products as for a box of one.
//
// Backfills every existing row in a STABLE order (createdAt, then id) so the
// numbering is reproducible: re-running against a restored snapshot assigns the
// same id to the same box rather than shuffling them.
//
// Idempotent: only fills rows that are still NULL, and the index creation is
// guarded. Run after deploy:
//   node backend/migrations/add_box_code.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  const table = 'warehouse_items';

  try {
    const desc = await qi.describeTable(table);
    if (desc.box_code) {
      console.log('- box_code already exists');
    } else {
      await qi.addColumn(table, 'box_code', { type: DataTypes.STRING, allowNull: true });
      console.log('✅ added box_code');
    }

    // Continue from the highest number already issued, so a second run never
    // reissues an id that is already printed on a sticker somewhere.
    const [[maxRow]] = await sequelize.query(
      `SELECT COALESCE(MAX((substring(box_code from '[0-9]{1,9}'))::int), 0) AS max_seq
         FROM warehouse_items
        WHERE box_code ILIKE 'GTP%'`
    );
    const start = Number(maxRow?.max_seq || 0);
    if (start) console.log(`- continuing from GTP-${String(start).padStart(6, '0')}`);

    const [, meta] = await sequelize.query(`
      WITH numbered AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) + :start AS seq
          FROM warehouse_items
         WHERE box_code IS NULL
      )
      UPDATE warehouse_items w
         SET box_code = 'GTP-' || lpad(numbered.seq::text, 6, '0')
        FROM numbered
       WHERE w.id = numbered.id
    `, { replacements: { start } });
    console.log(`✅ backfilled box_code on ${meta?.rowCount ?? 0} box(es)`);

    // One box, one barcode. Unique so a scan can never land on two rows.
    await sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS warehouse_items_box_code_unique ON warehouse_items (box_code)'
    );
    console.log('✅ box_code unique index ready');

    const [[left]] = await sequelize.query(
      'SELECT COUNT(*)::int AS n FROM warehouse_items WHERE box_code IS NULL'
    );
    if (left?.n) console.log(`⚠ ${left.n} box(es) still have no box_code`);

    const [[dupes]] = await sequelize.query(`
      SELECT COUNT(*)::int AS n FROM (
        SELECT box_code FROM warehouse_items
         WHERE box_code IS NOT NULL
         GROUP BY box_code HAVING COUNT(*) > 1) t
    `);
    if (dupes?.n) console.log(`⚠ ${dupes.n} duplicated box_code(s) — investigate before printing`);

    console.log('✅ box_code ready');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
