const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, UserNotice } = require('../models');
const { authenticate, generateToken, invalidateUserCache, JWT_SECRET } = require('../middleware/auth');
const { sendVerificationCodeEmail } = require('../../services/emailService');

const router = express.Router();

// First-login email verification for staff accounts.
const VERIFY_CODE_EXPIRY_MIN = 10;
const generateCode = () => String(crypto.randomInt(100000, 1000000));
const hashCode = (email, code) => crypto
  .createHmac('sha256', JWT_SECRET)
  .update(`${String(email || '').toLowerCase()}:${code}`)
  .digest('hex');

// In-memory cache for admin user records — admin emails are hardcoded and
// rarely change at runtime, so we can skip the DB roundtrip on repeat logins.
const adminUserCache = new Map(); // email -> { user, expiry }
const ADMIN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const ADMIN_CREDENTIALS = [
  {
    identifier: 'Cellzen',
    email: 'cellzen@cellzen.com.np',
    username: 'Cellzen',
    password: 'Cellzen2025@',
    name: 'Cellzen Admin',
    role: 'superadmin',
  },
  {
    identifier: 'CellzenTrading',
    email: 'admin@cellzentrading.com',
    username: 'CellzenTrading',
    password: 'Cellzen2025@',
    name: 'Cellzen Trading Admin',
    role: 'superadmin',
  },
  {
    identifier: 'ersubodhpokhrel@gmail.com',
    email: 'ersubodhpokhrel@gmail.com',
    username: 'ersubodhpokhrel',
    password: 'Subodh2060@',
    name: 'Subodh Pokhrel',
    role: 'superadmin',
  },
];

const buildAdminUserPayload = (matched, hashedPassword) => ({
  name: matched.name,
  firstName: matched.name.split(' ')[0],
  lastName: matched.name.split(' ').slice(1).join(' '),
  username: matched.username,
  email: matched.email,
  password: hashedPassword,
  role: matched.role,
  accountType: 'Admin',
});

const ENROLLMENT_TYPES = [
  { key: 'costumers', label: 'Costumers', aliases: ['Costumers', 'Customers', 'Customer'] },
  { key: 'distributors', label: 'Distributors', aliases: ['Distributor', 'Distributors'] },
  { key: 'logistics', label: 'Logistics', aliases: ['Logistics'] },
  { key: 'partners', label: 'Partners', aliases: ['Partners', 'Partner'] },
  { key: 'suppliers', label: 'Suppliers', aliases: ['Suppliers', 'Supplier'] },
];

const APPROVAL_REQUEST_TYPES = ['Distributor', 'Distributors', 'Partners', 'Partner', 'Suppliers', 'Supplier'];

const buildApprovalPayload = (user) => ({
  id: user.id,
  name: user.name,
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  accountType: user.accountType,
  phone: user.phone,
  country: user.country,
  accountApprovalStatus: user.accountApprovalStatus,
  createdAt: user.createdAt,
});

const requireAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin' && req.user?.accountType !== 'Admin') {
    return res.status(403).json({ success: false, message: 'Admin access is required' });
  }
  next();
};

// True when the authenticated user is a warehouse staff account (not an admin).
const isStaff = (req) => String(req.user?.role || '').toLowerCase() === 'staff';

// Allow admins AND staff. Staff-scoped endpoints further restrict the data set
// to rows the staff member owns (created_by_user_id = their id).
const requireStaffOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'staff' || req.user?.accountType === 'Admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Staff or admin access is required' });
};

const buildStaffPayload = (user) => ({
  id: user.id,
  name: user.name,
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  phone: user.phone,
  country: user.country,
  role: user.role,
  accountType: user.accountType,
  createdAt: user.createdAt,
});

