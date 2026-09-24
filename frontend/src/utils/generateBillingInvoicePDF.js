// Billing Invoice PDF — a distinct client-facing document from the Proforma
// Invoice (generateCellzenInvoicePDF.js).
//
// This is a pixel-match of the approved design, public/billinginvoice.svg.
// That file is a 1693 x 2406 Figma export of an A4 page, i.e. 8.0619 px/mm,
// so every position and type size below is expressed in *reference pixels*
// and converted at draw time by `mm()` / `pt()`. Keeping the design's own
// numbers in the source means any coordinate here can be checked straight
// against the SVG rather than being a tuned-by-eye magic number.
//
// See generateBillingInvoicePDF's export below for the entry point.

import { jsPDF } from 'jspdf';
import { buildInvoiceFilename } from './invoiceFilename';
import { convertInvoiceCurrency } from './convertInvoiceCurrency';

// ─── Reference-space conversion ───────────────────────────────────────────
const REF_PX_PER_MM = 1693 / 210;
const mm = (refPx) => refPx / REF_PX_PER_MM;               // reference px -> mm
const px = (valueMm) => valueMm * REF_PX_PER_MM;           // mm -> reference px
const pt = (refPx) => (refPx / REF_PX_PER_MM) * (72 / 25.4); // reference em px -> pt

// ─── Geometry, read out of public/billinginvoice.svg ──────────────────────
// x/y are reference pixels. Text y values are *baselines*, which is what
// jsPDF's doc.text() takes by default.
const REF = {
  marginX: 143,                  // left text origin + divider start
  rightX: 1547,                  // right text edge + divider end
  col2: 835,                     // "Contact" / "Invoice Number" / "Mode of Shipment"
  col3: 1285,                    // "Issued Date" / "Due Date"
  pageBottom: 2374,

  logo: { x: 146, y: 75, size: 102 },
  watermark: { x: 211.5, y: 543, w: 1271, h: 1280, opacity: 0.03 },
  titleBaseline: 150.3,
  titleRightX: 1552,             // "INVOICE" overhangs the rule slightly

  // The design puts these at 313.3 / 351.6; the whole block is nudged 28px
  // (~3.5 mm) higher than that by request, tightening the gap under the logo.
  companyBaseline: 285.3,        // "Cellzen Trading Limited" and "Contact" share this
  addressBaseline: 323.6,
  addressLead: 37,

  divider1: 476,
  metaLabel1: 543.1,
  metaValue1: 582.2,
  metaLabel2Col2: 653.8,         // col 2's second pair sits slightly lower than
  metaValue2Col2: 693.0,         // col 3's — that asymmetry is in the design
  metaLabel2Col3: 645.1,
  metaValue2Col3: 683.8,
  custLead: 37,

  band: { x: 125, w: 1440, y: 783, h: 66 },
  headBaseline: 824.1,
  bodyTop: 859,
  rowH: 54,
  rowBaseline: 33.2,             // baseline offset from the top of a row
  // "S.N." is an addition to the design (requested separately); the other
  // four columns keep the design's exact right edges.
  snLeft: 143,
  snCentre: 178,
  descLeft: 213,
  descRight: 845,
  // The design's right edges are 1001 / 1178 / 1359 / 1547. Qty and Unit are
  // pulled left and tightened up so the two money columns, which carry a
  // currency symbol the design's don't, get the room instead.
  colRight: { qty: 940, unit: 1060, rate: 1300, total: 1547 },

  totalsBaseline: 1628.2,
  totalsLead: 47,
  totalsLabelRight: 1359,
  totalsGap: 21,                 // design gap between the labels and amounts
  payMethodValue: 1668.2,
  inWordsLabel: 1736.1,
  inWordsValue: 1776.1,
  inWordsWrap: 700,

  divider2: 1819,
  payInfoBaseline: 1866.3,
  bankBaseline: 1907.1,
  bankLead: 35,
  bankWrap: 1120,

  qr: { x: 1351, y: 1851, size: 196 },
  nepalRightX: 1544,
  nepalLabelBaseline: 2089.8,
  nepalBaseline: 2130.1,
  nepalLead: 28,

  divider3: 2215,
  signLabelBaseline: 2266.1,
  signValueBaseline: 2304.2,
  signCol2: 616,                 // "Signed by" — left-aligned, not centred

  ruleThick: 4,                  // the divider under the company block
  ruleThin: 2,                   // every other rule, incl. item-row underlines
};

