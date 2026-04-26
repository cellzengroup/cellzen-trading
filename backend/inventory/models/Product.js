const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

const Product = sequelize
  ? sequelize.define('Product', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      image_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      image_url_2: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      barcode: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      cost_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      retail_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      wholesale_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      category: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      supplier_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      supplier_email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      supplier_phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      factory_location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pdf_files: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      weight: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      size: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      tableName: 'products',
      timestamps: true,
    })
  : null;

module.exports = Product;
