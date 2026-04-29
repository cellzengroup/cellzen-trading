const express = require('express');
const { Invoice, User } = require('../models');
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

// POST /share - Create/update the generated invoice shared with a user.
router.post('/share', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!Invoice || !User) {
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

    const sharedUser = await User.findByPk(sharedUserId);
    if (!sharedUser) {
      return res.status(404).json({ success: false, message: 'Shared user not found' });
    }

    const amount = calculateInvoiceAmount(invoice);
    const invoicePayload = {
      invoice_number: invoiceNumber,
      shared_user_id: sharedUser.id,
      shared_user_type: sharedUserType || sharedUser.accountType,
      customer_name: invoice.customerName || sharedUser.name,
      customer_email: invoice.customerEmail || sharedUser.email,
      amount,
      currency: invoice.currency || invoice.originalCurrency || 'USD',
      status: invoice.status || 'Generated',
      invoice_date: invoice.invoiceDate || null,
      invoice_data: invoice,
    };

    const [savedInvoice, created] = await Invoice.findOrCreate({
      where: { invoice_number: invoiceNumber },
      defaults: invoicePayload,
    });

    if (!created) {
      await savedInvoice.update(invoicePayload);
    }

    res.json({
      success: true,
      message: created ? 'Invoice shared with user' : 'Shared invoice updated',
      data: created ? savedInvoice : await Invoice.findByPk(savedInvoice.id),
    });
  } catch (error) {
    console.error('Share invoice error:', error);
    res.status(500).json({ success: false, message: 'Unable to share invoice' });
  }
});

// GET /shared - Invoices shared with the signed-in portal user.
router.get('/shared', authenticate, async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice database is not configured' });
    }

    const invoices = await Invoice.findAll({
      where: { shared_user_id: req.user.id },
      order: [['updatedAt', 'DESC']],
    });

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

module.exports = router;
