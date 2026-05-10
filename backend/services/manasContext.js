const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const Product = require('../inventory/models/Product');
const Invoice = require('../inventory/models/Invoice');
const User = require('../inventory/models/User');

let hsBundle = null;
const loadHsBundle = () => {
  if (hsBundle !== null) return hsBundle;
  // Try a few likely locations. The first one (frontend/src/data) is where the
  // bundle lives in source. In production on Render the source is also present
  // since Render deploys the whole repo. We also check dist/assets just in
  // case Vite copied an unhashed version there.
  const candidates = [
    path.join(__dirname, '..', '..', 'frontend', 'src', 'data', 'hsTariff.bundle.json'),
    path.join(__dirname, '..', '..', 'dist', 'assets', 'hsTariff.bundle.json'),
    path.join(__dirname, '..', '..', 'dist', 'hsTariff.bundle.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        hsBundle = JSON.parse(fs.readFileSync(p, 'utf8'));
        return hsBundle;
      }
    } catch (e) {
      console.warn('[MANAS] HS bundle read failed at', p, '-', e.message);
    }
  }
  // No bundle found — also check dist/assets for hashed Vite output as last resort
  try {
    const assetsDir = path.join(__dirname, '..', '..', 'dist', 'assets');
    if (fs.existsSync(assetsDir)) {
      const file = fs.readdirSync(assetsDir).find(f => f.startsWith('hsTariff.bundle') && f.endsWith('.json'));
      if (file) {
        hsBundle = JSON.parse(fs.readFileSync(path.join(assetsDir, file), 'utf8'));
        return hsBundle;
      }
    }
  } catch (e) { /* ignore */ }
  // Truly not found — degrade gracefully (HS lookups return empty, AI uses general knowledge)
  console.warn('[MANAS] ⚠️  HS tariff bundle not found in any expected location. HS code answers will use general knowledge only.');
  hsBundle = { c: {} };
  return hsBundle;
};

const STOP_WORDS = new Set([
  'what', 'which', 'where', 'when', 'how', 'who', 'why', 'this', 'that', 'with',
  'have', 'from', 'about', 'tell', 'give', 'show', 'find', 'know', 'want',
  'need', 'help', 'please', 'code', 'codes', 'tariff', 'duty', 'product',
  'products', 'invoice', 'invoices', 'order', 'orders', 'customer', 'cellzen',
  'trading', 'kindly', 'would', 'could', 'should', 'their', 'there', 'these',
  'those', 'your', 'mine', 'thanks', 'thank',
]);

const extractKeywords = (text) => {
  return Array.from(new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )).slice(0, 8);
};

// Unpack a single HS bundle entry into a friendly object — same field
// expansion as the frontend lookup utility uses (frontend/src/utils/hsCodeLookup.js).
const unpackHs = (code, packed) => ({
  code,
  description: packed.d || '',
  unit: packed.u || null,
  page: packed.p ?? null,                      // PDF page number in the official Nepal Customs Tariff
  excise: packed.e ?? null,                    // %
  agriFee: packed.a ?? null,                   // %
  advTax: packed.t ?? null,                    // %
  vat: packed.v ?? null,                       // %
  customsDuty: { saarc: packed.cs ?? null, other: packed.co ?? null },
  effectiveRate: {
    saarc: packed.es ?? null,
    india: packed.ei ?? null,
    tibet: packed.et ?? null,
    other: packed.eo ?? null,
  },
});

