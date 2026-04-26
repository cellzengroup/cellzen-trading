const express = require('express');
const router = express.Router();
const FormSubmission = require('../models/FormSubmission');
const { sendContactEmail, sendNewsletterEmail } = require('../services/emailService');
const { sendContactWhatsApp } = require('../services/whatsappService');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Forms API is healthy',
    db: FormSubmission ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString()
  });
});

// Helper: save submission to DB (non-blocking — won't fail the request if DB is down)
async function saveSubmission(formType, data) {
  if (!FormSubmission) {
    console.warn('⚠️ DB not available — skipping form submission save');
    return null;
  }
  try {
    const submission = await FormSubmission.create({ formType, data });
    return submission.token;
  } catch (err) {
    console.error('⚠️ Failed to save form submission to DB:', err.message);
    return null;
  }
}

// Submit Thangka form
router.post('/thangka', async (req, res, next) => {
  try {
    const token = await saveSubmission('thangka', req.body);
    res.json({ success: true, message: 'Form submitted successfully', ...(token && { token }) });
  } catch (error) {
    next(error);
  }
});

// Submit Sound Bowls form
router.post('/soundBowls', async (req, res, next) => {
  try {
    const token = await saveSubmission('soundBowls', req.body);
    res.json({ success: true, message: 'Form submitted successfully', ...(token && { token }) });
  } catch (error) {
    next(error);
  }
});

// Submit Sacred Items form
router.post('/sacredItems', async (req, res, next) => {
  try {
    const token = await saveSubmission('sacredItems', req.body);
    res.json({ success: true, message: 'Form submitted successfully', ...(token && { token }) });
  } catch (error) {
    next(error);
  }
});

// Submit Contact form
router.post('/contact', async (req, res, next) => {
  try {
    const { name, email, phone, country, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required',
      });
    }

    // Send notifications first — these don't depend on the DB
    await Promise.all([
      sendContactEmail({ name, email, phone, country, message }),
      sendContactWhatsApp({ name, email, phone, country, message }),
    ]);

    // Save to DB after notifications succeed
    const token = await saveSubmission('contact', req.body);

    res.json({
      success: true,
      message: 'Message sent successfully',
      ...(token && { token }),
    });
  } catch (error) {
    next(error);
  }
});

// Submit newsletter subscription
router.post('/newsletter', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required',
      });
    }

    await sendNewsletterEmail({ email });
    const token = await saveSubmission('newsletter', { email });

    res.json({
      success: true,
      message: 'Subscription received successfully',
      ...(token && { token }),
    });
  } catch (error) {
    next(error);
  }
});

// Get submission by token
router.get('/submission/:token', async (req, res, next) => {
  try {
    if (!FormSubmission) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
    const submission = await FormSubmission.findOne({ where: { token: req.params.token } });
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    res.json({ success: true, submission });
  } catch (error) {
    next(error);
  }
});

// Get submissions by form type
router.get('/submissions/:formType', async (req, res, next) => {
  try {
    if (!FormSubmission) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
    const submissions = await FormSubmission.findAll({
      where: { formType: req.params.formType },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    res.json({ success: true, count: submissions.length, submissions });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
