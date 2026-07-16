const express = require('express');
const { Op } = require('sequelize');
const { SupplierOrder, WarehouseItem } = require('../models');
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
    const rows = await SupplierOrder.findAll({
      where,
      order: [['synced_at', 'DESC'], ['order_number', 'DESC']],
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

// POST /sync — pull fresh data from gtradea now (staff/admin). Throttled: 409 if a
// sync is already running, 429 if one ran in the last few seconds — so it can't be
// looped to hammer the single shared gtradea account. Returns the summary.
router.post('/sync', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    if (!gtradeaSync.isConfigured()) {
      return res.status(503).json({ success: false, message: '1688 sync is not configured on the server' });
    }
    const st = gtradeaSync.getStatus();
    if (st.syncing) {
      return res.status(409).json({ success: false, message: 'A sync is already running — please wait' });
    }
    if (st.at && Date.now() - new Date(st.at).getTime() < 15000) {
      return res.status(429).json({ success: false, message: 'Just synced — wait a few seconds before syncing again' });
    }
    const result = await gtradeaSync.runSync();
    if (result.skipped) {
      return res.status(409).json({ success: false, message: 'A sync is already running — please wait' });
    }
    if (!result.ok) {
      return res.status(502).json({ success: false, message: result.error || 'Sync failed', data: result });
    }
    res.json({ success: true, data: result });
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