// POST /admin-login
router.post('/admin-login', async (req, res) => {
  try {
    const rawIdentifier = req.body?.identifier;
    const rawPassword   = req.body?.password;

    if (!rawIdentifier || !rawPassword) {
      return res.status(400).json({ success: false, message: 'ID/email and password are required' });
    }

    // Defense against browser autofill / paste leaving whitespace, zero-width
    // spaces, or non-breaking spaces around the credentials. Strict === fails
    // on a single trailing space, which is a common cause of "intermittent"
    // login failures users can't reproduce.
    const identifier = String(rawIdentifier).replace(/[\s​ ]+/g, ' ').trim();
    const password   = String(rawPassword).replace(/^[\s​ ]+|[\s​ ]+$/g, '');
    const normalizedIdentifier = identifier.toLowerCase();

    const matched = ADMIN_CREDENTIALS.find((credential) =>
      (credential.identifier.toLowerCase() === normalizedIdentifier
        || credential.email.toLowerCase() === normalizedIdentifier
        || credential.username.toLowerCase() === normalizedIdentifier)
      && credential.password === password
    );

    if (!matched) {
      // Diagnostic: log WHICH part failed (identifier vs password) without
      // leaking the actual values. Helps debug intermittent failures.
      const idMatch = ADMIN_CREDENTIALS.find((c) =>
        c.identifier.toLowerCase() === normalizedIdentifier
        || c.email.toLowerCase() === normalizedIdentifier
        || c.username.toLowerCase() === normalizedIdentifier
      );
      console.warn('[AdminLogin] Reject:', idMatch ? 'wrong-password' : 'unknown-identifier',
        '| id-length:', identifier.length, '| pw-length:', password.length);
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    // Fast path: serve from in-memory cache when possible (skip DB roundtrip)
    const cached = adminUserCache.get(matched.email);
    if (cached && Date.now() < cached.expiry) {
      const token = generateToken(cached.user);
      return res.json({
        success: true,
        token,
        user: { id: cached.user.id, name: cached.user.name, email: cached.user.email, role: cached.user.role },
      });
    }

    let user = await User.findOne({ where: { email: matched.email } });

    if (!user) {
      const hashedPassword = await bcrypt.hash(matched.password, 10);
      user = await User.create(buildAdminUserPayload(matched, hashedPassword));
    } else if (
      user.name !== matched.name
      || user.username !== matched.username
      || user.role !== matched.role
      || user.accountType !== 'Admin'
    ) {
      // Fire-and-forget: don't make the user wait for the metadata sync
      user.update({
        name: matched.name,
        username: matched.username,
        role: matched.role,
        accountType: 'Admin',
      }).catch((err) => console.error('Admin metadata sync failed:', err));
      // Update local copy so cache reflects the synced state
      user.name = matched.name;
      user.username = matched.username;
      user.role = matched.role;
      user.accountType = 'Admin';
    }

    adminUserCache.set(matched.email, { user, expiry: Date.now() + ADMIN_CACHE_TTL });

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Admin login failed' });
  }
});

// POST /register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
    });

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const rawEmail = String(req.body?.email || '').trim();
    // Tolerate copy/paste whitespace around the password (Gmail-style spaces,
    // trailing newlines) without altering an intentional internal space.
    const password = String(req.body?.password || '').replace(/^\s+|\s+$/g, '');

    if (!rawEmail || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Case-insensitive match by email OR username, so staff can sign in with a
    // simple handle (e.g. "staff1") as well as their email.
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: rawEmail } },
          { username: { [Op.iLike]: rawEmail } },
        ],
      },
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // First-login gate for staff: email a one-time code and DON'T issue a token
    // yet. The client then calls /verify-login with the code. After the first
    // successful verification, emailVerified stays true and it's password-only.
    if (String(user.role).toLowerCase() === 'staff' && !user.emailVerified) {
      const code = generateCode();
      await user.update({
        emailVerificationCodeHash: hashCode(user.email, code),
        emailVerificationExpiresAt: new Date(Date.now() + VERIFY_CODE_EXPIRY_MIN * 60 * 1000),
      });
      invalidateUserCache(user.id);

      try {
        await sendVerificationCodeEmail({ to: user.email, code, name: user.name, expiryMinutes: VERIFY_CODE_EXPIRY_MIN });
      } catch (mailErr) {
        console.error('Staff verification email failed:', mailErr.message);
        return res.status(502).json({ success: false, message: 'Could not send the verification code email. Please try again or contact your admin.' });
      }

      return res.json({
        success: true,
        requiresVerification: true,
        email: user.email,
        message: 'A verification code has been sent to your email.',
      });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// POST /verify-login - Complete a staff member's FIRST login by confirming the
// emailed one-time code. On success the account is marked verified and a token
// is issued; subsequent logins skip this step.
router.post('/verify-login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and code are required' });
    }

    const user = await User.findOne({ where: { email: { [Op.iLike]: email } } });
    if (!user || String(user.role).toLowerCase() !== 'staff') {
      return res.status(401).json({ success: false, message: 'Invalid verification request' });
    }
    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      return res.status(400).json({ success: false, message: 'No pending verification. Please sign in again.' });
    }
    if (new Date() > new Date(user.emailVerificationExpiresAt)) {
      return res.status(400).json({ success: false, message: 'The code has expired. Please sign in again to get a new code.' });
    }
    if (hashCode(user.email, code) !== user.emailVerificationCodeHash) {
      return res.status(401).json({ success: false, message: 'Incorrect verification code' });
    }

    await user.update({
      emailVerified: true,
      emailVerificationCodeHash: null,
      emailVerificationExpiresAt: null,
    });
    invalidateUserCache(user.id);

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Verify login error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// GET /me
router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// GET /enrollments
router.get('/enrollments', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const [total, typeCounts] = await Promise.all([
      User.count({ where: { role: 'customer' } }),
      Promise.all(
        ENROLLMENT_TYPES.map(async (type) => ({
          key: type.key,
          label: type.label,
          count: await User.count({
            where: {
              role: 'customer',
              accountType: { [Op.in]: type.aliases },
            },
          }),
        }))
      ),
    ]);

    res.json({
      success: true,
      total,
      types: typeCounts,
    });
  } catch (error) {
    console.error('Enrollment summary error:', error);
    res.status(500).json({ success: false, message: 'Unable to load enrollment summary' });
  }
});

