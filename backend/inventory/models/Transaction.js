const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const Transaction = sequelize
  ? sequelize.define('Transaction', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      type: {
        type: DataTypes.ENUM('stock_in', 'transfer', 'sale'),
        allowNull: false,
      },
      product_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      from_location_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      to_location_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      price_type: {
        type: DataTypes.ENUM('cost', 'retail', 'wholesale'),
        allowNull: true,
      },
      unit_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    }, {
      tableName: 'transactions',
      timestamps: true,
      indexes: [
        { fields: ['type'] },
        { fields: ['product_id'] },
        { fields: ['from_location_id'] },
        { fields: ['to_location_id'] },
        { fields: ['created_by'] },
        { fields: ['createdAt'] },
        { fields: ['type', 'createdAt'] },
      ],
    })
  : null;

module.exports = Transaction;
