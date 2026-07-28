const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Rack, WarehouseItem, PrintJob, SupplierOrder, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');

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

// The ONLY valid shelf-code shape: LETTERS + DIGITS - DIGITS - DIGITS
// (e.g. CZN01-01-0001 / CZ02-02-0001). Anything else is a tracking number, not
// a shelf, and must never be created as a rack.
const SHELF_PATTERN = /^[A-Za-z]{1,6}\d{1,4}-\d{1,4}-\d{1,6}$/;
const isShelfCode = (v) => SHELF_PATTERN.test(String(v || '').trim());

// Escape LIKE/ILIKE metacharacters so a tracking number containing % or _ is
// matched literally instead of being treated as a wildcard pattern.
const escapeLike = (v) => String(v).replace(/[\\%_]/g, (c) => `\\${c}`);

// UUID shape guard for :id path params (WarehouseItem PK is a UUID) — avoids a
// Postgres "invalid input syntax for type uuid" 500 on a malformed id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Generate the next SEQUENTIAL internal code: CZN00001, CZN00002, … — the max
// existing CZN number + 1, zero-padded to 5 digits. The DB unique constraint on
// `code` + the retry loop in POST /items cover concurrent races.
async function generateItemCode() {
  const rows = await WarehouseItem.findAll({
    where: { code: { [Op.iLike]: 'CZN%' } },
    attributes: ['code'],
  });
  let maxSeq = 0;
  for (const r of rows) {
    const n = parseInt(String(r.code || '').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return `CZN${String(maxSeq + 1).padStart(5, '0')}`;
}

// A managed Postgres connection (see config/postgres.js) can go stale between
// requests — Supabase/NAT silently drop idle TCP sockets — and hand back
// "Connection terminated unexpectedly" on the very next query, even on an
// otherwise-fresh page load. Sequelize's own `retry` option only covers
// ACQUIRING a new pool connection, not a query handed a connection that was
// already checked out and has since gone stale. One retry after a short pause
// is enough to recover; anything else re-throws unchanged.
async function withConnectionRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    const detail = `${error?.name || ''} ${error?.message || ''} ${error?.original?.message || error?.parent?.message || ''}`;
    const transient = /connection terminated unexpectedly|econnreset|epipe|sequelizeconnection|timeout/i.test(detail);
    if (!transient) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return fn();
  }
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
      return res.status(400).json({ success: false, message: 'Shelf code must look like CZN01-01-0001 (letters-digits-digits).' });
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
    const rows = await WarehouseItem.findAll({ order: [['createdAt', 'DESC']] });
    // RFC-4180 quoting PLUS CSV formula-injection guard: a value beginning with
    // = + - @ (or tab/CR) is prefixed with a single quote so spreadsheets don't
    // evaluate attacker-supplied tracking/rack text as a formula (CWE-1236).
    const esc = (v) => {
      const s = String(v ?? '');
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = ['Code', 'Tracking', 'Rack', 'Status', 'Stored By', 'Stored At', 'Shipped By', 'Shipped At'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.code, r.tracking_number, r.rack_id, r.status,
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

// GET /items?search=&status=&rack_id= — every item (shared), searchable
router.get('/items', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const { search, status, rack_id, source } = req.query;
    const where = {};
    if (status) where.status = status;
    if (rack_id) where.rack_id = normRack(rack_id);
    if (source) where.source = String(source).trim().toLowerCase();
    if (search) {
      const s = `%${escapeLike(String(search).trim())}%`;
      where[Op.or] = [
        { code: { [Op.iLike]: s } },
        { tracking_number: { [Op.iLike]: s } },
        { rack_id: { [Op.iLike]: s } },
      ];
    }
    const rows = await WarehouseItem.findAll({ where, order: [['createdAt', 'DESC']], limit: 5000 });

    // For GtradeA items, resolve the linked 1688 order # + product from the live
    // supplier_orders (matched by CN tracking) whenever it wasn't captured at
    // put-away time — so the order # always shows once the item's tracking is a
    // known 1688 order.
    if (SupplierOrder) {
      const need = rows.filter((r) => r.source === 'gtradea' && r.tracking_number && (!r.order_number || !r.product_name));
      if (need.length) {
        const trackings = [...new Set(need.map((r) => r.tracking_number))];
        const orders = await SupplierOrder.findAll({
          where: { china_tracking_no: { [Op.in]: trackings } },
          attributes: ['china_tracking_no', 'order_number', 'product_name'],
        });
        const map = {};
        for (const o of orders) { if (!map[o.china_tracking_no]) map[o.china_tracking_no] = o; }
        for (const r of rows) {
          const m = r.source === 'gtradea' ? map[r.tracking_number] : null;
          if (m) {
            if (!r.order_number) r.order_number = m.order_number;
            if (!r.product_name) r.product_name = m.product_name;
          }
        }
      }
    }

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('List items error:', error);
    res.status(500).json({ success: false, message: 'Unable to load items' });
  }
});

// POST /items — put-away. Auto-creates the shelf on first sight, dedupes an
// already-in-stock tracking number, mints a unique WH code, links item -> shelf.
router.post('/items', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const trackingNumber = String(req.body?.trackingNumber ?? req.body?.tracking_number ?? '').trim().toUpperCase();
    const rackId = normRack(req.body?.rackId ?? req.body?.rack_id);
    if (!rackId) return res.status(400).json({ success: false, message: 'Scan or choose a shelf first' });
    if (!isShelfCode(rackId)) {
      return res.status(400).json({ success: false, message: 'Shelf code must look like CZN01-01-0001 (letters-digits-digits).' });
    }
    if (!trackingNumber) return res.status(400).json({ success: false, message: 'Tracking number is required' });

    // GtradeA section: the tracking number MUST correspond to a known 1688
    // supplier order. Free-form trackings are rejected; the matched order # +
    // product are linked onto the item for the shipment panel. Cellzen is
    // unchanged (source defaults to 'cellzen', any tracking allowed).
    const source = String(req.body?.source || 'cellzen').trim().toLowerCase() === 'gtradea' ? 'gtradea' : 'cellzen';
    let orderNumber = null;
    let productName = null;
    if (source === 'gtradea') {
      if (!SupplierOrder) {
        return res.status(503).json({ success: false, message: '1688 orders are not configured' });
      }
      const match = await SupplierOrder.findOne({
        where: { china_tracking_no: trackingNumber },
        order: [['synced_at', 'DESC']],
      });
      if (!match) {
        return res.status(422).json({ success: false, message: "This tracking number doesn't exist in the orders" });
      }
      orderNumber = match.order_number || null;
      productName = match.product_name || null;
    }

    // Auto-create the shelf on first sight (spec: a new shelf code is created).
    await Rack.findOrCreate({ where: { id: rackId }, defaults: { id: rackId } });

    // Dedupe: a tracking number may only be in-stock once at a time. This
    // app-level check is the friendly path; the partial unique index on
    // warehouse_items (tracking_number WHERE status='in_stock') is the atomic
    // backstop for concurrent double-scans (handled in the catch below).
    const dupe = await WarehouseItem.findOne({
      where: { tracking_number: { [Op.iLike]: escapeLike(trackingNumber) }, status: 'in_stock' },
    });
    if (dupe) {
      return res.status(409).json({
        success: false,
        message: 'Already in stock — this tracking number is already stored',
        data: dupe,
      });
    }

    // Mint a sequential CZNnnnnn code and insert, retrying if a concurrent
    // request grabbed the same number first. A tracking-index violation means a
    // concurrent put-away already stored this tracking number (not retryable).
    let item = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        item = await WarehouseItem.create({
          code: await generateItemCode(),
          tracking_number: trackingNumber,
          rack_id: rackId,
          status: 'in_stock',
          source,
          order_number: orderNumber,
          product_name: productName,
          created_by_user_id: req.user.id,
          created_by_name: req.user.name || null,
        });
        break;
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
          const constraint = String(error?.parent?.constraint || '');
          if (constraint.includes('tracking')) {
            return res.status(409).json({ success: false, message: 'Already in stock — this tracking number is already stored' });
          }
          if (attempt < 5) continue; // code collision — regenerate + retry
        }
        throw error;
      }
    }
    if (!item) {
      return res.status(409).json({ success: false, message: 'Could not allocate a code — please retry' });
    }
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('Put-away item error:', error);
    res.status(500).json({ success: false, message: 'Unable to store item' });
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
    // Cellzen requires the carrier + land/sea at ship time; GtradeA ships with a
    // single tap (those details aren't tracked for 1688 goods).
    const logisticsName = String(req.body?.logisticsName ?? req.body?.logistics_name ?? '').trim();
    const shipmentFrom = String(req.body?.shipmentFrom ?? req.body?.shipment_from ?? '').trim();
    if (item.source !== 'gtradea') {
      if (!logisticsName) return res.status(400).json({ success: false, message: 'Name of the logistics is required' });
      if (!shipmentFrom) return res.status(400).json({ success: false, message: 'Shipment from is required' });
    }
    await item.update({
      status: 'shipped',
      shipped_at: new Date(),
      shipped_by_user_id: req.user.id,
      shipped_by_name: req.user.name || null,
      logistics_name: logisticsName ? logisticsName.slice(0, 120) : null,
      shipment_from: shipmentFrom ? shipmentFrom.slice(0, 60) : null,
    });
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
