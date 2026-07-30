const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const nlp = require('compromise');
const { imageSize } = require('image-size');
const { Op } = require('sequelize');
const { SupplierOrder, WarehouseItem, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { withConnectionRetry } = require('../dbRetry');
const { downloadImage } = require('../../config/supabase');
const gtradeaSync = require('../services/gtradeaSync');
const { extractProductNames } = require('../services/productNames');

const router = express.Router();

// The packing-list export reuses the hand-styled template (title band, logo,
// purple header row) that lives with the other static Invoice assets. Vite
// copies frontend/public/* into dist/ verbatim at build time, so the prod path
// mirrors the dev one exactly (same pattern as reports.js's TEMPLATES_DIR).
const PACKING_TEMPLATE_DIR = fs.existsSync(path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'Invoice'))
  ? path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'Invoice')
  : path.join(__dirname, '..', '..', '..', 'dist', 'Invoice');
const PACKING_TEMPLATE_PATH = path.join(PACKING_TEMPLATE_DIR, 'GtradeA Sent Goods.xlsx');

// Same staff-or-admin gate used across the inventory routes (see warehouse.js).
// Data is SHARED — every staff/admin sees every 1688 order. No per-user scoping.
const requireStaffOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'staff' || req.user?.accountType === 'Admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Staff or admin access is required' });
};

const dbGuard = (res) => {
  if (!SupplierOrder) {
    res.status(503).json({ success: false, message: '1688 orders are not configured' });
    return true;
  }
  return false;
};

// Escape LIKE/ILIKE metacharacters so a search containing % or _ is matched
// literally instead of being treated as a wildcard.
const escapeLike = (v) => String(v).replace(/[\\%_]/g, (c) => `\\${c}`);

// Shared by GET / (JSON list) and GET /export.xlsx (packing list) so the two
// can never disagree on which rows a given search matches.
async function fetchSupplierOrders(search) {
  const where = {};
  if (search) {
    const s = `%${escapeLike(String(search).trim())}%`;
    where[Op.or] = [
      { order_number: { [Op.iLike]: s } },
      { china_tracking_no: { [Op.iLike]: s } },
      { product_name: { [Op.iLike]: s } },
      { job_code: { [Op.iLike]: s } },
    ];
  }

  // Wrapped as one unit: a pooled connection that's gone stale (see
  // ../dbRetry.js) can surface on either query below, even on a fresh page
  // load — retrying the pair together keeps the read-and-enrich atomic.
  return withConnectionRetry(async () => {
    // Newest ORDER first (ordered_at), not newest poll — synced_at is the same
    // for every row a sync touches, so it can't order the list meaningfully.
    // NULLS LAST so pre-backfill rows don't jump to the top. Every item within
    // one 1688 order shares the same order_number AND ordered_at (both come
    // from the parent order, not the item), so those two alone tie completely
    // for a multi-item order — Postgres doesn't promise a stable tie order
    // across repeated queries/upserts, which showed up as rows visibly
    // swapping places on every poll/refresh. `id` is unique and never changes,
    // so it pins down one exact order and rows stop moving.
    const rows = await SupplierOrder.findAll({
      where,
      order: [
        [sequelize.literal('ordered_at DESC NULLS LAST')],
        ['order_number', 'DESC'],
        ['id', 'ASC'],
      ],
      limit: 5000,
    });

    // Warehouse match: which of these CN tracking numbers are physically stored.
    const matchMap = {};
    if (WarehouseItem) {
      const trackings = [...new Set(rows.map((r) => r.china_tracking_no).filter(Boolean))];
      if (trackings.length) {
        const items = await WarehouseItem.findAll({
          where: { tracking_number: { [Op.in]: trackings } },
          attributes: ['tracking_number', 'rack_id', 'status', 'code', 'shipped_at'],
        });
        for (const it of items) {
          const key = String(it.tracking_number || '').toUpperCase();
          // Prefer an in-stock match over a shipped one for the same tracking.
          if (!matchMap[key] || it.status === 'in_stock') {
            matchMap[key] = { rack_id: it.rack_id, status: it.status, code: it.code, shipped_at: it.shipped_at };
          }
        }
      }
    }

    return rows.map((r) => {
      const key = String(r.china_tracking_no || '').toUpperCase();
      const m = key ? matchMap[key] : null;
      return {
        id: r.id,
        order_number: r.order_number,
        job_code: r.job_code,
        china_tracking_no: r.china_tracking_no,
        nepal_tracking_no: r.nepal_tracking_no,
        status: r.status,
        product_name: r.product_name,
        product_image: r.product_image,
        supplier_url: r.supplier_url,
        source_product_id: r.source_product_id,
        quantity: r.quantity,
        shipping_mode: r.shipping_mode,
        order_status: r.order_status,
        paid_amount: r.paid_amount,
        ordered_at: r.ordered_at,
        synced_at: r.synced_at,
        warehouse: m ? { in_warehouse: true, rack_id: m.rack_id, status: m.status, code: m.code, shipped_at: m.shipped_at } : { in_warehouse: false },
      };
    });
  });
}

