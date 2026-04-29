import * as XLSX from 'xlsx';

// Convert number to words for total amount
const numberToWords = (number) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanOneThousand(n) {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertLessThanOneThousand(n % 100) : '');
  }

  if (number === 0) return 'Zero';

  const parts = [];
  let remaining = Math.floor(number);

  if (remaining >= 10000000) {
    parts.push(convertLessThanOneThousand(Math.floor(remaining / 10000000)) + ' Crore');
    remaining %= 10000000;
  }
  if (remaining >= 100000) {
    parts.push(convertLessThanOneThousand(Math.floor(remaining / 100000)) + ' Lakh');
    remaining %= 100000;
  }
  if (remaining >= 1000) {
    parts.push(convertLessThanOneThousand(Math.floor(remaining / 1000)) + ' Thousand');
    remaining %= 1000;
  }
  if (remaining > 0) {
    parts.push(convertLessThanOneThousand(remaining));
  }

  const decimalPart = Math.round((number % 1) * 100);
  let result = parts.join(' ');

  if (decimalPart > 0) {
    result += ' and ' + convertLessThanOneThousand(decimalPart) + ' Paisa';
  }

  return result + ' Only';
};

// Get currency symbol
const getCurrencySymbol = (currencyCode) => {
  const symbols = {
    NPR: 'Rs.',
    USD: '$',
    CNY: '¥'
  };
  return symbols[currencyCode] || currencyCode;
};

