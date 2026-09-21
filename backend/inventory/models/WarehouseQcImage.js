const { DataTypes } = require('sequelize');
const sequelize = require('../../config/postgres');

// A QC photo of a parcel's goods, taken at the shelf as the box is put away — at
// most TWO per box (enforced by the route, not the table). Keyed by the parcel's CN
// tracking number, the same key the parcel's weight lives under, rather than by
// a warehouse_items id: the photos describe the goods in that bag, they are found
// again by scanning or tapping its goods number, and they must survive the box
// being put away a second time. Shared across all staff (never scoped by user).
//
// The JPEG itself is kept IN this table (`data`, a bytea) and served by
// GET /warehouse/qc-images/:id/file, not in Supabase Storage. This project's
// Storage service has been refused before for going over its egress quota
// ("exceed_egress_quota" — the same thing that once blanked the label fonts, see
// utils/warehouseLabels.js), and a photo feature that stops working the day that
// happens is worse than a table that is a little heavier: the phone shrinks every
// photo to ~100 KB (50% JPEG, 1600px), so two per box is small next to the rest
// of the warehouse data. The list query never selects `data`.
const WarehouseQcImage = sequelize
  ? sequelize.define('WarehouseQcImage', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      // Trimmed + UPPERCASE, like warehouse_items.tracking_number, so a lookup is
      // an exact match.
      tracking_number: { type: DataTypes.STRING, allowNull: false },
      data: { type: DataTypes.BLOB('long'), allowNull: false },
      mime: { type: DataTypes.STRING, allowNull: false, defaultValue: 'image/jpeg' },
      created_by_name: { type: DataTypes.STRING, allowNull: true },
    }, {
      tableName: 'warehouse_qc_images',
      timestamps: true, // createdAt / updatedAt (repo convention: no underscored)
      indexes: [{ fields: ['tracking_number'] }],
    })
  : null;

module.exports = WarehouseQcImage;
