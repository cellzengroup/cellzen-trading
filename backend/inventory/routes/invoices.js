const express = require('express');
const { Op } = require('sequelize');
const { Invoice } = require('../models');
const { authenticate } = require('../middleware/auth');
const { sendInvoiceEmail } = require('../../services/emailService');

const router = express.Router();

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The two document types the invoice tool generates:
//   PI:      CZN-MM-NNNN            e.g. CZN-06-0007
//   Billing: CZN<MODE>-MMDD-NNNN    e.g. CZNLND-0923-0001 (MODE = shipment
//            mode's 3-letter code — see MODE_CODE)
// Each type keeps its own running NNNN counter (scoped by document_type, not
// by the invoice_number string), so PI and Billing numbers never collide.
const normalizeDocType = (v) => (v === 'Billing' ? 'Billing' : 'PI');
const MODE_CODE = { road: 'LND', air: 'AIR', sea: 'SEA', rail: 'RAL' };

const requireAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin' && req.user?.accountType !== 'Admin') {
    return res.status(403).json({ success: false, message: 'Admin access is required' });
  }
  next();
};

// True when the authenticated user is a warehouse staff account (not an admin).
const isStaff = (req) => String(req.user?.role || '').toLowerCase() === 'staff';

// Allow admins AND staff. Staff are then scoped to invoices they own
// (created_by_user_id = their id) inside each handler.
const requireStaffOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'staff' || req.user?.accountType === 'Admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Staff or admin access is required' });
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
// every admin sees the same data on every device. ?documentType=PI|Billing
// scopes the list to one of the two invoice tools (PI Generator / Billing
// Invoice) — omit it to get everything.
router.get('/', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const where = {};
    if (isStaff(req)) where.created_by_user_id = req.user.id;
    if (req.query.documentType) where.document_type = normalizeDocType(req.query.documentType);
    const invoices = await Invoice.findAll({
      where,
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

// GET /next-number - Compute the next invoice number for one invoice tool:
//   ?documentType=PI      -> CZN-MM-NNNN            (default)
//   ?documentType=Billing -> CZN<MODE>-YYMMNNNN      (?mode=road|air|sea|rail,
//                            defaults to GEN when omitted/unrecognized)
//
// NNNN is a SINGLE GLOBAL running counter PER document_type (mode is just a
// label baked into a Billing number, not a separate counter) — taken from the
// trailing 4 digits of every existing invoice_number of that type, regardless
// of month/mode. Consequences:
//   • A new month does NOT reset the counter — e.g. CZN-05-0010 → CZN-06-0011.
//   • Deleting the latest invoice frees its number for reuse, because the next
//     number is always (highest existing sequence + 1).
// The DB is the source of truth so all admins / devices agree, regardless of
// localStorage state.
router.get('/next-number', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const docType = normalizeDocType(req.query.documentType);
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const rows = await Invoice.findAll({
      where: { document_type: docType },
      attributes: ['invoice_number'],
    });

    // The running counter is always the invoice_number's trailing 4 digits,
    // for both formats (…-NNNN and …-YYMMNNNN both end in a 4-digit NNNN).
    let maxSeq = 0;
    for (const row of rows) {
      const n = parseInt(String(row.invoice_number || '').slice(-4), 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }

    const seq = maxSeq + 1;
    const seqStr = String(seq).padStart(4, '0');
    const invoiceNumber = docType === 'Billing'
      ? `CZN${MODE_CODE[String(req.query.mode || '').toLowerCase()] || 'GEN'}-${month}${day}-${seqStr}`
      : `CZN-${month}-${seqStr}`;

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { invoiceNumber, sequence: seq, month } });
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
router.post('/', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const invoice = req.body?.invoice || req.body;
    if (!invoice?.invoiceNumber) {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    // Ownership check: a staff member may only create new invoices or edit their
    // own. Editing another user's (or admin's) invoice is forbidden.
    const existing = await Invoice.findOne({ where: { invoice_number: invoice.invoiceNumber } });
    if (isStaff(req) && existing && existing.created_by_user_id && existing.created_by_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit invoices you created' });
    }

    const amount = calculateInvoiceAmount(invoice);
    const payload = {
      invoice_number: invoice.invoiceNumber,
      document_type: normalizeDocType(invoice.documentType),
      customer_name: invoice.customerName || invoice.customer || null,
      customer_email: invoice.customerEmail || null,
      amount,
      currency: invoice.currency || invoice.originalCurrency || 'USD',
      status: invoice.status || 'Generated',
      invoice_date: invoice.invoiceDate || null,
      invoice_data: invoice,
    };

    // Stamp the owner on first creation (or backfill a legacy row missing one).
    // On a later edit we omit these fields so the original owner is preserved.
    if (!existing || !existing.created_by_user_id) {
      payload.created_by_user_id = req.user.id;
      payload.created_by_name = req.user.name || null;
    }

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
router.post('/share', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }

    const { invoice, sharedUserId, sharedUserType } = req.body;
    const invoiceNumber = invoice?.invoiceNumber;

    if (!invoiceNumber) {
      return res.status(400).json({ success: false, message: 'Invoice number is required' });
    }

    // Staff may only share/unshare their own invoices.
    const existingShare = await Invoice.findOne({ where: { invoice_number: invoiceNumber } });
    if (isStaff(req) && existingShare && existingShare.created_by_user_id && existingShare.created_by_user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only share invoices you created' });
    }

    if (!sharedUserId) {
      const destroyWhere = { invoice_number: invoiceNumber };
      if (isStaff(req)) destroyWhere.created_by_user_id = req.user.id;
      await Invoice.destroy({ where: destroyWhere });
      return res.json({ success: true, message: 'Invoice sharing removed' });
    }

    const amount = calculateInvoiceAmount(invoice);
    const invoicePayload = {
      invoice_number: invoiceNumber,
      document_type: normalizeDocType(invoice.documentType),
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

    // Preserve/stamp ownership so a shared invoice still belongs to its creator.
    if (!existingShare || !existingShare.created_by_user_id) {
      invoicePayload.created_by_user_id = req.user.id;
      invoicePayload.created_by_name = req.user.name || null;
    }

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

// DELETE /:invoiceNumber — admins delete any; staff only their own.
router.delete('/:invoiceNumber', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const where = { invoice_number: req.params.invoiceNumber };
    if (isStaff(req)) where.created_by_user_id = req.user.id;
    const removed = await Invoice.destroy({ where });
    res.json({ success: true, removed });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete invoice' });
  }
});

// POST /:invoiceNumber/send-email (admin only) — email the invoice PDF to the
// customer. The admin authors the subject/body in the dashboard; the PDF is
// generated client-side and sent here as base64. On success we mark the
// invoice "Sent" and stamp an audit trail into invoice_data (no migration).
router.post('/:invoiceNumber/send-email', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }

    const { invoiceNumber } = req.params;
    const { to, subject, message, pdfBase64, filename, copyToSelf } = req.body || {};

    const recipient = String(to || '').trim();
    if (!EMAIL_RX.test(recipient)) {
      return res.status(400).json({ success: false, message: 'A valid recipient email is required' });
    }
    if (!pdfBase64) {
      return res.status(400).json({ success: false, message: 'Invoice PDF attachment is missing' });
    }

    const emailWhere = { invoice_number: invoiceNumber };
    if (isStaff(req)) emailWhere.created_by_user_id = req.user.id;
    const invoice = await Invoice.findOne({ where: emailWhere });
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const cc = copyToSelf ? (process.env.EMAIL_TO || process.env.SMTP_FROM || undefined) : undefined;

    // Fire-and-forget: the Gmail SMTP handshake can take ~100s on restricted
    // networks (it's near-instant in production). Don't block the admin's
    // request on it — kick off the send in the background and respond now.
    // Failures are logged server-side; the admin can re-send if needed.
    sendInvoiceEmail({
      to: recipient,
      cc,
      subject: subject || `Invoice ${invoiceNumber} from Cellzen Trading`,
      message: message || '',
      customerName: invoice.customer_name,
      invoiceNumber,
      pdfBase64,
      filename: filename || `${invoiceNumber}.pdf`,
    })
      .then(() => console.log(`✅ Invoice email sent: ${invoiceNumber} -> ${recipient}`))
      .catch((err) => console.error(`❌ Invoice email failed: ${invoiceNumber} -> ${recipient}:`, err.message));

    // Record the send immediately (optimistic). invoice_data is JSONB —
    // Sequelize won't detect an in-place mutation, so assign a fresh object.
    const sentAt = new Date().toISOString();
    invoice.status = 'Sent';
    invoice.invoice_data = {
      ...(invoice.invoice_data || {}),
      status: 'Sent',
      emailLog: { sentAt, sentTo: recipient, sentBy: req.user?.email || null },
    };
    invoice.changed('invoice_data', true);
    await invoice.save();

    // Respond right away — the email delivers in the background.
    res.json({ success: true, message: 'Invoice email is being sent', data: { sentAt } });
  } catch (error) {
    console.error('Send invoice email error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Unable to send invoice email' });
  }
});

