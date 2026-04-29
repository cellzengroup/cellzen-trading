const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const Invoice = sequelize
  ? sequelize.define('Invoice', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      invoice_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      shared_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      shared_user_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      customer_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      customer_email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'USD',
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Generated',
      },
      invoice_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      invoice_data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    }, {
      tableName: 'invoices',
      timestamps: true,
    })
  : null;

module.exports = Invoice;
