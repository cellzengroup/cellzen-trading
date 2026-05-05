// Build the download filename for invoice PDFs and Excel files.
// Format: {FirstName}_{InvoiceNumber}_{TransportMethod}
// Falls back gracefully when fields are missing so we never produce an empty
// or filesystem-hostile filename.

const sanitize = (s) =>
  String(s ?? '')
    .trim()
    // Strip characters illegal on Windows/macOS filesystems and collapse spaces.
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_');

const firstNameOf = (invoice = {}) => {
  const raw = invoice.rawData || {};
  const full = (invoice.customer || raw.customerName || raw.customerFirstName || '').trim();
  if (!full) return 'Customer';
  // First whitespace-delimited token captures the first name.
  return sanitize(full.split(/\s+/)[0]) || 'Customer';
};

const transportOf = (invoice = {}) => {
  const raw = invoice.rawData || {};
  const mode = raw.modeOfDelivery || raw.transportMethod || raw.shippingMethod || '';
  if (!mode) return '';
  // Capitalize for readability: "air" → "Air"
  const s = sanitize(mode);
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
};

export function buildInvoiceFilename(invoice = {}, ext = '') {
  const first = firstNameOf(invoice);
  const id = sanitize(invoice.id) || 'Invoice';
  const transport = transportOf(invoice);
  const stem = transport ? `${first}_${id}_${transport}` : `${first}_${id}`;
  if (!ext) return stem;
  const dot = ext.startsWith('.') ? ext : `.${ext}`;
  return `${stem}${dot}`;
}
