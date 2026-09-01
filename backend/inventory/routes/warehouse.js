const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Rack, WarehouseItem, PrintJob, SupplierOrder, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { withConnectionRetry } = require('../dbRetry');
const { effectiveOrderMode, toShipmentFrom } = require('../services/shipmentMode');

const router = express.Router();

// The on-site print agent (print-bridge) is NOT a logged-in user — it
// authenticates with a shared secret set as PRINT_AGENT_TOKEN in the backend
// env AND in the agent's config.json. Constant-time compared to avoid leaks.
const authenticateAgent = (req, res, next) => {
  const expected = process.env.PRINT_AGENT_TOKEN;
  if (!expected) {
    return res.status(503).json({ success: false, message: 'Print agent is not configured' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: 'Invalid agent token' });
  }
  next();
};

// Print queue needs both the model and a live connection (raw claim query).
const printDbGuard = (res) => {
  if (!PrintJob || !sequelize) {
    res.status(503).json({ success: false, message: 'Print queue is not configured' });
    return true;
  }
  return false;
};

// Warehouse — Scan & Locate.
// Same staff-or-admin gate used across the inventory routes (see packing.js).
// Warehouse data is SHARED: every staff/admin sees every rack + item. We only stamp
// the acting user on each record for the audit trail — reads are never scoped.
const requireStaffOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'staff' || req.user?.accountType === 'Admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Staff or admin access is required' });
};

// Models export `null` when the DB is unconfigured — guard before any query.
const dbGuard = (res) => {
  if (!Rack || !WarehouseItem) {
    res.status(503).json({ success: false, message: 'Warehouse database is not configured' });
    return true;
  }
  return false;
};

const normRack = (v) => String(v || '').trim().toUpperCase();

// The ONLY valid shelf-code shape: LETTERS - DIGITS - DIGITS, where the letters
// may carry a leading number of their own. That covers the GtradeA labels
// (GT-01-0001) and the older Cellzen ones (CZN01-01-0001 / CZ02-02-0001) with one
// pattern — existing shelves keep scanning. Anything else is a tracking number,
// not a shelf, and must never be created as a rack.
const SHELF_PATTERN = /^[A-Za-z]{1,6}\d{0,4}-\d{1,4}-\d{1,6}$/;
const isShelfCode = (v) => SHELF_PATTERN.test(String(v || '').trim());

// Escape LIKE/ILIKE metacharacters so a tracking number containing % or _ is
// matched literally instead of being treated as a wildcard pattern.
const escapeLike = (v) => String(v).replace(/[\\%_]/g, (c) => `\\${c}`);

// UUID shape guard for :id path params (WarehouseItem PK is a UUID) — avoids a
// Postgres "invalid input syntax for type uuid" 500 on a malformed id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The CN tracking numbers of every 1688 order line whose GOODS id (item_code),
// job id or order # matches `term` — i.e. the parcels a search term names.
//
// Why the warehouse row's own columns aren't enough: a parcel can hold several
// products and the box stores only ONE of their ids in item_code (the lowest,
// picked for stability), while the rest are resolved from supplier_orders on
// read. A search for any of the others — and there is no way for staff to know
// which of the ids on a portal row is the one the box happens to hold — would
// otherwise find nothing. It also covers a box whose item_code column is still
// null and only filled in on read.
async function trackingsForSearch(term) {
  if (!SupplierOrder || !term) return [];
  const s = `%${escapeLike(term)}%`;
  const orders = await SupplierOrder.findAll({
    where: {
      china_tracking_no: { [Op.ne]: null },
      [Op.or]: [
        { item_code: { [Op.iLike]: s } },
        { job_code: { [Op.iLike]: s } },
        { order_number: { [Op.iLike]: s } },
      ],
    },
    attributes: ['china_tracking_no'],
    limit: 2000, // a bounded widening: an empty-ish term must not drag the table in
  });
  return [...new Set(orders.map((o) => o.china_tracking_no).filter(Boolean))];
}