// Generate formatted Excel invoice
export const generateInvoiceExcel = (invoice, currency = 'NPR') => {
  const wb = XLSX.utils.book_new();

  // Create worksheet data
  const ws_data = [];

  // Header with logo placeholder
  ws_data.push(['', '', '', '', '', '', '', '', '']);
  ws_data.push(['CELLZEN TRADING', '', '', '', '', '', '', '', '']);
  ws_data.push(['Proforma Invoice', '', '', '', '', '', '', '', '']);
  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Invoice Info
  ws_data.push(['Invoice No:', invoice.id || '', '', '', 'Date:', invoice.date || '', '', '', '']);
  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Buyer Info
  ws_data.push(['Buyer:', invoice.customer || '', '', '', '', '', '', '', '']);
  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Shipment Info
  ws_data.push(['Mode of Shipment:', invoice.rawData?.modeOfDelivery || '', '', '', 'Export Country:', invoice.rawData?.exportCountry || '', '', '', '']);
  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Items Table Header
  ws_data.push(['S.No', 'Product Image', 'Product Name', 'QTY', 'Unit', 'Unit Price', 'Total Amount', 'Package Weight', 'Package Size']);

  // Items Data
  const items = invoice.rawData?.items || [];
  items.forEach((item, index) => {
    const baseTotal = item.quantity * item.unitPrice;
    const commissionPercent = item.commission || 0;
    const commissionAmount = baseTotal * (commissionPercent / 100);
    const totalWithCommission = baseTotal + commissionAmount;

    ws_data.push([
      index + 1,
      item.productImage ? '[Image]' : '',
      item.productName || '',
      item.quantity || 0,
      item.unit || 'KG',
      `${getCurrencySymbol(currency)} ${item.unitPrice || 0}`,
      `${getCurrencySymbol(currency)} ${totalWithCommission.toFixed(2)}`,
      item.weight || '',
      item.cbm || ''
    ]);
  });

  // Add empty rows if less than 5 items
  for (let i = items.length; i < 5; i++) {
    ws_data.push([i + 1, '', '', '', '', '', '', '', '']);
  }

  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Calculate totals
  const itemsTotal = items.reduce((sum, item) => {
    const baseTotal = item.quantity * item.unitPrice;
    const commissionPercent = item.commission || 0;
    const commissionAmount = baseTotal * (commissionPercent / 100);
    return sum + baseTotal + commissionAmount;
  }, 0);

  const customsDuty = parseFloat(invoice.rawData?.customsDuty || 0);
  const docCharges = parseFloat(invoice.rawData?.documentationCharges || 0);
  const transportCost = parseFloat(invoice.rawData?.transportCost || 0);
  const grandTotal = itemsTotal + customsDuty + docCharges + transportCost;

  // Totals Section
  ws_data.push(['', '', '', '', '', 'Items Total:', `${getCurrencySymbol(currency)} ${itemsTotal.toFixed(2)}`, '', '']);

  if (customsDuty > 0) {
    ws_data.push(['', '', '', '', '', 'Customs Duty:', `${getCurrencySymbol(currency)} ${customsDuty.toFixed(2)}`, '', '']);
  }
  if (docCharges > 0) {
    ws_data.push(['', '', '', '', '', 'Documentation Charges:', `${getCurrencySymbol(currency)} ${docCharges.toFixed(2)}`, '', '']);
  }
  if (transportCost > 0) {
    ws_data.push(['', '', '', '', '', 'Transportation Cost:', `${getCurrencySymbol(currency)} ${transportCost.toFixed(2)}`, '', '']);
  }

  ws_data.push(['', '', '', '', '', 'Grand Total:', `${getCurrencySymbol(currency)} ${grandTotal.toFixed(2)}`, '', '']);
  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Amount in Words
  ws_data.push(['Total Amount in Words:', numberToWords(grandTotal), '', '', '', '', '', '', '']);
  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Notes
  if (invoice.rawData?.notes) {
    ws_data.push(['Note:', invoice.rawData.notes, '', '', '', '', '', '', '']);
    ws_data.push(['', '', '', '', '', '', '', '', '']);
  }

  // Terms and Conditions
  ws_data.push(['Terms and Conditions:', '', '', '', '', '', '', '', '']);
  ws_data.push(['1. Payment Terms: 50% advance, 50% against delivery', '', '', '', '', '', '', '', '']);
  ws_data.push(['2. Delivery: As per agreement', '', '', '', '', '', '', '', '']);
  ws_data.push(['3. Validity: 30 days from invoice date', '', '', '', '', '', '', '', '']);
  ws_data.push(['', '', '', '', '', '', '', '', '']);

  // Footer
  ws_data.push(['', '', '', '', '', '', '', '', '']);
  ws_data.push(['Thank you for your business!', '', '', '', '', '', '', '', '']);
  ws_data.push(['CELLZEN TRADING', '', '', '', '', '', '', '', '']);
  ws_data.push(['Kathmandu, Nepal', '', '', '', '', '', '', '', '']);
  ws_data.push(['Phone: +977-XXXXXXXXXX', '', '', '', '', '', '', '', '']);
  ws_data.push(['Email: info@cellzen.com', '', '', '', '', '', '', '', '']);

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },   // S.No
    { wch: 15 },  // Product Image
    { wch: 30 },  // Product Name
    { wch: 8 },   // QTY
    { wch: 8 },   // Unit
    { wch: 15 },  // Unit Price
    { wch: 15 },  // Total Amount
    { wch: 15 },  // Package Weight
    { wch: 15 },  // Package Size
  ];

  // Set merges for header
  ws['!merges'] = [
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }, // CELLZEN TRADING
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } }, // Proforma Invoice
    { s: { r: 5, c: 1 }, e: { r: 5, c: 3 } }, // Invoice No value
    { s: { r: 5, c: 5 }, e: { r: 5, c: 7 } }, // Date value
    { s: { r: 7, c: 1 }, e: { r: 7, c: 8 } }, // Buyer value
    { s: { r: 9, c: 1 }, e: { r: 9, c: 3 } }, // Mode of Shipment value
    { s: { r: 9, c: 5 }, e: { r: 9, c: 7 } }, // Export Country value
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice');

  // Generate file
  const fileName = `${invoice.id || 'Invoice'}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

export default generateInvoiceExcel;
