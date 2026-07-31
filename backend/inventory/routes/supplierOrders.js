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

// A YYYY-MM-DD query param -> the instant that bounds that calendar day in UTC,
// or null if it isn't a real date (a typo must not silently drop every row).
// UTC on purpose: gtradea stamps ordered_at in UTC and the 1688 panel renders
// that column in UTC too, so "1st–31st" here selects exactly the days the user
// can see in the table rather than sliding by their timezone offset.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayBound = (v, end) => {
  const s = String(v || '').trim();
  if (!DAY_RE.test(s)) return null;
  const d = new Date(`${s}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
  return isNaN(d.getTime()) ? null : d;
};

// Shared by GET / (JSON list) and GET /export.xlsx (packing list) so the two
// can never disagree on which rows a given search matches. `from`/`to` bound
// the ORDER date (ordered_at) and are used by the export only — the on-screen
// list has no date filter of its own.
async function fetchSupplierOrders(search, { from, to } = {}) {
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
  // Filtered in the QUERY, not after the fact: the 5000-row cap below is applied
  // by Postgres, so a post-filter would only ever see the newest 5000 orders and
  // would quietly return nothing for an older date range.
  const fromAt = dayBound(from, false);
  const toAt = dayBound(to, true);
  if (fromAt || toAt) {
    // Rows with no ordered_at can't be placed in a window at all, and Postgres
    // drops NULLs from a range comparison anyway — so they're excluded whenever
    // a date bound is given. That's the honest answer for "ordered between X and Y".
    where.ordered_at = {
      ...(fromAt ? { [Op.gte]: fromAt } : {}),
      ...(toAt ? { [Op.lte]: toAt } : {}),
    };
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
          attributes: ['tracking_number', 'rack_id', 'status', 'code', 'pr_code', 'shipped_at'],
        });
        for (const it of items) {
          const key = String(it.tracking_number || '').toUpperCase();
          // Prefer an in-stock match over a shipped one for the same tracking.
          if (!matchMap[key] || it.status === 'in_stock') {
            matchMap[key] = { rack_id: it.rack_id, status: it.status, code: it.code, pr_code: it.pr_code, shipped_at: it.shipped_at };
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
        warehouse: m ? { in_warehouse: true, rack_id: m.rack_id, status: m.status, code: m.code, pr_code: m.pr_code, shipped_at: m.shipped_at } : { in_warehouse: false },
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

// The sheet's columns, in order. Declared as a list rather than parallel
// header/width arrays with hard-coded indexes because the "without images"
// export DROPS the image column outright — leaving it in place as an empty
// 28-wide band reads as missing data rather than a deliberate choice — and
// every column after it then shifts left. Indexes are derived per-export from
// this list (see packingColumns below), so nothing has to be renumbered by hand.
const PACKING_COLUMNS = [
  { key: 'marka', header: 'MARKA', width: 16 },
  { key: 'ctn', header: 'Ctn. No', width: 15 },
  { key: 'order', header: 'Order ID', width: 24 },
  { key: 'goods', header: 'Goods No.', width: 16 },
  { key: 'image', header: 'Product Image', width: 28 },
  { key: 'name', header: 'Product Name', width: 24 },
  { key: 'brand', header: 'Brand name', width: 18 },
  { key: 'model', header: 'Model Number', width: 24 },
  { key: 'description', header: 'Product Description', width: 58 },
  { key: 'quantity', header: 'Quantity', width: 14 },
  { key: 'unit', header: 'Unit', width: 14 },
  { key: 'kg', header: 'KG', width: 14 },
  { key: 'cbm', header: 'CBM', width: 14 },
  { key: 'paid', header: 'Paid Amount', width: 16 },
];
// -> { columns: [...], col: { marka: 1, ctn: 2, ... } }, 1-indexed for ExcelJS.
const packingColumns = (withImages) => {
  const columns = withImages ? PACKING_COLUMNS : PACKING_COLUMNS.filter((c) => c.key !== 'image');
  return { columns, col: Object.fromEntries(columns.map((c, i) => [c.key, i + 1])) };
};
const PACKING_ROW_HEIGHT = 126; // pt (~168px) — data rows, sized up from the template's 45pt
// Without photos there's nothing needing a 126pt row, so the sheet tightens up
// to something you can actually scroll and print. Still tall enough for the
// wrapped product description, which is the only multi-line cell left.
const PACKING_ROW_HEIGHT_NO_IMG = 42; // pt
const PACKING_IMG_MAX = 140; // px — thumbnail fits inside the taller data row without blowing it up
const PACKING_THIN_BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
// How many rows get the expensive per-row extras (product photo + LLM-refined
// name). Data rows are NOT capped — see the export route for why only the
// enrichment is bounded.
const PACKING_ENRICH_MAX_ROWS = Number(process.env.PACKING_ENRICH_MAX_ROWS || 500);

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

// Which slice of the 1688 orders an export covers. `received` is the default
// because the packing list is a physical-packing reference — only goods sitting
// on the shelf can actually go in a carton — but staff also need the other two
// views: `all` to reconcile a whole date range against gtradea, and
// `not_arrived` as a chase list for stock that was ordered but never scanned in.
const EXPORT_SCOPES = {
  received: {
    label: 'Received Only',
    // In the warehouse RIGHT NOW. A box that arrived and has since been
    // dispatched is deliberately out: there's nothing left to pack.
    match: (o) => !!(o.warehouse && o.warehouse.in_warehouse && o.warehouse.status === 'in_stock'),
  },
  all: {
    label: 'All Orders',
    match: () => true,
  },
  not_arrived: {
    label: 'Not Arrived Yet',
    // Never scanned into the warehouse — covers both "gtradea has no CN
    // tracking yet" and "has tracking but hasn't turned up". A dispatched box
    // is NOT here; it did arrive.
    match: (o) => !(o.warehouse && o.warehouse.in_warehouse),
  },
};
// Tolerate the UI's own vocabulary for the same slice so a renamed control on
// the frontend can't silently fall back to the default scope.
const SCOPE_ALIASES = { pending: 'not_arrived', not_received: 'not_arrived', in_stock: 'received' };
// hasOwnProperty, not a bare lookup: `?scope=constructor` would otherwise hit an
// inherited Object.prototype member and read as a known scope.
const hasKey = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const resolveScope = (v) => {
  const key = String(v || '').trim().toLowerCase();
  const name = hasKey(SCOPE_ALIASES, key) ? SCOPE_ALIASES[key] : key;
  return hasKey(EXPORT_SCOPES, name) ? name : 'received';
};

// GET /export.xlsx — packing list for the (optionally search-, scope- and
// date-filtered) 1688 orders, styled after
// frontend/public/Invoice/GtradeA Sent Goods.xlsx: title band, Cellzen logo,
// purple header row, one row per order with its product photo embedded.
// Brand/model/description are gtradea data gaps we backfill with sane
// placeholders (see the per-row build below) rather than leaving the columns
// blank, since the sheet is used as a physical packing reference.
//
// Query: ?search= (same matcher as the list) &scope=received|all|not_arrived
// (default received) &from=YYYY-MM-DD &to=YYYY-MM-DD (both optional, inclusive,
// on the gtradea ORDER date) &images=0 to drop the product photos.
router.get('/export.xlsx', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const scopeKey = resolveScope(req.query.scope);
    const scope = EXPORT_SCOPES[scopeKey];
    const from = DAY_RE.test(String(req.query.from || '').trim()) ? String(req.query.from).trim() : '';
    const to = DAY_RE.test(String(req.query.to || '').trim()) ? String(req.query.to).trim() : '';
    // Photos are the default (the sheet is a packing reference), so only an
    // explicit off value turns them off — an absent or unparseable param must
    // not quietly produce a photo-less list.
    const withImages = !['0', 'false', 'no', 'off'].includes(String(req.query.images ?? '').trim().toLowerCase());
    const { columns, col } = packingColumns(withImages);
    const rowHeight = withImages ? PACKING_ROW_HEIGHT : PACKING_ROW_HEIGHT_NO_IMG;
    const allOrders = await fetchSupplierOrders(req.query.search, { from, to });
    const orders = allOrders.filter(scope.match);

    // Product photos and LLM-refined names are per-row NETWORK work: a Supabase
    // download + re-encode each, plus a Groq call per 25 titles. On the default
    // Received-only list that's a few dozen rows and costs nothing. "Export all"
    // over a long date range can be thousands — and doing this for every one of
    // them is exactly what used to push this route past Render's proxy timeout
    // into a 502 (see mapWithConcurrency above). So the enrichment, not the data,
    // is what gets bounded: EVERY matching row and every field is still written
    // below, the rows past this point just carry the offline heuristic name and
    // no thumbnail — which is all a reconciliation-sized export needs anyway.
    const enriched = orders.slice(0, PACKING_ENRICH_MAX_ROWS);
    const trimmedEnrichment = orders.length > enriched.length;
    if (trimmedEnrichment) {
      console.warn(`[1688 export] ${orders.length} rows (scope=${scopeKey}) — photos/LLM names limited to the first ${enriched.length}.`);
    }

    // Resolve the product name up front (see productNames.js — a wrong name here
    // is a customs problem, not just a cosmetic one). `nerNames[i]` is null
    // wherever no strategy produced a trustworthy name, and undefined past
    // `enriched`; both fall back to deriveShortProductName below.
    const nerNames = await extractProductNames(enriched.map((o) => o.product_name || ''));

    // Fetch the product images in parallel (bounded to 8 at a time) instead of
    // one network round-trip at a time inside the row loop below. Skipped
    // entirely for a no-images export — that's the whole point of the option,
    // and it's what makes a several-thousand-row "Export All" finish quickly.
    const imageBuffers = new Array(orders.length).fill(null);
    if (withImages) {
      await mapWithConcurrency(enriched, 8, async (o, i) => {
        if (!o.product_image) return;
        try {
          const raw = await downloadImage(o.product_image);
          if (raw) imageBuffers[i] = await shrinkImageForExport(raw);
        } catch (e) {
          console.error('[1688 export] product image download failed:', e?.message || e);
        }
      });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Packing List');
    columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });

    // Row 1 — title band. The scope and date range are printed INTO the sheet,
    // not just the filename: these lists get emailed and printed, and a
    // "Not Arrived Yet" chase list that reads like a packing list of goods on
    // hand is the kind of mix-up that ships the wrong carton.
    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell(1, 1);
    const rangeLabel = from && to ? ` (${from} to ${to})` : from ? ` (from ${from})` : to ? ` (up to ${to})` : '';
    // A trimmed export says so on its face — a reader who sees photos stop
    // halfway down otherwise has no way to tell that from missing product data.
    // Only photos are called out: a row past the cap still gets a product name,
    // just from the offline heuristic rather than the model, so nothing is
    // actually absent from those cells. Moot without images.
    const trimLabel = trimmedEnrichment && withImages
      ? `  ·  photos on the first ${enriched.length} of ${orders.length} rows`
      : '';
    titleCell.value = `Packing List of 1688 Orders — ${scope.label}${rangeLabel}${trimLabel}`;
    titleCell.font = { size: 17, bold: true, name: 'Arial', color: { argb: 'FF2D2D2D' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4DD' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 48;

    // Row 2 — logo band, logo pulled straight from the template file so the
    // export always carries whatever mark is currently in that file.
    sheet.mergeCells(2, 1, 2, columns.length);
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
    columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
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

      setCell(col.marka, 'CZN-GT'); // Marka — fixed shipping mark for every carton in this batch
      setCell(col.ctn, null); // Ctn. No — filled in by hand once cartons are packed
      setCell(col.order, o.order_number || '-');
      // Goods No. — the id physically printed on the box's label: the gtradea PR
      // id (PR-1029), same as the GtradeA panel's "Received · PR-…" pill. Falls
      // back to the internal CZN code only for a box stored before gtradea
      // published a job code for its order. Blank until it's actually received —
      // never a made-up sequence.
      setCell(col.goods, o.warehouse && o.warehouse.in_warehouse ? (o.warehouse.pr_code || o.job_code || o.warehouse.code) : null);
      if (withImages) setCell(col.image, null); // the photo is embedded into this cell below
      setCell(col.name, nerNames[i] || deriveShortProductName(o.product_name), { bold: true });
      setCell(col.brand, 'GT'); // gtradea doesn't track a real brand — generic house brand
      setCell(col.model, deriveModelNumber(o));
      setCell(col.description, o.product_name || '-'); // full 1688 listing title — no qty/unit mixed in
      setCell(col.quantity, qty || null);
      setCell(col.unit, 'pcs');
      setCell(col.kg, null); // KG — filled in by hand at packing time
      setCell(col.cbm, null); // CBM — filled in by hand at packing time
      setCell(col.paid, o.paid_amount != null ? Number(o.paid_amount) : null); // Paid Amount — from gtradea's procurement/China-ops view, packing list only (not shown on the 1688 tab)
      row.height = rowHeight;

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
          const imgCol0 = col.image - 1; // ExcelJS anchors are 0-indexed
          const colWidthPx = columns[imgCol0].width * 7.5;
          const rowHeightPx = rowHeight * 1.333;
          const padX = Math.round(Math.max(0, (colWidthPx - w) / 2) * PX_TO_EMU);
          const padY = Math.round(Math.max(0, (rowHeightPx - h) / 2) * PX_TO_EMU);
          sheet.addImage(imgId, {
            tl: { col: imgCol0, row: r - 1, nativeCol: imgCol0, nativeRow: r - 1, nativeColOff: padX, nativeRowOff: padY },
            br: { col: imgCol0, row: r - 1, nativeCol: imgCol0, nativeRow: r - 1, nativeColOff: padX + w * PX_TO_EMU, nativeRowOff: padY + h * PX_TO_EMU },
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
          [col.order, col.paid].forEach((c) => {
            sheet.mergeCells(4 + groupStart, c, 4 + i - 1, c);
            sheet.getCell(4 + groupStart, c).alignment = { horizontal: 'center', vertical: 'middle' };
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
    const setTotalCell = (c, value) => {
      const cell = totalRow.getCell(c);
      cell.value = value;
      cell.font = { size: 12, bold: true, name: 'Arial' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E4DD' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    };
    setTotalCell(col.model, 'Total');
    setTotalCell(col.description, 'Total');
    setTotalCell(col.quantity, totalQty);
    setTotalCell(col.unit, 'pcs');
    setTotalCell(col.paid, totalPaid ? Math.round(totalPaid * 100) / 100 : null);

    const stamp = from || to
      ? `${(from || 'any').replace(/-/g, '')}_${(to || 'any').replace(/-/g, '')}`
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const scopeTag = { received: 'Received', all: 'All', not_arrived: 'NotArrived' }[scopeKey];
    const filename = `CZN_GtradeA_PackingList_${scopeTag}${withImages ? '' : '_NoImages'}_${stamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export 1688 packing list error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ============================================================ BILLING REPORT
// Styled after frontend/public/Invoice/GtradeA_Billing_Templates.xlsx — every
// literal below (teal title band, orange header, 83.25pt bordered rows, the BR
// Firma faces, the ¥ accounting format) is read off that file, so the generated
// report and the hand-made template are the same document.
const BILLING_TEMPLATE_PATH = path.join(PACKING_TEMPLATE_DIR, 'GtradeA_Billing_Templates.xlsx');
const BILLING_TEAL = 'FF267488';   // title band fill
const BILLING_CREAM = 'FFF4F0EB';  // title band text
const BILLING_ORANGE = 'FFE94724'; // column header fill
// The title band reads plainly: "GtradeA Billing" in the family's regular
// weight, smaller than the template's 17pt SemiBold.
const BILLING_TITLE_FONT = 'BR Firma Regular';
const BILLING_TITLE_SIZE = 10;
// The sheet is set in the family's REGULAR weight — headers and data alike.
// Medium is reserved for the one column that should carry weight on the page,
// the product name, so the eye lands on what each line is actually for.
const BILLING_FONT = 'BR Firma Regular';
const BILLING_EMPHASIS_FONT = 'BR Firma Medium';
// Chinese Yuan accounting format, copied verbatim from the template's price column.
const BILLING_CNY_FMT = '_ [$¥-804]* #,##0.00_ ;_ [$¥-804]* -#,##0.00_ ;_ [$¥-804]* "-"??_ ;_ @_ ';
const BILLING_DATE_FMT = 'd-mmm';
const BILLING_TITLE_HEIGHT = 35.6;
const BILLING_LOGO_HEIGHT = 101.15;
// Fraction of the sheet width the logo may occupy. The mark is ~4.8:1, so
// height-fitting alone would run it most of the way across the page.
const BILLING_LOGO_MAX_WIDTH = 0.4;
const BILLING_ROW_HEIGHT = 83.25;
// The template carries one combined "Product ID" column; this splits it into the
// PR ID and Order ID the 1688 tab actually shows, which is what was asked for.
// Widths run wider than the template's so nothing sits tight against a cell
// border — the ids and the product name are the long values, so they get the
// most room. The price header carries the currency, since the ¥ in the cells is
// part of a number format and can be easy to miss.
const BILLING_COLUMNS = [
  { key: 'date', header: 'Date', width: 18 },
  { key: 'pr', header: 'PR ID', width: 21 },
  { key: 'order', header: 'Order ID', width: 32 },
  { key: 'name', header: 'Product Name', width: 42 },
  { key: 'quantity', header: 'Qty', width: 14 },
  { key: 'unit', header: 'Unit', width: 14 },
  { key: 'price', header: 'Total Price (¥)', width: 26 },
];
const BILLING_COL = Object.fromEntries(BILLING_COLUMNS.map((c, i) => [c.key, i + 1]));
const BILLING_BORDER = PACKING_THIN_BORDER;

// ordered_at is a UTC calendar day everywhere else in this feature, so pin the
// cell to UTC midnight. Handing ExcelJS a raw timestamp would let a late-evening
// order render as the next/previous day depending on how the serial is read.
const billingDateCell = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

// Two rows belong to the same billing group when they're the same order AND the
// same PR. The order number has to be present to claim that — a pair of blank
// ids is not evidence of anything, and merging on it would fuse unrelated lines.
const sameBillingGroup = (a, b) => !!a.orderId && a.orderId === b.orderId && a.prId === b.prId;

// Maximal runs of equal adjacent values in `rows[start..end)`, as [from, to)
// pairs. Used for the price column: a run longer than one row is a single
// order-level charge repeated across its line items, so it merges into one cell
// and counts once. `null` (unpriced) never runs — blank cells stay separate.
function equalRuns(rows, start, end, valueOf) {
  const runs = [];
  let i = start;
  while (i < end) {
    const v = valueOf(rows[i]);
    let j = i + 1;
    if (v !== null) while (j < end && valueOf(rows[j]) === v) j += 1;
    runs.push([i, j]);
    i = j;
  }
  return runs;
}

// GET /billing-report.xlsx — the GtradeA billing report: one row per 1688 line
// item with its date, PR/order ids, product, quantity and price.
//
// Query: ?search= (same matcher as the list) &from=YYYY-MM-DD &to=YYYY-MM-DD.
// Both dates optional — omitting them is the "All time" report.
router.get('/billing-report.xlsx', authenticate, requireStaffOrAdmin, async (req, res) => {
  try {
    if (dbGuard(res)) return;
    const from = DAY_RE.test(String(req.query.from || '').trim()) ? String(req.query.from).trim() : '';
    const to = DAY_RE.test(String(req.query.to || '').trim()) ? String(req.query.to).trim() : '';
    // Billing covers what was ORDERED, so there's no warehouse-state scope here:
    // an order still in transit has already been paid for and belongs on the bill.
    const orders = await fetchSupplierOrders(req.query.search, { from, to });

    // Same bound as the packing list, and for the same reason — see the comment
    // there. No images on this sheet, so naming is the only per-row network cost.
    const enriched = orders.slice(0, PACKING_ENRICH_MAX_ROWS);
    const nerNames = await extractProductNames(enriched.map((o) => o.product_name || ''));

    const rows = orders.map((o, i) => ({
      date: billingDateCell(o.ordered_at),
      // The PR id printed on the box, same precedence as the packing list's
      // Goods No. — the warehouse's own pr_code once scanned in, else whatever
      // job code gtradea published for the order.
      prId: (o.warehouse && o.warehouse.pr_code) || o.job_code || '',
      orderId: o.order_number || '',
      name: nerNames[i] || deriveShortProductName(o.product_name),
      quantity: Number(o.quantity) || null,
      // paid_amount is an ORDER-level figure repeated on every line item of that
      // order (see the packing list's total), which is exactly what makes the
      // merge below meaningful.
      price: Number.isFinite(Number(o.paid_amount)) && o.paid_amount != null ? Number(o.paid_amount) : null,
    }));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('GtradeA Billings');
    BILLING_COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });
    const lastCol = BILLING_COLUMNS.length;

    // Row 1 — title band
    sheet.mergeCells(1, 1, 1, lastCol);
    const titleCell = sheet.getCell(1, 1);
    // Title only — the date range it covers is carried by the filename, so the
    // band stays clean.
    titleCell.value = 'GtradeA Billing';
    titleCell.font = { name: BILLING_TITLE_FONT, size: BILLING_TITLE_SIZE, color: { argb: BILLING_CREAM } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BILLING_TEAL } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = BILLING_TITLE_HEIGHT;

    // Row 2 — logo band, lifted from the template so the report always carries
    // whatever mark that file currently holds.
    sheet.mergeCells(2, 1, 2, lastCol);
    sheet.getRow(2).height = BILLING_LOGO_HEIGHT;
    if (fs.existsSync(BILLING_TEMPLATE_PATH)) {
      try {
        const templateWb = new ExcelJS.Workbook();
        await templateWb.xlsx.readFile(BILLING_TEMPLATE_PATH);
        const tplSheet = templateWb.getWorksheet(1);
        const tplImages = tplSheet ? tplSheet.getImages() : [];
        if (tplImages.length) {
          const imgData = templateWb.getImage(tplImages[0].imageId);
          const logoId = workbook.addImage({ buffer: imgData.buffer, extension: imgData.extension });
          const widthsPx = BILLING_COLUMNS.map((c) => c.width * 7.5);
          const totalPx = widthsPx.reduce((a, b) => a + b, 0);
          const dim = imageSize(imgData.buffer);
          // The mark is very wide (1186 x 248, about 4.8:1), so fitting it to the
          // band's HEIGHT alone would stretch it right across the sheet. Take the
          // smaller of the height fit and a width cap, and never upscale — so it
          // keeps the proportions of the original artwork at a sensible size.
          const scale = Math.min(
            (BILLING_LOGO_HEIGHT * 1.333 - 16) / dim.height,
            (totalPx * BILLING_LOGO_MAX_WIDTH) / dim.width,
            1
          );
          const w = Math.round(dim.width * scale);
          const h = Math.round(dim.height * scale);
          // Anchor by TOP-LEFT + explicit extent, NOT top-left + bottom-right.
          // A br anchor makes Excel stretch the image to whatever gap it lands in,
          // and that gap depends on Excel's own column-width-to-pixel rounding —
          // which is not the 7.5x used here, so the mark came out distorted. `ext`
          // sets the size outright, so the aspect ratio is exactly the original's.
          const colAt = (xPx) => {
            let x = Math.max(0, xPx);
            for (let i = 0; i < widthsPx.length; i++) {
              if (x < widthsPx[i]) return i + x / widthsPx[i]; // fractional column
              x -= widthsPx[i];
            }
            return widthsPx.length;
          };
          const rowOff = Math.max(0, (BILLING_LOGO_HEIGHT * 1.333 - h) / 2) / (BILLING_LOGO_HEIGHT * 1.333);
          sheet.addImage(logoId, {
            tl: { col: colAt((totalPx - w) / 2), row: 1 + rowOff },
            ext: { width: w, height: h },
            editAs: 'oneCell',
          });
        }
      } catch (e) {
        console.error('[1688 billing] could not load logo template:', e?.message || e);
      }
    }

    // Row 3 — column headers
    const headerRow = sheet.getRow(3);
    BILLING_COLUMNS.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { name: BILLING_FONT, size: 16 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BILLING_ORANGE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = BILLING_ROW_HEIGHT;

    // Data rows
    const FIRST_ROW = 4;
    rows.forEach((row, i) => {
      const r = sheet.getRow(FIRST_ROW + i);
      const setCell = (c, value, extra = {}) => {
        const cell = r.getCell(c);
        cell.value = value === '' || value == null ? null : value;
        cell.font = { name: BILLING_FONT, size: 16, ...(extra.font || {}) };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = BILLING_BORDER;
        if (extra.numFmt) cell.numFmt = extra.numFmt;
      };
      setCell(BILLING_COL.date, row.date, { numFmt: BILLING_DATE_FMT });
      setCell(BILLING_COL.pr, row.prId);
      setCell(BILLING_COL.order, row.orderId);
      // Medium rather than bold: the weight comes from the face itself, so it
      // stays in the family instead of Excel synthesising a heavier one.
      setCell(BILLING_COL.name, row.name, { font: { name: BILLING_EMPHASIS_FONT } });
      setCell(BILLING_COL.quantity, row.quantity);
      setCell(BILLING_COL.unit, 'pcs');
      setCell(BILLING_COL.price, row.price, { numFmt: BILLING_CNY_FMT });
      r.height = BILLING_ROW_HEIGHT;
    });

    // Merge down: the PR/Order ids across every line item of one order, and the
    // price across each run of line items carrying the SAME charge. A group whose
    // lines were each priced separately keeps one price cell per line.
    let total = 0;
    let start = 0;
    for (let i = 1; i <= rows.length; i++) {
      if (i < rows.length && sameBillingGroup(rows[start], rows[i])) continue;
      if (i - start > 1) {
        [BILLING_COL.pr, BILLING_COL.order].forEach((c) => {
          sheet.mergeCells(FIRST_ROW + start, c, FIRST_ROW + i - 1, c);
          sheet.getCell(FIRST_ROW + start, c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
      }
      for (const [a, b] of equalRuns(rows, start, i, (x) => x.price)) {
        if (b - a > 1) {
          sheet.mergeCells(FIRST_ROW + a, BILLING_COL.price, FIRST_ROW + b - 1, BILLING_COL.price);
          sheet.getCell(FIRST_ROW + a, BILLING_COL.price).alignment = { horizontal: 'center', vertical: 'middle' };
        }
        // One charge per merged run — that's the whole point of the merge, and
        // it's what keeps the total from double-counting an order-level amount
        // that happens to be stamped on each of its line items.
        if (rows[a].price !== null) total += rows[a].price;
      }
      start = i;
    }

    // Total row, bookending the sheet in the title band's colours.
    const totalRow = sheet.getRow(FIRST_ROW + rows.length);
    totalRow.height = BILLING_ROW_HEIGHT;
    BILLING_COLUMNS.forEach((c, i) => {
      const cell = totalRow.getCell(i + 1);
      cell.font = { name: BILLING_TITLE_FONT, size: 16, color: { argb: BILLING_CREAM } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BILLING_TEAL } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = BILLING_BORDER;
    });
    totalRow.getCell(BILLING_COL.name).value = 'Total';
    totalRow.getCell(BILLING_COL.quantity).value = rows.reduce((s, x) => s + (x.quantity || 0), 0) || null;
    totalRow.getCell(BILLING_COL.unit).value = 'pcs';
    const totalCell = totalRow.getCell(BILLING_COL.price);
    totalCell.value = total ? Math.round(total * 100) / 100 : null;
    totalCell.numFmt = BILLING_CNY_FMT;

    const stamp = from || to
      ? `${(from || 'any').replace(/-/g, '')}_${(to || 'any').replace(/-/g, '')}`
      : `AllTime_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const filename = `CZN_GtradeA_Billing_${stamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('GtradeA billing report error:', error);
    res.status(500).json({ success: false, message: 'Report failed' });
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
