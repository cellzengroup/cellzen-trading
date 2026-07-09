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
      // Pre-rendered label image, so a phone-queued job prints byte-identical to
      // one printed on the warehouse PC. The website renders the full 60x80mm
      // shipment label once, packs it to a 1-bit bitmap, and stores it here; the
      // print agent feeds it straight to the Deli 720C as a TSPL BITMAP. NULL for
      // simple native-barcode jobs (e.g. rack labels), which the agent builds
      // from `code` alone. Packing: MSB-first, rows padded to whole bytes,
      // bit 0 = black dot / bit 1 = white — TSPL BITMAP polarity.
      bitmap_data: {
        type: DataTypes.TEXT,
        allowNull: true, // base64 of the packed 1-bit rows
      },
      bitmap_width_bytes: {
        type: DataTypes.INTEGER,
        allowNull: true, // bytes per row (= ceil(widthDots / 8))
      },
      bitmap_height: {
        type: DataTypes.INTEGER,
        allowNull: true, // number of rows (label height in dots)
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
