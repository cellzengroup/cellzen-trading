require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const sequelize = require('../config/postgres');

// Adds the per-staff ownership stamp columns used by the Staff portal:
//   invoices.created_by_user_id / invoices.created_by_name
//   users.created_by_user_id    / users.created_by_name
// Safe to run multiple times — each column is added only if missing.
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }

  const addColumn = async (table, column, ddl) => {
    const [rows] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = '${table}' AND column_name = '${column}'
    `);
    if (rows.length > 0) {
      console.log(`• ${table}.${column} already exists`);
      return;
    }
    await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`✅ Added ${table}.${column}`);
  };

  try {
    await addColumn('invoices', 'created_by_user_id', 'created_by_user_id UUID');
    await addColumn('invoices', 'created_by_name', 'created_by_name VARCHAR(255)');
    await addColumn('users', 'created_by_user_id', 'created_by_user_id UUID');
    await addColumn('users', 'created_by_name', 'created_by_name VARCHAR(255)');

    // Helpful indexes for the staff-scoped lookups (created only if missing).
    await sequelize.query('CREATE INDEX IF NOT EXISTS invoices_created_by_user_id ON invoices (created_by_user_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS users_created_by_user_id ON users (created_by_user_id)');

    console.log('✅ Staff ownership migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
