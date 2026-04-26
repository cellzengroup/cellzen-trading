const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

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
      await user.update({
        name: matched.name,
        username: matched.username,
        role: matched.role,
        accountType: 'Admin',
      });
    }

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

module.exports = router;
