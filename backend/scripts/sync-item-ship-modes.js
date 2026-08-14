require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Op } = require('sequelize');
const { sequelize, WarehouseItem, SupplierOrder } = require('../inventory/models');
const { effectiveOrderMode, toShipmentFrom } = require('../inventory/services/shipmentMode');

// Aligns warehouse_items.shipment_from with the mode its 1688 order ships in,
// for stock that was put away BEFORE the mode column existed.
//
// From now on this happens by itself — the put-away route stamps the mode when
// a box is scanned, and correcting the mode in the 1688 panel pushes the change
// onto the matching box. This is the one-off catch-up for everything already on
// the shelf, which would otherwise sit on the old 'By Air' default and print
// air-freight labels for lithium and blades.
//
// Only IN-STOCK items are touched. A shipped item records how it actually
// travelled and must not be rewritten.
//
//   node backend/scripts/sync-item-ship-modes.js          # report only
//   node backend/scripts/sync-item-ship-modes.js --apply  # write the changes
const APPLY = process.argv.includes('--apply');

async function main() {
  if (!sequelize || !WarehouseItem || !SupplierOrder) {
    console.error('Database not configured');
    process.exitCode = 1;
    return;
  }
  try {
    const items = await WarehouseItem.findAll({
      where: { status: 'in_stock', tracking_number: { [Op.ne]: null } },
    });
    const trackings = [...new Set(items.map((i) => i.tracking_number).filter(Boolean))];
    if (!trackings.length) {
      console.log('No in-stock items with a tracking number.');
      return;
    }

    const orders = await SupplierOrder.findAll({ where: { china_tracking_no: { [Op.in]: trackings } } });
    const byTracking = new Map();
    for (const o of orders) byTracking.set(String(o.china_tracking_no).toUpperCase(), o);

    let changed = 0;
    let matched = 0;
    for (const item of items) {
      const order = byTracking.get(String(item.tracking_number || '').toUpperCase());
      if (!order) continue; // a cellzen box with no 1688 row — leave it alone
      matched++;
      const want = toShipmentFrom(await effectiveOrderMode(order));
      if (item.shipment_from === want) continue;
      changed++;
      console.log(
        `  ${item.code || item.id}  ${item.shipment_from || '(unset)'} -> ${want}` +
        `   ${String(order.product_name || '').slice(0, 56)}`
      );
      if (APPLY) await item.update({ shipment_from: want });
    }

    console.log(
      `\n${items.length} in-stock item(s), ${matched} matched to a 1688 order, ${changed} need(s) a different mode.`
    );
    console.log(APPLY ? '✅ changes written.' : 'Dry run — re-run with --apply to write them.');
  } catch (error) {
    console.error('Sync failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