// GET /approval-requests - Pending distributor/partner/supplier approvals
router.get('/approval-requests', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const requests = await User.findAll({
      where: {
        role: 'customer',
        emailVerified: true,
        accountApprovalStatus: 'pending',
        accountType: { [Op.in]: APPROVAL_REQUEST_TYPES },
      },
      attributes: [
        'id',
        'name',
        'firstName',
        'lastName',
        'username',
        'email',
        'accountType',
        'phone',
        'country',
        'accountApprovalStatus',
        'createdAt',
      ],
      order: [['createdAt', 'DESC']],
    });

    res.set('Cache-Control', 'private, max-age=15');
    res.json({
      success: true,
      count: requests.length,
      data: requests.map(buildApprovalPayload),
    });
  } catch (error) {
    console.error('Approval requests error:', error);
    res.status(500).json({ success: false, message: 'Unable to load approval requests' });
  }
});

// POST /approval-requests/:id/approve - Approve a pending account
router.post('/approval-requests/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const user = await User.findOne({
      where: {
        id: req.params.id,
        role: 'customer',
        accountApprovalStatus: 'pending',
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Pending approval request not found' });
    }

    await user.update({ accountApprovalStatus: 'approved' });

    res.json({
      success: true,
      message: 'Account approved successfully',
      user: buildApprovalPayload(user),
    });
  } catch (error) {
    console.error('Approve account error:', error);
    res.status(500).json({ success: false, message: 'Unable to approve account' });
  }
});

// GET /users - Fetch users by account type (for invoices/share dropdown).
// Admins see every customer; staff see only the customers they enrolled
// (created_by_user_id = their own id).
router.get('/users', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const { type } = req.query;

    const where = { role: 'customer' };
    if (isStaff(req)) where.created_by_user_id = req.user.id;

    // Fetch all customers and filter by type in JavaScript
    // This is more reliable than complex SQL patterns
    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'accountType', 'phone', 'country'],
      order: [['name', 'ASC']],
    });

    // Filter by type if specified
    let filteredUsers = users;
    if (type) {
      const typeLower = type.toLowerCase();
      filteredUsers = users.filter(user => {
        const accountType = (user.accountType || '').toLowerCase();
        if (typeLower === 'customers') {
          return accountType.includes('customer') || accountType.includes('costumer');
        }
        if (typeLower === 'distributors') {
          return accountType.includes('distributor');
        }
        if (typeLower === 'suppliers') {
          return accountType.includes('supplier');
        }
        if (typeLower === 'partners') {
          return accountType.includes('partner');
        }
        if (typeLower === 'logistics') {
          return accountType.includes('logistic');
        }
        return true;
      });
    }

    res.json({
      success: true,
      count: filteredUsers.length,
      total: users.length,
      data: filteredUsers,
    });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ success: false, message: 'Unable to load users' });
  }
});

