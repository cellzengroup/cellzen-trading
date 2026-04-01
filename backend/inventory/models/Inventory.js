const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const Inventory = sequelize
  ? sequelize.define('Inventory', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      product_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      location_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    }, {
      tableName: 'inventory',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['product_id', 'location_id'],
        },
        { fields: ['quantity'] },
        { fields: ['location_id'] },
      ],
    })
  : null;

module.exports = Inventory;
