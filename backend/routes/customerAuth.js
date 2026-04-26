const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const User = require('../inventory/models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cellzentrading-default-secret';

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
});

const generateCustomerToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

router.post('/register', async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'Customer database is not configured' });
    }

    const { firstName, lastName, username, email, password, accountType, country, phone } = req.body;
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

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: 'Username already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      firstName,
      lastName,
      username,
      email,
      password: hashedPassword,
      role: 'customer',
      accountType,
      country,
      phone,
    });

    res.status(201).json({
      success: true,
      token: generateCustomerToken(user),
      user: buildCustomerPayload(user),
    });
  } catch (error) {
    console.error('Customer register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    if (!User) {
      return res.status(503).json({ success: false, message: 'Customer database is not configured' });
    }

    const { email, identifier, password } = req.body;
    const loginIdentifier = (identifier || email || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Email or username and password are required' });
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: loginIdentifier },
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
