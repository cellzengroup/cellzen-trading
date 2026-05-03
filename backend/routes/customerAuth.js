const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const User = require('../inventory/models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cellzentrading-default-secret';
const VERIFICATION_CODE_EXPIRY_MINUTES = 10;
const APPROVAL_REQUIRED_ACCOUNT_TYPES = new Set(['distributor', 'partners', 'partner', 'suppliers', 'supplier']);
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const resendFrom = process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || 'Cellzen Trading <onboarding@resend.dev>';
const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
const smtpTransporter = EMAIL_PROVIDER === 'smtp'
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_PORT) === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const buildCustomerPayload = (user) => ({
  id: user.id,
  name: user.name,
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  role: user.role,
  accountType: user.accountType,
  country: user.country,
  phone: user.phone,
  accountApprovalStatus: user.accountApprovalStatus,
});

const generateCustomerToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const requiresAdminApproval = (accountType) => APPROVAL_REQUIRED_ACCOUNT_TYPES.has(String(accountType || '').trim().toLowerCase());

const generateVerificationCode = () => String(crypto.randomInt(100000, 1000000));

const hashVerificationCode = (email, code) => crypto
  .createHmac('sha256', JWT_SECRET)
  .update(`${normalizeEmail(email)}:${code}`)
  .digest('hex');

const getVerificationExpiry = () => new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Returns true if an outbound email service is configured and ready to send.
// We use this to gracefully skip email verification when the deploy lacks
// SMTP/Resend creds (rather than failing signup entirely).
const isEmailServiceAvailable = () => {
  if (EMAIL_PROVIDER === 'smtp') {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && smtpFrom);
  }
  return Boolean(resend);
};

const ensureEmailServiceConfigured = () => {
  if (isEmailServiceAvailable()) return;
  const error = new Error('Email service is not configured');
  error.statusCode = 503;
  throw error;
};

