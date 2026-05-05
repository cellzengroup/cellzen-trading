const express = require('express');
const { Op } = require('sequelize');
const { Invoice } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const requireAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin' && req.user?.accountType !== 'Admin') {
    return res.status(403).json({ success: false, message: 'Admin access is required' });
  }
  next();
};

const calculateInvoiceAmount = (invoiceData) => {
  const itemsTotal = (invoiceData.items || []).reduce((sum, item) => {
    const baseTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    const commission = baseTotal * ((Number(item.commission) || 0) / 100);
    return sum + baseTotal + commission;
  }, 0);

  return itemsTotal
    + (Number(invoiceData.customsDuty) || 0)
    + (Number(invoiceData.documentationCharges) || 0)
    + (Number(invoiceData.otherCharges) || 0)
    + (Number(invoiceData.transportCost) || 0);
};

// GET / - List ALL invoices (admin only). Used by the admin invoices page so
// every admin sees the same data on every device.
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const invoices = await Invoice.findAll({
      order: [['updatedAt', 'DESC']],
      limit: 1000,
    });
    // Invoices change frequently (create/edit/delete from the admin panel).
    // A browser cache here meant freshly-saved invoices took up to 10s to
    // appear in the dashboard — disable it so every fetch is fresh.
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (error) {
    console.error('List invoices error:', error);
    res.status(500).json({ success: false, message: 'Unable to load invoices' });
  }
});

// GET /next-number - Compute the next sequential invoice number for the
// current month from the database. Format: CZN-MM-NNNN (4-digit, starts at
// 0001 each month). The DB is the source of truth so all admins / devices
// agree, regardless of localStorage state.
router.get('/next-number', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `CZN-${month}-`;

    const rows = await Invoice.findAll({
      where: { invoice_number: { [Op.like]: `${prefix}%` } },
      attributes: ['invoice_number'],
    });

    let maxSeq = 0;
    for (const row of rows) {
      const tail = String(row.invoice_number || '').slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }

    const next = String(maxSeq + 1).padStart(4, '0');
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { invoiceNumber: `${prefix}${next}`, sequence: maxSeq + 1, month } });
  } catch (error) {
    console.error('Next invoice number error:', error);
    res.status(500).json({ success: false, message: 'Unable to compute next invoice number' });
  }
});

// POST / - Upsert an invoice (admin only). Saves the full draft + computed
// summary fields keyed by invoice_number so re-saves replace cleanly.
//
// Uses Postgres UPSERT (INSERT ... ON CONFLICT DO UPDATE) — one round-trip,
// versus the old findOrCreate + update which needed 2-3.
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const invoice = req.body?.invoice || req.body;
    if (!invoice?.invoiceNumber) {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    const amount = calculateInvoiceAmount(invoice);
    const payload = {
      invoice_number: invoice.invoiceNumber,
      customer_name: invoice.customerName || invoice.customer || null,
      customer_email: invoice.customerEmail || null,
      amount,
      currency: invoice.currency || invoice.originalCurrency || 'USD',
      status: invoice.status || 'Generated',
      invoice_date: invoice.invoiceDate || null,
      invoice_data: invoice,
    };

    // Caller may explicitly include sharedUserId — even null/empty to unshare.
    // If they don't include the field at all, leave whatever's already on the row.
    if (invoice.sharedUserId !== undefined) {
      payload.shared_user_id = invoice.sharedUserId || null;
      payload.shared_user_type = invoice.sharedUserType || null;
    }

    const [saved] = await Invoice.upsert(payload, { returning: true });
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Save invoice error:', error);
    res.status(500).json({ success: false, message: 'Unable to save invoice' });
  }
});

// POST /share - Create/update the generated invoice shared with a user.
// Single UPSERT round-trip; no User lookup (caller already validated the
// recipient client-side, and the shared_user_id column is just a UUID stored
// for the /shared lookup — we don't need to JOIN on User here).
router.post('/share', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }

    const { invoice, sharedUserId, sharedUserType } = req.body;
    const invoiceNumber = invoice?.invoiceNumber;

    if (!invoiceNumber) {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    if (!sharedUserId) {
      await Invoice.destroy({ where: { invoice_number: invoiceNumber } });
      return res.json({ success: true, message: 'Invoice sharing removed' });
    }

    const amount = calculateInvoiceAmount(invoice);
    const invoicePayload = {
      invoice_number: invoiceNumber,
      shared_user_id: sharedUserId,
      shared_user_type: sharedUserType || null,
      customer_name: invoice.customerName || null,
      customer_email: invoice.customerEmail || null,
      amount,
      currency: invoice.currency || invoice.originalCurrency || 'USD',
      status: invoice.status || 'Generated',
      invoice_date: invoice.invoiceDate || null,
      invoice_data: invoice,
    };

    const [savedInvoice] = await Invoice.upsert(invoicePayload, { returning: true });

    res.json({
      success: true,
      message: 'Invoice shared with user',
      data: savedInvoice,
    });
  } catch (error) {
    console.error('Share invoice error:', error);
    res.status(500).json({ success: false, message: 'Unable to share invoice' });
  }
});

// GET /shared - Invoices shared with the signed-in portal user.
// NOTE: Must be declared BEFORE the parameterized /:invoiceNumber routes,
// otherwise Express matches /shared as invoiceNumber="shared" and the
// customer hits the admin-only handler.
router.get('/shared', authenticate, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }

    const invoices = await Invoice.findAll({
      where: { shared_user_id: req.user.id },
      order: [['updatedAt', 'DESC']],
    });

    // Per-user 10s cache: tab-switching back to Invoices won't re-hit the DB.
    res.set('Cache-Control', 'private, max-age=10');
    res.json({
      success: true,
      count: invoices.length,
      data: invoices,
    });
  } catch (error) {
    console.error('Shared invoices error:', error);
    res.status(500).json({ success: false, message: 'Unable to load shared invoices' });
  }
});

// DELETE /:invoiceNumber (admin only)
router.delete('/:invoiceNumber', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const removed = await Invoice.destroy({ where: { invoice_number: req.params.invoiceNumber } });
    res.json({ success: true, removed });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete invoice' });
  }
});

// GET /:invoiceNumber (admin only) — fetch one invoice for the editor
router.get('/:invoiceNumber', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const invoice = await Invoice.findOne({ where: { invoice_number: req.params.invoiceNumber } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ success: false, message: 'Unable to load invoice' });
  }
});

module.exports = router;
