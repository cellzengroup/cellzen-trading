const express = require('express');
const { Op } = require('sequelize');
const { PackingList } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const isStaff = (req) => String(req.user?.role || '').toLowerCase() === 'staff';

const requireStaffOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'staff' || req.user?.accountType === 'Admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Staff or admin access is required' });
};

// Derive carton/weight/CBM totals from the carton list so the stored summary
// always matches the detail (and the client can't send inconsistent totals).
const computeTotals = (data) => {
  const cartons = Array.isArray(data?.cartons) ? data.cartons : [];
  let totalWeight = 0;
  let totalCbm = 0;
  for (const c of cartons) {
    totalWeight += Number(c.weightKg) || 0;
    totalCbm += Number(c.cbm) || 0;
  }
  return {
    total_cartons: cartons.length,
    total_weight: Math.round(totalWeight * 1000) / 1000,
    total_cbm: Math.round(totalCbm * 10000) / 10000,
  };
};

// GET / - list packing lists (admin: all, staff: own)
router.get('/', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!PackingList) return res.status(503).json({ success: false, message: 'Packing list database is not configured' });
    const where = isStaff(req) ? { created_by_user_id: req.user.id } : undefined;
    const rows = await PackingList.findAll({ where, order: [['updatedAt', 'DESC']], limit: 1000 });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('List packing lists error:', error);
    res.status(500).json({ success: false, message: 'Unable to load packing lists' });
  }
});

// GET /next-number - PL-MM-NNNN (global running counter, same scheme as invoices)
router.get('/next-number', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!PackingList) return res.status(503).json({ success: false, message: 'Packing list database is not configured' });
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `PL-${month}-`;
    const rows = await PackingList.findAll({
      where: { packing_number: { [Op.like]: 'PL-%' } },
      attributes: ['packing_number'],
    });
    let maxSeq = 0;
    for (const row of rows) {
      const parts = String(row.packing_number || '').split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
    const next = String(maxSeq + 1).padStart(4, '0');
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { packingNumber: `${prefix}${next}` } });
  } catch (error) {
    console.error('Next packing number error:', error);
    res.status(500).json({ success: false, message: 'Unable to compute next packing number' });
  }
});

// GET /:packingNumber - fetch one (staff: only their own)
router.get('/:packingNumber', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!PackingList) return res.status(503).json({ success: false, message: 'Packing list database is not configured' });
    const where = { packing_number: req.params.packingNumber };
    if (isStaff(req)) where.created_by_user_id = req.user.id;
    const row = await PackingList.findOne({ where });
    if (!row) return res.status(404).json({ success: false, message: 'Packing list not found' });
    res.json({ success: true, data: row });
  } catch (error) {
    console.error('Get packing list error:', error);
    res.status(500).json({ success: false, message: 'Unable to load packing list' });
  }
});

// POST / - upsert by packing_number. Stamp owner on create; staff can't edit others.
router.post('/', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!PackingList) return res.status(503).json({ success: false, message: 'Packing list database is not configured' });
    const body = req.body?.packing || req.body || {};
    const packingNumber = body.packingNumber || body.packing_number;
    if (!packingNumber) return res.status(400).json({ success: false, message: 'Packing number is required' });

    const existing = await PackingList.findOne({ where: { packing_number: packingNumber } });
    if (isStaff(req) && existing && existing.created_by_user_id && existing.created_by_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit packing lists you created' });
    }

    const data = { cartons: Array.isArray(body.cartons) ? body.cartons : [] };
    const totals = computeTotals(data);

    const payload = {
      packing_number: packingNumber,
      reference: body.reference || null,
      customer_name: body.customerName || null,
      marka: body.marka || null,
      status: body.status || 'Draft',
      data,
      ...totals,
    };
    if (!existing || !existing.created_by_user_id) {
      payload.created_by_user_id = req.user.id;
      payload.created_by_name = req.user.name || null;
    }

    const [saved] = await PackingList.upsert(payload, { returning: true });
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Save packing list error:', error);
    res.status(500).json({ success: false, message: 'Unable to save packing list' });
  }
});

// DELETE /:packingNumber - staff only their own
router.delete('/:packingNumber', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!PackingList) return res.status(503).json({ success: false, message: 'Packing list database is not configured' });
    const where = { packing_number: req.params.packingNumber };
    if (isStaff(req)) where.created_by_user_id = req.user.id;
    const removed = await PackingList.destroy({ where });
    res.json({ success: true, removed });
  } catch (error) {
    console.error('Delete packing list error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete packing list' });
  }
});

module.exports = router;
