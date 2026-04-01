const express = require('express');
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const { imageSize } = require('image-size');
const fs = require('fs');
const path = require('path');
const { Transaction, Product, Location, User, Inventory } = require('../models');
const { authenticate } = require('../middleware/auth');
const { downloadImage } = require('../../config/supabase');

const cache = require('../cache');

const router = express.Router();

// ─── Shared Excel constants ────────────────────────────────────────────────────
// In production the built dist/ folder has the templates; in dev use frontend/public
const TEMPLATES_DIR_PROD = path.join(__dirname, '..', '..', '..', 'dist', 'Excels Templates');
const TEMPLATES_DIR_DEV = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'Excels Templates');
const TEMPLATES_DIR = fs.existsSync(TEMPLATES_DIR_DEV) ? TEMPLATES_DIR_DEV : TEMPLATES_DIR_PROD;
const IMG_FIT = 150;        // px — larger dimension scaled to this (for non-quotation exports)
const IMG_COL_WIDTH = 40;   // Excel column width (chars) for image column
const QUOTATION_IMG_MAX = 120; // px — max dimension for quotation images

const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF720E20' } };
const headerFont = { size: 13, color: { theme: 0 }, name: 'Arial', bold: true };
const headerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
const dataFont = { size: 11, name: 'Arial' };
const dataAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
const thinBorder = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

// ─── embedImages helper — place 1 or 2 images in a cell ──────────────────────
// options.singleImage: if true, only show first image (for quotation exports)
// options.maxSize: max pixel dimension (default IMG_FIT)
// Uses tl+br anchoring so the image is pinned exactly to cell boundaries.
// Excel row height is in points (1pt ≈ 1.333px at 96 DPI).
async function embedImages(workbook, sheet, imageUrl1, imageUrl2, col, rowIndex, options = {}) {
  const singleImage = options.singleImage || false;
  const maxSize = options.maxSize || IMG_FIT;

  const allUrls = [imageUrl1, imageUrl2].filter(Boolean);
  const urls = singleImage ? allUrls.slice(0, 1) : allUrls;
  if (urls.length === 0) return { hasImage: false, imgHeight: 0 };

  const cellWidthPx = IMG_COL_WIDTH * 7.5;
  let maxH = 0;

  for (let i = 0; i < urls.length; i++) {
    try {
      const imgBuffer = await downloadImage(urls[i]);
      if (!imgBuffer) continue;
      const ext = path.extname(urls[i].split('?')[0]).replace('.', '').toLowerCase() || 'jpeg';
      const dimensions = imageSize(imgBuffer);

      let w, h;
      if (singleImage) {
        // Quotation: vertical => constrain height, horizontal => constrain width
        const isVertical = dimensions.height >= dimensions.width;
        if (isVertical) {
          const scale = Math.min(maxSize / dimensions.height, 1);
          w = Math.round(dimensions.width * scale);
          h = maxSize; // exactly maxSize for vertical
        } else {
          const scale = Math.min(maxSize / dimensions.width, 1);
          w = maxSize; // exactly maxSize for horizontal
          h = Math.round(dimensions.height * scale);
        }
      } else {
        const slotWidth = urls.length === 1 ? cellWidthPx : cellWidthPx / 2;
        const maxImgW = slotWidth - 8;
        const scaleW = maxImgW / dimensions.width;
        const scaleH = maxSize / dimensions.height;
        const scale = Math.min(scaleW, scaleH, 1);
        w = Math.round(dimensions.width * scale);
        h = Math.round(dimensions.height * scale);
      }

      if (h > maxH) maxH = h;

      const imgId = workbook.addImage({
        buffer: imgBuffer,
        extension: ext === 'jpg' ? 'jpeg' : ext,
      });

      // Use tl+br cell anchoring so image fits exactly in the cell
      const c = Math.floor(col);
      // nativeColOff/nativeRowOff are in EMUs (914400 EMU = 1 inch = 96px at 96dpi)
      // So 1px = 914400/96 = 9525 EMU
      const PX_TO_EMU = 9525;
      const padXEmu = Math.round(Math.max(0, (cellWidthPx - w) / 2) * PX_TO_EMU);
      const imgWEmu = Math.round(w * PX_TO_EMU);
      const imgHEmu = Math.round(h * PX_TO_EMU);
      const padYEmu = Math.round(2 * PX_TO_EMU); // 2px top padding

      if (singleImage) {
        sheet.addImage(imgId, {
          tl: { col: c, row: rowIndex, nativeCol: c, nativeRow: rowIndex, nativeColOff: padXEmu, nativeRowOff: padYEmu },
          br: { col: c, row: rowIndex, nativeCol: c, nativeRow: rowIndex, nativeColOff: padXEmu + imgWEmu, nativeRowOff: padYEmu + imgHEmu },
        });
      } else {
        const slotWidth = urls.length === 1 ? cellWidthPx : cellWidthPx / 2;
        const slotStartX = i * slotWidth;
        const slotPadX = Math.round((slotStartX + Math.max(0, (slotWidth - w) / 2)) * PX_TO_EMU);
        const cellH = IMG_FIT;
        const padY2 = Math.round(Math.max(0, (cellH - h) / 2) * PX_TO_EMU);
        sheet.addImage(imgId, {
          tl: { col: c, row: rowIndex, nativeCol: c, nativeRow: rowIndex, nativeColOff: slotPadX, nativeRowOff: padY2 },
          br: { col: c, row: rowIndex, nativeCol: c, nativeRow: rowIndex, nativeColOff: slotPadX + imgWEmu, nativeRowOff: padY2 + imgHEmu },
        });
      }
    } catch (err) {
      console.error('embedImages error:', err?.message || err);
    }
  }

  if (maxH === 0) return { hasImage: false, imgHeight: 0 };
  // Row height in points = px * 0.75  (1pt = 1.333px)
  // Add 4px padding (2 top + 2 bottom)
  const rowHeightPts = Math.round((maxH + 4) * 0.75);
  return { hasImage: true, imgHeight: rowHeightPts };
}

