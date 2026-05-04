const express = require('express');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, UserNotice } = require('../models');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

// In-memory cache for admin user records — admin emails are hardcoded and
// rarely change at runtime, so we can skip the DB roundtrip on repeat logins.
const adminUserCache = new Map(); // email -> { user, expiry }
const ADMIN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const ADMIN_CREDENTIALS = [
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

// POST /admin-login
router.post('/admin-login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'ID/email and password are required' });
    }

    const matched = ADMIN_CREDENTIALS.find((credential) => {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      return (
        (credential.identifier.toLowerCase() === normalizedIdentifier
          || credential.email.toLowerCase() === normalizedIdentifier
          || credential.username.toLowerCase() === normalizedIdentifier)
        && credential.password === password
      );
    });

    if (!matched) {
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
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

// GET /users - Fetch users by account type (for invoices/share dropdown)
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const { type } = req.query;

    // Fetch all customers and filter by type in JavaScript
    // This is more reliable than complex SQL patterns
    const users = await User.findAll({
      where: { role: 'customer' },
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
router.put('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const user = await User.findOne({ where: { id: req.params.id, role: 'customer' } });
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

// POST /users/:id/notices - Admin sends a personal notice to a single user
router.post('/users/:id/notices', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!UserNotice) {
      return res.status(503).json({ success: false, message: 'Notice store is not configured' });
    }

    const { message, title } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const user = await User.findOne({ where: { id: req.params.id, role: 'customer' } });
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
router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'User database is not configured' });
    }

    const user = await User.findOne({ where: { id: req.params.id, role: 'customer' } });
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

module.exports = router;