// Type sizes, also in reference em pixels. Labels and body text are the same
// size throughout — the hierarchy comes from weight, not scale.
//
// These are the design's own measured sizes (69.5 / 29.4 / 30.4 / 26.3 /
// 24.2 / 23.1) less TRIM, a requested one-point reduction across the board.
// Drop TRIM to 0 to go back to matching billinginvoice.svg exactly.
const TRIM = 1 / ((72 / 25.4) / (1693 / 210)); // 1 pt, expressed in reference px
const SIZE = {
  title: 69.5 - TRIM,
  label: 29.4 - TRIM,      // semibold
  body: 30.4 - TRIM,       // light
  meta: 26.3 - TRIM,       // light — invoice-to / number / dates, addresses
  nepal: 24.2 - TRIM,      // light
  nepalLabel: 23.1 - TRIM, // semibold
};

// Aeonik ships no upright Semibold (only Thin/Light/Regular/Bold), so
// headings are set in Regular and thickened by a stroke of this fraction of
// the em — heavier than Regular, lighter than Bold. 0 gives plain Regular.
const SEMIBOLD_STROKE = 0.025;

// ─── Brand colours — lifted straight from public/billinginvoice.svg, which
// uses exactly three: the page wash, the red accent, and black text (weight
// carries the hierarchy, not a second text colour).
const C = {
  accent: [255, 78, 70],   // #FF4E46 — "INVOICE" title, items table header
  ink:    [0, 0, 0],       // all body copy and rules
  band:   [247, 247, 247], // #F7F7F7 — full page background wash
  white:  [255, 255, 255],
};

// Currency symbols, used both in the Rate/Total column headers — "Rate ($)" —
// and on every rate and total amount. Note NPR uses U+20A8 (₨), the rupee
// sign Aeonik actually carries; it has no U+20B9 (₹), which is in any case
// the Indian rather than the Nepalese mark.
const symOf = (code) => ({ NPR: '₨', USD: '$', CNY: '¥' }[code] || code);

const MODE_LABEL = { road: 'BY LAND', air: 'BY AIR', sea: 'BY SEA', rail: 'BY RAIL' };

// Cellzen's fixed bank details — same on every Billing Invoice, so this is
// baked into the template rather than entered per invoice.
const BANK = {
  accountNumber: '63003676333',
  holderName: 'CELLZEN TRADING LIMITED',
  bankName: 'JPMorgan Chase Bank N.A., Hong Kong Branch',
  // Two entries because the design breaks this address after "8" rather than
  // wherever the column happens to run out.
  bankAddress: ['18/F, 20/F, 22-29/F, CHATER HOUSE, 8', 'CONNAUGHT ROAD CENTRAL, HONG KONG'],
  accountType: 'Business Account',
  swift: 'CHASHKHH (CHASHKHHXXX if 11 characters are required)',
  bankCode: '007',
  branchNumber: '863',
};

const NEPAL_ACCOUNT = {
  label: 'For Nepal',
  signer: 'SUNDAR SHRESTHA',
  accountName: 'Citizens Bishesh Bachat Khata',
  accountNumber: '0850100000189041',
};