// Generate the INTERNAL goods number for a newly put-away item: CZN-00001,
// CZN-00002, … Every box that belongs to the same 1688 order (order_number)
// shares ONE goods number — if another box from this order is already on file,
// its code is reused instead of minting a new one. Otherwise the next
// sequential number is the max existing CZN number + 1, zero-padded to 5 digits.
//
// NOTE: for gtradea items this code is no longer what staff see — the label,
// its barcode and the GtradeA panel show the gtradea item code (item_code).
// `code` stays as the stable internal key that groups the boxes of one order
// together.
async function generateItemCode(orderNumber) {
  if (orderNumber) {
    const existing = await WarehouseItem.findOne({
      where: { order_number: orderNumber },
      order: [['createdAt', 'ASC']],
      attributes: ['code'],
    });
    if (existing?.code) return existing.code;
  }

  // Max sequence in ONE aggregate query. This used to pull every CZN row back
  // into Node just to scan for the largest number — put-away is on the scan →
  // print hot path (staff wait on it at the shelf), so the whole row set is
  // never shipped over the wire for a single max.
  //
  // `[0-9]{1,9}` (not "strip every non-digit") caps the match at 9 digits, so the
  // ::int cast can't overflow on an oddly-shaped code — and a code with no digits
  // at all yields NULL, which MAX() simply skips.
  const [[row]] = await sequelize.query(
    `SELECT MAX((substring(code from '[0-9]{1,9}'))::int) AS max_seq
       FROM warehouse_items
      WHERE code ILIKE 'CZN%'`
  );
  return `CZN-${String((row?.max_seq || 0) + 1).padStart(5, '0')}`;
}

// Mint the id of the BOX: GTP-000001, GTP-000002, … One per physical parcel,
// never shared — unlike `code`, which every box of one order deliberately shares.
// This is what the label's barcode carries, so it must resolve to exactly one row.
//
// Same shape as a gtradea product id (three letters, dash, six digits) on purpose:
// the barcode is then exactly as wide for a box of four products as for a box of
// one, which is the whole reason the box id exists.
async function generateBoxCode() {
  const [[row]] = await sequelize.query(
    `SELECT MAX((substring(box_code from '[0-9]{1,9}'))::int) AS max_seq
       FROM warehouse_items
      WHERE box_code ILIKE 'GTP%'`
  );
  return `GTP-${String((row?.max_seq || 0) + 1).padStart(6, '0')}`;
}

// ============================================================ RACKS

// GET /racks — every rack (shared), newest first
router.get('/racks', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const rows = await withConnectionRetry(() => Rack.findAll({ order: [['createdAt', 'DESC']], limit: 2000 }));
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('List racks error:', error?.message, '| original:', error?.original?.message || error?.parent?.message || '(none)');
    res.status(500).json({ success: false, message: 'Unable to load shelves' });
  }
});

// POST /racks — create a rack. `id` IS the shelf code. 409 if it already exists.
router.post('/racks', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const id = normRack(req.body?.id ?? req.body?.code);
    if (!id) return res.status(400).json({ success: false, message: 'Shelf code is required' });
    if (!isShelfCode(id)) {
      return res.status(400).json({ success: false, message: 'Shelf code must look like GT-01-0001 (letters-digits-digits).' });
    }
    const existing = await Rack.findByPk(id);
    if (existing) {
      return res.status(409).json({ success: false, message: 'That shelf already exists', data: existing });
    }
    const rack = await Rack.create({ id, note: req.body?.note || null });
    res.status(201).json({ success: true, data: rack });
  } catch (error) {
    console.error('Create rack error:', error);
    res.status(500).json({ success: false, message: 'Unable to create shelf' });
  }
});

// DELETE /racks/:id — blocked while the shelf still holds in-stock items
router.delete('/racks/:id', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const id = normRack(req.params.id);
    const rack = await Rack.findByPk(id);
    if (!rack) return res.status(404).json({ success: false, message: 'Shelf not found' });
    const inStock = await WarehouseItem.count({ where: { rack_id: id, status: 'in_stock' } });
    if (inStock > 0) {
      return res.status(409).json({
        success: false,
        message: `Can't delete ${id} — it still holds ${inStock} in-stock item(s)`,
      });
    }
    await rack.destroy();
    res.json({ success: true, removed: 1 });
  } catch (error) {
    console.error('Delete rack error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete shelf' });
  }
});

// ============================================================ ITEMS

