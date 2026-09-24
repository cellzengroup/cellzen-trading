require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { DataTypes } = require('sequelize');
const { sequelize } = require('../inventory/models');

// Adds invoices.document_type — splits the single "Invoices" tool into two:
// 'PI' (Proforma Invoice) and 'Billing' (Billing Invoice). Every row that
// existed before this column was added is a PI (that's what "Invoices" meant
// before Billing Invoice existed), so the column defaults to 'PI' and no
// backfill UPDATE is needed.
//
// Run this BEFORE (or together with) deploying the code that filters on it.
// Production does not run sequelize.sync(), so the invoices list/next-number
// routes will error on a database that lacks this column.
//
// Idempotent — safe to run more than once:
//   node backend/migrations/add_invoice_document_type.js
async function migrate() {
  if (!sequelize) {
    console.error('Database not configured');
    return;
  }
  const qi = sequelize.getQueryInterface();

  try {
    const desc = await qi.describeTable('invoices');
    if (desc.document_type) {
      console.log('- document_type already exists');
    } else {
      await qi.addColumn('invoices', 'document_type', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'PI',
      });
      console.log('✅ added document_type');
    }
    await sequelize.query('CREATE INDEX IF NOT EXISTS invoices_document_type ON invoices (document_type)');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
