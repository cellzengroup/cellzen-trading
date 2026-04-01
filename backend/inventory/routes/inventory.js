const express = require('express');
const sequelize = require('../../config/postgres');
const { Inventory, Product, Location, Transaction } = require('../models');
const { authenticate } = require('../middleware/auth');
const cache = require('../cache');

const router = express.Router();

// GET / - list all inventory with product and location details
router.get('/', authenticate, async (req, res) => {
  try {
    const { location_id } = req.query;
    const cacheKey = `inventory:${location_id || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const where = {};
    if (location_id) where.location_id = location_id;

    let [inventory, gzWarehouse] = await Promise.all([
      Inventory.findAll({
        where,
        include: [
          { model: Product, as: 'product' },
          { model: Location, as: 'location' },
        ],
        order: [[{ model: Product, as: 'product' }, 'name', 'ASC']],
      }),
      Location.findOne({ where: { name: 'Guangzhou Warehouse' } }),
    ]);

    if (gzWarehouse) {
      const gzId = String(gzWarehouse.id);
      const viewingGz = location_id && String(location_id) === gzId;

      if (!viewingGz) {
        // For non-Guangzhou locations: hide products with 0 stock at that location
        inventory = inventory.filter((inv) => {
          // Always show Guangzhou records (in All Locations view)
          if (String(inv.location_id) === gzId) return true;
          // Hide 0-stock items at other locations
          return inv.quantity > 0;
        });
      }
    }

    cache.set(cacheKey, inventory, 3000);
    res.json({ success: true, data: inventory });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
  }
});

// POST /stock-in
router.post('/stock-in', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { product_id, location_id, quantity, notes } = req.body;

    if (!product_id || !location_id || !quantity || quantity <= 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'product_id, location_id, and positive quantity are required' });
    }

    // Find or create inventory record
    const [inv, created] = await Inventory.findOrCreate({
      where: { product_id, location_id },
      defaults: { quantity },
      transaction: t,
    });

    if (!created) {
      await inv.update({ quantity: inv.quantity + quantity }, { transaction: t });
    }

    // Log transaction
    await Transaction.create({
      type: 'stock_in',
      product_id,
      to_location_id: location_id,
      quantity,
      notes,
      created_by: req.user.id,
    }, { transaction: t });

    await t.commit();

    const updated = await Inventory.findByPk(inv.id, {
      include: [
        { model: Product, as: 'product' },
        { model: Location, as: 'location' },
      ],
    });

    cache.invalidateAll();
    res.status(201).json({ success: true, data: updated });
  } catch (error) {
    await t.rollback();
    console.error('Stock in error:', error);
    res.status(500).json({ success: false, message: 'Stock in failed' });
  }
});

// POST /transfer
router.post('/transfer', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { product_id, from_location_id, to_location_id, quantity, notes } = req.body;

    if (!product_id || !from_location_id || !to_location_id || !quantity || quantity <= 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'product_id, from_location_id, to_location_id, and positive quantity are required' });
    }

    if (from_location_id === to_location_id) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Source and destination locations must be different' });
    }

    // Check source inventory
    const sourceInv = await Inventory.findOne({
      where: { product_id, location_id: from_location_id },
      transaction: t,
    });

    if (!sourceInv || sourceInv.quantity < quantity) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient stock at source location' });
    }

    // Deduct from source
    await sourceInv.update({ quantity: sourceInv.quantity - quantity }, { transaction: t });

    // Add to destination
    const [destInv, created] = await Inventory.findOrCreate({
      where: { product_id, location_id: to_location_id },
      defaults: { quantity },
      transaction: t,
    });

    if (!created) {
      await destInv.update({ quantity: destInv.quantity + quantity }, { transaction: t });
    }

    // Log transaction
    await Transaction.create({
      type: 'transfer',
      product_id,
      from_location_id,
      to_location_id,
      quantity,
      notes,
      created_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    cache.invalidateAll();
    res.json({ success: true, message: 'Transfer completed successfully' });
  } catch (error) {
    await t.rollback();
    console.error('Transfer error:', error);
    res.status(500).json({ success: false, message: 'Transfer failed' });
  }
});

// POST /sale
router.post('/sale', authenticate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { product_id, location_id, quantity, price_type, unit_price: sent_price, notes } = req.body;

    if (!product_id || !location_id || !quantity || quantity <= 0 || !price_type) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'product_id, location_id, positive quantity, and price_type are required' });
    }

    if (!['retail', 'wholesale'].includes(price_type)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'price_type must be retail or wholesale' });
    }

    // Check stock and get product price in parallel
    const [inv, product] = await Promise.all([
      Inventory.findOne({ where: { product_id, location_id }, transaction: t }),
      Product.findByPk(product_id, { transaction: t }),
    ]);

    if (!inv || inv.quantity < quantity) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    // Use the price sent by the client (user may have edited it); fall back to product price
    const unit_price = sent_price != null ? parseFloat(sent_price) : (price_type === 'retail' ? product.retail_price : product.wholesale_price);

    // Deduct stock
    await inv.update({ quantity: inv.quantity - quantity }, { transaction: t });

    // Log transaction
    await Transaction.create({
      type: 'sale',
      product_id,
      from_location_id: location_id,
      quantity,
      price_type,
      unit_price,
      notes,
      created_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    cache.invalidateAll();
    res.json({ success: true, message: 'Sale completed', unit_price, total: unit_price * quantity });
  } catch (error) {
    await t.rollback();
    console.error('Sale error:', error);
    res.status(500).json({ success: false, message: 'Sale failed' });
  }
});

module.exports = router;
