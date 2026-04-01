const express = require('express');
const authRoutes = require('./auth');
const productRoutes = require('./products');
const locationRoutes = require('./locations');
const inventoryRoutes = require('./inventory');
const reportRoutes = require('./reports');

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Inventory API is running' });
});

// Auth routes (public)
router.use('/auth', authRoutes);

// Protected routes
router.use('/products', productRoutes);
router.use('/locations', locationRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/reports', reportRoutes);

module.exports = router;
