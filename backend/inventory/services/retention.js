// Background retention job for the warehouse "1688 Orders" and "Dispatched"
// panels. Neither table is pruned anywhere else, so without this both grow
// forever — supplier_orders in particular gets a full JSONB payload per row
// (see raw on SupplierOrder). Runs once a day:
//
//   1. 1688 panel: once a gtradea item has been shipped for
//      SUPPLIER_ORDER_RETENTION_DAYS, its matching supplier_orders row
//      (joined by china_tracking_no, same key the panels already use) is
//      deleted. The warehouse_items row itself is untouched here — only its
//      procurement-side twin in the 1688 panel goes.
//   2. Dispatched panel: any warehouse_items row (either source) shipped more
//      than WAREHOUSE_DISPATCH_RETENTION_DAYS ago is deleted outright — that
//      row IS the dispatched-history entry.
//
// Both are pure age-based deletes off shipped_at, so an item that was never
// shipped (still in_stock) is never touched by either pass.

const { Op } = require('sequelize');
const { SupplierOrder, WarehouseItem } = require('../models');
const { withConnectionRetry } = require('../dbRetry');

const SUPPLIER_ORDER_RETENTION_DAYS = Math.max(parseInt(process.env.SUPPLIER_ORDER_RETENTION_DAYS, 10) || 15, 1);
const WAREHOUSE_DISPATCH_RETENTION_DAYS = Math.max(parseInt(process.env.WAREHOUSE_DISPATCH_RETENTION_DAYS, 10) || 45, 1);
// Once a day is plenty for a day-granularity retention window; env-tunable for testing.
const INTERVAL_MS = Math.max(parseInt(process.env.RETENTION_SWEEP_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000, 60000);

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// Delete the 1688-panel (supplier_orders) rows for gtradea items that were
// dispatched SUPPLIER_ORDER_RETENTION_DAYS+ ago. Matched by tracking number,
// the same join the panels use to link a physical item to its 1688 order.
async function cleanupSupplierOrders() {
  if (!SupplierOrder || !WarehouseItem) return 0;
  return withConnectionRetry(async () => {
    const cutoff = daysAgo(SUPPLIER_ORDER_RETENTION_DAYS);
    const shipped = await WarehouseItem.findAll({
      where: {
        source: 'gtradea',
        status: 'shipped',
        shipped_at: { [Op.lte]: cutoff },
        tracking_number: { [Op.ne]: null },
      },
      attributes: ['tracking_number'],
    });
    const trackings = [...new Set(shipped.map((r) => String(r.tracking_number).trim().toUpperCase()).filter(Boolean))];
    if (!trackings.length) return 0;
    return SupplierOrder.destroy({ where: { china_tracking_no: { [Op.in]: trackings } } });
  });
}

// Delete Dispatched-panel (warehouse_items) rows shipped WAREHOUSE_DISPATCH_RETENTION_DAYS+
// ago — this is the dispatch history itself, so the row goes entirely.
async function cleanupDispatchedItems() {
  if (!WarehouseItem) return 0;
  return withConnectionRetry(async () => {
    const cutoff = daysAgo(WAREHOUSE_DISPATCH_RETENTION_DAYS);
    return WarehouseItem.destroy({ where: { status: 'shipped', shipped_at: { [Op.lte]: cutoff } } });
  });
}

async function runSweep() {
  if (!SupplierOrder && !WarehouseItem) return { supplierOrdersRemoved: 0, dispatchedItemsRemoved: 0 };
  try {
    // 1688 panel first: it depends on the warehouse_items rows the dispatch
    // sweep below is about to start deleting, so ordering avoids ever missing
    // a supplier_orders row because its warehouse_items twin disappeared first.
    const supplierOrdersRemoved = await cleanupSupplierOrders();
    const dispatchedItemsRemoved = await cleanupDispatchedItems();
    if (supplierOrdersRemoved || dispatchedItemsRemoved) {
      console.log(
        `[retention] swept: ${supplierOrdersRemoved} 1688 order(s) (>${SUPPLIER_ORDER_RETENTION_DAYS}d dispatched), ` +
          `${dispatchedItemsRemoved} dispatched warehouse item(s) (>${WAREHOUSE_DISPATCH_RETENTION_DAYS}d)`
      );
    }
    return { supplierOrdersRemoved, dispatchedItemsRemoved };
  } catch (e) {
    console.error('[retention] sweep failed:', e.message);
    return { supplierOrdersRemoved: 0, dispatchedItemsRemoved: 0, error: e.message };
  }
}

function startScheduler() {
  if (!SupplierOrder && !WarehouseItem) {
    console.log('[retention] skipped — no DB');
    return;
  }
  console.log(
    `[retention] scheduler on — every ${Math.round(INTERVAL_MS / 3600000)}h, ` +
      `1688 panel ${SUPPLIER_ORDER_RETENTION_DAYS}d after dispatch, dispatched history ${WAREHOUSE_DISPATCH_RETENTION_DAYS}d`
  );
  setTimeout(() => { runSweep().catch(() => {}); }, 30000); // first run shortly after boot
  const timer = setInterval(() => { runSweep().catch(() => {}); }, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = { runSweep, startScheduler };
