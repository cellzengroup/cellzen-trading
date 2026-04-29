import ExcelJS from 'exceljs';

// ─── Brand colours ────────────────────────────────────────────────────────────
const C = {
  purple: 'FF412460',
  light:  'FFF4F2EF',
  dark:   'FF2D2D2D',
  black:  'FF000000',
  grey:   'FF888888',
  white:  'FFFFFFFF',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fill = (cell, argb) =>
  (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } });

const fnt = (cell, opts = {}) =>
  (cell.font = {
    name:   'Arial',
    size:   opts.size  || 10,
    bold:   opts.bold  || false,
    italic: false,
    color:  { argb: opts.color || C.dark },
  });

const aln = (cell, h = 'center', v = 'middle', wrap = false) =>
  (cell.alignment = { horizontal: h, vertical: v, wrapText: wrap });

// ─── Number → words ───────────────────────────────────────────────────────────
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

const symOf = (code) => ({ NPR: 'Rs.', USD: 'USD', CNY: 'RMB' }[code] || code);

// ─── Main export ──────────────────────────────────────────────────────────────
export const generateInvoiceExcel = async (invoice, currency = 'USD') => {
  const raw   = invoice.rawData || {};
  const items = raw.items       || [];
  const sym   = symOf(currency);

  // ── Totals ──────────────────────────────────────────────────────────────────
  const itemsTotal    = items.reduce((s, it) => {
    const base = (it.quantity || 0) * (it.unitPrice || 0);
    return s + base + base * ((it.commission || 0) / 100);
  }, 0);
  const customsDuty   = parseFloat(raw.customsDuty           || 0);
  const docCharges    = parseFloat(raw.documentationCharges  || 0);
  const transportCost = parseFloat(raw.transportCost         || 0);
  const grandTotal    = itemsTotal + customsDuty + docCharges + transportCost;

  // ── Workbook ─────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cellzen Trading';

  const ws = wb.addWorksheet('Invoice', {
    views:     [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  // ── Column widths (A–I) ──────────────────────────────────────────────────────
  // Added a bit more width to Total Amount, Package Wgt, Size (CBM) for spacing
  ws.columns = [
    { width: 6  },   // A  S.No
    { width: 14 },   // B  Product Image
    { width: 28 },   // C  Product Name
    { width: 7  },   // D  Qty
    { width: 7  },   // E  Unit
    { width: 20 },   // F  Unit Price
    { width: 20 },   // G  Total Amount   ← wider for spacing
    { width: 16 },   // H  Package Wgt    ← wider for spacing
    { width: 16 },   // I  Size (CBM)     ← wider for spacing
  ];

  const row = (n)            => ws.getRow(n);
  const cel = (r, c)         => ws.getCell(r, c);
  const mg  = (r1,c1,r2,c2) => ws.mergeCells(r1, c1, r2, c2);

  // ===========================================================================
  // ROW 1  –  Logo (top-left) + Invoice Number / Date (top-right)
  // ===========================================================================
  row(1).height = 62;

  try {
    const resp = await fetch('/Images/CZNLogo.png');
    if (resp.ok) {
      const buf   = await resp.arrayBuffer();
      const imgId = wb.addImage({ buffer: buf, extension: 'png' });
      ws.addImage(imgId, { tl: { col: 0.15, row: 0.12 }, ext: { width: 60, height: 60 } });
    }
  } catch (_) { /* skip */ }

  mg(1, 7, 1, 9);
  const invHdr = cel(1, 7);
  invHdr.value = `Invoice Number: ${invoice.id || ''}\nInvoice Date: ${invoice.date || raw.invoiceDate || ''}`;
  fnt(invHdr, { size: 9, color: C.dark });
  aln(invHdr, 'right', 'middle', true);

  // ===========================================================================
  // ROW 2  –  Spacer
  // ===========================================================================
  row(2).height = 8;

  // ===========================================================================
  // ROW 3  –  "Performa Invoice" title
  // ===========================================================================
  row(3).height = 38;
  mg(3, 1, 3, 9);
  const title = cel(3, 1);
  title.value = 'Performa Invoice';
  fnt(title, { size: 22, bold: true, color: C.purple });
  aln(title, 'center', 'middle');

  // ===========================================================================
  // ROW 4  –  "Buyer" label right-aligned only
  // ===========================================================================
  row(4).height = 18;
  mg(4, 7, 4, 9);
  const buyerLbl = cel(4, 7);
  buyerLbl.value = 'Buyer';
  fnt(buyerLbl, { bold: true, size: 10, color: C.dark });
  aln(buyerLbl, 'right', 'middle');

  // ===========================================================================
  // ROW 5  –  Mode of Shipment (left) + Customer Name (right)
  // ===========================================================================
  row(5).height = 18;
  mg(5, 1, 5, 6);
  const modeCell = cel(5, 1);
  const modeStr  = raw.modeOfDelivery
    ? 'By ' + raw.modeOfDelivery.charAt(0).toUpperCase() + raw.modeOfDelivery.slice(1)
    : '';
  modeCell.value = `Mode of Shipment: ${modeStr}`;
  fnt(modeCell, { size: 9, color: C.grey });
  aln(modeCell, 'left', 'middle');

  mg(5, 7, 5, 9);
  const buyerVal = cel(5, 7);
  buyerVal.value = invoice.customer || raw.customerName || '';
  fnt(buyerVal, { bold: true, size: 10, color: C.dark });
  aln(buyerVal, 'right', 'middle');

  // ===========================================================================
  // ROW 6  –  Export Country (left)
  // ===========================================================================
  row(6).height = 18;
  mg(6, 1, 6, 6);
  const expCell = cel(6, 1);
  expCell.value = `Export Country: ${raw.exportCountry || ''}`;
  fnt(expCell, { size: 9, color: C.grey });
  aln(expCell, 'left', 'middle');

  // ===========================================================================
  // ROW 7  –  Spacer before table
  // ===========================================================================
  row(7).height = 6;

  // ===========================================================================
  // ROW 8  –  Table header (purple bg, white Arial Bold, single-line labels)
  // ===========================================================================
  row(8).height = 26;

  const HEADERS = [
    { col: 1, label: 'S.No'                    },
    { col: 2, label: 'Product Image'            },
    { col: 3, label: 'Product Name'             },
    { col: 4, label: 'Qty'                      },
    { col: 5, label: 'Unit'                     },
    { col: 6, label: `Unit Price (${sym}) / KG` },
    { col: 7, label: 'Total Amount'             },
    { col: 8, label: 'Package Wgt'              },   // renamed
    { col: 9, label: 'Size (CBM)'               },   // renamed
  ];

  HEADERS.forEach(({ col, label }) => {
    const c = cel(8, col);
    c.value = label;
    fnt(c, { bold: true, size: 10, color: C.white });
    fill(c, C.purple);
    aln(c, 'center', 'middle', false);
  });

  // ===========================================================================
  // ROWS 9+  –  Item rows (all cells centered h+v)
  // ===========================================================================
  let curRow = 9;
  const IMG_H  = 70;   // taller row for larger image
  const TEXT_H = 22;

  // Col B (0-based index 1): width 14 chars × ~7px = ~98px
  // Image 70px wide → h-offset = (98-70)/2/98 ≈ 0.143 → 0.14
  // Image 68px tall, row 70pt ≈ 93px → v-offset = (93-68)/2/93 ≈ 0.134 → 0.13
  const IMG_W = 70;
  const IMG_H_PX = 68;
  const COL_B_PX = 14 * 7;
  const ROW_H_PX = IMG_H * 1.33;
  const COL_OFFSET = (COL_B_PX - IMG_W)    / 2 / COL_B_PX;
  const ROW_OFFSET = (ROW_H_PX - IMG_H_PX) / 2 / ROW_H_PX;

  for (let i = 0; i < items.length; i++) {
    const it     = items[i];
    const hasImg = !!it.productImage;
    row(curRow).height = hasImg ? IMG_H : TEXT_H;
    const bg = i % 2 === 1 ? C.light : C.white;

    const sc = (col, value, opts = {}) => {
      const c = cel(curRow, col);
      c.value = value;
      fnt(c, { color: opts.color || C.dark, bold: opts.bold || false });
      aln(c, 'center', 'middle', false);
      fill(c, bg);
    };

    const base  = (it.quantity || 0) * (it.unitPrice || 0);
    const total = base + base * ((it.commission || 0) / 100);

    sc(1, i + 1,                                                        { bold: true, color: C.purple });
    // col 2: image — handled below
    sc(3, it.productName || '');
    sc(4, it.quantity    || 0);
    sc(5, it.unit        || 'KG');
    sc(6, `${sym} ${parseFloat(it.unitPrice || 0).toFixed(2)} / ${it.unit || 'KG'}`);
    sc(7, `${sym} ${total.toFixed(2)}`,                                 { bold: true, color: C.purple });
    sc(8, it.weight ? `${it.weight} kg` : '');
    sc(9, it.cbm    ? `${it.cbm} CBM`  : '');

    // Col B: image cell — centred, image placed in centre of cell
    const imgCell = cel(curRow, 2);
    fill(imgCell, bg);
    aln(imgCell, 'center', 'middle');

    if (hasImg) {
      try {
        const [meta, b64] = it.productImage.split(',');
        const ext = meta.includes('png') ? 'png' : 'jpeg';
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
        const pid = wb.addImage({ buffer: arr.buffer, extension: ext });
        ws.addImage(pid, {
          tl:  { col: 1 + COL_OFFSET, row: (curRow - 1) + ROW_OFFSET },
          ext: { width: IMG_W, height: IMG_H_PX },
        });
      } catch (_) {
        imgCell.value = '[img]';
        fnt(imgCell, { color: C.dark });
      }
    }

    curRow++;
  }

  // ── Empty filler rows – NO S.No numbers, just blank cells ─────────────────
  for (let i = items.length; i < 5; i++) {
    row(curRow).height = TEXT_H;
    for (let col = 1; col <= 9; col++) {
      const c = cel(curRow, col);
      c.value = '';          // no S.No numbers in filler rows
      fill(c, C.white);
      fnt(c, { color: C.dark });
      aln(c, 'center', 'middle');
    }
    curRow++;
  }

  // ===========================================================================
  // Totals section: Total Amount → Documentation → Transportation → Grand Total
  // Label: cols A–F (right-aligned)
  // Value: col G ONLY — so it aligns under "Total Amount" header, not Package Wgt
  // Cols H & I: filled with light bg, no text
  // ===========================================================================
  const addSummaryRow = (label, amount, bold = false) => {
    row(curRow).height = bold ? 26 : 20;

    mg(curRow, 1, curRow, 6);
    const lbl = cel(curRow, 1);
    lbl.value = label;
    fnt(lbl, { bold, size: bold ? 11 : 10, color: bold ? C.purple : C.dark });
    aln(lbl, 'right', 'middle');
    fill(lbl, C.light);

    // Value strictly in col G (Total Amount column)
    const val = cel(curRow, 7);
    val.value = `${sym} ${parseFloat(amount).toFixed(2)}`;
    fnt(val, { bold, size: bold ? 11 : 10, color: bold ? C.purple : C.dark });
    aln(val, 'center', 'middle');
    fill(val, C.light);

    // Cols H & I — empty, same background
    fill(cel(curRow, 8), C.light);
    fill(cel(curRow, 9), C.light);

    curRow++;
  };

  addSummaryRow('Total Amount',          itemsTotal);
  if (docCharges    > 0) addSummaryRow('Documentation Charges', docCharges);
  if (transportCost > 0) addSummaryRow('Transportation Cost',   transportCost);
  if (customsDuty   > 0) addSummaryRow('Customs Duty',          customsDuty);
  addSummaryRow('Grand Total',           grandTotal, true);   // bold + purple, last

  // ── 1 spacer row between Grand Total and In Words ─────────────────────────
  row(curRow).height = 6;
  curRow++;

  // ===========================================================================
  // In Words  –  full width (A–I) merged, centered, Arial Regular
  // Format: "In Words:   Rs. Two Thousand..."  (one cell, all in one line)
  // ===========================================================================
  row(curRow).height = 26;
  mg(curRow, 1, curRow, 9);
  const inWordsCell = cel(curRow, 1);
  inWordsCell.value = `In Words:   ${sym} ${numberToWords(grandTotal)}`;
  fnt(inWordsCell, { bold: false, size: 10, color: C.dark });
  aln(inWordsCell, 'center', 'middle', true);
  fill(inWordsCell, C.light);
  curRow++;

  // ===========================================================================
  // Note row  –  only if admin entered a note
  // ===========================================================================
  if (raw.notes && raw.notes.trim()) {
    row(curRow).height = 22;
    mg(curRow, 1, curRow, 9);
    const noteCell = cel(curRow, 1);
    noteCell.value = `Note: ${raw.notes}`;
    fnt(noteCell, { bold: true, size: 10, color: C.purple });
    aln(noteCell, 'center', 'middle', true);
    fill(noteCell, C.light);
    curRow++;
  }

  // ===========================================================================
  // Spacer
  // ===========================================================================
  row(curRow).height = 10;
  curRow++;

  // ===========================================================================
  // Terms and Conditions header  (light bg, black bold)
  // ===========================================================================
  row(curRow).height = 22;
  mg(curRow, 1, curRow, 9);
  const tcHdr = cel(curRow, 1);
  tcHdr.value = 'Terms and Conditions:';
  fnt(tcHdr, { bold: true, size: 11, color: C.black });
  aln(tcHdr, 'left', 'middle');
  fill(tcHdr, C.light);
  curRow++;

  // ── 6 Terms (black text) ──────────────────────────────────────────────────
  const TERMS = [
    'This quotation is valid for a period of 10 days from the date of issuance. Failure to confirm within this period will render the quotation null and void.',
    'The quoted price is based on the details provided at the time of inquiry. Any changes in product specifications, quantity, weight, dimensions, or quality may result in a revised quotation.',
    'The final price shall remain fixed only if all shipment details exactly match those submitted for this quotation.',
    'Customs-related charges are not fixed and may change based on assessment by the relevant authorities; the exact amount will be determined after customs clearance.',
    'The total quoted cost is inclusive of door-to-door delivery, covering transportation from origin to the final delivery destination.',
    'An additional 10% of the total goods charges shall be applied for warehouse storage, quality inspection, and goods handling services.',
  ];

  TERMS.forEach((text, idx) => {
    row(curRow).height = 20;

    const numCell = cel(curRow, 1);
    numCell.value = idx + 1;
    fnt(numCell, { size: 9, color: C.black });
    aln(numCell, 'center', 'middle');
    fill(numCell, C.white);

    mg(curRow, 2, curRow, 9);
    const termCell = cel(curRow, 2);
    termCell.value = text;
    fnt(termCell, { size: 9, color: C.black });
    aln(termCell, 'left', 'middle', true);
    fill(termCell, C.white);

    curRow++;
  });

  // ===========================================================================
  // Spacer
  // ===========================================================================
  row(curRow).height = 10;
  curRow++;

  // ===========================================================================
  // Footer  –  purple bar, Arial Bold
  // ===========================================================================
  row(curRow).height = 28;
  mg(curRow, 1, curRow, 9);
  const footer = cel(curRow, 1);
  footer.value = '"Connecting Global Markets"';
  fnt(footer, { bold: true, size: 13, color: C.white });
  aln(footer, 'center', 'middle');
  fill(footer, C.purple);

  // ===========================================================================
  // Write & download
  // ===========================================================================
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${invoice.id || 'Invoice'}_Cellzen.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default generateInvoiceExcel;