// GET / — list supplier orders, each annotated with a warehouse match computed
// by joining china_tracking_no against warehouse_items.tracking_number (both are
// stored trim+uppercased, so it's an exact value match).
router.get('/', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const data = await fetchSupplierOrders(req.query.search);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: data.length, data, lastSync: gtradeaSync.getStatus() });
  } catch (error) {
    console.error('List supplier orders error:', error);
    res.status(500).json({ success: false, message: 'Unable to load 1688 orders' });
  }
});

// A stable, deterministic "model number" for orders that gtradea has none for.
// Same order (same order number + product) always produces the same number, so
// re-exporting the packing list twice doesn't relabel a product a staff member
// already wrote on a physical box.
function deriveModelNumber(o) {
  const seed = `${o.order_number || ''}|${o.product_name || ''}|${o.id || ''}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `GT${1000 + (hash % 9000)}`;
}

// FALLBACK ONLY — the export route's primary path is productNameNer.js
// (a real NER model), used whenever it's available and confident. This
// heuristic exists for when it isn't (model unavailable on this platform, or
// it genuinely found nothing) — a rough guess is still better than a blank
// customs-facing cell.
//
// gtradea's product_name is really the full 1688 listing TITLE — a long,
// keyword-stuffed marketing string ("European and American Cross-Border Gold
// and Silver Two-Tone Earring Set, High-End and Elegant Earrings for Women,
// Niche Design, ..."), not a short product name. That full title is exactly
// right for the Product Description column, but the Product Name column
// needs a short, human name. A plain "first/last N words" cut is unreliable —
// the real product type sits at the END of the title in some listings and at
// the START in others. What IS reliable: sellers keyword-stuff by repeating
// the actual product-type word(s) more than once across the title (e.g.
// "Stand" 3x, "Earring"/"Earrings" 2x, "Hand Ledger Tape" verbatim 2x) — so we
// POS-tag the title with compromise and collect every noun that recurs;
// that's a much stronger signal than position. Short, single-clause titles
// (<=3 words, e.g. "Mobile Phone Stand") need none of this and are just
// sentence-cased as-is.
function pluralizeWord(word) {
  const bare = word.replace(/[^a-zA-Z]/g, '');
  if (/[sxz]$/i.test(bare) || /(ch|sh)$/i.test(bare)) return `${word}es`;
  if (/[^aeiou]y$/i.test(bare)) return `${word.slice(0, -1)}ies`;
  if (/s$/i.test(bare)) return word; // already looks plural
  return `${word}s`;
}
// Strip (Color: ...) / [silver] spec tags — noise for name extraction.
const stripSpecTags = (title) => String(title || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
// Drop a trailing use-case clause ("... for the bottled jar", "... for
// Women") so a tail-word fallback lands on the head noun ("water pump")
// instead of the object of "for" ("bottled jar").
function stripTrailingPrepClause(clause) {
  const m = clause.match(/^(.*?)\s+(?:for|with|in|of|to|on)\s+.+$/i);
  return m && m[1].trim() ? m[1].trim() : clause;
}
// POS-tag every token of a cleaned title via compromise; returns parallel
// arrays so callers can test "is this token (index i) a noun?" cheaply.
function tagTokens(cleanTitle) {
  const tokens = [];
  const isNoun = [];
  for (const sentence of nlp(cleanTitle).json()) {
    for (const term of sentence.terms) {
      tokens.push(term.text);
      isNoun.push(term.tags.includes('Noun'));
    }
  }
  const normTokens = tokens.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return { tokens, isNoun, normTokens };
}
const sentenceCase = (phrase) => {
  const lower = String(phrase || '').toLowerCase();
  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
};

function deriveShortProductName(rawName) {
  const s = stripSpecTags(rawName);
  if (!s) return '-';
  const clause1 = stripTrailingPrepClause(s.split(',')[0].trim());
  const words1 = clause1.split(/\s+/).filter(Boolean);
  if (words1.length > 0 && words1.length <= 3) return sentenceCase(clause1);

  // Long / comma-less title — find every noun that the seller repeated
  // somewhere else in the title (2+ occurrences, singular/plural collapsed).
  // That's what actually names the product in keyword-stuffed listings — NOT
  // just the first noun that happens to repeat: a title can stutter the same
  // word 2-3 times in a row ("relief relief relief") AND separately repeat the
  // real head noun far apart ("...material paper...backing paper"). Counting
  // distinct repeated stems (not first-match position) catches both at once
  // and naturally collapses the stutter to a single mention.
  const { tokens, isNoun, normTokens } = tagTokens(s);
  const counts = new Map();
  tokens.forEach((t, i) => {
    if (!isNoun[i] || !normTokens[i]) return;
    const entry = counts.get(normTokens[i]);
    if (entry) entry.count += 1;
    else counts.set(normTokens[i], { count: 1, firstIdx: i, text: t });
  });
  const repeated = [...counts.values()]
    .filter((v) => v.count >= 2)
    .sort((a, b) => a.firstIdx - b.firstIdx);

  if (repeated.length >= 2) return sentenceCase(repeated.map((r) => r.text).join(' '));
  if (repeated.length === 1) {
    // A single repeated noun ("Earring") isn't a complete name by itself —
    // pair it with the word right after its first occurrence ("Set").
    const head = repeated[0];
    const next = tokens[head.firstIdx + 1];
    return sentenceCase(next ? `${head.text} ${pluralizeWord(next)}` : pluralizeWord(head.text));
  }

  // Nothing repeats — fall back to the tail of clause 1 (best-effort).
  const core = words1.slice(-2);
  core[core.length - 1] = pluralizeWord(core[core.length - 1]);
  return sentenceCase(core.join(' '));
}

// Run async work over items with a bounded worker pool. Product-image
// downloads were previously awaited one row at a time, so the whole response
// stayed unsent until every row finished — with up to 5000 orders that blew
// past Render's proxy timeout and came back as a 502 (same fix already
// applied to reports.js's exports; see mapWithConcurrency there).
async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const PACKING_HEADERS = ['MARKA', 'Ctn. No', 'Order ID', 'Goods No.', 'Product Image', 'Product Name', 'Brand name', 'Model Number', 'Product Description', 'Quantity', 'Unit', 'KG', 'CBM', 'Paid Amount'];
const PACKING_COL_WIDTHS = [16, 15, 24, 16, 28, 24, 18, 24, 58, 14, 14, 14, 14, 16];
const PACKING_PAID_COL = 14; // 1-indexed — order-level, so it merges the same way Order ID does
const PACKING_IMG_COL = 5; // 1-indexed column — Product Image
const PACKING_ROW_HEIGHT = 126; // pt (~168px) — data rows, sized up from the template's 45pt
const PACKING_IMG_MAX = 140; // px — thumbnail fits inside the taller data row without blowing it up
const PACKING_THIN_BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

// The packing list only ever shows these photos as a ~140px thumbnail
// (PACKING_IMG_MAX), so embedding gtradea's original product photo — often a
// multi-MB listing image — just bloats both the in-memory workbook and the
// downloaded file for no visible benefit. Re-encode down to a small JPEG
// before embedding instead. `sharp` is a declared backend dependency, but it's
// a native addon whose prebuilt binary can fail to load on an unexpected
// OS/libc combo — so this requires it lazily and falls back to the original
// buffer if it's unavailable, rather than taking the whole export down over a
// thumbnail optimisation.
async function shrinkImageForExport(buffer) {
  try {
    const sharp = require('sharp');
    const out = await sharp(buffer)
      .resize({ width: PACKING_IMG_MAX, withoutEnlargement: true })
      .jpeg({ quality: 45 })
      .toBuffer();
    return { buffer: out, ext: 'jpeg' };
  } catch {
    return { buffer, ext: null };
  }
}

// GET /export.xlsx — packing list for the (optionally search-filtered) 1688
// orders, styled after frontend/public/Invoice/GtradeA Sent Goods.xlsx: title
// band, Cellzen logo, purple header row, one row per order with its product
// photo embedded. Brand/model/description are gtradea data gaps we backfill
// with sane placeholders (see the per-row build below) rather than leaving the
// columns blank, since the sheet is used as a physical packing reference.
router.get('/export.xlsx', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const allOrders = await fetchSupplierOrders(req.query.search);
    // The packing list is a physical-packing reference — only goods actually
    // sitting on the shelf belong on it. Dispatched (already shipped out) and
    // not-yet-received orders (no warehouse scan yet) have nothing to pack.
    const orders = allOrders.filter((o) => o.warehouse && o.warehouse.in_warehouse && o.warehouse.status === 'in_stock');

    // Resolve every row's product name up front (see productNames.js — a wrong
    // name here is a customs problem, not just a cosmetic one). `nerNames[i]`
    // is null wherever no strategy produced a trustworthy name; those rows fall
    // back to deriveShortProductName below.
    const nerNames = await extractProductNames(orders.map((o) => o.product_name || ''));

    // Fetch every row's product image in parallel (bounded to 8 at a time)
    // instead of one network round-trip at a time inside the row loop below —
    // see mapWithConcurrency above for why that mattered.
    const imageBuffers = new Array(orders.length).fill(null);
    await mapWithConcurrency(orders, 8, async (o, i) => {
      if (!o.product_image) return;
      try {
        const raw = await downloadImage(o.product_image);
        if (raw) imageBuffers[i] = await shrinkImageForExport(raw);
      } catch (e) {
        console.error('[1688 export] product image download failed:', e?.message || e);
      }
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Packing List');
    PACKING_COL_WIDTHS.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    // Row 1 — title band
    sheet.mergeCells(1, 1, 1, PACKING_HEADERS.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = 'Packing List of 1688 Orders';
    titleCell.font = { size: 17, bold: true, name: 'Arial', color: { argb: 'FF2D2D2D' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4DD' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 48;

    // Row 2 — logo band, logo pulled straight from the template file so the
    // export always carries whatever mark is currently in that file.
    sheet.mergeCells(2, 1, 2, PACKING_HEADERS.length);
    sheet.getRow(2).height = 105;
    if (fs.existsSync(PACKING_TEMPLATE_PATH)) {
      try {
        const templateWb = new ExcelJS.Workbook();
        await templateWb.xlsx.readFile(PACKING_TEMPLATE_PATH);
        const tplSheet = templateWb.getWorksheet(1);
        const tplImages = tplSheet ? tplSheet.getImages() : [];
        if (tplImages.length) {
          const imgData = templateWb.getImage(tplImages[0].imageId);
          const logoId = workbook.addImage({ buffer: imgData.buffer, extension: imgData.extension });
          sheet.addImage(logoId, {
            tl: { col: 5, row: 1, nativeCol: 5, nativeRow: 1, nativeColOff: 839416, nativeRowOff: 150000 },
            br: { col: 7, row: 1, nativeCol: 7, nativeRow: 1, nativeColOff: 85760, nativeRowOff: 1050000 },
            editAs: 'oneCell',
          });
        }
      } catch (e) {
        console.error('[1688 export] could not load logo template:', e?.message || e);
      }
    }

    // Row 3 — header
    const headerRow = sheet.getRow(3);
    PACKING_HEADERS.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { size: 13, name: 'Arial', color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF512D70' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 40;

    // Data rows
    let totalQty = 0;
    let r = 4;
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      const row = sheet.getRow(r);
      const qty = Number(o.quantity) || 0;
      totalQty += qty;

      const setCell = (col, value, extraFont) => {
        const cell = row.getCell(col);
        cell.value = value === '' || value == null ? null : value;
        cell.font = { size: 11, name: 'Arial', ...extraFont };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = PACKING_THIN_BORDER;
      };

      setCell(1, 'CZN-GT'); // Marka — fixed shipping mark for every carton in this batch
      setCell(2, null); // Ctn. No — filled in by hand once cartons are packed
      setCell(3, o.order_number || '-');
      setCell(4, o.warehouse && o.warehouse.in_warehouse ? o.warehouse.code : null); // Goods No. — the REAL warehouse item code assigned when this box was scanned in (same one shown as "Received · CZN…" on the 1688 tab), not a made-up sequence. Blank until it's actually received.
      setCell(5, null); // Product Image cell — the photo is embedded below
      setCell(6, nerNames[i] || deriveShortProductName(o.product_name), { bold: true });
      setCell(7, 'GT'); // gtradea doesn't track a real brand — generic house brand
      setCell(8, deriveModelNumber(o));
      setCell(9, o.product_name || '-'); // full 1688 listing title — no qty/unit mixed in
      setCell(10, qty || null);
      setCell(11, 'pcs');
      setCell(12, null); // KG — filled in by hand at packing time
      setCell(13, null); // CBM — filled in by hand at packing time
      setCell(14, o.paid_amount != null ? Number(o.paid_amount) : null); // Paid Amount — from gtradea's procurement/China-ops view, packing list only (not shown on the 1688 tab)
      row.height = PACKING_ROW_HEIGHT;

      const img = imageBuffers[i];
      if (img) {
        try {
          const buf = img.buffer;
          const ext = img.ext || (path.extname(o.product_image.split('?')[0]).replace('.', '') || 'jpeg').toLowerCase();
          const dim = imageSize(buf);
          const scale = Math.min(PACKING_IMG_MAX / dim.width, PACKING_IMG_MAX / dim.height, 1);
          const w = Math.round(dim.width * scale);
          const h = Math.round(dim.height * scale);
          const imgId = workbook.addImage({ buffer: buf, extension: ext === 'jpg' ? 'jpeg' : ext });
          const PX_TO_EMU = 9525;
          const colWidthPx = PACKING_COL_WIDTHS[PACKING_IMG_COL - 1] * 7.5;
          const rowHeightPx = PACKING_ROW_HEIGHT * 1.333;
          const padX = Math.round(Math.max(0, (colWidthPx - w) / 2) * PX_TO_EMU);
          const padY = Math.round(Math.max(0, (rowHeightPx - h) / 2) * PX_TO_EMU);
          sheet.addImage(imgId, {
            tl: { col: PACKING_IMG_COL - 1, row: r - 1, nativeCol: PACKING_IMG_COL - 1, nativeRow: r - 1, nativeColOff: padX, nativeRowOff: padY },
            br: { col: PACKING_IMG_COL - 1, row: r - 1, nativeCol: PACKING_IMG_COL - 1, nativeRow: r - 1, nativeColOff: padX + w * PX_TO_EMU, nativeRowOff: padY + h * PX_TO_EMU },
            editAs: 'oneCell',
          });
        } catch (e) {
          console.error('[1688 export] product image embed failed:', e?.message || e);
        }
      }

      r += 1;
    }

    // Merge the Order ID + Paid Amount cells down across consecutive line items
    // that belong to the same order AND the same CN tracking number — that's one
    // shipment split into several product rows, so its order number and paid
    // amount (both order-level, not per-item) should read once per shipment
    // instead of repeating on every line.
    let groupStart = 0;
    let totalPaid = 0;
    for (let i = 1; i <= orders.length; i++) {
      const sameShipment = i < orders.length
        && orders[i].order_number && orders[i].china_tracking_no
        && orders[i].order_number === orders[groupStart].order_number
        && orders[i].china_tracking_no === orders[groupStart].china_tracking_no;
      if (!sameShipment) {
        if (i - groupStart > 1) {
          [3, PACKING_PAID_COL].forEach((col) => {
            sheet.mergeCells(4 + groupStart, col, 4 + i - 1, col);
            sheet.getCell(4 + groupStart, col).alignment = { horizontal: 'center', vertical: 'middle' };
          });
        }
        // Paid amount is per ORDER, not per line item — count each order once
        // regardless of how many product rows it spans, so the total isn't
        // inflated by multi-item shipments.
        const paid = Number(orders[groupStart].paid_amount);
        if (Number.isFinite(paid)) totalPaid += paid;
        groupStart = i;
      }
    }

    // Total row
    const totalRow = sheet.getRow(r);
    totalRow.height = 40;
    const setTotalCell = (col, value) => {
      const cell = totalRow.getCell(col);
      cell.value = value;
      cell.font = { size: 12, bold: true, name: 'Arial' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4DD' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    };
    setTotalCell(8, 'Total');
    setTotalCell(9, 'Total');
    setTotalCell(10, totalQty);
    setTotalCell(11, 'pcs');
    setTotalCell(PACKING_PAID_COL, totalPaid ? Math.round(totalPaid * 100) / 100 : null);

    const filename = `CZN_GtradeA_PackingList_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export 1688 packing list error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// POST /sync — kick off a fresh gtradea pull (staff/admin) and answer IMMEDIATELY
// with 202 + the in-flight status.
//
// This deliberately does NOT await the sync. A full pull is ~26-35s (gtradea is
// slow: 7 jobs x a detail round-trip each). Holding the HTTP request open that
// long meant the browser — and Render's proxy in production — gave up first and
// surfaced "Sync failed" / "failed to fetch", even though the sync itself went on
// to succeed server-side. The client follows progress via the `syncing` flag that
// both GET / and GET /status return.
//
// Coalesced, NOT errored: if a sync is already running or one finished moments
// ago, the caller's intent ("make sure fresh data is being pulled") is already
// satisfied, so we answer 200 with started:false instead of 409/429.
//
// This used to return 409/429. Because the 1688 tab fires a sync on every tab
// open (plus every 60s, from every staff member's browser), those benign
// collisions are routine — and the browser logs every non-2xx as a red "Failed
// to load resource", so a perfectly healthy, freshly-synced system looked like
// it was throwing errors in production. The protection against hammering the
// single shared gtradea account is that we don't START a sync — not the status
// code, so reporting it as success loses nothing.
const SYNC_COALESCE_MS = 3000;

router.post('/sync', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    // An explicit user-clicked "Sync now" (?force=1) bypasses the failure backoff;
    // the tab's automatic 60s kick does not, so a persistent upstream block stays
    // paused instead of being re-hit by every open browser.
    const force = String(req.query.force || '') === '1';
    const st = gtradeaSync.getStatus();
    // Bridge mode: the server's own pull is switched off (GTRADEA_SYNC_ENABLED
    // =false) because this IP is blocked upstream and the on-site bridge feeds
    // /ingest instead. Checked BEFORE isConfigured(): in bridge mode the gtradea
    // credentials live in the bridge's config.json, NOT in this server's env, so
    // the "not configured" branch would otherwise fire a misleading 503 while the
    // bridge is happily relaying orders.
    if (!st.enabled) {
      return res.json({ success: true, data: { started: false, reason: 'bridge-mode', ...st } });
    }
    if (!gtradeaSync.isConfigured()) {
      return res.status(503).json({ success: false, message: '1688 sync is not configured on the server' });
    }
    if (st.syncing) {
      return res.json({ success: true, data: { started: false, reason: 'already-running', ...st } });
    }
    if (!force && st.backingOffMs) {
      return res.json({ success: true, data: { started: false, reason: 'backing-off', ...st } });
    }
    if (!force && st.at && Date.now() - new Date(st.at).getTime() < SYNC_COALESCE_MS) {
      return res.json({ success: true, data: { started: false, reason: 'recently-synced', ...st } });
    }
    // runSync() flips its `syncing` flag synchronously before its first await, so
    // the status we return below already reads syncing: true.
    gtradeaSync.runSync({ force }).catch((e) => console.error('[gtradeaSync] background sync failed:', e.message));
    res.status(202).json({ success: true, data: { started: true, ...gtradeaSync.getStatus() } });
  } catch (error) {
    console.error('Sync supplier orders error:', error);
    res.status(500).json({ success: false, message: 'Sync failed' });
  }
});

