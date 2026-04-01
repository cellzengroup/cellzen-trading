const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const User = sequelize
  ? sequelize.define('User', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        defaultValue: 'admin',
      },
    }, {
      tableName: 'users',
      timestamps: true,
    })
  : null;

module.exports = User;
