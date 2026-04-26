const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../config/postgres');

const FormSubmission = sequelize
  ? sequelize.define('FormSubmission', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      token: {
        type: DataTypes.STRING,
        unique: true,
        defaultValue: () => crypto.randomBytes(16).toString('hex'),
      },
      formType: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['thangka', 'soundBowls', 'sacredItems', 'contact', 'newsletter']],
        },
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
    }, {
      tableName: 'form_submissions',
      timestamps: true,
    })
  : null;

module.exports = FormSubmission;