const searchHsCodes = (text, limit = 5) => {
  const bundle = loadHsBundle();
  const codes = bundle.c || {};
  const keywords = extractKeywords(text);
  if (keywords.length === 0) return [];
  const matches = [];
  for (const code in codes) {
    const desc = String(codes[code].d || '').toLowerCase();
    let score = 0;
    for (const kw of keywords) if (desc.includes(kw)) score++;
    if (score > 0) matches.push({ code, packed: codes[code], score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit).map(m => unpackHs(m.code, m.packed));
};

// Format a duty rate for display — null/undefined → "—"
const fmtPct = (v) => (v == null ? '—' : `${v}%`);

const sanitizeProduct = (p) => ({
  name: p.name,
  category: p.category,
  description: p.description ? String(p.description).slice(0, 300) : null,
  retail_price: p.retail_price,
  wholesale_price: p.wholesale_price,
  weight: p.weight,
  size: p.size,
  image_url: p.image_url || null,
});

// Whitelist of phrases that explicitly mean the user wants to see products.
// Without one of these in the message we don't return any products — otherwise
// generic queries like "who are you" or "hello" would dump the catalog.
const PRODUCT_INTENT_RX = /\b(product|products|catalog|catalogue|item|items|inventory|sourcing|what (do you|you) (sell|have|offer|stock)|do you sell|browse|show me)\b/i;

const searchProducts = async (text, limit = 5) => {
  if (!Product) return [];
  const raw = String(text || '');
  // Only run product search when the user actually mentions products.
  if (!PRODUCT_INTENT_RX.test(raw)) return [];
  const keywords = extractKeywords(text);
  try {
    if (keywords.length === 0) {
      // User mentioned "products" generically with no specifics — return a
      // small recent sample so we have something useful to show.
      const recent = await Product.findAll({ limit, order: [['createdAt', 'DESC']] });
      return recent.map(sanitizeProduct);
    }
    const where = {
      [Op.or]: keywords.flatMap(kw => [
        { name: { [Op.iLike]: `%${kw}%` } },
        { description: { [Op.iLike]: `%${kw}%` } },
        { category: { [Op.iLike]: `%${kw}%` } },
      ]),
    };
    const products = await Product.findAll({ where, limit });
    return products.map(sanitizeProduct);
  } catch (e) {
    console.warn('[MANAS] Product search failed:', e.message);
    return [];
  }
};

const findCustomerByContact = async ({ name, email, phone }) => {
  if (!User || !name) return null;
  if (!email && !phone) return null;
  const trimmedName = String(name).trim();
  if (trimmedName.length < 2) return null;
  try {
    const where = {
      role: 'customer',
      name: { [Op.iLike]: `%${trimmedName}%` },
    };
    if (email) where.email = String(email).trim().toLowerCase();
    if (phone) where.phone = String(phone).trim();
    return await User.findOne({ where });
  } catch (e) {
    console.warn('[MANAS] Customer lookup failed:', e.message);
    return null;
  }
};

// Look up an invoice by number ONLY — used to check if a number exists at all,
// so we can tell the user "the contact info is wrong" vs "no such invoice".
// Returns the invoice if found, null otherwise. We DO NOT expose the row to
// the AI — only the existence flag matters for the UX message.
// Case-insensitive: "czn-06-0001" === "CZN-06-0001".
const findInvoiceByNumberOnly = async (invoiceNumber) => {
  if (!Invoice || !invoiceNumber) return null;
  const trimmedNumber = String(invoiceNumber).trim();
  if (trimmedNumber.length < 2) return null;
  try {
    const inv = await Invoice.findOne({
      where: { invoice_number: { [Op.iLike]: trimmedNumber } },
      attributes: ['id', 'invoice_number'], // minimal, never leak data
    });
    return inv ? inv.toJSON() : null;
  } catch (e) {
    console.warn('[MANAS] Invoice number-only lookup failed:', e.message);
    return null;
  }
};

// Look up a single invoice by its number AND verify with ANY one of the
// customer identifiers we have on the invoice row: name, email, or phone.
// Invoice number alone is NOT enough (someone could guess); pairing it with
// any contact field is sufficient proof of ownership.
const findInvoiceByNameAndNumber = async ({ name, email, phone, invoiceNumber }) => {
  if (!Invoice || !invoiceNumber) return null;
  const trimmedNumber = String(invoiceNumber).trim();
  if (trimmedNumber.length < 2) return null;
  // At least ONE contact identifier must be provided — invoice # alone is unsafe.
  const hasContact = !!(name || email || phone);
  if (!hasContact) return null;

  try {
    const orConditions = [];
    if (name) {
      const trimmed = String(name).trim();
      if (trimmed.length >= 2) orConditions.push({ customer_name: { [Op.iLike]: `%${trimmed}%` } });
    }
    if (email) {
      const trimmed = String(email).trim().toLowerCase();
      if (trimmed.length >= 3) orConditions.push({ customer_email: { [Op.iLike]: trimmed } });
    }
    // Phone: Invoice doesn't store phone directly, but invoice_data may.
    // We match on customer_name fallback if a phone was given alone — typically
    // user provides phone OR email, not phone alone, so this branch is rare.

    if (orConditions.length === 0) return null;

    const inv = await Invoice.findOne({
      where: {
        // Case-insensitive — "czn-06-0001" matches "CZN-06-0001"
        invoice_number: { [Op.iLike]: trimmedNumber },
        [Op.or]: orConditions,
      },
    });
    return inv ? inv.toJSON() : null;
  } catch (e) {
    console.warn('[MANAS] Invoice lookup failed:', e.message);
    return null;
  }
};

const getInvoicesForCustomer = async (customerId, customerEmail, limit = 20) => {
  if (!Invoice) return [];
  const orClauses = [];
  if (customerId) orClauses.push({ shared_user_id: customerId });
  if (customerEmail) orClauses.push({ customer_email: String(customerEmail).toLowerCase() });
  if (orClauses.length === 0) return [];
  try {
    return await Invoice.findAll({
      where: { [Op.or]: orClauses },
      limit,
      order: [['invoice_date', 'DESC']],
      attributes: ['invoice_number', 'customer_name', 'amount', 'currency', 'status', 'invoice_date'],
    });
  } catch (e) {
    console.warn('[MANAS] Invoice lookup failed:', e.message);
    return [];
  }
};

// Trivial messages don't need DB lookups — saves 200-500ms per call.
// Greetings, thanks, simple confirmations, very short utterances.
const TRIVIAL_PATTERNS = [
  /^(hi|hello|hey|hola|namaste|namaskar|yo|sup|thanks?|thank you|dhanyabad|dhanyawad|ok|okay|cool|nice|good|great|yes|no|bye|goodbye|alvida|fine)[\s!.?,]*$/i,
  /^(how are you|kasto chha|k cha|ke chha|tapai|tapailai)[\s!.?,]{0,20}$/i,
];

const isTrivial = (text) => {
  const trimmed = String(text || '').trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length <= 5) return true; // "hi", "ok", "hi!"
  return TRIVIAL_PATTERNS.some(rx => rx.test(trimmed));
};

const buildContext = async ({ message, user, verifiedCustomer, matchedInvoice, lookupFailure }) => {
  const blocks = [];
  const trivial = isTrivial(message);

  // If a verification attempt was made but failed, emit an EXPLICIT failure
  // block so the AI doesn't hallucinate invoice data. Each failure mode has
  // a verbatim user-facing reply the AI must use.
  if (lookupFailure) {
    let block = '[CONTEXT: INVOICE LOOKUP FAILED — server-confirmed. NO match found in the database.]\n';
    block += 'DO NOT invent any invoice details. DO NOT show any table. DO NOT say "I found the invoice" (unless the failure kind is "wrong-contact"). DO NOT include the [CONTEXT: ...] line. Reply EXACTLY using the message below — nothing more, nothing less. Preserve the line breaks and the bold **labels**.\n\n';

    if (lookupFailure.kind === 'no-such-invoice') {
      block += `Required reply (use this EXACT text including line breaks):\n` +
        `"I'm a bit confused — I couldn't find your invoice. Could you please provide the details in this format so I can search more accurately?\n\n` +
        `**Invoice:** [your invoice number, e.g. CZN-06-0001]\n` +
        `**Name / Email / Phone:** [whichever one is on the order]"\n\n` +
        `Details: invoice number "${lookupFailure.invoiceNumber || 'unknown'}" does NOT exist in our database.`;
    } else if (lookupFailure.kind === 'wrong-contact') {
      const wrong = [];
      if (lookupFailure.providedName)  wrong.push(`name "${lookupFailure.providedName}"`);
      if (lookupFailure.providedEmail) wrong.push(`email "${lookupFailure.providedEmail}"`);
      if (lookupFailure.providedPhone) wrong.push(`phone "${lookupFailure.providedPhone}"`);
      const wrongStr = wrong.join(' / ') || 'contact details';
      block += `Required reply (use this EXACT text including line breaks):\n` +
        `"I found the invoice ${lookupFailure.invoiceNumber}, but the ${wrongStr} you provided doesn't match what's on the order. Could you please re-send the details in this format so I can search more accurately?\n\n` +
        `**Invoice:** ${lookupFailure.invoiceNumber}\n` +
        `**Name / Email / Phone:** [whichever one is on the order]"\n\n` +
        `Details: invoice "${lookupFailure.invoiceNumber}" exists, but the ${wrongStr} provided do not match the customer record.`;
    } else if (lookupFailure.kind === 'incomplete') {
      block += `Required reply (use this EXACT text including line breaks):\n` +
        `"To look up your invoice, please share the details in this format:\n\n` +
        `**Invoice:** [your invoice number, e.g. CZN-06-0001]\n` +
        `**Name / Email / Phone:** [whichever one is on the order]"\n\n` +
        `Details: user mentioned wanting to look up an invoice but didn't provide enough info yet.`;
    }
    blocks.push(block);
    return blocks.join('\n\n'); // Return early — failure context is everything we need
  }

  // If the user verified with name + invoice number AND we found the invoice,
  // include it as a rich context block so MANAS can describe it as a table
  // and the frontend can render the download buttons.
  if (matchedInvoice) {
    const inv = matchedInvoice;
    const data = inv.invoice_data || {};
    const items = Array.isArray(data.items) ? data.items : [];

    // Aggregate goods quantity + weight across all line items (with sensible fallbacks).
    const goodsQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const weightTotalKg = items.reduce((sum, it) => {
      const wPerUnit = Number(it.weight) || 0;
      const qty = Number(it.quantity) || 0;
      return sum + wPerUnit * qty;
    }, 0);
    const weightDisplay = weightTotalKg > 0
      ? `${weightTotalKg} kg`
      : (data.totalWeight || data.weight ? `${data.totalWeight || data.weight} kg` : '—');

    const fmtRow = (label, value) => `| ${label} | ${value} |`;
    const customerName = data.customerName || inv.customer_name || '—';
    const invoiceDate  = data.invoiceDate  || inv.invoice_date  || '—';
    const status       = data.status        || inv.status        || '—';
    const currency     = data.currency      || inv.currency      || 'USD';
    const totalAmount  = data.grandTotal != null ? data.grandTotal : inv.amount;

    blocks.push(
      '[CONTEXT: VERIFIED INVOICE DATA — server-confirmed. The lookup succeeded.]\n' +
      'Use the table below VERBATIM in your reply. Do NOT include the [CONTEXT: ...] line. Do NOT add a "## VERIFIED INVOICE" heading. Start your reply with "Found your invoice **NUMBER** ✅" then the table.\n\n' +
      `Found your invoice **${inv.invoice_number}** ✅\n\n` +
      '| Field | Value |\n|---|---|\n' +
      fmtRow('Date of Invoice', invoiceDate) + '\n' +
      fmtRow('Invoice Number', inv.invoice_number) + '\n' +
      fmtRow('Name', customerName) + '\n' +
      fmtRow('Goods Quantity', goodsQuantity > 0 ? goodsQuantity : '—') + '\n' +
      fmtRow('Weight', weightDisplay) + '\n' +
      fmtRow('Total Amount', `${currency} ${Number(totalAmount || 0).toLocaleString()}`) + '\n' +
      fmtRow('Payment Status', status) + '\n\n' +
      'STOP your reply right after the Payment Status row. The frontend renders the three download buttons automatically. Do NOT add download links or any "Download in NPR/RMB/USD" text.'
    );
    return blocks.join('\n\n'); // Return early — invoice context is everything we need
  }

  // Fire all DB queries IN PARALLEL — they're independent, don't wait serially.
  // searchHsCodes is sync (in-memory), so just run it inline.
  const hsResults = trivial ? [] : searchHsCodes(message);

  const queries = [];
  // Product search (skip for trivial messages)
  queries.push(trivial ? Promise.resolve([]) : searchProducts(message));
  // Logged-in customer's invoices
  queries.push(
    (user && user.role === 'customer')
      ? getInvoicesForCustomer(user.id, user.email)
      : Promise.resolve(null)
  );
  // Verified anonymous customer's invoices
  queries.push(
    verifiedCustomer
      ? getInvoicesForCustomer(verifiedCustomer.id, verifiedCustomer.email)
      : Promise.resolve(null)
  );

  const [products, customerInvoices, verifiedInvoices] = await Promise.all(queries);

  if (hsResults.length > 0) {
    blocks.push(
      '## Relevant HS Codes (from Nepal Customs Tariff 2082/83)\n' +
      'Use this data to answer the user. Calculate totals when asked. ALWAYS include the PDF page number "(Pg No: X)" at the end of each HS code line you mention in your reply.\n\n' +
      hsResults.map(r => {
        const pgTag = r.page != null ? ` (Pg No: ${r.page})` : '';
        const lines = [
          `**HS ${r.code}**${pgTag} — ${r.description}` + (r.unit ? ` _(unit: ${r.unit})_` : ''),
          `  Customs duty: SAARC ${fmtPct(r.customsDuty.saarc)} | Other countries ${fmtPct(r.customsDuty.other)}`,
          `  Excise: ${fmtPct(r.excise)} | Agriculture fee: ${fmtPct(r.agriFee)} | Advance income tax: ${fmtPct(r.advTax)} | VAT: ${fmtPct(r.vat)}`,
          `  Effective total rate: SAARC ${fmtPct(r.effectiveRate.saarc)} | India ${fmtPct(r.effectiveRate.india)} | Tibet ${fmtPct(r.effectiveRate.tibet)} | Other ${fmtPct(r.effectiveRate.other)}`,
        ];
        return lines.join('\n');
      }).join('\n\n')
    );
  }

  if (products && products.length > 0) {
    blocks.push(
      '[CONTEXT: PRODUCT CATALOG MATCHES — use only if the user is asking about products. Do NOT include the [CONTEXT: ...] line or "## Matching Products" heading in your reply.]\n' +
      'When listing products, render each one in this exact markdown format so the image shows:\n' +
      '![ProductName](image_url)\n' +
      '**ProductName** — category | price details\n' +
      'short description\n\n' +
      'Product data:\n' +
      products.map(p => {
        const parts = [`**${p.name}**`];
        if (p.category) parts.push(`category: ${p.category}`);
        if (p.retail_price) parts.push(`retail: ${p.retail_price}`);
        if (p.wholesale_price) parts.push(`wholesale: ${p.wholesale_price}`);
        if (p.weight) parts.push(`weight: ${p.weight}`);
        if (p.size) parts.push(`size: ${p.size}`);
        let line = '- ' + parts.join(' | ');
        if (p.image_url) line += `\n  image: ${p.image_url}`;
        if (p.description) line += `\n  ${p.description}`;
        return line;
      }).join('\n')
    );
  }

  if (user && user.role === 'customer') {
    blocks.push(
      `## Logged-in Customer Profile (this is the user you're talking to)\n` +
      `- Name: ${user.name}\n- Email: ${user.email}\n- Phone: ${user.phone || 'N/A'}\n- Country: ${user.country || 'N/A'}`
    );
    const invoices = customerInvoices || [];
    if (invoices.length > 0) {
      blocks.push(
        `## Their Invoices (${invoices.length})\n` +
        invoices.map(i => `- ${i.invoice_number} | ${i.invoice_date || '-'} | ${i.currency} ${i.amount} | ${i.status}`).join('\n')
      );
    } else {
      blocks.push('## Their Invoices\nNo invoices found under this account yet.');
    }
  }

  if (verifiedCustomer) {
    blocks.push(
      `## Verified Customer (anonymous lookup matched)\n` +
      `- Name: ${verifiedCustomer.name}\n- Email: ${verifiedCustomer.email}\n- Country: ${verifiedCustomer.country || 'N/A'}`
    );
    const invoices = verifiedInvoices || [];
    if (invoices.length > 0) {
      blocks.push(
        `## Their Invoices (${invoices.length})\n` +
        invoices.map(i => `- ${i.invoice_number} | ${i.invoice_date || '-'} | ${i.currency} ${i.amount} | ${i.status}`).join('\n')
      );
    } else {
      blocks.push('## Their Invoices\nNo invoices found under this customer yet — tell them: "Sorry, I don\'t see any orders under your details yet."');
    }
  }

  if (user && user.role === 'admin') {
    blocks.push('## Admin Mode\nThis user is an admin and may ask about any customer or invoice. If they ask about a specific customer by name/email, tell them you need them to specify which customer and they can look up details directly in the admin dashboard.');
  }

  return blocks.join('\n\n');
};

module.exports = {
  buildContext,
  findCustomerByContact,
  findInvoiceByNameAndNumber,
  findInvoiceByNumberOnly,
  getInvoicesForCustomer,
  searchHsCodes,
  searchProducts,
  isTrivial,
};
