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
      // Ownership stamp: the staff user who created/enrolled this customer.
      // NULL = created by admin (or self-registered). Staff Management lists
      // only the customers where this equals the staff's own id.
      created_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_by_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      tableName: 'users',
      timestamps: true,
      indexes: [
        { fields: ['role'] },
        { fields: ['accountType'] },
        { fields: ['accountApprovalStatus'] },
        { fields: ['role', 'accountApprovalStatus'] },
        { fields: ['created_by_user_id'] },
      ],
    })
  : null;

module.exports = User;
