// Background retention job for the warehouse "1688 Orders" and "Dispatched"
// panels. Neither table is pruned anywhere else, so without this both grow
// forever — supplier_orders in particular carries a full JSONB payload per row
// (see `raw` on SupplierOrder). Runs once a day.
//
// ONLY DISPATCHED GOODS ARE EVER DELETED. Both passes measure age from the
// moment a parcel left the warehouse, and a row with no dispatch date is
// untouchable:
//
//   1. 1688 panel: a supplier_orders row is deleted SUPPLIER_ORDER_RETENTION_DAYS
//      after its parcel was dispatched, read from its OWN dispatched_at column.
//   2. Dispatched panel: a warehouse_items row is deleted
//      WAREHOUSE_DISPATCH_RETENTION_DAYS after shipped_at — that row IS the
//      dispatched-history entry, so it goes entirely.
//
// Received stock is never in scope. A box sitting on a shelf has status
// 'in_stock' and no shipped_at; its 1688 lines have no dispatched_at. Neither
// query can match either, at any age.
//
// The 1688 window is the LONGER of the two (60 days against 30), which is the
// whole reason dispatched_at exists as a column on supplier_orders rather than
// being joined from warehouse_items: by the time the 1688 row is due to go, the
// warehouse row that recorded the dispatch has been deleted for a month. The
// stamp is written at ship time (POST /items/:id/ship) and backfilled by
// migrations/add_supplier_orders_dispatched_at.js — plus, belt and braces, by
// the sweep itself for any dispatched box whose lines somehow never got one.

const { Op } = require('sequelize');
const { SupplierOrder, WarehouseItem } = require('../models');
const { withConnectionRetry } = require('../dbRetry');

const SUPPLIER_ORDER_RETENTION_DAYS = Math.max(parseInt(process.env.SUPPLIER_ORDER_RETENTION_DAYS, 10) || 60, 1);
const WAREHOUSE_DISPATCH_RETENTION_DAYS = Math.max(parseInt(process.env.WAREHOUSE_DISPATCH_RETENTION_DAYS, 10) || 30, 1);
// Once a day is plenty for a day-granularity retention window; env-tunable for testing.
const INTERVAL_MS = Math.max(parseInt(process.env.RETENTION_SWEEP_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000, 60000);

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

// Catch-up stamp: any parcel still in the Dispatched panel whose 1688 lines
// carry no dispatched_at gets one now, from the warehouse row while it is still
// there. Covers boxes shipped before the column existed (had the migration not
// been run) and anything the ship route missed — without it those lines would
// never be prunable, since nothing else records when they went out.
async function stampMissingDispatchDates() {
  if (!SupplierOrder || !WarehouseItem) return 0;
  const shipped = await WarehouseItem.findAll({
    where: {
      source: 'gtradea',
      status: 'shipped',
      shipped_at: { [Op.ne]: null },
      tracking_number: { [Op.ne]: null },
    },
    attributes: ['tracking_number', 'shipped_at'],
  });
  if (!shipped.length) return 0;

  // Latest dispatch wins where a tracking has been used more than once: the
  // retention clock must never run from an older date than the last dispatch.
  const latest = new Map();
  for (const r of shipped) {
    const key = String(r.tracking_number).trim().toUpperCase();
    const at = new Date(r.shipped_at);
    if (!latest.has(key) || at > latest.get(key)) latest.set(key, at);
  }

  let stamped = 0;
  for (const [tracking, at] of latest) {
    const [n] = await SupplierOrder.update(
      { dispatched_at: at },
      { where: { china_tracking_no: tracking, dispatched_at: null } }
    );
    stamped += n || 0;
  }
  return stamped;
}

// Delete the 1688-panel rows for parcels dispatched SUPPLIER_ORDER_RETENTION_DAYS+
// ago. Reads dispatched_at on the row itself, so it keeps working long after the
// warehouse row is gone. `Op.ne: null` is redundant next to a <= comparison in
// Postgres, but it states the rule this sweep lives by: no dispatch date, no
// delete.
async function cleanupSupplierOrders() {
  if (!SupplierOrder) return 0;
  const cutoff = daysAgo(SUPPLIER_ORDER_RETENTION_DAYS);
  return SupplierOrder.destroy({
    where: { dispatched_at: { [Op.ne]: null, [Op.lte]: cutoff } },
  });
}

// Delete Dispatched-panel (warehouse_items) rows shipped WAREHOUSE_DISPATCH_RETENTION_DAYS+
// ago — this is the dispatch history itself, so the row goes entirely. Stock is
// out of reach twice over: status must be 'shipped' AND shipped_at must be set.
async function cleanupDispatchedItems() {
  if (!WarehouseItem) return 0;
  const cutoff = daysAgo(WAREHOUSE_DISPATCH_RETENTION_DAYS);
  return WarehouseItem.destroy({
    where: {
      status: 'shipped',
      shipped_at: { [Op.ne]: null, [Op.lte]: cutoff },
    },
  });
}

async function runSweep() {
  if (!SupplierOrder && !WarehouseItem) return { supplierOrdersRemoved: 0, dispatchedItemsRemoved: 0 };
  try {
    // Order matters: stamp first, while the warehouse rows are all still there,
    // then prune the 1688 panel, then the dispatch history. Run the other way
    // round, a box crossing the 30-day line in the same sweep would be deleted
    // before its 1688 lines were ever stamped, and they would then sit in the
    // table for good.
    return await withConnectionRetry(async () => {
      const stamped = await stampMissingDispatchDates();
      const supplierOrdersRemoved = await cleanupSupplierOrders();
      const dispatchedItemsRemoved = await cleanupDispatchedItems();
      if (stamped || supplierOrdersRemoved || dispatchedItemsRemoved) {
        console.log(
          `[retention] swept: ${supplierOrdersRemoved} 1688 order(s) (>${SUPPLIER_ORDER_RETENTION_DAYS}d since dispatch), ` +
            `${dispatchedItemsRemoved} dispatched warehouse item(s) (>${WAREHOUSE_DISPATCH_RETENTION_DAYS}d)` +
            (stamped ? `, ${stamped} 1688 line(s) back-stamped with their dispatch date` : '')
        );
      }
      return { supplierOrdersRemoved, dispatchedItemsRemoved, stamped };
    });
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
      `1688 panel ${SUPPLIER_ORDER_RETENTION_DAYS}d after dispatch, dispatched history ` +
      `${WAREHOUSE_DISPATCH_RETENTION_DAYS}d. Goods still in stock are never deleted.`
  );
  setTimeout(() => { runSweep().catch(() => {}); }, 30000); // first run shortly after boot
  const timer = setInterval(() => { runSweep().catch(() => {}); }, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

module.exports = { runSweep, startScheduler };
