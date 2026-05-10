const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const ManasConversation = sequelize
  ? sequelize.define('ManasConversation', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      user_role: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      verified_customer_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      messages: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
    }, {
      tableName: 'manas_conversations',
      timestamps: true,
      indexes: [
        { fields: ['session_id'] },
        { fields: ['user_id'] },
        { fields: ['createdAt'] },
      ],
    })
  : null;

module.exports = ManasConversation;