// GET /:invoiceNumber/items — line items only (name/image/quantity), used by the
// Packing List "Load PI". NOT owner-scoped: any staff/admin can read the product
// list of a company PI for packing, even one they didn't create. Exposes ONLY
// product name/image/quantity/weight/cbm — no pricing, customer, or full data.
// Case-insensitive number match. Declared before GET /:invoiceNumber (distinct path).
router.get('/:invoiceNumber/items', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const invoice = await Invoice.findOne({
      where: { invoice_number: { [Op.iLike]: String(req.params.invoiceNumber).trim() } },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    const rawItems = Array.isArray(invoice.invoice_data?.items) ? invoice.invoice_data.items : [];
    const data = rawItems.map((it) => ({
      productName: it.productName || it.product || '',
      productImage: it.productImage || it.image || '',
      quantity: Number(it.quantity) || 1,
      weight: it.weight || '',
      cbm: it.cbm || '',
    }));
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Get invoice items error:', error);
    res.status(500).json({ success: false, message: 'Unable to load invoice items' });
  }
});

// GET /:invoiceNumber — fetch one invoice for the editor. Staff only their own.
router.get('/:invoiceNumber', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }
    const oneWhere = { invoice_number: req.params.invoiceNumber };
    if (isStaff(req)) oneWhere.created_by_user_id = req.user.id;
    const invoice = await Invoice.findOne({ where: oneWhere });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ success: false, message: 'Unable to load invoice' });
  }
});

module.exports = router;