// PUT /users/:id - Update a user's editable fields
router.put('/users/:id', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const where = { id: req.params.id, role: 'customer' };
    if (isStaff(req)) where.created_by_user_id = req.user.id;
    const user = await User.findOne({ where });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, firstName, lastName, email, phone, country, accountType } = req.body || {};
    const updates = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof firstName === 'string') updates.firstName = firstName;
    if (typeof lastName === 'string') updates.lastName = lastName;
    if (typeof email === 'string') updates.email = email;
    if (typeof phone === 'string') updates.phone = phone;
    if (typeof country === 'string') updates.country = country;
    if (typeof accountType === 'string') updates.accountType = accountType;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields provided' });
    }

    if (updates.email && updates.email !== user.email) {
      const taken = await User.findOne({ where: { email: updates.email } });
      if (taken && taken.id !== user.id) {
        return res.status(409).json({ success: false, message: 'Email is already in use' });
      }
    }

    await user.update(updates);

    res.json({
      success: true,
      message: 'User updated',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        accountType: user.accountType,
        phone: user.phone,
        country: user.country,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Unable to update user' });
  }
});

// POST /users/:id/notices - Admin/staff sends a personal notice to a single user
router.post('/users/:id/notices', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!UserNotice) {
      return res.status(503).json({ success: false, message: 'Notice store is not configured' });
    }

    const { message, title } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const where = { id: req.params.id, role: 'customer' };
    if (isStaff(req)) where.created_by_user_id = req.user.id;
    const user = await User.findOne({ where });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Recipient user not found' });
    }

    const notice = await UserNotice.create({
      userId: user.id,
      title: title ? String(title).trim().slice(0, 200) : null,
      message: String(message).trim(),
      sentByName: req.user?.name || null,
    });

    res.status(201).json({
      success: true,
      message: 'Notice sent',
      data: {
        id: notice.id,
        title: notice.title,
        message: notice.message,
        read: notice.read,
        createdAt: notice.createdAt,
      },
    });
  } catch (error) {
    console.error('Send notice error:', error);
    res.status(500).json({ success: false, message: 'Unable to send notice' });
  }
});

// GET /me/notices - Authenticated user fetches their own notices + unread count
router.get('/me/notices', authenticate, async (req, res) => {
  try {
    if (!UserNotice) {
      return res.json({ success: true, data: [], unreadCount: 0 });
    }

    const [notices, unreadCount] = await Promise.all([
      UserNotice.findAll({
        where: { userId: req.user.id },
        order: [['createdAt', 'DESC']],
        limit: 50,
      }),
      UserNotice.count({ where: { userId: req.user.id, read: false } }),
    ]);

    res.json({
      success: true,
      unreadCount,
      data: notices.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        read: n.read,
        sentByName: n.sentByName,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    console.error('Fetch notices error:', error);
    res.status(500).json({ success: false, message: 'Unable to load notices' });
  }
});

// POST /me/notices/:id/read - Mark a single notice as read
router.post('/me/notices/:id/read', authenticate, async (req, res) => {
  try {
    if (!UserNotice) {
      return res.status(503).json({ success: false, message: 'Notice store is not configured' });
    }

    const notice = await UserNotice.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!notice) {
      return res.status(404).json({ success: false, message: 'Notice not found' });
    }
    if (!notice.read) {
      await notice.update({ read: true });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Mark notice read error:', error);
    res.status(500).json({ success: false, message: 'Unable to mark notice as read' });
  }
});

// DELETE /users/:id - Delete a registered customer-side user
router.delete('/users/:id', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const where = { id: req.params.id, role: 'customer' };
    if (isStaff(req)) where.created_by_user_id = req.user.id;
    const user = await User.findOne({ where });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await user.destroy();

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete user' });
  }
});