// The on-site gtradea bridge is NOT a logged-in user — it authenticates with a
// shared secret set as GTRADEA_BRIDGE_TOKEN in the backend env AND in the
// bridge's config.json. Constant-time compared to avoid leaks. Same pattern as
// the print agent (see warehouse.js authenticateAgent).
const authenticateBridge = (req, res, next) => {
  const expected = process.env.GTRADEA_BRIDGE_TOKEN;
  if (!expected) {
    return res.status(503).json({ success: false, message: 'gtradea bridge is not configured' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: 'Invalid bridge token' });
  }
  return next();
};

// POST /ingest — the on-site bridge relays raw gtradea job-detail payloads from
// a network Cloudflare doesn't challenge. We map + upsert them exactly as a
// direct pull would, so the 1688 tab behaves identically either way.
// Body: { details: [ <job detail payload>, … ] }
router.post('/ingest', authenticateBridge, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const details = req.body && req.body.details;
    if (!Array.isArray(details)) {
      return res.status(400).json({ success: false, message: 'Body must be { details: [...] }' });
    }
    const result = await gtradeaSync.ingestDetails(details);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('gtradea bridge ingest error:', error);
    res.status(500).json({ success: false, message: 'Ingest failed' });
  }
});

// GET /status — last sync info (for the header "Synced …" label).
router.get('/status', authenticate, requireStaffOrAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: gtradeaSync.getStatus() });
});

module.exports = router;