// ─── loadTemplate: load xlsx template, clear data rows, set headers ────────────
async function loadTemplate(templateFile, sheetName, headers, colWidths) {
  const workbook = new ExcelJS.Workbook();
  const templatePath = path.join(TEMPLATES_DIR, templateFile);
  const hasTemplate = fs.existsSync(templatePath);

  if (hasTemplate) {
    await workbook.xlsx.readFile(templatePath);
  }

  let sheet = workbook.getWorksheet(1);
  if (!sheet) sheet = workbook.addWorksheet(sheetName);

  // Clear data rows (row 4+)
  for (let r = 4; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => { cell.value = null; cell.style = {}; });
  }

  // If template exists, preserve its header styling (row 3), logo (rows 1-2), and column widths.
  // Only write headers as fallback when no template is available.
  if (!hasTemplate) {
    sheet.mergeCells(1, 1, 2, headers.length);
    sheet.getRow(1).height = 30;
    sheet.getRow(2).height = 30;

    const headerRow = sheet.getRow(3);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = headerAlign;
      cell.border = thinBorder;
    });
    headerRow.height = 30;

    colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
  }

  return { workbook, sheet };
}

// Helper: set a data cell with font, alignment, border
function setCell(row, col, value, font, align) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.font = font || dataFont;
  cell.alignment = align || dataAlign;
  cell.border = thinBorder;
}

