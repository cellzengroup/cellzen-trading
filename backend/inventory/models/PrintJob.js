const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// A queued label print. ANY device (including phones) enqueues a job via the
// API; the on-site print agent (print-bridge) polls the queue, prints the label
// on the Deli 720C, and marks the job done/error. Shared across all staff —
// created_by_* is an audit stamp only.
const PrintJob = sequelize
  ? sequelize.define('PrintJob', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING,
        allowNull: false, // the value to encode, e.g. CZN00001 or a shelf code
      },
      kind: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'item', // 'item' | 'rack'
      },
      copies: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending', // 'pending' | 'printing' | 'done' | 'error'
      },
      error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_by_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      claimed_at: {
        type: DataTypes.DATE,
        allowNull: true, // when the agent picked it up (used to recover stuck jobs)
      },
      printed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    }, {
      tableName: 'print_jobs',
      timestamps: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['createdAt'] },
      ],
    })
  : null;

module.exports = PrintJob;
