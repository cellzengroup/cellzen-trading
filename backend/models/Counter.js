const { DataTypes } = require('sequelize');
const sequelize = require('../config/postgres');

// Define the counters table
const Counter = sequelize
  ? sequelize.define('Counter', {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true,
      },
      value: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
    }, {
      tableName: 'counters',
      timestamps: false,
    })
  : null;

/**
 * Atomically increment a named counter and return the new value.
 * Falls back to a timestamp-based number if the DB is unavailable.
 */
async function getNext(name) {
  if (!Counter || !sequelize) {
    // Fallback: use millisecond timestamp mod 9999 so email still goes out
    return (Date.now() % 9999) + 1;
  }

  // Upsert + atomic increment using raw SQL for safety
  await sequelize.query(
    `INSERT INTO counters (name, value) VALUES (:name, 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1`,
    { replacements: { name } }
  );

  const [rows] = await sequelize.query(
    'SELECT value FROM counters WHERE name = :name',
    { replacements: { name } }
  );

  return rows[0]?.value ?? 1;
}

module.exports = { getNext };
