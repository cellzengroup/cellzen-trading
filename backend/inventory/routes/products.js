const express = require('express');
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const { Product, Location, Inventory } = require('../models');
const { authenticate } = require('../middleware/auth');
const cache = require('../cache');
const { uploadImage, uploadPdf, createSignedImageUpload, deleteImage } = require('../../config/supabase');

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

// Multer decodes multipart filenames as latin1 by default, so any non-ASCII
// name (Chinese, Cyrillic, etc.) arrives as mojibake. Re-decoding the raw
// bytes as UTF-8 recovers the original — and is a no-op for pure ASCII names
// since ASCII bytes are identical in latin1 and UTF-8.
const decodeUploadName = (raw) => {
  if (!raw) return '';
  try {
    return Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    return raw;
  }
};

const sanitizePdfName = (originalName) => {
  let decoded = decodeUploadName(originalName);
  if (/%[0-9A-Fa-f]{2}/.test(decoded)) {
    try { decoded = decodeURIComponent(decoded); } catch { /* keep decoded */ }
  }
  return decoded.replace(/\.pdf$/i, '');
};

// GET / - list all products
// Query params:
//   ?search=...           — full-text search on name/barcode/description
//   ?sharedWith=role      — filter by share_to.role flag
//   ?category=...         — filter by exact category match
//   ?excludeCategory=...  — exclude products with this category
//   ?light=1              — omit pdf_files JSONB (smaller payload for list views)
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, sharedWith, category, excludeCategory, light } = req.query;
    const lightMode = light === '1' || light === 'true';
    const cacheKey = `products:${search || ''}:${sharedWith || ''}:${category || ''}:${excludeCategory || ''}:${lightMode ? 'L' : 'F'}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      // no-store: don't let the browser cache this. Server-side cache (60s)
      // still absorbs repeat hits, but admin un-share/share toggles need to
      // be visible to the customer immediately on the next page load.
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, data: cached });
    }

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (category) where.category = category;
    if (excludeCategory) where.category = { [Op.or]: [{ [Op.ne]: excludeCategory }, { [Op.is]: null }] };

    const findOptions = { where, order: [['name', 'ASC']] };
    // Light mode: skip the heavy pdf_files JSONB column for list views
    if (lightMode) {
      findOptions.attributes = { exclude: ['pdf_files'] };
    }

    const products = await Product.findAll(findOptions);

    // Filter by sharedWith if specified (kept in JS because share_to is JSONB)
    let filteredProducts = products;
    if (sharedWith) {
      filteredProducts = products.filter(p => {
        let shareTo = p.share_to || {};
        if (typeof shareTo === 'string') {
          try { shareTo = JSON.parse(shareTo); } catch { shareTo = {}; }
        }
        return shareTo[sharedWith] === true;
      });
    }

    cache.set(cacheKey, filteredProducts, 60000);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: filteredProducts });
  } catch (error) {
    console.error('Get products error:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
});

// POST /upload-url — Returns a signed Supabase upload URL the browser can PUT
// to directly. This eliminates the slow browser → backend → Supabase proxy
// hop that used to dominate gallery upload time on Render's free tier.
//
// Body: { fileName: string, kind?: 'image' | 'pdf' }
// Returns: { signedUrl, publicUrl }
router.post('/upload-url', authenticate, async (req, res) => {
  try {
    const { fileName, kind = 'image' } = req.body || {};
    if (!fileName) {
      return res.status(400).json({ success: false, message: 'fileName is required' });
    }
    const folder = kind === 'pdf' ? 'product-pdfs' : 'products';
    const result = await createSignedImageUpload(fileName, folder);
    res.json({
      success: true,
      signedUrl: result.signedUrl,
      publicUrl: result.publicUrl,
      path: result.path,
    });
  } catch (error) {
    console.error('Sign upload URL error:', error);
    res.status(500).json({ success: false, message: 'Could not generate upload URL' });
  }
});

// GET /public-gallery — PUBLIC (no auth) endpoint for the landing page Products section
// Returns only "Product Gallery" rows with the minimal fields needed for the card grid.
router.get('/public-gallery', async (req, res) => {
  try {
    const cacheKey = 'products:public-gallery';
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=20, must-revalidate');
      return res.json({ success: true, data: cached });
    }

    const products = await Product.findAll({
      where: { category: 'Product Gallery' },
      attributes: ['id', 'name', 'description', 'image_url', 'image_url_2', 'supplier_name'],
      order: [['createdAt', 'DESC']],
    });

    // Drop products with no image — useless for the card grid
    const withImages = products.filter((p) => p.image_url || p.image_url_2);

    cache.set(cacheKey, withImages, 30000); // 30s server cache (was 2 min)
    res.set('Cache-Control', 'public, max-age=20, must-revalidate');
    res.json({ success: true, data: withImages });
  } catch (error) {
    console.error('Public gallery error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch gallery' });
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
        name: sanitizePdfName(file.originalname),
        size: file.size,
        url: await uploadPdf(file.buffer, file.originalname),
      }))
    );

    const { Transaction } = require('../models');
    const pdfGroups = uploadedPdfs.length ? uploadedPdfs.map((pdf) => [pdf]) : [[]];
    const isGalleryItem = category === 'Product Gallery';

    // Gallery items are images, not stockable products — skip the inventory bootstrap entirely.
    let locations = null;
    let guangzhou = null;
    if (!isGalleryItem) {
      locations = await Location.findAll();
      guangzhou = locations.find((l) => l.name === 'Guangzhou Warehouse');
      if (!guangzhou) {
        guangzhou = await Location.create({ name: 'Guangzhou Warehouse', type: 'warehouse' });
        locations = await Location.findAll();
      }
    }

    // Build all products in parallel (multi-PDF uploads create one row per PDF — no need to serialize them).
    const createdProducts = await Promise.all(pdfGroups.map(async (pdfGroup) => {
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

      if (isGalleryItem) return product;

      // Auto stock-in at Guangzhou Warehouse + bootstrap zero-qty rows at other locations + log transaction.
      const [gzInv, gzCreated] = await Inventory.findOrCreate({
        where: { product_id: product.id, location_id: guangzhou.id },
        defaults: { quantity: qty },
      });

      await Promise.all([
        gzCreated ? null : gzInv.update({ quantity: gzInv.quantity + qty }),
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
      ].filter(Boolean));

      return product;
    }));

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
        name: sanitizePdfName(file.originalname),
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
