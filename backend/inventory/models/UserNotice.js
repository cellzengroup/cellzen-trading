const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const UserNotice = sequelize
  ? sequelize.define('UserNotice', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sentByName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      tableName: 'user_notices',
      timestamps: true,
      indexes: [
        { fields: ['userId'] },
        { fields: ['userId', 'read'] },
      ],
    })
  : null;

module.exports = UserNotice;
