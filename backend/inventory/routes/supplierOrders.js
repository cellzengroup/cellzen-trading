const express = require('express');
const { Op } = require('sequelize');
const { SupplierOrder, WarehouseItem, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const gtradeaSync = require('../services/gtradeaSync');

const router = express.Router();

// Same staff-or-admin gate used across the inventory routes (see warehouse.js).
// Data is SHARED — every staff/admin sees every 1688 order. No per-user scoping.
const requireStaffOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'staff' || req.user?.accountType === 'Admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Staff or admin access is required' });
};

const dbGuard = (res) => {
  if (!SupplierOrder) {
    res.status(503).json({ success: false, message: '1688 orders are not configured' });
    return true;
  }
  return false;
};

// Escape LIKE/ILIKE metacharacters so a search containing % or _ is matched
// literally instead of being treated as a wildcard.
const escapeLike = (v) => String(v).replace(/[\\%_]/g, (c) => `\\${c}`);

// GET / — list supplier orders, each annotated with a warehouse match computed
// by joining china_tracking_no against warehouse_items.tracking_number (both are
// stored trim+uppercased, so it's an exact value match).
router.get('/', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const { search } = req.query;
    const where = {};
    if (search) {
      const s = `%${escapeLike(String(search).trim())}%`;
      where[Op.or] = [
        { order_number: { [Op.iLike]: s } },
        { china_tracking_no: { [Op.iLike]: s } },
        { product_name: { [Op.iLike]: s } },
        { job_code: { [Op.iLike]: s } },
      ];
    }
    // Newest ORDER first (ordered_at), not newest poll — synced_at is the same
    // for every row a sync touches, so it can't order the list meaningfully.
    // NULLS LAST so pre-backfill rows don't jump to the top.
    const rows = await SupplierOrder.findAll({
      where,
      order: [
        [sequelize.literal('ordered_at DESC NULLS LAST')],
        ['order_number', 'DESC'],
      ],
      limit: 5000,
    });

    // Warehouse match: which of these CN tracking numbers are physically stored.
    const matchMap = {};
    if (WarehouseItem) {
      const trackings = [...new Set(rows.map((r) => r.china_tracking_no).filter(Boolean))];
      if (trackings.length) {
        const items = await WarehouseItem.findAll({
          where: { tracking_number: { [Op.in]: trackings } },
          attributes: ['tracking_number', 'rack_id', 'status', 'code'],
        });
        for (const it of items) {
          const key = String(it.tracking_number || '').toUpperCase();
          // Prefer an in-stock match over a shipped one for the same tracking.
          if (!matchMap[key] || it.status === 'in_stock') {
            matchMap[key] = { rack_id: it.rack_id, status: it.status, code: it.code };
          }
        }
      }
    }

    const data = rows.map((r) => {
      const key = String(r.china_tracking_no || '').toUpperCase();
      const m = key ? matchMap[key] : null;
      return {
        id: r.id,
        order_number: r.order_number,
        job_code: r.job_code,
        china_tracking_no: r.china_tracking_no,
        nepal_tracking_no: r.nepal_tracking_no,
        status: r.status,
        product_name: r.product_name,
        product_image: r.product_image,
        supplier_url: r.supplier_url,
        source_product_id: r.source_product_id,
        quantity: r.quantity,
        shipping_mode: r.shipping_mode,
        order_status: r.order_status,
        ordered_at: r.ordered_at,
        synced_at: r.synced_at,
        warehouse: m ? { in_warehouse: true, rack_id: m.rack_id, status: m.status, code: m.code } : { in_warehouse: false },
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: data.length, data, lastSync: gtradeaSync.getStatus() });
  } catch (error) {
    console.error('List supplier orders error:', error);
    res.status(500).json({ success: false, message: 'Unable to load 1688 orders' });
  }
});

// POST /sync — kick off a fresh gtradea pull (staff/admin) and answer IMMEDIATELY
// with 202 + the in-flight status.
//
// This deliberately does NOT await the sync. A full pull is ~26-35s (gtradea is
// slow: 7 jobs x a detail round-trip each). Holding the HTTP request open that
// long meant the browser — and Render's proxy in production — gave up first and
// surfaced "Sync failed" / "failed to fetch", even though the sync itself went on
// to succeed server-side. The client follows progress via the `syncing` flag that
// both GET / and GET /status return.
//
// Coalesced, NOT errored: if a sync is already running or one finished moments
// ago, the caller's intent ("make sure fresh data is being pulled") is already
// satisfied, so we answer 200 with started:false instead of 409/429.
//
// This used to return 409/429. Because the 1688 tab fires a sync on every tab
// open (plus every 60s, from every staff member's browser), those benign
// collisions are routine — and the browser logs every non-2xx as a red "Failed
// to load resource", so a perfectly healthy, freshly-synced system looked like
// it was throwing errors in production. The protection against hammering the
// single shared gtradea account is that we don't START a sync — not the status
// code, so reporting it as success loses nothing.
const SYNC_COALESCE_MS = 3000;

router.post('/sync', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    if (!gtradeaSync.isConfigured()) {
      return res.status(503).json({ success: false, message: '1688 sync is not configured on the server' });
    }
    // An explicit user-clicked "Sync now" (?force=1) bypasses the failure backoff;
    // the tab's automatic 60s kick does not, so a persistent upstream block stays
    // paused instead of being re-hit by every open browser.
    const force = String(req.query.force || '') === '1';
    const st = gtradeaSync.getStatus();
    if (st.syncing) {
      return res.json({ success: true, data: { started: false, reason: 'already-running', ...st } });
    }
    if (!force && st.backingOffMs) {
      return res.json({ success: true, data: { started: false, reason: 'backing-off', ...st } });
    }
    if (!force && st.at && Date.now() - new Date(st.at).getTime() < SYNC_COALESCE_MS) {
      return res.json({ success: true, data: { started: false, reason: 'recently-synced', ...st } });
    }
    // runSync() flips its `syncing` flag synchronously before its first await, so
    // the status we return below already reads syncing: true.
    gtradeaSync.runSync({ force }).catch((e) => console.error('[gtradeaSync] background sync failed:', e.message));
    res.status(202).json({ success: true, data: { started: true, ...gtradeaSync.getStatus() } });
  } catch (error) {
    console.error('Sync supplier orders error:', error);
    res.status(500).json({ success: false, message: 'Sync failed' });
  }
});

// GET /status — last sync info (for the header "Synced …" label).
router.get('/status', authenticate, requireStaffOrAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: gtradeaSync.getStatus() });
});

module.exports = router;
