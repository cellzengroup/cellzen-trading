require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds supplier_orders.ship_mode_override — the staff correction of the By
// Air / By Land mode that the dangerous-goods classifier
// (inventory/services/shipmentMode.js) derives from the product title, shown as
// the editable Mode column in the warehouse 1688 panel.
//
// NULL is the normal state and means "no correction": the classifier's answer
// is used. Nothing is backfilled on purpose — a backfill would freeze today's
// classifier output into the table as if a human had chosen it, and those rows
// would then never pick up an improvement to the lexicon or the corpus.
//
// Idempotent — safe to run more than once. Run after deploy:
//   node backend/migrations/add_supplier_order_ship_mode.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();
  const table = 'supplier_orders';

  try {
    const desc = await qi.describeTable(table);
    if (desc.ship_mode_override) {
      console.log('- ship_mode_override already exists');
    } else {
      await qi.addColumn(table, 'ship_mode_override', { type: DataTypes.STRING, allowNull: true });
      console.log('✅ added ship_mode_override');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
