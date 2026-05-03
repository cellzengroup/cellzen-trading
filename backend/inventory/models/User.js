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
      firstName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      lastName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
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
      accountType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      country: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      emailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      emailVerificationCodeHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      emailVerificationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      accountApprovalStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'approved',
      },
    }, {
      tableName: 'users',
      timestamps: true,
      indexes: [
        { fields: ['role'] },
        { fields: ['accountType'] },
        { fields: ['accountApprovalStatus'] },
        { fields: ['role', 'accountApprovalStatus'] },
      ],
    })
  : null;

module.exports = User;
