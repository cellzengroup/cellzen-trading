require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const sequelize = require('../config/postgres');

// Adds transport_rates.rate_currency — the currency the rate values were
// entered in (CNY/NPR/USD). New rows store the raw typed value plus this tag so
// the rate is shown and calculated in exactly the currency entered and never
// drifts when the USD exchange rate changes. Legacy rows stay null and are
// still interpreted as USD. Safe to run multiple times.
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }

  try {
    const [rows] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'transport_rates' AND column_name = 'rate_currency'
    `);
    if (rows.length > 0) {
      console.log('• transport_rates.rate_currency already exists');
    } else {
      await sequelize.query('ALTER TABLE transport_rates ADD COLUMN rate_currency VARCHAR(8)');
      console.log('✅ Added transport_rates.rate_currency');
    }
    console.log('✅ Transport rate currency migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
