const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// Persisted transport cost rates managed from the admin settings panel.
// Two shapes share this table:
//   - Standard single-rate routes: rate + unit
//   - China → Border → Nepal two-leg routes: rateKg + rateCBM + rateBorder
// Nullable columns let one row carry whichever shape applies.
const TransportRate = sequelize
  ? sequelize.define('TransportRate', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      mode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      method: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      fromLocation: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'from_location',
      },
      toLocation: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'to_location',
      },
      rate: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
      },
      unit: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      rateKg: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        field: 'rate_kg',
      },
      rateCBM: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        field: 'rate_cbm',
      },
      rateBorder: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        field: 'rate_border',
      },
      unitBorder: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'unit_border',
      },
      effectiveDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'effective_date',
      },
    }, {
      tableName: 'transport_rates',
      timestamps: true,
    })
  : null;

module.exports = TransportRate;