const sendVerificationEmail = async ({ email, code, firstName }) => {
  ensureEmailServiceConfigured();

  const subject = 'Verify your Cellzen Trading account';
  const text = `Your Cellzen Trading verification code is ${code}. This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2D2D2D">
      <h2 style="color:#412460">Verify your Cellzen Trading account</h2>
      <p>Hello ${escapeHtml(firstName || 'there')},</p>
      <p>Use this code to finish creating your tracking account:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:8px;color:#412460">${code}</p>
      <p>This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  if (EMAIL_PROVIDER === 'smtp') {
    try {
      await smtpTransporter.sendMail({
        from: smtpFrom,
        to: email,
        subject,
        text,
        html,
      });
      return;
    } catch (smtpError) {
      const emailError = new Error(smtpError.message || 'SMTP verification email could not be sent');
      emailError.statusCode = 503;
      throw emailError;
    }
  }

  const { error } = await resend.emails.send({
    from: resendFrom,
    to: email,
    subject,
    text,
    html,
  });

  if (error) {
    const emailError = new Error(error.message || 'Verification email could not be sent');
    emailError.statusCode = 503;

    if (String(error.message || '').toLowerCase().includes('domain is not verified')) {
      emailError.message = 'Resend sender domain is not verified. Verify your domain in Resend or use onboarding@resend.dev for testing.';
    }

    throw emailError;
  }
};

const createAndSendVerificationCode = async (user) => {
  const code = generateVerificationCode();

  user.emailVerificationCodeHash = hashVerificationCode(user.email, code);
  user.emailVerificationExpiresAt = getVerificationExpiry();
  await user.save();

  await sendVerificationEmail({
    email: user.email,
    code,
    firstName: user.firstName,
  });
};

router.post('/register', async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'Customer database is not configured' });
    }

    const { firstName, lastName, username, email, password, accountType, country, phone } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const trimmedUsername = String(username || '').trim();
    const name = `${firstName || ''} ${lastName || ''}`.trim();

    if (!firstName || !lastName || !username || !email || !password || !accountType || !country || !phone) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, username, email, password, account type, country, and phone are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const emailServiceUp = isEmailServiceAvailable();

    const existing = await User.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.role === 'customer' && existing.emailVerified === false) {
        if (emailServiceUp) {
          try {
            await createAndSendVerificationCode(existing);
            return res.json({
              success: true,
              requiresEmailVerification: true,
              email: existing.email,
              message: 'This account is waiting for email verification. A new code has been sent.',
            });
          } catch (emailErr) {
            console.warn('Email send failed, auto-verifying instead:', emailErr.message);
          }
        }
        // No email service or send failed — auto-verify so the user can proceed.
        existing.emailVerified = true;
        existing.emailVerificationCodeHash = null;
        existing.emailVerificationExpiresAt = null;
        await existing.save();
        if (existing.accountApprovalStatus === 'pending') {
          return res.json({
            success: true,
            requiresAdminApproval: true,
            user: buildCustomerPayload(existing),
            message: 'Wait for the admin to accept your approval',
          });
        }
        return res.json({
          success: true,
          token: generateCustomerToken(existing),
          user: buildCustomerPayload(existing),
        });
      }
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const existingUsername = await User.findOne({ where: { username: trimmedUsername } });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: 'Username already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const accountApprovalStatus = requiresAdminApproval(accountType) ? 'pending' : 'approved';

    // If email service isn't available we auto-verify on creation so signup
    // never gets stuck waiting for an email that can't be sent.
    const user = await User.create({
      name,
      firstName,
      lastName,
      username: trimmedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'customer',
      accountType,
      country,
      phone,
      emailVerified: !emailServiceUp,
      accountApprovalStatus,
    });

    if (emailServiceUp) {
      try {
        await createAndSendVerificationCode(user);
        return res.status(201).json({
          success: true,
          requiresEmailVerification: true,
          email: user.email,
          message: 'Account created. Please check your email for the verification code.',
        });
      } catch (emailErr) {
        // Send failed — auto-verify and let the user in rather than blocking
        console.warn('Verification email failed, auto-verifying:', emailErr.message);
        user.emailVerified = true;
        await user.save();
      }
    }

    if (user.accountApprovalStatus === 'pending') {
      return res.status(201).json({
        success: true,
        requiresAdminApproval: true,
        user: buildCustomerPayload(user),
        message: 'Wait for the admin to accept your approval',
      });
    }

    return res.status(201).json({
      success: true,
      token: generateCustomerToken(user),
      user: buildCustomerPayload(user),
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('Customer register error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Registration failed' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'Customer database is not configured' });
    }

    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();

    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'A valid email and 6-digit code are required' });
    }

    const user = await User.findOne({ where: { email, role: 'customer' } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    if (user.emailVerified) {
      if (user.accountApprovalStatus === 'pending') {
        return res.json({
          success: true,
          requiresAdminApproval: true,
          user: buildCustomerPayload(user),
          message: 'Wait for the admin to accept your approval',
        });
      }

      return res.json({
        success: true,
        token: generateCustomerToken(user),
        user: buildCustomerPayload(user),
        message: 'Email is already verified',
      });
    }

    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      return res.status(400).json({ success: false, message: 'Verification code is missing. Please request a new code.' });
    }

    if (new Date(user.emailVerificationExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Verification code expired. Please request a new code.' });
    }

    if (user.emailVerificationCodeHash !== hashVerificationCode(email, code)) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    user.emailVerified = true;
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    if (requiresAdminApproval(user.accountType) && user.accountApprovalStatus !== 'approved') {
      user.accountApprovalStatus = 'pending';
    }
    await user.save();

    if (user.accountApprovalStatus === 'pending') {
      return res.json({
        success: true,
        requiresAdminApproval: true,
        user: buildCustomerPayload(user),
        message: 'Wait for the admin to accept your approval',
      });
    }

    res.json({
      success: true,
      token: generateCustomerToken(user),
      user: buildCustomerPayload(user),
      message: 'Email verified successfully',
    });
  } catch (error) {
    console.error('Customer verify email error:', error);
    res.status(500).json({ success: false, message: 'Email verification failed' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'Customer database is not configured' });
    }

    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ where: { email, role: 'customer' } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email is already verified' });
    }

    await createAndSendVerificationCode(user);

    res.json({
      success: true,
      message: 'A new verification code has been sent to your email.',
    });
  } catch (error) {
    console.error('Customer resend verification error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Could not resend verification code' });
  }
});

router.post('/login', async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'Customer database is not configured' });
    }

    const { email, identifier, password } = req.body;
    const loginIdentifier = (identifier || email || '').trim();
    const normalizedIdentifier = normalizeEmail(loginIdentifier);

    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Email or username and password are required' });
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: normalizedIdentifier },
          { username: loginIdentifier },
        ],
      },
    });
    if (!user || user.role !== 'customer') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.emailVerified === false) {
      // If we can actually send a verification email, ask the user to verify.
      // Otherwise auto-verify here so they're not locked out by a missing
      // email service in this deploy.
      if (isEmailServiceAvailable()) {
        return res.status(403).json({
          success: false,
          requiresEmailVerification: true,
          email: user.email,
          message: 'Please verify your email before signing in',
        });
      }
      user.emailVerified = true;
      await user.save();
    }

    if (user.accountApprovalStatus === 'pending') {
      return res.status(403).json({
        success: false,
        requiresAdminApproval: true,
        user: buildCustomerPayload(user),
        message: 'Wait for the admin to accept your approval',
      });
    }

    res.json({
      success: true,
      token: generateCustomerToken(user),
      user: buildCustomerPayload(user),
    });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

module.exports = router;
