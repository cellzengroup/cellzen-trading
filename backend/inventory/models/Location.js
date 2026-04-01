const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const Location = sequelize
  ? sequelize.define('Location', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      type: {
        type: DataTypes.ENUM('warehouse', 'shop', 'exhibition'),
        allowNull: false,
      },
    }, {
      tableName: 'locations',
      timestamps: true,
    })
  : null;

module.exports = Location;
