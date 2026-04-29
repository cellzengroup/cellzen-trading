const sequelize = require('../config/postgres');

async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }

  try {
    console.log('Adding share_to column to products table...');

    // Check if column exists
    const [columns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'share_to'
    `);

    if (columns.length > 0) {
      console.log('share_to column already exists');
      return;
    }

    // Add share_to column
    await sequelize.query(`
      ALTER TABLE products
      ADD COLUMN share_to JSONB DEFAULT '{"customers": false, "distributors": false, "partners": false}'
    `);

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