// ─── GET /transactions ─────────────────────────────────────────────────────────
router.get('/transactions', authenticate, async (req, res) => {
  try {
    const { type, product_id, location_id, start_date, end_date, page = 1, limit = 50 } = req.query;
    const txCacheKey = `transactions:${type||''}:${product_id||''}:${location_id||''}:${start_date||''}:${end_date||''}:${page}:${limit}`;
    const txCached = cache.get(txCacheKey);
    if (txCached) return res.json(txCached);

    const where = {};
    if (type) where.type = type;
    if (product_id) where.product_id = product_id;
    if (location_id) {
      where[Op.or] = [
        { from_location_id: location_id },
        { to_location_id: location_id },
      ];
    }
    if (start_date || end_date) {
      where.createdAt = {};
      if (start_date) where.createdAt[Op.gte] = new Date(start_date);
      if (end_date) where.createdAt[Op.lte] = new Date(end_date);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Transaction.findAndCountAll({
      where,
      include: [
        { model: Product, as: 'product', attributes: ['id', 'name', 'barcode', 'image_url', 'image_url_2'] },
        { model: Location, as: 'fromLocation', attributes: ['id', 'name'] },
        { model: Location, as: 'toLocation', attributes: ['id', 'name'] },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    const result = {
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / parseInt(limit)),
      },
    };
    cache.set(txCacheKey, result, 3000);
    res.json(result);
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

// ─── GET /summary ──────────────────────────────────────────────────────────────
router.get('/summary', authenticate, async (req, res) => {
  try {
    const cached = cache.get('summary');
    if (cached) return res.json({ success: true, data: cached });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalProducts, totalLocations, todaySales, lowStock, outOfStock, recentTransactions] = await Promise.all([
      Product.count(),
      Location.count(),
      Transaction.count({
        where: { type: 'sale', createdAt: { [Op.gte]: today } },
      }),
      Inventory.count({
        where: { quantity: { [Op.lte]: 5, [Op.gt]: 0 } },
      }),
      Inventory.count({
        where: { quantity: 0 },
      }),
      Transaction.findAll({
        include: [
          { model: Product, as: 'product', attributes: ['id', 'name'] },
          { model: Location, as: 'fromLocation', attributes: ['id', 'name'] },
          { model: Location, as: 'toLocation', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: 10,
      }),
    ]);

    const data = { totalProducts, totalLocations, todaySales, lowStock, outOfStock, recentTransactions };
    cache.set('summary', data, 3000);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch summary' });
  }
});

// ─── GET /export/quotation — Product List using SingingBowlTemplates.xlsx ──────
router.get('/export/quotation', authenticate, async (req, res) => {
  try {
    const { category, price_type = 'retail_price', location_id } = req.query;

    const priceLabels = {
      cost_price: 'Cost Price / 成本价',
      retail_price: 'Retail Price / 零售价',
      wholesale_price: 'Wholesale Price / 批发价',
    };

    const catNameMap = {
      'Singing Bowl': 'singingbowl',
      'Thanka': 'thanka',
      'Thanka Locket': 'thanka_locket',
      'Jewelleries': 'jewelleries',
    };

    const headers = ['Image / 图片', 'Product Name / 产品名称', 'Bar Code / 条形码', 'Weight / 重量', 'Size / 尺寸', `${priceLabels[price_type] || 'Price / 价格'}`];
    const colWidths = [IMG_COL_WIDTH, 36, 37, 24, 24, 20];

    const allCategories = ['Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries'];
    const categoriesToExport = category ? [category] : allCategories;

    // Load template to copy logo and styling from it
    const templatePath = path.join(TEMPLATES_DIR, 'SingingBowlTemplates.xlsx');
    let templateWb = null;
    let logoImgBuffer = null;
    let logoImgExt = 'png';
    if (fs.existsSync(templatePath)) {
      templateWb = new ExcelJS.Workbook();
      await templateWb.xlsx.readFile(templatePath);
      const tplSheet = templateWb.getWorksheet(1);
      if (tplSheet) {
        const tplImages = tplSheet.getImages();
        if (tplImages.length > 0) {
          const imgData = templateWb.getImage(tplImages[0].imageId);
          logoImgBuffer = imgData.buffer;
          logoImgExt = imgData.extension;
        }
      }
    }

    // Read template header styling to replicate exactly
    const tplHeaderFont = templateWb
      ? templateWb.getWorksheet(1)?.getRow(3)?.getCell(1)?.font || headerFont
      : headerFont;
    const tplHeaderFill = templateWb
      ? templateWb.getWorksheet(1)?.getRow(3)?.getCell(1)?.fill || headerFill
      : headerFill;
    const tplHeaderAlign = { horizontal: 'center', vertical: 'middle' };

    const workbook = new ExcelJS.Workbook();

    // If location_id provided, get product IDs at that location
    let locationProductIds = null;
    if (location_id) {
      const invRecords = await Inventory.findAll({ where: { location_id, quantity: { [Op.gt]: 0 } }, attributes: ['product_id'] });
      locationProductIds = new Set(invRecords.map(r => r.product_id));
    }

    // Helper to set up a sheet with logo and headers
    const setupSheet = (sheet) => {
      if (logoImgBuffer) {
        const logoId = workbook.addImage({ buffer: logoImgBuffer, extension: logoImgExt });
        sheet.addImage(logoId, {
          tl: { col: 2, row: 0, nativeCol: 2, nativeRow: 0, nativeColOff: 217712, nativeRowOff: 81644 },
          br: { col: 2, row: 1, nativeCol: 2, nativeRow: 1, nativeColOff: 2496589, nativeRowOff: 424544 },
        });
      }
      sheet.mergeCells(1, 1, 2, headers.length);
      sheet.getRow(1).height = 44.6;
      sheet.getRow(2).height = 44.6;
      const headerRow = sheet.getRow(3);
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        cell.font = tplHeaderFont;
        cell.fill = tplHeaderFill;
        cell.alignment = tplHeaderAlign;
      });
      headerRow.height = 30;
      colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });
    };

    // Helper to write product rows into a sheet starting at startRow
    const writeProducts = async (sheet, products, startRow) => {
      for (let idx = 0; idx < products.length; idx++) {
        const p = products[idx];
        const row = sheet.getRow(startRow + idx);

        setCell(row, 1, '');
        const { hasImage, imgHeight } = await embedImages(workbook, sheet, p.image_url, p.image_url_2, 0, startRow + idx - 1, { singleImage: true, maxSize: QUOTATION_IMG_MAX });
        row.height = hasImage ? imgHeight : 25;

        setCell(row, 2, p.name || '-', { ...dataFont, bold: true });
        setCell(row, 3, p.barcode || '-');
        setCell(row, 4, p.weight || '-');
        setCell(row, 5, p.size || '-');

        const priceVal = parseFloat(p[price_type] || 0);
        setCell(row, 6, priceVal > 0 ? priceVal.toFixed(2) : '-', { ...dataFont, bold: true, color: { argb: 'FF720E20' } });
      }
    };

    if (category) {
      // Single category selected — all products in one sheet
      let products = await Product.findAll({ where: { category }, order: [['createdAt', 'DESC']] });
      if (locationProductIds) {
        products = products.filter(p => locationProductIds.has(p.id));
      }
      const sheet = workbook.addWorksheet(category);
      setupSheet(sheet);
      await writeProducts(sheet, products, 4);
    } else {
      // All Categories — each category gets its own sheet
      for (const cat of categoriesToExport) {
        let products = await Product.findAll({ where: { category: cat }, order: [['createdAt', 'DESC']] });
        if (locationProductIds) {
          products = products.filter(p => locationProductIds.has(p.id));
        }
        if (products.length === 0) continue;

        const sheet = workbook.addWorksheet(cat);
        setupSheet(sheet);
        await writeProducts(sheet, products, 4);
      }
    }

    // Ensure at least one sheet exists (Excel requires it)
    if (workbook.worksheets.length === 0) {
      const sheet = workbook.addWorksheet('No Products');
      setupSheet(sheet);
    }

    const catName = catNameMap[category] || (category || 'all_products').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${catName}_PI.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export quotation error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─── GET /export/transfers — using TransferTemplates.xlsx ──────────────────────
router.get('/export/transfers', authenticate, async (req, res) => {
  try {
    const { location_id } = req.query;
    const where = { type: 'transfer' };

    if (location_id) {
      where[Op.or] = [
        { from_location_id: location_id },
        { to_location_id: location_id },
      ];
    }

    const transfers = await Transaction.findAll({
      where,
      include: [
        { model: Product, as: 'product', attributes: ['id', 'name', 'barcode', 'image_url', 'image_url_2'] },
        { model: Location, as: 'fromLocation', attributes: ['id', 'name'] },
        { model: Location, as: 'toLocation', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 500,
    });

    const headers = ['Image', 'Product Name', 'Bar Code', 'Transferred To', 'Date'];
    const colWidths = [IMG_COL_WIDTH, 36, 37, 24, 20];

    const { workbook, sheet } = await loadTemplate('TransferTemplates.xlsx', 'Transfer Records', headers, colWidths);

    if (location_id) {
      const loc = await Location.findByPk(location_id);
      if (loc) sheet.name = loc.name;
    }

    const startRow = 4;
    for (let idx = 0; idx < transfers.length; idx++) {
      const tx = transfers[idx];
      const row = sheet.getRow(startRow + idx);

      setCell(row, 1, '');
      const { hasImage, imgHeight } = await embedImages(workbook, sheet, tx.product?.image_url, tx.product?.image_url_2, 0, startRow + idx - 1);
      row.height = hasImage ? imgHeight : 25;

      setCell(row, 2, tx.product?.name || '-', { ...dataFont, bold: true });
      setCell(row, 3, tx.product?.barcode || '-');
      setCell(row, 4, tx.toLocation?.name || '-', { ...dataFont, bold: true, color: { argb: 'FF720E20' } });
      setCell(row, 5, new Date(tx.createdAt).toLocaleDateString());
    }

    const locName = location_id
      ? (await Location.findByPk(location_id))?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Unknown'
      : 'All_Locations';
    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${locName}_${dateStr}_transfer.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export transfers error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─── GET /export/excel — Product List (plain) ─────────────────────────────────
router.get('/export/excel', authenticate, async (req, res) => {
  try {
    const { location_id } = req.query;

    let products;
    if (location_id) {
      const inventoryRecords = await Inventory.findAll({
        where: { location_id },
        include: [{ model: Product, as: 'product' }],
      });
      products = inventoryRecords.map((inv) => ({
        ...inv.product.toJSON(),
        quantity: inv.quantity,
      }));
    } else {
      products = await Product.findAll({ order: [['name', 'ASC']] });
      products = products.map((p) => p.toJSON());
    }

    const headers = location_id
      ? ['Image', 'Product Name', 'Description', 'Barcode', 'Cost Price', 'Retail Price', 'Wholesale Price', 'Quantity']
      : ['Image', 'Product Name', 'Description', 'Barcode', 'Cost Price', 'Retail Price', 'Wholesale Price'];
    const colWidths = location_id
      ? [IMG_COL_WIDTH, 30, 40, 20, 15, 15, 15, 12]
      : [IMG_COL_WIDTH, 30, 40, 20, 15, 15, 15];

    const { workbook, sheet } = await loadTemplate('SingingBowlTemplates.xlsx', 'Products', headers, colWidths);

    const startRow = 4;
    for (let idx = 0; idx < products.length; idx++) {
      const product = products[idx];
      const row = sheet.getRow(startRow + idx);

      setCell(row, 1, '');
      const { hasImage, imgHeight } = await embedImages(workbook, sheet, product.image_url, product.image_url_2, 0, startRow + idx - 1);
      row.height = hasImage ? imgHeight : 25;

      setCell(row, 2, product.name || '-', { ...dataFont, bold: true });
      setCell(row, 3, product.description || '-');
      setCell(row, 4, product.barcode || '-');
      setCell(row, 5, parseFloat(product.cost_price) || 0);
      setCell(row, 6, parseFloat(product.retail_price) || 0);
      setCell(row, 7, parseFloat(product.wholesale_price) || 0);
      if (location_id) {
        setCell(row, 8, product.quantity);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=yogini-arts-products.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─── GET /export/sales — using SaleTemplates.xlsx ──────────────────────────────
router.get('/export/sales', authenticate, async (req, res) => {
  try {
    const { location_id, start_date, end_date } = req.query;
    const where = { type: 'sale' };

    if (location_id) {
      where.from_location_id = location_id;
    }
    if (start_date || end_date) {
      where.createdAt = {};
      if (start_date) where.createdAt[Op.gte] = new Date(start_date);
      if (end_date) {
        const endOfDay = new Date(end_date);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = endOfDay;
      }
    }

    const sales = await Transaction.findAll({
      where,
      include: [
        { model: Product, as: 'product', attributes: ['id', 'name', 'barcode', 'image_url', 'image_url_2'] },
        { model: Location, as: 'fromLocation', attributes: ['id', 'name'] },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 1000,
    });

    const headers = ['Image', 'Product Name', 'Bar Code', 'Location', 'Qty', 'Price Type', 'Sold Price', 'Date', 'Sold By'];
    const colWidths = [IMG_COL_WIDTH, 30, 25, 20, 10, 15, 15, 20, 18];

    const { workbook, sheet } = await loadTemplate('SaleTemplates.xlsx', 'Sales Report', headers, colWidths);

    const startRow = 4;
    for (let idx = 0; idx < sales.length; idx++) {
      const tx = sales[idx];
      const row = sheet.getRow(startRow + idx);

      setCell(row, 1, '');
      const { hasImage, imgHeight } = await embedImages(workbook, sheet, tx.product?.image_url, tx.product?.image_url_2, 0, startRow + idx - 1);
      row.height = hasImage ? imgHeight : 25;

      setCell(row, 2, tx.product?.name || '-', { ...dataFont, bold: true });
      setCell(row, 3, tx.product?.barcode || '-');
      setCell(row, 4, tx.fromLocation?.name || '-', { ...dataFont, bold: true, color: { argb: 'FF720E20' } });
      setCell(row, 5, tx.quantity);
      setCell(row, 6, tx.price_type || '-');
      setCell(row, 7, parseFloat(tx.unit_price) || 0, { ...dataFont, bold: true });
      setCell(row, 8, new Date(tx.createdAt).toLocaleDateString());
      setCell(row, 9, tx.createdByUser?.name || '-');
    }

    const locName = location_id
      ? (await Location.findByPk(location_id))?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Unknown'
      : 'All_Locations';
    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${locName}_${dateStr}_sales.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export sales error:', error);
    res.status(500).json({ success: false, message: 'Export sales failed' });
  }
});

module.exports = router;
