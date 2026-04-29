const express = require('express');
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const { Product, Location, Inventory } = require('../models');
const { authenticate } = require('../middleware/auth');
const cache = require('../cache');
const { uploadImage, uploadPdf, deleteImage } = require('../../config/supabase');

const router = express.Router();

// Multer config — memory storage so we can forward the buffer to Supabase
const upload = multer({
  storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImageField = file.fieldname === 'image' || file.fieldname === 'image2';
    const isPdfField = file.fieldname === 'pdf_files';
    const imageAllowed = /jpeg|jpg|png|gif|webp/;

    if (isImageField && imageAllowed.test(ext) && imageAllowed.test(file.mimetype)) return cb(null, true);
    if (isPdfField && ext === '.pdf' && file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only image files or PDF documents are allowed'));
  },
});

// Wrapper: run multer only for multipart requests, skip for JSON
const optionalUpload = (fields) => (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return upload.fields(fields)(req, res, next);
  }
  next();
};

// GET / - list all products
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, sharedWith } = req.query;
    const cacheKey = `products:${search || ''}:${sharedWith || ''}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const products = await Product.findAll({ where, order: [['name', 'ASC']] });

    // Filter by sharedWith if specified
    let filteredProducts = products;
    if (sharedWith) {
      filteredProducts = products.filter(p => {
        // Handle both object and string (JSON) formats of share_to
        let shareTo = p.share_to || {};
        if (typeof shareTo === 'string') {
          try {
            shareTo = JSON.parse(shareTo);
          } catch (e) {
            shareTo = {};
          }
        }
        return shareTo[sharedWith] === true;
      });
    }

    cache.set(cacheKey, filteredProducts, 3000);
    res.json({ success: true, data: filteredProducts });
  } catch (error) {
    console.error('Get products error:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
});

// GET /:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// POST / - create product (with optional image upload)
router.post('/', authenticate, optionalUpload([{ name: 'image', maxCount: 1 }, { name: 'image2', maxCount: 1 }, { name: 'pdf_files', maxCount: 10 }]), async (req, res) => {
  try {
    const {
      name,
      description,
      image_url,
      image_url_2,
      barcode,
      cost_price,
      retail_price,
      wholesale_price,
      category,
      supplier_name,
      supplier_email,
      supplier_phone,
      factory_location,
      weight,
      size,
      share_to,
    } = req.body;

    // Parse share_to if it's a string
    let parsedShareTo = { customers: false, distributors: false, partners: false };
    if (share_to) {
      try {
        parsedShareTo = typeof share_to === 'string' ? JSON.parse(share_to) : share_to;
      } catch (e) {
        console.error('Error parsing share_to:', e);
      }
    }

    const rawQty = req.body.quantity;
    const qty = Math.max(1, Number(rawQty) || 1);
    console.log('[Create Product] quantity received:', rawQty, '→ parsed:', qty);

    if (!category) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }

    // Use uploaded file (→ Supabase), or provided URL (ignore ephemeral blob: URLs)
    let finalImageUrl = (image_url && !image_url.startsWith('blob:')) ? image_url : null;
    if (req.files?.image?.[0]) {
      finalImageUrl = await uploadImage(req.files.image[0].buffer, req.files.image[0].originalname);
    }

    let finalImageUrl2 = (image_url_2 && !image_url_2.startsWith('blob:')) ? image_url_2 : null;
    if (req.files?.image2?.[0]) {
      finalImageUrl2 = await uploadImage(req.files.image2[0].buffer, req.files.image2[0].originalname);
    }

    const pdfFiles = req.files?.pdf_files || [];
    const pdfFileIndex = Number(req.body.pdf_file_index);
    const uploadedPdfs = await Promise.all(
      pdfFiles.map(async (file) => ({
        name: file.originalname,
        size: file.size,
        url: await uploadPdf(file.buffer, file.originalname),
      }))
    );

    // Ensure default location exists
    let locations = await Location.findAll();
    let guangzhou = locations.find((l) => l.name === 'Guangzhou Warehouse');
    if (!guangzhou) {
      guangzhou = await Location.create({ name: 'Guangzhou Warehouse', type: 'warehouse' });
      locations = await Location.findAll();
    }

    const { Transaction } = require('../models');
    const pdfGroups = uploadedPdfs.length ? uploadedPdfs.map((pdf) => [pdf]) : [[]];
    const createdProducts = [];

    for (const pdfGroup of pdfGroups) {
      const pdfName = pdfGroup[0]?.name;
      const product = await Product.create({
        name: pdfName ? `${name || supplier_name || category} - ${pdfName}` : name || supplier_name || category,
        description,
        image_url: finalImageUrl,
        image_url_2: finalImageUrl2,
        barcode: pdfGroups.length === 1 ? barcode || null : null,
        cost_price: cost_price || 0,
        retail_price: retail_price || 0,
        wholesale_price: wholesale_price || 0,
        category: category || null,
        supplier_name: supplier_name || null,
        supplier_email: supplier_email || null,
        supplier_phone: supplier_phone || null,
        factory_location: factory_location || null,
        pdf_files: pdfGroup,
        share_to: parsedShareTo,
        weight: weight || null,
        size: size || null,
      });

      createdProducts.push(product);

      // Auto stock-in at Guangzhou Warehouse
      const [gzInv, gzCreated] = await Inventory.findOrCreate({
        where: { product_id: product.id, location_id: guangzhou.id },
        defaults: { quantity: qty },
      });
      if (!gzCreated) {
        await gzInv.update({ quantity: gzInv.quantity + qty });
      }

      // Create inventory records (quantity 0) at other locations + log transaction in parallel
      await Promise.all([
        ...locations
          .filter((loc) => loc.id !== guangzhou.id)
          .map((loc) =>
            Inventory.findOrCreate({
              where: { product_id: product.id, location_id: loc.id },
              defaults: { quantity: 0 },
            })
          ),
        Transaction.create({
          type: 'stock_in',
          product_id: product.id,
          to_location_id: guangzhou.id,
          quantity: qty,
          notes: `Auto stock-in on product creation (qty: ${qty})`,
          created_by: req.user?.id || null,
        }),
      ]);
    }

    cache.invalidate('products');
    cache.invalidate('summary');
    cache.invalidate('inventory');
    res.status(201).json({ success: true, data: createdProducts.length === 1 ? createdProducts[0] : createdProducts });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'Barcode already exists' });
    }
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

// PUT /:id - update product (with optional image upload)
router.put('/:id', authenticate, optionalUpload([{ name: 'image', maxCount: 1 }, { name: 'image2', maxCount: 1 }, { name: 'pdf_files', maxCount: 10 }]), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const {
      name,
      description,
      image_url,
      image_url_2,
      barcode,
      cost_price,
      retail_price,
      wholesale_price,
      category,
      supplier_name,
      supplier_email,
      supplier_phone,
      factory_location,
      weight,
      size,
      share_to,
    } = req.body;

    // Parse share_to if provided
    let parsedShareTo = product.share_to || { customers: false, distributors: false, partners: false };
    if (share_to !== undefined) {
      try {
        parsedShareTo = typeof share_to === 'string' ? JSON.parse(share_to) : share_to;
      } catch (e) {
        console.error('Error parsing share_to:', e);
      }
    }

    // Use uploaded file (→ Supabase), or provided URL, or keep existing (ignore ephemeral blob: URLs)
    let finalImageUrl = image_url !== undefined ? ((image_url && image_url.startsWith('blob:')) ? product.image_url : image_url) : product.image_url;
    if (req.files?.image?.[0]) {
      finalImageUrl = await uploadImage(req.files.image[0].buffer, req.files.image[0].originalname);
      if (product.image_url) {
        deleteImage(product.image_url).catch(() => {});
      }
    }

    let finalImageUrl2 = image_url_2 !== undefined ? ((image_url_2 && image_url_2.startsWith('blob:')) ? product.image_url_2 : image_url_2) : product.image_url_2;
    if (req.files?.image2?.[0]) {
      finalImageUrl2 = await uploadImage(req.files.image2[0].buffer, req.files.image2[0].originalname);
      if (product.image_url_2) {
        deleteImage(product.image_url_2).catch(() => {});
      }
    }

    const pdfFiles = req.files?.pdf_files || [];
    const pdfFileIndex = Number(req.body.pdf_file_index);
    const uploadedPdfs = await Promise.all(
      pdfFiles.map(async (file) => ({
        name: file.originalname,
        size: file.size,
        url: await uploadPdf(file.buffer, file.originalname),
      }))
    );
    const existingPdfs = Array.isArray(product.pdf_files) ? product.pdf_files : [];
    const selectedPdf = Number.isInteger(pdfFileIndex) && pdfFileIndex >= 0 ? existingPdfs[pdfFileIndex] : existingPdfs[0];
    const finalPdfFiles = uploadedPdfs.length ? [uploadedPdfs[0]] : selectedPdf ? [selectedPdf] : existingPdfs.slice(0, 1);

    if (existingPdfs.length > 1 && Number.isInteger(pdfFileIndex) && pdfFileIndex >= 0 && existingPdfs[pdfFileIndex]) {
      const remainingPdfs = existingPdfs.filter((_, index) => index !== pdfFileIndex);
      const splitProduct = await Product.create({
        name: name !== undefined ? name : product.name,
        description: description !== undefined ? description : product.description,
        image_url: finalImageUrl,
        image_url_2: finalImageUrl2,
        barcode: null,
        cost_price: cost_price !== undefined ? cost_price : product.cost_price,
        retail_price: retail_price !== undefined ? retail_price : product.retail_price,
        wholesale_price: wholesale_price !== undefined ? wholesale_price : product.wholesale_price,
        category: category !== undefined ? category : product.category,
        supplier_name: supplier_name !== undefined ? supplier_name : product.supplier_name,
        supplier_email: supplier_email !== undefined ? supplier_email : product.supplier_email,
        supplier_phone: supplier_phone !== undefined ? supplier_phone : product.supplier_phone,
        factory_location: factory_location !== undefined ? factory_location : product.factory_location,
        pdf_files: finalPdfFiles,
        share_to: parsedShareTo,
        weight: weight !== undefined ? weight : product.weight,
        size: size !== undefined ? size : product.size,
      });

      await product.update({ pdf_files: remainingPdfs });
      cache.invalidate('products');
      cache.invalidate('summary');
      cache.invalidate('inventory');
      return res.json({ success: true, data: splitProduct });
    }

    await product.update({
      name: name !== undefined ? name : product.name,
      description: description !== undefined ? description : product.description,
      image_url: finalImageUrl,
      image_url_2: finalImageUrl2,
      barcode: barcode !== undefined ? barcode : product.barcode,
      cost_price: cost_price !== undefined ? cost_price : product.cost_price,
      retail_price: retail_price !== undefined ? retail_price : product.retail_price,
      wholesale_price: wholesale_price !== undefined ? wholesale_price : product.wholesale_price,
      category: category !== undefined ? category : product.category,
      supplier_name: supplier_name !== undefined ? supplier_name : product.supplier_name,
      supplier_email: supplier_email !== undefined ? supplier_email : product.supplier_email,
      supplier_phone: supplier_phone !== undefined ? supplier_phone : product.supplier_phone,
      factory_location: factory_location !== undefined ? factory_location : product.factory_location,
      pdf_files: finalPdfFiles,
      share_to: parsedShareTo,
      weight: weight !== undefined ? weight : product.weight,
      size: size !== undefined ? size : product.size,
    });

    // Update inventory quantity if provided
    const newQty = Number(req.body.quantity);
    console.log('[Update Product] quantity received:', req.body.quantity, '→ parsed:', newQty);
    if (!isNaN(newQty) && newQty >= 0) {
      const invRecords = await Inventory.findAll({ where: { product_id: product.id } });
      const currentTotal = invRecords.reduce((sum, inv) => sum + inv.quantity, 0);
      const diff = newQty - currentTotal;
      console.log('[Update Product] currentTotal:', currentTotal, 'newQty:', newQty, 'diff:', diff);
      if (diff !== 0) {
        // Find Guangzhou Warehouse as the primary location
        let guangzhou = await Location.findOne({ where: { name: 'Guangzhou Warehouse' } });
        if (!guangzhou) {
          guangzhou = await Location.create({ name: 'Guangzhou Warehouse', type: 'warehouse' });
        }

        // Find or create inventory record at Guangzhou Warehouse
        const [gzInv] = await Inventory.findOrCreate({
          where: { product_id: product.id, location_id: guangzhou.id },
          defaults: { quantity: 0 },
        });

        await gzInv.update({ quantity: Math.max(0, gzInv.quantity + diff) });

        // Log the transaction
        const { Transaction } = require('../models');
        await Transaction.create({
          type: diff > 0 ? 'stock_in' : 'stock_out',
          product_id: product.id,
          [diff > 0 ? 'to_location_id' : 'from_location_id']: guangzhou.id,
          quantity: Math.abs(diff),
          notes: `Quantity updated from product edit (${currentTotal} → ${newQty})`,
          created_by: req.user?.id || null,
        });

        cache.invalidate('inventory');
        cache.invalidate('summary');
      }
    }

    cache.invalidate('products');
    res.json({ success: true, data: product });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'Barcode already exists' });
    }
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// DELETE /:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const pdfFileIndex = Number(req.query.pdfFileIndex);
    const existingPdfs = Array.isArray(product.pdf_files) ? product.pdf_files : [];
    if (existingPdfs.length > 1 && Number.isInteger(pdfFileIndex) && pdfFileIndex >= 0 && existingPdfs[pdfFileIndex]) {
      await product.update({ pdf_files: existingPdfs.filter((_, index) => index !== pdfFileIndex) });
      cache.invalidate('products');
      cache.invalidate('inventory');
      cache.invalidate('summary');
      return res.json({ success: true, message: 'Product catalog deleted' });
    }

    // Delete images from Supabase Storage
    if (product.image_url) {
      deleteImage(product.image_url).catch(() => {});
    }
    if (product.image_url_2) {
      deleteImage(product.image_url_2).catch(() => {});
    }

    await product.destroy();
    cache.invalidate('products');
    cache.invalidate('inventory');
    cache.invalidate('summary');
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

module.exports = router;
