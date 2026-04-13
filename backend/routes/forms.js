const express = require('express');
const router = express.Router();
const FormSubmission = require('../models/FormSubmission');
const { sendContactEmail } = require('../services/emailService');
const { sendContactWhatsApp } = require('../services/whatsappService');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Forms API is healthy',
    timestamp: new Date().toISOString()
  });
});

// Submit Thangka form
router.post('/thangka', async (req, res, next) => {
  try {
    const submission = new FormSubmission({
      formType: 'thangka',
      data: req.body
    });
    
    await submission.save();
    
    res.json({
      success: true,
      message: 'Form submitted successfully',
      token: submission.token
    });
  } catch (error) {
    next(error);
  }
});

// Submit Sound Bowls form
router.post('/soundBowls', async (req, res, next) => {
  try {
    const submission = new FormSubmission({
      formType: 'soundBowls',
      data: req.body
    });
    
    await submission.save();
    
    // Send to Discord
    await discordService.sendFormSubmission('soundBowls', submission);
    
    res.json({
      success: true,
      message: 'Form submitted successfully',
      token: submission.token
    });
  } catch (error) {
    next(error);
  }
});

// Submit Sacred Items form
router.post('/sacredItems', async (req, res, next) => {
  try {
    const submission = new FormSubmission({
      formType: 'sacredItems',
      data: req.body
    });
    
    await submission.save();
    
    // Send to Discord
    await discordService.sendFormSubmission('sacredItems', submission);
    
    res.json({
      success: true,
      message: 'Form submitted successfully',
      token: submission.token
    });
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

    const submission = new FormSubmission({
      formType: 'contact',
      data: req.body
    });

    await submission.save();

    // Send email + WhatsApp notifications in parallel
    await Promise.all([
      sendContactEmail({ name, email, phone, country, message }),
      sendContactWhatsApp({ name, email, phone, country, message }),
    ]);

    res.json({
      success: true,
      message: 'Message sent successfully',
      token: submission.token
    });
  } catch (error) {
    next(error);
  }
});

// Get submission by token
router.get('/submission/:token', async (req, res, next) => {
  try {
    const submission = await FormSubmission.findOne({ token: req.params.token });
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    res.json({
      success: true,
      submission
    });
  } catch (error) {
    next(error);
  }
});

// Get submissions by form type
router.get('/submissions/:formType', async (req, res, next) => {
  try {
    const submissions = await FormSubmission.find({ formType: req.params.formType })
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({
      success: true,
      count: submissions.length,
      submissions
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