// POST /users - Create a customer-side user. Admins create unowned customers;
// staff create customers stamped with their own id so they appear only in that
// staff member's Management list (and the admin's full list).
router.post('/users', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const { name, email, password, phone, country, accountType } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(String(password).replace(/^\s+|\s+$/g, ''), 10);
    const trimmedName = String(name).trim();

    const user = await User.create({
      name: trimmedName,
      firstName: trimmedName.split(' ')[0],
      lastName: trimmedName.split(' ').slice(1).join(' ') || null,
      email: String(email).trim().toLowerCase(),
      password: hashedPassword,
      role: 'customer',
      accountType: accountType || 'Customer',
      phone: phone || null,
      country: country || null,
      emailVerified: true,
      accountApprovalStatus: 'approved',
      // Stamp ownership when a staff member enrolls the customer.
      created_by_user_id: isStaff(req) ? req.user.id : null,
      created_by_name: isStaff(req) ? (req.user.name || null) : null,
    });

    res.status(201).json({
      success: true,
      message: 'Customer created',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        accountType: user.accountType,
        phone: user.phone,
        country: user.country,
      },
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ success: false, message: 'Unable to create customer' });
  }
});

// ───────────────────────── Staff account management (admin only) ─────────────
// Admins create/list/update/delete warehouse staff accounts. Staff log in via
// the standard POST /login (bcrypt) and receive role 'staff'.

// GET /staff - list all staff accounts
router.get('/staff', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }
    const staff = await User.findAll({
      where: { role: 'staff' },
      attributes: ['id', 'name', 'firstName', 'lastName', 'username', 'email', 'phone', 'country', 'role', 'accountType', 'createdAt'],
      order: [['name', 'ASC']],
    });
    res.json({ success: true, count: staff.length, data: staff.map(buildStaffPayload) });
  } catch (error) {
    console.error('List staff error:', error);
    res.status(500).json({ success: false, message: 'Unable to load staff' });
  }
});

// POST /staff - create a staff account
router.post('/staff', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const { name, email, password, phone, country } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(String(password).replace(/^\s+|\s+$/g, ''), 10);
    const trimmedName = String(name).trim();

    const user = await User.create({
      name: trimmedName,
      firstName: trimmedName.split(' ')[0],
      lastName: trimmedName.split(' ').slice(1).join(' ') || null,
      email: String(email).trim().toLowerCase(),
      password: hashedPassword,
      role: 'staff',
      accountType: 'Staff',
      phone: phone || null,
      country: country || null,
      // Unverified on purpose: the staff member must confirm a one-time code
      // emailed to them on their FIRST login. After that it's password-only.
      emailVerified: false,
      accountApprovalStatus: 'approved',
    });

    res.status(201).json({ success: true, message: 'Staff account created', data: buildStaffPayload(user) });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ success: false, message: 'Unable to create staff account' });
  }
});

// PUT /staff/:id - update a staff account (optionally reset password)
router.put('/staff/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }
    const user = await User.findOne({ where: { id: req.params.id, role: 'staff' } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Staff account not found' });
    }

    const { name, email, phone, country, password } = req.body || {};
    const updates = {};
    if (typeof name === 'string') {
      updates.name = name.trim();
      updates.firstName = updates.name.split(' ')[0];
      updates.lastName = updates.name.split(' ').slice(1).join(' ') || null;
    }
    if (typeof phone === 'string') updates.phone = phone;
    if (typeof country === 'string') updates.country = country;
    if (typeof email === 'string' && email.trim() && email.trim() !== user.email) {
      const taken = await User.findOne({ where: { email: email.trim() } });
      if (taken && taken.id !== user.id) {
        return res.status(409).json({ success: false, message: 'Email is already in use' });
      }
      updates.email = email.trim();
    }
    if (typeof password === 'string' && password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      updates.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields provided' });
    }

    await user.update(updates);
    invalidateUserCache(user.id);

    res.json({ success: true, message: 'Staff account updated', data: buildStaffPayload(user) });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ success: false, message: 'Unable to update staff account' });
  }
});

// DELETE /staff/:id - remove a staff account
router.delete('/staff/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }
    const user = await User.findOne({ where: { id: req.params.id, role: 'staff' } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Staff account not found' });
    }
    await user.destroy();
    invalidateUserCache(user.id);
    res.json({ success: true, message: 'Staff account deleted' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete staff account' });
  }
});

module.exports = router;