// GET /items/export.csv — declared BEFORE the /items/:id ship route so the
// literal path is never captured by a param segment.
router.get('/items/export.csv', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const rows = await WarehouseItem.findAll({ order: [['createdAt', 'DESC'], ['id', 'ASC']] });
    // RFC-4180 quoting PLUS CSV formula-injection guard: a value beginning with
    // = + - @ (or tab/CR) is prefixed with a single quote so spreadsheets don't
    // evaluate attacker-supplied tracking/rack text as a formula (CWE-1236).
    const esc = (v) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = ['Box ID', 'Product ID', 'Code', 'Order #', 'Tracking', 'Rack', 'Status', 'Stored By', 'Stored At', 'Shipped By', 'Shipped At'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.box_code, r.item_code, r.code, r.order_number, r.tracking_number, r.rack_id, r.status,
        r.created_by_name, r.createdAt, r.shipped_by_name, r.shipped_at,
      ].map(esc).join(','));
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=warehouse_items_${dateStr}.csv`);
    res.send('﻿' + lines.join('\r\n')); // BOM so Excel reads UTF-8
  } catch (error) {
    console.error('Export items error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// Every 1688 product that travels under one CN tracking number, attached to the
// boxes that carry it. A parcel routinely holds MORE THAN ONE: a supplier
// consolidating several lines — or several orders — into one bag ships them
// under a single tracking, and the warehouse stores that bag as ONE box with one
// goods id. The box is right; the label is what has to say the bag holds five
// things and not one, so it prints this list under the bars.
//
// Sets three fields on each gtradea row, none of them model columns:
//   item_codes    — the parcel's product ids (GTI-100119), distinct, stable order
//   product_ids   — ONE PER LINE, duplicates kept, in the same order. Two lines
//                   of an order can be booked against the same product id, and
//                   they are still two things in the bag; item_codes collapses
//                   them and product_ids is what keeps both visible.
//   order_numbers — the parcel's 1688 order numbers, distinct, same order
//   product_count — how many 1688 LINES the parcel actually holds
// The count is separate on purpose. Two lines of one order can carry the SAME
// product id (and a line gtradea hasn't published an id for carries none), so
// neither list can be counted to learn how many products are in the bag — which
// is exactly the case where a label built from the ids alone said "one".
//
// Also backfills the row's own item/PR/order/product fields from the parcel when
// they weren't captured at put-away: rows stored before those columns existed,
// and any the migration couldn't match because gtradea published the job code
// only after the box was scanned in.
//
// Runs against a LIST so it costs one query for a whole page — pass [item] for a
// single row. Rows that aren't gtradea, or have no tracking, are left untouched.
async function attachParcelProducts(rows) {
  if (!SupplierOrder) return rows;
  const need = rows.filter((r) => r && r.source === 'gtradea' && r.tracking_number);
  if (!need.length) return rows;

  const trackings = [...new Set(need.map((r) => r.tracking_number))];
  const orders = await SupplierOrder.findAll({
    where: { china_tracking_no: { [Op.in]: trackings } },
    attributes: ['china_tracking_no', 'job_code', 'item_code', 'order_number', 'product_name'],
    // One tracking can carry several items (two variants in one parcel), and
    // unlike job_code their item_codes DIFFER — so the row that wins decides
    // which id gets printed. Order by item_code so the winner is always the same
    // one, instead of whatever the planner happened to return first. NULLS LAST
    // keeps a row that has an item_code ahead of one that doesn't, so a missing
    // code never shadows a real one. order_number then id break the ties the
    // item_code leaves, so the LIST comes back in the same order every read —
    // a label must not reorder itself between two prints of the same box.
    order: [['item_code', 'ASC NULLS LAST'], ['order_number', 'ASC'], ['id', 'ASC']],
  });

  const first = {};
  const codesByTracking = {};
  const lineIdsByTracking = {};
  const ordersByTracking = {};
  const linesByTracking = {};
  for (const o of orders) {
    const t = o.china_tracking_no;
    if (!first[t]) first[t] = o;
    linesByTracking[t] = (linesByTracking[t] || 0) + 1;
    // Every line, duplicates and all — see product_ids above. A line gtradea
    // hasn't published an id for goes in as null so the position is kept and the
    // list still lines up with product_count.
    (lineIdsByTracking[t] ||= []).push(o.item_code || null);
    // Pushed in query order, so each parcel's lists stay stable between reads.
    if (o.item_code && !(codesByTracking[t] || []).includes(o.item_code)) {
      (codesByTracking[t] ||= []).push(o.item_code);
    }
    if (o.order_number && !(ordersByTracking[t] || []).includes(o.order_number)) {
      (ordersByTracking[t] ||= []).push(o.order_number);
    }
  }

  for (const r of need) {
    const m = first[r.tracking_number];
    if (m) {
      if (!r.item_code) r.item_code = m.item_code;
      if (!r.pr_code) r.pr_code = m.job_code;
      if (!r.order_number) r.order_number = m.order_number;
      if (!r.product_name) r.product_name = m.product_name;
    }
    // Not model columns — setDataValue is what carries them through toJSON to
    // the client. Guarded rather than called outright: this is the warehouse's
    // busiest endpoint, and a row that is a plain object rather than a model
    // instance would otherwise take the whole list down with a 500 instead of
    // just missing one field.
    const codes = codesByTracking[r.tracking_number] || (r.item_code ? [r.item_code] : []);
    const lineIds = lineIdsByTracking[r.tracking_number] || (r.item_code ? [r.item_code] : []);
    const orderNos = ordersByTracking[r.tracking_number] || (r.order_number ? [r.order_number] : []);
    // Falls back to what the lists themselves prove: a parcel with no matching
    // 1688 rows at all still holds the one product this box names.
    const count = linesByTracking[r.tracking_number] || Math.max(codes.length, orderNos.length, 1);
    const set = (k, v) => { if (typeof r.setDataValue === 'function') r.setDataValue(k, v); else r[k] = v; };
    set('item_codes', codes);
    set('product_ids', lineIds);
    set('order_numbers', orderNos);
    set('product_count', count);
  }
  return rows;
}

// The same, for ONE row that is about to be returned on its own — and never at
// the cost of the response. Every caller has already written to the database by
// the time it runs, so a failed lookup here must not turn a put-away or a ship
// that DID happen into a 500: staff would repeat it and hit the duplicate guard.
// A label listing one product is a far smaller problem than that.
//
// Every endpoint that returns a whole item goes through this, not just the list:
// the client swaps the row it holds for whatever a write hands back, so a lean
// row from one of them would drop the parcel's product list out of a box that
// was showing it — and the next label printed for that box would name one
// product again, until a page refresh went through GET /items.
async function attachParcelSafely(item) {
  try {
    await attachParcelProducts([item]);
  } catch (e) {
    console.error('Parcel product lookup failed (the write itself succeeded):', e?.message || e);
  }
  return item;
}

// GET /items?search=&status=&rack_id= — every item (shared), searchable
router.get('/items', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const { search, status, rack_id, source } = req.query;
    const where = {};
    if (status) where.status = status;
    if (rack_id) where.rack_id = normRack(rack_id);
    if (source) where.source = String(source).trim().toLowerCase();
    const searchTerm = search ? String(search).trim() : '';
    // The clauses that can be answered by the warehouse row alone. Kept in a
    // variable because the sibling-product widening below rebuilds `where[Op.or]`
    // from it on every connection retry — appending in place would stack a
    // duplicate clause onto each attempt.
    const searchOr = searchTerm
      ? (() => {
          const s = `%${escapeLike(searchTerm)}%`;
          return [
            { item_code: { [Op.iLike]: s } }, // the id the label's barcode carries
            { box_code: { [Op.iLike]: s } },  // internal box id — on one older generation of label
            // Boxes stored before this change were labelled with the PR id, and
            // those labels are still on shelves — keep matching them so an old
            // sticker doesn't become unsearchable.
            { pr_code: { [Op.iLike]: s } },
            { code: { [Op.iLike]: s } },
            { order_number: { [Op.iLike]: s } },
            { tracking_number: { [Op.iLike]: s } },
            { rack_id: { [Op.iLike]: s } },
          ];
        })()
      : null;
    if (searchOr) where[Op.or] = searchOr;
    const rows = await withConnectionRetry(async () => {
      // Widen the search to every product in the parcel: a box holds one product
      // id of possibly several, so searching its columns alone finds it by that
      // one id only. trackingsForSearch turns the term back into the parcels it
      // names, and those parcels' boxes join the result.
      if (searchOr) {
        const trackings = await trackingsForSearch(searchTerm);
        where[Op.or] = trackings.length
          ? [...searchOr, { tracking_number: { [Op.in]: trackings } }]
          : searchOr;
      }

      // id as a tiebreaker: two items put away in the same millisecond tie on
      // createdAt alone, and without a unique tiebreak Postgres doesn't promise
      // the same tie order across polls — rows could visibly swap places on
      // refresh. id is unique and never changes, so it pins down one order.
      const found = await WarehouseItem.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'ASC']], limit: 5000 });

      // Every product in each parcel + the ids and counts the label prints from,
      // and the 1688 fields for rows that were stored without them.
      if (SupplierOrder) {
        await attachParcelProducts(found);

        // Fallback by ORDER NUMBER for boxes the tracking join couldn't reach:
        // gtradea sometimes stops publishing a tracking it once had, and the box
        // outlives that. Without this those boxes keep displaying the PR id — the
        // very id this replaced. Order-level, so on a multi-line order it can name
        // the wrong line; that's the same granularity pr_code had, so it
        // identifies the box no less precisely than before.
        //
        // Sits OUTSIDE the tracking block on purpose: `need` only collects rows
        // that have a tracking number, so a box without one would never reach this
        // if it were nested in there. Guarded by its own filter, so it costs a
        // query only when something is actually missing, and it runs after the
        // tracking pass so an exact parcel match always wins.
        const stillMissing = found.filter((r) => r.source === 'gtradea' && !r.item_code && r.order_number);
        if (stillMissing.length) {
          const orderNos = [...new Set(stillMissing.map((r) => r.order_number))];
          const byOrder = await SupplierOrder.findAll({
            where: { order_number: { [Op.in]: orderNos }, item_code: { [Op.ne]: null } },
            attributes: ['order_number', 'item_code'],
            order: [['item_code', 'ASC']], // same MIN pick as every other path
          });
          const omap = {};
          for (const o of byOrder) { if (!omap[o.order_number]) omap[o.order_number] = o.item_code; }
          for (const r of stillMissing) {
            if (omap[r.order_number]) r.item_code = omap[r.order_number];
          }
        }
      }

      return found;
    });

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('List items error:', error?.message, '| original:', error?.original?.message || error?.parent?.message || '(none)');
    res.status(500).json({ success: false, message: 'Unable to load items' });
  }
});

// POST /items — put-away. Auto-creates the shelf on first sight, dedupes an
// already-in-stock tracking number, mints (or reuses) the goods number, links
// item -> shelf.
router.post('/items', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    // `let`, not `const`: a scanned GOODS id is resolved to the tracking number of
    // the parcel it belongs to below, and everything after that stores the parcel.
    let trackingNumber = String(req.body?.trackingNumber ?? req.body?.tracking_number ?? '').trim().toUpperCase();
    const rackId = normRack(req.body?.rackId ?? req.body?.rack_id);
    if (!rackId) return res.status(400).json({ success: false, message: 'Scan or choose a shelf first' });
    if (!isShelfCode(rackId)) {
      return res.status(400).json({ success: false, message: 'Shelf code must look like GT-01-0001 (letters-digits-digits).' });
    }
    if (!trackingNumber) return res.status(400).json({ success: false, message: 'Tracking number is required' });

    // What gets held under the scanner at put-away is usually the courier's
    // tracking barcode — but the label this app prints carries the GOODS id, and
    // staff scan that here too: at a box coming back to another shelf, or simply
    // to check one they just stored. So before anything else, answer the case
    // where the code names a box that is already on a shelf, and answer it with
    // WHERE it is: 'this tracking number doesn't exist in the orders' tells
    // someone holding a labelled box nothing at all.
    //
    // Only the ids that name ONE box are matched here. pr_code and code are
    // shared by every box of an order, so an old sticker carrying one of those
    // would otherwise block a SIBLING box from being stored.
    const scanned = escapeLike(trackingNumber);
    const already = await WarehouseItem.findOne({
      where: {
        status: 'in_stock',
        [Op.or]: [
          { tracking_number: { [Op.iLike]: scanned } },
          { item_code: { [Op.iLike]: scanned } },
          { box_code: { [Op.iLike]: scanned } },
        ],
      },
    });
    if (already) {
      return res.status(409).json({
        success: false,
        message: `Already in stock — ${already.item_code || already.code} is stored on ${already.rack_id}`,
        data: already,
      });
    }

    // GtradeA section: the tracking number MUST correspond to a known 1688
    // supplier order. Free-form trackings are rejected; the matched order # +
    // product are linked onto the item for the shipment panel. Cellzen is
    // unchanged (source defaults to 'cellzen', any tracking allowed).
    const source = String(req.body?.source || 'cellzen').trim().toLowerCase() === 'gtradea' ? 'gtradea' : 'cellzen';
    let orderNumber = null;
    let productName = null;
    let prCode = null;
    let itemCode = null;
    // Null until a 1688 order says otherwise, so the model's 'By Air' default
    // still applies to a plain cellzen put-away.
    let shipmentFrom = null;
    if (source === 'gtradea') {
      if (!SupplierOrder) {
        return res.status(503).json({ success: false, message: '1688 orders are not configured' });
      }
      // Ordered by item_code, NOT synced_at: a parcel with two items in it has
      // two candidate rows, and this pick decides which item_code goes on the
      // box. The list route resolves the same way (see GET /items), so a box
      // shows the same id at put-away as it does on every later read — with
      // synced_at the two could disagree, and the printed label would stop
      // matching the panel the next time gtradea re-synced.
      let match = await SupplierOrder.findOne({
        where: { china_tracking_no: trackingNumber },
        order: [['item_code', 'ASC NULLS LAST']],
      });
      // Not a tracking number — try it as a GOODS id. A box that has shipped and
      // come back is scanned by the label on it, and that label reads GTI-100119;
      // so does the China Operations row someone may be typing from. Resolving it
      // to the parcel it belongs to means the id staff can actually see is enough
      // to store the box, instead of being rejected as an unknown tracking.
      if (!match) {
        const byGoods = await SupplierOrder.findOne({
          where: { item_code: { [Op.iLike]: escapeLike(trackingNumber) } },
          attributes: ['china_tracking_no'],
          // A goods id appears once per parcel, but pick deterministically anyway
          // so two scans of the same id can never store two different parcels.
          order: [['china_tracking_no', 'ASC NULLS LAST']],
        });
        if (byGoods?.china_tracking_no) {
          trackingNumber = byGoods.china_tracking_no;
          // Re-read by tracking so the item_code / shipment mode picked below are
          // the same ones every other path picks for this parcel (lowest item_code
          // of the tracking), rather than whichever line was scanned.
          match = await SupplierOrder.findOne({
            where: { china_tracking_no: trackingNumber },
            order: [['item_code', 'ASC NULLS LAST']],
          });
          // The parcel may already be on a shelf under its tracking number, which
          // the id check above couldn't see because it was scanned by goods id.
          const stored = await WarehouseItem.findOne({
            where: { tracking_number: { [Op.iLike]: escapeLike(trackingNumber) }, status: 'in_stock' },
          });
          if (stored) {
            return res.status(409).json({
              success: false,
              message: `Already in stock — ${stored.item_code || stored.code} is stored on ${stored.rack_id}`,
              data: stored,
            });
          }
        } else if (byGoods) {
          // Known product, but the supplier hasn't dispatched it: there is no
          // parcel to put on a shelf yet, and saying so beats "doesn't exist".
          return res.status(422).json({
            success: false,
            message: 'That goods ID has no tracking number yet — it has not been dispatched',
          });
        }
      }
      if (!match) {
        return res.status(422).json({ success: false, message: "This tracking number or goods ID doesn't exist in the orders" });
      }
      orderNumber = match.order_number || null;
      productName = match.product_name || null;
      // The gtradea item code (GTI-100119) — this is what the label that gets
      // printed seconds later shows and encodes, captured here so printing needs
      // no second lookup. job_code (PR-1029) rides along for traceability back
      // to the procurement job, but is no longer displayed anywhere.
      itemCode = match.item_code || null;
      prCode = match.job_code || null;
      // The matched parcel row can still be missing its item code — a row the
      // poller wrote before this field was mapped, for instance. Fall back to the
      // order's own code rather than letting the box be stored with nothing but a
      // PR id, which is what the label would then print.
      if (!itemCode && match.order_number) {
        const byOrder = await SupplierOrder.findOne({
          where: { order_number: match.order_number, item_code: { [Op.ne]: null } },
          attributes: ['item_code'],
          order: [['item_code', 'ASC']],
        });
        itemCode = byOrder?.item_code || null;
      }
      // Same reason for the shipment mode: scanning a box in Store prints its
      // label immediately, and that label has to read the mode the 1688 panel
      // shows for this order — the staff override if someone set one, otherwise
      // what the dangerous-goods classifier worked out. Without this the box
      // was born on the model's 'By Air' default and a lithium shipment printed
      // as air freight seconds after being scanned.
      shipmentFrom = toShipmentFrom(await effectiveOrderMode(match));
    }

    // Auto-create the shelf on first sight (spec: a new shelf code is created).
    await Rack.findOrCreate({ where: { id: rackId }, defaults: { id: rackId } });

    // Dedupe is handled by the id-aware in-stock check at the top (and repeated
    // for a goods id once it resolves to a tracking number). The partial unique
    // index on warehouse_items (tracking_number WHERE status='in_stock') remains
    // the atomic backstop for concurrent double-scans, handled in the catch below.

    // Mint (or reuse) the goods number and insert. The tracking_number partial
    // unique index is the atomic backstop for a concurrent double-scan of the
    // same tracking number (not retryable — the item is already stored).
    let item;
    try {
      item = await WarehouseItem.create({
        code: await generateItemCode(orderNumber),
        box_code: await generateBoxCode(),
        tracking_number: trackingNumber,
        rack_id: rackId,
        status: 'in_stock',
        source,
        order_number: orderNumber,
        product_name: productName,
        pr_code: prCode,
        item_code: itemCode,
        // Omitted entirely when there's no 1688 match, so the column default
        // ('By Air') applies rather than an explicit null overwriting it.
        ...(shipmentFrom ? { shipment_from: shipmentFrom } : {}),
        created_by_user_id: req.user.id,
        created_by_name: req.user.name || null,
      });
    } catch (error) {
      // MAX(box_code)+1 is not atomic, so two put-aways in the same instant can
      // pick the same number. That collision is on box_code, not tracking, and it
      // is safely retryable — the second scan just takes the next number. A
      // tracking collision means the box really is already stored, so it still 409s.
      const dupBox = error.name === 'SequelizeUniqueConstraintError'
        && String(error.parent?.constraint || '').includes('box_code');
      if (dupBox) {
        item = await WarehouseItem.create({
          code: await generateItemCode(orderNumber),
          box_code: await generateBoxCode(),
          tracking_number: trackingNumber,
          rack_id: rackId,
          status: 'in_stock',
          source,
          order_number: orderNumber,
          product_name: productName,
          pr_code: prCode,
          item_code: itemCode,
          ...(shipmentFrom ? { shipment_from: shipmentFrom } : {}),
          created_by_user_id: req.user.id,
          created_by_name: req.user.name || null,
        });
      } else if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ success: false, message: 'Already in stock — this tracking number is already stored' });
      } else {
        throw error;
      }
    }
    // The put-away sheet prints the label straight off this response, so the
    // parcel's product list has to ride along — without it a bag holding five
    // products printed a label naming one, and only a later page refresh (which
    // goes through GET /items) ever showed the rest.
    await attachParcelSafely(item);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('Put-away item error:', error);
    res.status(500).json({ success: false, message: 'Unable to store item' });
  }
});

// POST /items/:id/shipment-mode — record which way an item ships ("By Air" |
// "By Land"). Callable any time before it actually ships (the print dialog
// calls this the moment staff pick a mode for the label), so /ship below can
// just inherit whatever was set here instead of asking again.
router.post('/items/:id/shipment-mode', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    const item = await WarehouseItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    const mode = String(req.body?.shipmentMode ?? req.body?.shipment_mode ?? '').trim();
    if (mode !== 'By Air' && mode !== 'By Land') {
      return res.status(400).json({ success: false, message: 'Shipment mode must be "By Air" or "By Land"' });
    }
    await item.update({ shipment_from: mode });
    await attachParcelSafely(item);
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Update shipment mode error:', error);
    res.status(500).json({ success: false, message: 'Unable to update shipment mode' });
  }
});

// POST /items/:id/ship — mark shipped (records who + when for the audit trail)
router.post('/items/:id/ship', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    const item = await WarehouseItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (item.status === 'shipped') {
      return res.status(409).json({ success: false, message: 'Item is already shipped', data: item });
    }
    // Every shipment (Cellzen or GtradeA) records the carrier. The shipment mode
    // is NOT taken from the request — it's whatever was already set on the item
    // (via /shipment-mode, normally when the label was printed), so an item
    // printed "By Land" always ships "By Land" regardless of what a client sends.
    const logisticsName = String(req.body?.logisticsName ?? req.body?.logistics_name ?? '').trim();
    if (!logisticsName) return res.status(400).json({ success: false, message: 'Name of the logistics is required' });
    const shipmentMode = item.shipment_from === 'By Air' || item.shipment_from === 'By Land' ? item.shipment_from : 'By Air';
    await item.update({
      status: 'shipped',
      shipped_at: new Date(),
      shipped_by_user_id: req.user.id,
      shipped_by_name: req.user.name || null,
      logistics_name: logisticsName.slice(0, 120),
      shipment_from: shipmentMode,
    });
    await attachParcelSafely(item);
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Ship item error:', error);
    res.status(500).json({ success: false, message: 'Unable to mark item shipped' });
  }
});

// DELETE /items/:id — remove an item (used to clear dispatched history).
router.delete('/items/:id', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    const item = await WarehouseItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    await item.destroy();
    res.json({ success: true, removed: 1 });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete item' });
  }
});

// ============================================================ PRINT QUEUE
// Any device (incl. phones) enqueues a label; the on-site print agent polls the
// queue, prints on the Deli 720C, and reports the result. See /print-bridge.

// POST /print-jobs — enqueue a label print (staff/admin, any device).
router.post('/print-jobs', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (printDbGuard(res)) return;
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ success: false, message: 'code is required' });
    const kind = String(req.body?.kind || 'item').trim().toLowerCase() === 'rack' ? 'rack' : 'item';
    const copies = Math.min(Math.max(parseInt(req.body?.copies, 10) || 1, 1), 20);

    // Optional pre-rendered label image (base64 packed 1-bit rows). When present
    // the agent prints it verbatim as a TSPL BITMAP, so phone-queued labels match
    // the warehouse PC exactly. Only accept a well-formed, sanely-sized payload.
    const bmp = req.body?.bitmap;
    let bitmap = { data: null, widthBytes: null, height: null };
    if (bmp && typeof bmp.data === 'string') {
      const widthBytes = parseInt(bmp.widthBytes, 10);
      const height = parseInt(bmp.height, 10);
      const okDims =
        Number.isInteger(widthBytes) && widthBytes > 0 && widthBytes <= 512 &&
        Number.isInteger(height) && height > 0 && height <= 4096;
      // base64 of a 60x80mm mono label is ~51KB; cap well above that, reject abuse.
      if (okDims && /^[A-Za-z0-9+/=]+$/.test(bmp.data) && bmp.data.length <= 400000) {
        bitmap = { data: bmp.data, widthBytes, height };
      } else {
        return res.status(400).json({ success: false, message: 'Invalid bitmap payload' });
      }
    }

    const job = await PrintJob.create({
      code: code.slice(0, 64),
      kind,
      copies,
      status: 'pending',
      bitmap_data: bitmap.data,
      bitmap_width_bytes: bitmap.widthBytes,
      bitmap_height: bitmap.height,
      created_by_user_id: req.user.id,
      created_by_name: req.user.name || null,
    });
    res.status(201).json({ success: true, data: { id: job.id, status: job.status } });
  } catch (error) {
    console.error('Enqueue print job error:', error);
    res.status(500).json({ success: false, message: 'Unable to queue print' });
  }
});

// GET /print-jobs/pending — the agent atomically claims pending jobs (marks them
// 'printing' so a second agent can't grab the same ones). Also re-claims jobs
// stuck in 'printing' for >2 min (agent crashed mid-print). Declared BEFORE the
// /print-jobs/:id route so the literal path is never captured as an :id.
router.get('/print-jobs/pending', authenticateAgent, async (req, res) => {
  try {
    if (printDbGuard(res)) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
    const [rows] = await sequelize.query(
      `UPDATE print_jobs SET status = 'printing', claimed_at = NOW(), "updatedAt" = NOW()
       WHERE id IN (
         SELECT id FROM print_jobs
         WHERE status = 'pending'
            OR (status = 'printing' AND claimed_at < NOW() - INTERVAL '2 minutes')
         ORDER BY "createdAt" ASC
         LIMIT :limit
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, code, kind, copies, bitmap_data, bitmap_width_bytes, bitmap_height`,
      { replacements: { limit } }
    );
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Claim print jobs error:', error);
    res.status(500).json({ success: false, message: 'Unable to claim jobs' });
  }
});

// POST /print-jobs/:id/complete — agent reports the print result.
router.post('/print-jobs/:id/complete', authenticateAgent, async (req, res) => {
  try {
    if (printDbGuard(res)) return;
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const job = await PrintJob.findByPk(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    const ok = req.body?.ok !== false && !req.body?.error;
    await job.update({
      status: ok ? 'done' : 'error',
      error: ok ? null : String(req.body?.error || 'print failed').slice(0, 500),
      printed_at: ok ? new Date() : null,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Complete print job error:', error);
    res.status(500).json({ success: false, message: 'Unable to update job' });
  }
});

// GET /print-jobs/:id — status lookup so the UI can confirm a queued print.
router.get('/print-jobs/:id', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (printDbGuard(res)) return;
    if (!UUID_RE.test(String(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const job = await PrintJob.findByPk(req.params.id, {
      attributes: ['id', 'status', 'error', 'printed_at'],
    });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: job });
  } catch (error) {
    console.error('Get print job error:', error);
    res.status(500).json({ success: false, message: 'Unable to load job' });
  }
});

module.exports = router;
