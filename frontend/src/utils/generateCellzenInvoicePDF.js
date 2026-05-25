import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { buildInvoiceFilename } from './invoiceFilename';
import { convertInvoiceCurrency } from './convertInvoiceCurrency';

// ─── Brand colours ────────────────────────────────────────────────────────────
const C = {
  purple: [65, 36, 96],
  light:  [244, 242, 239],
  dark:   [45, 45, 45],
  black:  [0, 0, 0],
  grey:   [136, 136, 136],
  white:  [255, 255, 255],
};

const symOf = (code) => ({ NPR: 'Rs.', USD: 'USD', CNY: 'RMB' }[code] || code);

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

const getImageFormat = (dataUrl = '') => {
  if (dataUrl.includes('image/png')) return 'PNG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'JPEG';
};

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

// ─── Main export ──────────────────────────────────────────────────────────────
// `currency` is the target download currency (USD/CNY/NPR). When `rates` is
// supplied, every monetary value on the invoice is converted from its
// original currency into `currency` before rendering — so an invoice entered
// in CNY can be downloaded in NPR with all numbers correctly scaled.
export const generateInvoicePDF = async (invoiceInput, currency = 'USD', rates = null) => {
  const invoice = rates ? convertInvoiceCurrency(invoiceInput, currency, rates) : invoiceInput;
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
  const otherCharges   = parseFloat(raw.otherCharges          || 0);
  const transportCost = parseFloat(raw.transportCost         || 0);
  const grandTotal    = itemsTotal + customsDuty + docCharges + otherCharges + transportCost;

  // ── Create PDF ──────────────────────────────────────────────────────────────
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;
  let logoData = null;

  // ── Load logo once for header and watermark ─────────────────────────────────
  try {
    logoData = await loadImageDataUrl('/Images/CZNLogo.png');
  } catch (e) {
    console.log('Logo skipped:', e);
  }

  // ── Header Logo (top-left) ─────────────────────────────────────────────────
  if (logoData) {
    doc.addImage(logoData, getImageFormat(logoData), margin, y, 20, 20);
  }

  // ── Invoice Number & Date (top-right) ──────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  const hdrText = `Invoice Number: ${invoice.id || ''}\nInvoice Date: ${invoice.date || raw.invoiceDate || ''}`;
  doc.text(hdrText, pageWidth - margin, y + 5, { align: 'right' });
  y += 25;

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...C.purple);
  doc.text('Performa Invoice', pageWidth / 2, y, { align: 'center' });
  y += 10;

  // ── Buyer label ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.dark);
  doc.text('Buyer', pageWidth - margin, y, { align: 'right' });
  y += 5;

  // ── Mode of Shipment & Customer Name ───────────────────────────────────────
  const modeStr = raw.modeOfDelivery
    ? 'By ' + raw.modeOfDelivery.charAt(0).toUpperCase() + raw.modeOfDelivery.slice(1)
    : '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.grey);
  doc.text(`Mode of Shipment: ${modeStr}`, margin, y);

  // Buyer: customer name on this line, phone or email on the next line.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.dark);
  doc.text(invoice.customer || raw.customerName || '', pageWidth - margin, y, { align: 'right' });
  y += 6;

  // ── Export Country (left) + Buyer contact (right) ──────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.grey);
  doc.text(`Export Country: ${raw.exportCountry || ''}`, margin, y);

  const buyerContact = (raw.customerPhone || raw.customerEmail || '').toString().trim();
  if (buyerContact) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.grey);
    doc.text(buyerContact, pageWidth - margin, y, { align: 'right' });
  }
  y += 10;

  // ── Table columns — hide Weight / CBM columns when no item uses them ────────
  const hasWeight = items.some(it => it.weight && parseFloat(it.weight) > 0);
  const hasCbm    = items.some(it => it.cbm    && parseFloat(it.cbm)    > 0);

  // Landscape A4 = 297 mm wide; usable width ≈ 277 mm (10 mm margins each side).
  // Base total (7 cols): 12+32+75+15+18+38+34 = 224 mm
  // With both optional cols: 224+26+26 = 276 mm — fills the page nicely.
  const headers      = ['S.No', 'Product Image', 'Product Name', 'Qty', 'Unit', `Unit Price (${sym})`, 'Total Amount'];
  const columnWidths = [12,      32,               75,             15,    18,     38,                    34];
  // Columns 7-8: optional; freed space goes to Product Name (index 2)
  if (hasWeight) { headers.push('Package Wgt'); columnWidths.push(26); }
  else           { columnWidths[2] += 13; }
  if (hasCbm)    { headers.push('Size (CBM)');  columnWidths.push(26); }
  else           { columnWidths[2] += 13; }

  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
  const startX = (pageWidth - totalWidth) / 2;

  // Header row
  doc.setFillColor(...C.purple);
  doc.rect(startX, y, totalWidth, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.white);

  let x = startX;
  headers.forEach((header, i) => {
    doc.text(header, x + columnWidths[i] / 2, y + 6, { align: 'center' });
    x += columnWidths[i];
  });
  y += 10;

  // ── Item rows ───────────────────────────────────────────────────────────────
  const LINE_H = 8 * 0.353 * 1.45; // ~4.1 mm per line (8pt font with leading)
  const ROW_PAD = 5; // vertical padding (top + bottom combined) in mm

  items.forEach((it, idx) => {
    const base  = (it.quantity || 0) * (it.unitPrice || 0);
    const total = base + base * ((it.commission || 0) / 100);

    // Pre-calculate product name line-wrap so row height accommodates the text.
    doc.setFontSize(8);
    const nameLines = doc.splitTextToSize(it.productName || '', columnWidths[2] - 3);
    const nameBlockH = nameLines.length * LINE_H;

    // Row height = tallest of: image slot, text block + padding, minimum
    const imgSlot = it.productImage ? 26 : 0;
    const textSlot = nameBlockH + ROW_PAD;
    const rowHeight = Math.max(it.productImage ? imgSlot : 14, textSlot);

    // Check if new page needed
    if (y > pageHeight - 40) {
      doc.addPage();
      y = margin;
    }

    // Plain white row background (no alternating tint).
    doc.setFillColor(...C.white);
    doc.rect(startX, y, totalWidth, rowHeight, 'F');

    doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);

    // Vertical center baseline for single-line cells.
    // jsPDF text Y is the baseline; shift up by ~1mm to visually center cap-height glyphs.
    const midY = y + rowHeight / 2 + 1;

    x = startX;
    const rowData = [
      (idx + 1).toString(),
      '', // Product Image placeholder
      '', // Product Name drawn separately (multi-line)
      (it.quantity || 0).toString(),
      it.unit || 'KG',
      `${sym} ${parseFloat(it.unitPrice || 0).toFixed(2)}`,
      `${sym} ${total.toFixed(2)}`,
    ];
    if (hasWeight) rowData.push(it.weight ? `${it.weight} kg` : '');
    if (hasCbm)    rowData.push(it.cbm    ? `${it.cbm} CBM`  : '');

    rowData.forEach((cell, i) => {
      if (i === 6) {
        doc.setTextColor(...C.purple);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(...C.dark);
        doc.setFont('helvetica', 'normal');
      }
      // Column 2 is drawn below; skip the placeholder here.
      if (i !== 2) {
        doc.text(cell, x + columnWidths[i] / 2, midY, { align: 'center' });
      }
      x += columnWidths[i];
    });

    // Product Name — multi-line, vertically centered block.
    doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.dark);
    const nameX = startX + columnWidths[0] + columnWidths[1] + columnWidths[2] / 2;
    // Top of text block so the whole block is centered in the row.
    const nameStartY = y + (rowHeight - nameBlockH) / 2 + LINE_H * 0.75;
    nameLines.forEach((line, li) => {
      doc.text(line, nameX, nameStartY + li * LINE_H, { align: 'center' });
    });

    if (it.productImage) {
      try {
        const imageFormat = getImageFormat(it.productImage);
        const imageSize = Math.min(rowHeight - 4, 22);
        const imageX = startX + columnWidths[0] + (columnWidths[1] - imageSize) / 2;
        const imageY = y + (rowHeight - imageSize) / 2;
        doc.addImage(it.productImage, imageFormat, imageX, imageY, imageSize, imageSize);
      } catch (_) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...C.grey);
        doc.text('[img]', startX + columnWidths[0] + columnWidths[1] / 2, midY, { align: 'center' });
      }
    }

    // Per-column row separator — skip the segment for any column that is
    // merged into the next row (i.e. nextItem.mergedInto[colKey] === true).
    const nextMerged = (items[idx + 1]?.mergedInto) || {};
    // Map each column index to its mergedInto key (empty string = never merged)
    const colMergeKeys = ['', 'image', 'productName', 'quantity', 'unit', 'unitPrice', 'total'];
    if (hasWeight) colMergeKeys.push('weight');
    if (hasCbm)    colMergeKeys.push('cbm');

    doc.setDrawColor(155, 155, 155);
    doc.setLineWidth(0.3);
    let segX = startX;
    colMergeKeys.forEach((key, i) => {
      if (!key || !nextMerged[key]) {
        doc.line(segX, y + rowHeight, segX + columnWidths[i], y + rowHeight);
      }
      segX += columnWidths[i];
    });

    y += rowHeight;
  });

  // ── Empty rows (if less than 5 items) ───────────────────────────────────────
  for (let i = items.length; i < 5; i++) {
    doc.setFillColor(...C.white);
    doc.rect(startX, y, totalWidth, 14, 'F');
    y += 14;
  }

  // ── Summary rows ────────────────────────────────────────────────────────────
  const addSummaryRow = (label, amount, isBold = false, isPurple = false) => {
    doc.setFillColor(...C.light);
    doc.rect(startX, y, totalWidth, 8, 'F');

    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 11 : 10);
    doc.setTextColor(...(isPurple ? C.purple : C.dark));

    // Label (left aligned)
    doc.text(label, startX + 2, y + 5);

    // Value (right aligned under Total Amount column)
    const valueX = startX + columnWidths.slice(0, 7).reduce((a, b) => a + b, 0) - columnWidths[6] / 2;
    doc.text(`${sym} ${parseFloat(amount).toFixed(2)}`, valueX, y + 5, { align: 'center' });

    y += 8;
  };

  addSummaryRow('Total Amount', itemsTotal);
  if (docCharges    > 0) addSummaryRow('Documentation Charges', docCharges);
  if (otherCharges  > 0) addSummaryRow('Other Charges', otherCharges);
  if (transportCost > 0) addSummaryRow('Freight Cost',          transportCost);
  if (customsDuty   > 0) addSummaryRow('Customs Duty',          customsDuty);
  addSummaryRow('Grand Total', grandTotal, true, true);

  y += 3;

  // ── In Words ────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.light);
  doc.rect(startX, y, totalWidth, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...C.dark);
  doc.text(`In Words: ${sym} ${numberToWords(grandTotal)}`, pageWidth / 2, y + 6, { align: 'center' });
  y += 12;

  // ── Note (if exists) ───────────────────────────────────────────────────────
  if (raw.notes && raw.notes.trim()) {
    doc.setFillColor(...C.light);
    doc.rect(startX, y, totalWidth, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.purple);
    doc.text(`Note: ${raw.notes}`, pageWidth / 2, y + 6, { align: 'center' });
    y += 12;
  }

  y += 5;

  // ── Terms and Conditions ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.black);
  doc.text('Terms and Conditions:', margin, y);
  y += 6;

  const TERMS = [
    '1. This quotation is valid for a period of 10 days from the date of issuance. Failure to confirm within this period will render the quotation null and void.',
    '2. The quoted price is based on the details provided at the time of inquiry. Any changes in product specifications, quantity, weight, dimensions, or quality may result in a revised quotation.',
    '3. The final price shall remain fixed only if all shipment details exactly match those submitted for this quotation.',
    '4. Customs-related charges are not fixed and may change based on assessment by the relevant authorities; the exact amount will be determined after customs clearance.',
    '5. The total quoted cost is inclusive of door-to-door delivery, covering transportation from origin to the final delivery destination.',
    '6. An additional 10% of the total goods charges shall be applied for warehouse storage, quality inspection, and goods handling services.',
    '7. Other Charges means can include Delivery cost from factory to warehouse and many more.',
    '8. Upon arrival at the destination, the consignee must inspect the goods within 1–3 days of receipt. Any claims for damaged, broken, or missing items must be reported within this period; thereafter, the company shall not be held liable for any such damage or loss.',
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.black);

  TERMS.forEach((term) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = margin;
    }
    const splitText = doc.splitTextToSize(term, pageWidth - 2 * margin);
    doc.text(splitText, margin, y);
    y += splitText.length * 4 + 2;
  });

  y += 5;

  // ── Footer ─────────────────────────────────────────────────────────────────
  if (y > pageHeight - 21) {
    doc.addPage();
    y = margin;
  }
  doc.setFillColor(...C.purple);
  doc.rect(margin, y, pageWidth - 2 * margin, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C.white);
  doc.text('"Connecting Global Markets"', pageWidth / 2, y + 6, { align: 'center' });
  doc.setFontSize(8);
  doc.text('Contact: +8613073017734, +977 9849956242   Email: cellzengroup@gmail.com.', pageWidth / 2, y + 12, { align: 'center' });

  // ── Watermark overlay on every page (3% opacity, visible over backgrounds) ──
  if (logoData) {
    const watermarkWidth = 120;
    const watermarkHeight = 120;
    const watermarkX = (pageWidth - watermarkWidth) / 2;
    const watermarkY = (pageHeight - watermarkHeight) / 2;
    const totalPages = doc.getNumberOfPages();

    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.03 }));
      doc.addImage(logoData, getImageFormat(logoData), watermarkX, watermarkY, watermarkWidth, watermarkHeight);
      doc.restoreGraphicsState();
    }
  }

  // ── Save & download ─────────────────────────────────────────────────────────
  doc.save(buildInvoiceFilename(invoice, 'pdf'));
};

export default generateInvoicePDF;