// ─── Assets ───────────────────────────────────────────────────────────────
const loadImageDataUrl = async (src) => {
  const resp = await fetch(src);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  const reader = new FileReader();
  await new Promise((resolve, reject) => {
    reader.onloadend = resolve;
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return reader.result;
};

// jsPDF (4.2.1) can't embed WEBP directly — decode it via canvas and
// re-encode as PNG. The WEBP file stays the canonical stored asset (smaller,
// per request); this conversion is purely to satisfy jsPDF's format support.
const loadWebpAsPngDataUrl = async (src) => {
  const resp = await fetch(src);
  if (!resp.ok) return null;
  const blob = await resp.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return canvas.toDataURL('image/png');
};

const getImageFormat = (dataUrl = '') => {
  if (dataUrl.includes('image/png')) return 'PNG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'JPEG';
};

// ─── Fonts ────────────────────────────────────────────────────────────────
// The design is set in Aeonik. The shipped webfonts are WOFF with CFF
// outlines, which jsPDF can't embed, so public/fonts/Aeonik-*.ttf are
// TrueType conversions subset to Latin-1 (~10 KB each). They're fetched
// rather than bundled so they cost nothing until someone exports a PDF.
// Falls back to Helvetica if the fetch fails — a slightly-off typeface beats
// no invoice.
//
// Regular takes jsPDF's "bold" slot because headings are set in Regular and
// stroked up to a semibold weight; see SEMIBOLD_STROKE.
const FONT_FILES = [
  { file: 'Aeonik-Light.ttf', url: '/fonts/Aeonik-Light.ttf', style: 'normal' },
  { file: 'Aeonik-Regular.ttf', url: '/fonts/Aeonik-Regular.ttf', style: 'bold' },
];

let fontDataPromise = null;

const fetchAsBase64 = async (url) => {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url} -> ${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // chunked so a ~10 KB font can't blow the arg limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const registerFonts = async (doc) => {
  if (!fontDataPromise) {
    fontDataPromise = Promise.all(FONT_FILES.map((f) => fetchAsBase64(f.url)))
      .catch((e) => {
        console.log('Aeonik unavailable, falling back to Helvetica:', e);
        return null;
      });
  }
  const data = await fontDataPromise;
  if (!data) return 'helvetica';
  FONT_FILES.forEach(({ file, style }, i) => {
    doc.addFileToVFS(file, data[i]);
    doc.addFont(file, 'Aeonik', style);
  });
  return 'Aeonik';
};

// ─── Export-only fallbacks ────────────────────────────────────────────────
// When a customer field is missing, the PDF fills it with a placeholder
// instead of leaving the line blank. Never written back into the
// create-invoice form.
// "Subodh Pokhrel" -> "subodh@gmail.com" (first name only).
const fallbackEmail = (name) => {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const slug = first.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slug ? `${slug}@gmail.com` : '';
};
const FALLBACK_PHONE = '97798000000';
const FALLBACK_ADDRESS = 'Kathmandu, Bagmati Province, Nepal';

// Due Date defaults to 1 week after the Invoice Date whenever it's missing
// at export time (an older/edited invoice, not just a brand-new one).
const addDaysISO = (dateStr, days) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

// ─── Number → words (Crore/Lakh style, matches the PI generator) ───────────
const numberToWords = (n) => {
  const ones  = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
  const teens = ['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const lt1k  = (x) => {
    if (!x) return '';
    if (x < 10)  return ones[x];
    if (x < 20)  return teens[x - 10];
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
    return ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' and ' + lt1k(x % 100) : '');
  };
  if (!n) return 'Zero Only';
  const parts = []; let rem = Math.floor(n);
  if (rem >= 10000000) { parts.push(lt1k(Math.floor(rem / 10000000)) + ' Crore'); rem %= 10000000; }
  if (rem >= 100000)   { parts.push(lt1k(Math.floor(rem / 100000))   + ' Lakh');  rem %= 100000;   }
  if (rem >= 1000)     { parts.push(lt1k(Math.floor(rem / 1000))     + ' Thousand'); rem %= 1000;  }
  if (rem > 0)         { parts.push(lt1k(rem)); }
  const dec = Math.round((n % 1) * 100);
  return parts.join(' ') + (dec ? ' and ' + lt1k(dec) + ' Paisa' : '') + ' Only';
};

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const formatDateOrdinal = (d) => {
  if (!d) return '';
  const parsed = new Date(d);
  if (isNaN(parsed)) return String(d);
  const month = parsed.toLocaleDateString('en-US', { month: 'long' });
  return `${month} ${ordinal(parsed.getDate())}, ${parsed.getFullYear()}`;
};

// ─── Main export ──────────────────────────────────────────────────────────────
// Same signature as generateInvoicePDF (generateCellzenInvoicePDF.js) so the
// two generators are interchangeable at the call site based on documentType.
export const generateBillingInvoicePDF = async (invoiceInput, currency = 'USD', rates = null, options = {}) => {
  const invoice = rates ? convertInvoiceCurrency(invoiceInput, currency, rates) : invoiceInput;
  const raw   = invoice.rawData || {};
  // A row only prints once staff actually filled in a Qty or a Rate — the
  // 13-row default checklist starts fully blank apart from Description, and
  // an unused charge (even one with a leftover Unit but no amount) shouldn't
  // show up as a "-, -, -" line on the PDF.
  const items = (raw.items || []).filter((it) =>
    parseFloat(it.quantity) > 0 || parseFloat(it.unitPrice) > 0
  );
  const sym   = symOf(currency);

  const subTotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0), 0);
  const discount = parseFloat(raw.discount) || 0;
  const amountReceived = parseFloat(raw.amountReceived) || 0;
  const grandTotal = Math.max(subTotal - discount, 0);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const family = await registerFonts(doc);

  // ── Drawing helpers, all taking reference-pixel coordinates ─────────────
  // Stroke width, in mm, applied to the current font to fake a weight jsPDF
  // has no real face for. Zero for body copy.
  let weightStroke = 0;
  const light = (sizePx) => {
    doc.setFont(family, 'normal');
    doc.setFontSize(pt(sizePx));
    weightStroke = 0;
  };
  const semibold = (sizePx) => {
    doc.setFont(family, 'bold');
    doc.setFontSize(pt(sizePx));
    // Helvetica's "bold" really is bold, so it needs no help.
    weightStroke = family === 'Aeonik' ? mm(sizePx) * SEMIBOLD_STROKE : 0;
  };
  // Text is stroked in the draw colour, so ink() has to set both.
  const ink = (rgb) => { doc.setTextColor(...rgb); doc.setDrawColor(...rgb); };
  const text = (str, xPx, yPx, align) => {
    const opts = align ? { align } : {};
    if (weightStroke) {
      opts.renderingMode = 'fillThenStroke';
      doc.setLineWidth(weightStroke);
    }
    doc.text(String(str), mm(xPx), mm(yPx), opts);
  };
  const rule = (yPx, widthPx = REF.ruleThin, x0 = REF.marginX, x1 = REF.rightX) => {
    doc.setDrawColor(...C.ink);
    doc.setLineWidth(mm(widthPx));
    doc.line(mm(x0), mm(yPx), mm(x1), mm(yPx));
  };

  // Full-bleed page wash (#F7F7F7). Wrapping addPage means every page this
  // document ends up with gets the same wash before anything else is drawn.
  const fillPageBg = () => {
    doc.setFillColor(...C.band);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  };
  const nativeAddPage = doc.addPage.bind(doc);
  doc.addPage = (...args) => {
    const result = nativeAddPage(...args);
    fillPageBg();
    return result;
  };
  fillPageBg();

  let logoData = null;
  try {
    logoData = await loadImageDataUrl('/Images/CZNLogoDark.png');
  } catch (e) {
    console.log('Logo skipped:', e);
  }

  // ── Faint watermark ──────────────────────────────────────────────────────
  if (logoData) {
    const { x, y, w, h, opacity } = REF.watermark;
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity }));
    doc.addImage(logoData, getImageFormat(logoData), mm(x), mm(y), mm(w), mm(h));
    doc.restoreGraphicsState();
  }

  // ── Header: logo (left) + INVOICE title (right, centred on the logo) ────
  if (logoData) {
    const { x, y, size } = REF.logo;
    doc.addImage(logoData, getImageFormat(logoData), mm(x), mm(y), mm(size), mm(size));
  }
  semibold(SIZE.title);
  ink(C.accent);
  text('INVOICE', REF.titleRightX, REF.titleBaseline, 'right');

  // ── Company (left) + Contact (right of centre, left-aligned on col 2) ───
  ink(C.ink);
  semibold(SIZE.label);
  text('Cellzen Trading Limited', REF.marginX, REF.companyBaseline);
  text('Contact', REF.col2, REF.companyBaseline);

  light(SIZE.meta);
  const companyLines = ['Shop 185 G/F, Hang Wai Ind. Centre,', 'No. 6 Kin Tai St., Tuen Mun, N.T.', 'Hong Kong.'];
  const contactLines = ['cellzengroup.com', 'sales@cellzengroup.com', '9779849956242, 8613073017734'];
  companyLines.forEach((line, i) => text(line, REF.marginX, REF.addressBaseline + i * REF.addressLead));
  contactLines.forEach((line, i) => text(line, REF.col2, REF.addressBaseline + i * REF.addressLead));

  rule(REF.divider1, REF.ruleThick);

  // ── Invoice to / Number / Mode / Dates ───────────────────────────────────
  light(SIZE.meta);
  const addressLines = doc.splitTextToSize(raw.customerAddress || FALLBACK_ADDRESS, mm(620));
  const custEmail = raw.customerEmail || fallbackEmail(raw.customerName);
  const custPhone = raw.customerPhone || FALLBACK_PHONE;
  const custLines = [
    raw.customerName || '-',
    ...addressLines,
    ...(custEmail ? [custEmail] : []),
    custPhone,
  ];

  semibold(SIZE.label);
  text('Invoice to', REF.marginX, REF.metaLabel1);
  text('Invoice Number', REF.col2, REF.metaLabel1);
  text('Issued Date', REF.col3, REF.metaLabel1);
  text('Mode of Shipment', REF.col2, REF.metaLabel2Col2);
  text('Due Date', REF.col3, REF.metaLabel2Col3);

  const issuedDate = invoice.date || raw.invoiceDate;
  const dueDate = raw.dueDate || addDaysISO(issuedDate, 7);

  light(SIZE.meta);
  custLines.forEach((line, i) => text(line, REF.marginX, REF.metaValue1 + i * REF.custLead));
  text(String(invoice.id || raw.invoiceNumber || '-'), REF.col2, REF.metaValue1);
  text(MODE_LABEL[raw.modeOfDelivery] || '-', REF.col2, REF.metaValue2Col2);
  text(formatDateOrdinal(issuedDate) || '-', REF.col3, REF.metaValue1);
  text(formatDateOrdinal(dueDate) || '-', REF.col3, REF.metaValue2Col3);

  // ── Items table ──────────────────────────────────────────────────────────
  // Drawn by hand rather than via jspdf-autotable: the design pins the row
  // pitch and every column's right edge to the pixel, which is fiddly to
  // coax out of a layout engine and trivial to place directly.
  // `bandY` lets a continuation page repeat the header nearer the top.
  const drawTableHead = (bandY) => {
    const { x, w, h } = REF.band;
    const baseline = REF.headBaseline + (bandY - REF.band.y);
    doc.setFillColor(...C.accent);
    doc.rect(mm(x), mm(bandY), mm(w), mm(h), 'F');
    semibold(SIZE.label);
    ink(C.white);
    text('S.N.', REF.snCentre, baseline, 'center');
    text('Description', REF.descLeft, baseline);
    text('Qty.', REF.colRight.qty, baseline, 'right');
    text('Unit', REF.colRight.unit, baseline, 'right');
    text(`Rate (${sym})`, REF.colRight.rate, baseline, 'right');
    text(`Total (${sym})`, REF.colRight.total, baseline, 'right');
    ink(C.ink);
    // Gap between the band and the first row, preserved from the design.
    return bandY + h + (REF.bodyTop - REF.band.y - h);
  };

  drawTableHead(REF.band.y);

  let rowTop = REF.bodyTop;
  const descWidth = mm(REF.descRight - REF.descLeft);
  items.forEach((it, i) => {
    light(SIZE.body);
    const descLines = doc.splitTextToSize(it.productName || '-', descWidth);
    const rowH = Math.max(REF.rowH, descLines.length * REF.rowH);

    // Overflow onto a fresh page, repeating the header band near the top.
    if (rowTop + rowH > REF.pageBottom - 120) {
      doc.addPage();
      rowTop = drawTableHead(REF.marginX);
    }

    const qty = parseFloat(it.quantity) || 0;
    const rate = parseFloat(it.unitPrice) || 0;
    const total = qty * rate;
    const baseline = rowTop + REF.rowBaseline;

    text(String(i + 1), REF.snCentre, baseline, 'center');
    descLines.forEach((line, n) => text(line, REF.descLeft, baseline + n * REF.rowH));
    text(qty ? String(qty) : '-', REF.colRight.qty, baseline, 'right');
    text(it.unit || it.priceUnit || '-', REF.colRight.unit, baseline, 'right');
    text(rate ? `${sym}${rate.toFixed(2)}` : '-', REF.colRight.rate, baseline, 'right');
    text(total ? `${sym}${total.toFixed(2)}` : '-', REF.colRight.total, baseline, 'right');

    rowTop += rowH;
    rule(rowTop);
  });

  // The design lays out 13 checklist rows; a shorter invoice pulls everything
  // below the table up by the difference rather than leaving a gap.
  const designTableBottom = REF.bodyTop + 13 * REF.rowH;
  let shift = rowTop - designTableBottom;

  // ── Totals ───────────────────────────────────────────────────────────────
  semibold(SIZE.label);
  text('Payment Method', REF.marginX, REF.totalsBaseline + shift);
  light(SIZE.body);
  text(raw.paymentMethod || '-', REF.marginX, REF.payMethodValue + shift);

  semibold(SIZE.label);
  text('In Words', REF.marginX, REF.inWordsLabel + shift);
  light(SIZE.body);
  const wordsLines = doc.splitTextToSize(numberToWords(grandTotal), mm(REF.inWordsWrap));
  wordsLines.forEach((line, i) =>
    text(line, REF.marginX, REF.inWordsValue + shift + i * REF.bankLead));

  const totalsRows = [
    ['Sub Total', subTotal],
    ['Total Amount Recieved', amountReceived],
    ['Discount', discount],
    ['Grand Total', grandTotal],
  ].map(([label, val]) => [label, `${sym}${val.toFixed(2)}/-`]);

  // The design ends the labels at 1359 and the amounts at 1547, a gap that
  // fits its unprefixed "10000000/-" but not a currency-prefixed amount. Pull
  // the labels left when they'd otherwise collide, rather than overprinting.
  const widestAmount = Math.max(...totalsRows.map(([, v]) => px(doc.getTextWidth(v))));
  const totalsLabelRight = Math.min(
    REF.totalsLabelRight,
    REF.colRight.total - widestAmount - REF.totalsGap,
  );

  totalsRows.forEach(([label, val], i) => {
    const baseline = REF.totalsBaseline + shift + i * REF.totalsLead;
    text(label, totalsLabelRight, baseline, 'right');
    text(val, REF.colRight.total, baseline, 'right');
  });

  // ── Payment Info + QR / Nepal signer block ───────────────────────────────
  light(SIZE.body);
  const bankLines = [
    `Account Number: ${BANK.accountNumber}`,
    `Holder Name: ${BANK.holderName}`,
    `Bank Name: ${BANK.bankName}`,
    `Bank Address: ${BANK.bankAddress[0]}`,
    ...BANK.bankAddress.slice(1),
    `Account Type: ${BANK.accountType}`,
    `Swift/BIC: ${BANK.swift}`,
    `Bank Code: ${BANK.bankCode}`,
    `Branch Number: ${BANK.branchNumber}`,
  ].flatMap((line) => doc.splitTextToSize(line, mm(REF.bankWrap)));

  // Depth of the payment block below its divider — whichever of the bank
  // lines, the signer lines or the QR reaches lowest.
  const payDepth = Math.max(
    REF.bankBaseline + (bankLines.length - 1) * REF.bankLead,
    REF.nepalBaseline + 2 * REF.nepalLead,
    REF.qr.y + REF.qr.size,
  ) - REF.divider2;
  // Design gap between the bottom of the payment block and the footer rule.
  const FOOT_GAP = REF.divider3 - (REF.bankBaseline + 8 * REF.bankLead);
  const footDepth = REF.signValueBaseline - REF.divider3;

  // Keep the divider, heading, bank block, QR and signature row together —
  // this footer must never be split across pages or silently clipped.
  if (REF.divider2 + shift + payDepth + FOOT_GAP + footDepth > REF.pageBottom) {
    doc.addPage();
    shift = REF.marginX - REF.divider2;
  }

  rule(REF.divider2 + shift);

  semibold(SIZE.label);
  text('Payment Info', REF.marginX, REF.payInfoBaseline + shift);
  light(SIZE.body);
  bankLines.forEach((line, i) => text(line, REF.marginX, REF.bankBaseline + shift + i * REF.bankLead));

  // The same fixed QR on every invoice (taken from the approved design), not
  // one generated per invoice. The Nepal account text is drawn regardless of
  // whether the image itself loads.
  try {
    const qrData = await loadWebpAsPngDataUrl('/billing-qr.webp');
    if (qrData) {
      const { x, y, size } = REF.qr;
      doc.addImage(qrData, 'PNG', mm(x), mm(y + shift), mm(size), mm(size));
    }
  } catch (e) {
    console.log('QR code skipped:', e);
  }

  semibold(SIZE.nepalLabel);
  text(NEPAL_ACCOUNT.label, REF.nepalRightX, REF.nepalLabelBaseline + shift, 'right');
  light(SIZE.nepal);
  [NEPAL_ACCOUNT.signer, NEPAL_ACCOUNT.accountName, NEPAL_ACCOUNT.accountNumber]
    .forEach((line, i) => text(line, REF.nepalRightX, REF.nepalBaseline + shift + i * REF.nepalLead, 'right'));

  // ── Accepted by / Signed by / Note ───────────────────────────────────────
  // Pinned to the foot of the page, as in the design, unless the payment
  // block has grown past it (a longer bank address wrapping to more lines).
  const footShift = Math.max(0, REF.divider2 + shift + payDepth + FOOT_GAP - REF.divider3);

  rule(REF.divider3 + footShift);
  [
    [REF.marginX, 'left', 'Accepted by:', 'Cellzen Trading Limited'],
    [REF.signCol2, 'left', 'Signed by', raw.createdByName || '-'],
    [REF.rightX, 'right', 'Note:', 'E-generated'],
  ].forEach(([x, align, label, value]) => {
    semibold(SIZE.label);
    text(label, x, REF.signLabelBaseline + footShift, align);
    light(SIZE.body);
    text(value, x, REF.signValueBaseline + footShift, align);
  });

  // ── Output ──────────────────────────────────────────────────────────────
  const filename = buildInvoiceFilename(invoice, 'pdf');

  if (options.output === 'base64') {
    const dataUri = doc.output('datauristring');
    const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
    return { base64, filename };
  }

  doc.save(filename);
};

export default generateBillingInvoicePDF;
