require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { sequelize } = require('../inventory/models');

// Rename a shelf, keeping every box on it. Used to move the GtradeA section off
// the old Cellzen-style codes (CZN99-01-0001) onto GT-rr-cccc:
//   node backend/migrations/rename_shelf.js CZN99-01-0001 GT-99-0001
//
// racks.id IS the shelf code, and warehouse_items.rack_id references it with
// ON UPDATE CASCADE — so one UPDATE on racks moves the shelf AND re-points every
// item sitting on it, atomically. No item is ever left pointing at a shelf that
// no longer exists.
//
// Must accept the same shapes the app does — see SHELF_PATTERN in
// ../inventory/routes/warehouse.js and RACK_CODE_PATTERN in the frontend.
const SHELF_PATTERN = /^[A-Za-z]{1,6}\d{0,4}-\d{1,4}-\d{1,6}$/;

async function rename() {
  const [fromArg, toArg] = process.argv.slice(2);
  const from = String(fromArg || '').trim().toUpperCase();
  const to = String(toArg || '').trim().toUpperCase();

  if (!from || !to) {
    console.error('Usage: node backend/migrations/rename_shelf.js <old-code> <new-code>');
    process.exit(1);
  }
  if (!SHELF_PATTERN.test(to)) {
    console.error(`"${to}" isn't a valid shelf code — it must look like GT-01-0001 (letters-digits-digits).`);
    process.exit(1);
  }
  if (!sequelize) {
    console.error('Database not configured');
    process.exit(1);
  }

  try {
    const [[oldRack]] = await sequelize.query('SELECT id FROM racks WHERE id = :from', { replacements: { from } });
    if (!oldRack) {
      console.error(`Shelf ${from} doesn't exist.`);
      process.exit(1);
    }
    const [[clash]] = await sequelize.query('SELECT id FROM racks WHERE id = :to', { replacements: { to } });
    if (clash) {
      console.error(`Shelf ${to} already exists — pick a free code (merging two shelves isn't what this does).`);
      process.exit(1);
    }

    const [[{ count }]] = await sequelize.query(
      'SELECT count(*)::int AS count FROM warehouse_items WHERE rack_id = :from',
      { replacements: { from } }
    );
    await sequelize.query('UPDATE racks SET id = :to, "updatedAt" = NOW() WHERE id = :from', {
      replacements: { from, to },
    });

    // Prove the cascade landed rather than assuming it: a silent no-op here would
    // leave boxes stranded on a shelf code that no longer exists.
    const [[{ moved }]] = await sequelize.query(
      'SELECT count(*)::int AS moved FROM warehouse_items WHERE rack_id = :to',
      { replacements: { to } }
    );
    console.log(`✅ ${from} → ${to} (${moved} of ${count} item(s) moved with it)`);
    if (moved !== count) console.error(`⚠️  expected ${count} items on ${to} — check warehouse_items.rack_id`);
  } catch (error) {
    console.error('Rename failed:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

rename();
