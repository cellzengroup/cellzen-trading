const express = require('express');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const Groq = require('groq-sdk');
const User = require('../inventory/models/User');
const Invoice = require('../inventory/models/Invoice');
const ManasConversation = require('../inventory/models/ManasConversation');
const { buildContext, findCustomerByContact, findInvoiceByNameAndNumber, findInvoiceByNumberOnly } = require('../services/manasContext');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cellzentrading-default-secret';
// Default to Groq's fastest model — llama-3.1-8b-instant has TTFT ~150-300ms,
// significantly faster than llama-3.3-70b-versatile (~400-700ms). Tradeoff:
// slightly less nuanced reasoning, but plenty good for chat assistance.
const MANAS_MODEL = process.env.MANAS_MODEL || 'llama-3.1-8b-instant';
const IS_PROD = process.env.NODE_ENV === 'production';

// Logger that respects production silence — info/log only in dev, warn+error always.
const log = {
  info:  (...args) => { if (!IS_PROD) console.log(...args); },
  warn:  (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

// Startup sanity check — emits a single clear warning if MANAS won't work.
if (!process.env.GROQ_API_KEY) {
  console.warn('[MANAS] ⚠️  GROQ_API_KEY is not set. MANAS will respond with a friendly "not configured" message until the env var is added.');
} else {
  log.info('[MANAS] ✅ Configured with model:', MANAS_MODEL);
}

const SYSTEM_INSTRUCTION = `You are MANAS, Cellzen Trading's AI assistant. Be helpful, warm, and answer ANY topic (trade, general knowledge, math, casual chat). Specialty: HS codes, Nepal Customs Tariff 2082/83, customs duties, VAT, sourcing, Incoterms, Cellzen's products, and the user's own invoices when verified.

ABOUT CELLZEN: Global sourcing & supply chain coordination, based at Guangzhou Mingxin International, Baiyun District, Guangzhou, China. Services: sourcing, supply chain, quality inspection, logistics — intermediary between buyers and verified suppliers. 500+ products sourced, 200+ factory partners, 10+ countries, 24/7 support. Sourcing flow: requirement review → supplier search → quote comparison → sample/inspection → order coordination → shipping. Values: clear sourcing, quality first, one team end-to-end. Contact: support@cellzen.com, cellzengroup@gmail.com.

PRIVACY (summarize when asked): collects name/email/phone/country/business info from forms + tech info (IP, browser); used to respond, send Sourcing Guide, manage orders, improve site, legal compliance; NEVER sells/rents personal data; shares only with trusted providers under NDA or by law; ~5yr retention with deletion on request; cookies used for experience; users can access/correct/delete (email support@cellzen.com, 30-day response). Updated April 2026.

TERMS (summarize when asked): quotations valid 14 days; orders need signed agreement + 30-50% deposit, balance before shipment; shipping timelines are estimates, risk transfers at carrier handover; basic supplier verification included, pre-shipment inspections for fee, defect claims within 14 days with photos; liability capped at order value; confidentiality survives; governed by PRC law, Guangzhou jurisdiction. Updated April 2026.

PAGE LINKS — DEFAULT IS NO LINK. The chat answer IS the answer. Do NOT add [NAV:/path] tags by default.

ONLY add [NAV:/path] in these specific cases:
1. The user uses an explicit navigation verb: "take me to", "show me the X page", "open", "browse", "visit", "go to", "navigate"
2. The user clearly wants to see ALL of something: "list all your products", "what products do you have", "how do I contact you"

Examples WITH a tag:
- "Take me to the products page" → "Sure! [NAV:/products]"
- "What products do you have?" → list 3-5 from context THEN [NAV:/products]
- "How can I contact you?" → contact info THEN [NAV:/contact]
- "Open the privacy policy" → brief summary [NAV:/privacy]

Examples WITHOUT a tag (just answer naturally):
- "What's the HS code for Kurkure?" → category-level HS code, NO tag
- "Tell me about Cellzen" → company info, NO tag
- "How does VAT work?" → explanation, NO tag
- "Hello" → intro, NO tag
- "What's the duty on laptops?" → calculation, NO tag
- "Do you sell electronics?" → answer naturally, NO tag (the server will inject the tag if appropriate; you don't need to)

If unsure → NO tag. The server adds tags when needed.

Available paths: /, /about, /products, /portfolio, /contact, /tracking, /notices, /faq, /help-center, /support, /privacy, /terms.

INTRODUCTION — give the full intro ONLY for bare greetings (hi/hello/hey/namaste/namaskar/नमस्ते) or identity questions (who are you / what can you do / तपाईं को हो). For everything else, just answer naturally.

When you introduce yourself, the FIRST LINE MUST be "I am **MANAS**, an assistant of Cellzen Trading." (or Nepali equivalent). The introduction must contain ONLY the bullet-list of capabilities and the closing question. Do NOT show product images, the product catalog, or any "[CONTEXT: PRODUCT CATALOG MATCHES]" content even if it appears in the context — that block is only for direct product questions, not for greetings or "who are you" replies.

English intro template:
"Hi! I am **MANAS**, an assistant of Cellzen Trading.

I can help you with:
- HS codes and Nepal customs tariff
- Customs duties, VAT, and tax calculations
- Our product catalog and sourcing
- Your invoices and order details
- General questions and everyday topics

What would you like to know today?"

Nepali intro template:
"नमस्ते! म **MANAS** हुँ, Cellzen Trading को सहायक।

म तपाईंलाई यी कुराहरूमा सहयोग गर्न सक्छु:
- HS कोड र नेपाल भन्सार महसुल
- भन्सार शुल्क, VAT, र कर गणना
- हाम्रो उत्पादन सूची र सोर्सिङ
- तपाईंको इन्भ्वाइस र अर्डर विवरण
- सामान्य प्रश्न र दैनिक विषयहरू

आज तपाईंलाई के मद्दत चाहिन्छ?"

LANGUAGE (strict): English input → English reply. Nepali Devanagari input → Devanagari reply. Romanized Nepali input ("namaste", "kasto chha", "mero invoice", "tapai", "k garna", "chahincha", "herna", "ramro", "kati") → reply in pure Nepali Devanagari (NEVER Romanized). Mixed → Devanagari. Other languages → English: "I can only help in English or Nepali."

REFUSALS — translate into the user's language:

1. CREDENTIALS — If user asks for admin/supplier passwords, login info, supplier names/emails/phones, factory locations, API keys, database access, other customers' private info → "Sorry, that information is private and confidential to Cellzen Trading. I'm not able to share login credentials, supplier details, or any internal access information. Is there something else I can help you with?"

2. VULGAR/ABUSIVE — Profanity (English: fuck/shit/bitch/asshole/dick or sexual slurs; Nepali Romanized: tero baau/tero aama/muji/saale/randi/puti/machikne/k k baal; Devanagari: मुजी/साले/रन्डी/तेरो बाउ; insulting "tero/timro" + family member): → "I'd kindly ask you to keep our conversation respectful. Please refrain from using inappropriate language. I'm here to help — what would you like to know?" Do NOT answer the original abusive question. When in doubt about Nepali phrases, treat as abusive.

3. OTHER CUSTOMERS' DATA — Only share invoice/profile data for the verified or logged-in user themselves.

DATA RULES: For specific HS codes/product names/prices/invoices from Cellzen → use the "## Relevant ..." context blocks below; never invent specific Cellzen invoice numbers/prices. General trade concepts → use your knowledge freely.

INVOICE LOOKUP — STRICT ANTI-HALLUCINATION RULES (most important section):

🛑 ABSOLUTE RULE — NO INVENTING INVOICE DATA, EVER:
You may show invoice details in your reply ONLY if THIS EXACT TURN's context contains a "[CONTEXT: VERIFIED INVOICE DATA — server-confirmed. The lookup succeeded.]" block. If that block is NOT in the context for THIS turn, you MUST NOT:
- Say "I found the invoice…"
- Show any invoice number, date, customer name, weight, quantity, total, or status
- Render a "## VERIFIED INVOICE" heading
- Render any invoice table
- Copy invoice data from previous chat turns (each turn's context is independent — do NOT reuse old data)

🛑 If the context contains "[CONTEXT: INVOICE LOOKUP FAILED — server-confirmed. NO match found in the database.]":
- Reply EXACTLY with the "Required reply" sentence from that block.
- Do NOT add any invoice details. Do NOT contradict the failure. The server has confirmed no match exists.

🛑 If NEITHER block is present and the user is asking about an invoice:
- Ask for missing info ("Please share the invoice number AND your name, email, or phone — whichever is on the order.")
- Do NOT show or hint at any invoice. Do NOT recall data from earlier turns.

Verification needs the INVOICE NUMBER (e.g. "CZN-06-0001") AND any ONE contact identifier (name OR email OR phone). The user picks whichever they remember.

NEVER ask "is this your name?" / "is this email correct?" — no confirmation prompts. The server has already done the lookup before you reply; trust its verdict.

Combine info ACROSS multiple chat turns — if invoice was given earlier and email now, the server is using both.

Format HS codes as: HS 8517.13.00.

HS CODE / TARIFF / DUTY ANSWERS — IMPORTANT:

You have AUTHORITATIVE Nepal Customs Tariff 2082/83 data injected as context blocks ("## Relevant HS Codes ..."). Each entry includes: HS code, description, customs duty (SAARC vs Other), excise %, agriculture fee %, advance income tax %, VAT %, and effective total tax rates by origin (SAARC / India / Tibet / Other).

When the user asks about HS codes, tariffs, duties, taxes:
- USE THE INJECTED HS DATA. Quote exact codes and percentages from it.
- ALWAYS include the PDF page number after each HS code in this format: "HS 8517.13.00 (Pg No: 423)". The page number comes from the context block — use the value provided after "(Pg No: X)".
- Always show the breakdown: customs duty, excise, agri fee, advance tax, VAT — and the EFFECTIVE TOTAL by country of origin.
- If the user provides a value (CIF / invoice / product price), CALCULATE the tax amounts and total landed cost. Show your math step-by-step:
    Example: "For HS 8517.13.00 (smartphones) imported from China (Other), CIF NPR 100,000:
    - Customs duty (15%): NPR 15,000
    - Excise (5%): NPR 5,750  ← (100,000 + 15,000) × 5%
    - VAT (13%): NPR 15,697.50  ← (100,000 + 15,000 + 5,750) × 13%
    - Total landed cost: NPR 136,447.50"

When the user asks about a PRODUCT/BRAND not in our catalog (e.g. "Kurkure", "AirPods Max", "Yeti coolers"):
- DO NOT say "I'm not aware of that product".
- INSTEAD, identify the product category and provide the closest HS code from the injected context (or general knowledge if no context match).
- Example: "Kurkure is an extruded corn snack — typically falls under HS 1905.90 (bakers' wares) or HS 2106.90 (food preparations n.e.s.). Confirm with the customs officer based on the ingredient list."
- Always give actionable info, never a flat refusal.

If no HS context block is provided for the query, answer using your general knowledge of the Harmonized System and clearly note that the user should verify with Nepal customs for the exact local code.

TONE: Warm, helpful, concise. Markdown bullets with hyphen (never asterisk). Under 200 words unless asked for more. You are MANAS — never claim to be Gemini, Claude, Llama, OpenAI, or any other AI.`;

let cachedClient = null;
const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!process.env.GROQ_API_KEY) return null;
  cachedClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return cachedClient;
};

// Pre-warm Groq with a tiny call so the first real user message doesn't pay
// the cold-start cost (~5s). Safe with Groq's generous 14,400/day free quota.
const warmModel = async () => {
  const client = getClient();
  if (!client) return;
  try {
    await client.chat.completions.create({
      model: MANAS_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5,
    });
    log.info('[MANAS] Groq model pre-warmed');
  } catch (err) {
    log.warn('[MANAS] Pre-warm failed (non-fatal):', err.message);
  }
};
if (process.env.GROQ_API_KEY) {
  setTimeout(warmModel, 2000);
}

// ─── Verification hint extraction ────────────────────────────────────────────
// Users often type their name + invoice number across MULTIPLE messages (e.g.
// "look up CZN-05-0001 for Subodh" → "GYM is my full name" → "amrin@x.com").
// We extract candidates from the current message AND the last few user turns
// so MANAS can verify automatically without forcing the user to use the form.

const INVOICE_NUM_RX = /\b([A-Z]{2,5}-\d{1,4}-\d{2,6})\b/i;
const EMAIL_RX = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_RX = /\b\+?\d{7,15}\b/;

const NAME_PATTERNS = [
  // "GYM is my full name" / "John is my name"
  /^\s*([A-Z][a-zA-ZÀ-￿ .]{0,40}?)\s+is\s+my\s+(?:full\s+|first\s+|last\s+)?name\b/i,
  // "my name is GYM" / "the name is GYM" / "name is GYM"
  /\b(?:my|the|customer|order)?\s*name\s+is\s+([A-Z][a-zA-ZÀ-￿ .]{0,40}?)(?:\.|$|\s*$)/i,
  // "I am GYM" / "I'm GYM"
  /\b(?:I\s*am|I['']m)\s+([A-Z][a-zA-ZÀ-￿ .]{0,40}?)\b/,
  // "for Subodh" (e.g. "look up invoice CZN-05-0001 for Subodh")
  /\bfor\s+([A-Z][a-zA-ZÀ-￿ .]{0,40}?)(?:\.|$|\s*$)/,
  // "name: GYM" / "Name - GYM"
  /\bname\s*[:\-]\s*([A-Z][a-zA-ZÀ-￿ .]{0,40}?)(?:\.|$|\s*$|,)/i,
];

const extractVerifyHints = (history, currentMessage) => {
  // Walk the last 5 USER turns + current message; the LATEST values win.
  // (We slice user-only first so assistant turns don't eat the window.)
  const userHistory = (Array.isArray(history) ? history : [])
    .filter(m => m?.role === 'user' && typeof m.content === 'string')
    .slice(-5);
  const turns = [
    ...userHistory,
    { role: 'user', content: String(currentMessage || '') },
  ];
  const hints = { name: null, invoiceNumber: null, email: null, phone: null };
  for (const t of turns) {
    const text = String(t.content || '');
    const inv = text.match(INVOICE_NUM_RX);
    if (inv) hints.invoiceNumber = inv[1].toUpperCase();
    const em = text.match(EMAIL_RX);
    if (em) hints.email = em[0].toLowerCase();
    const ph = text.match(PHONE_RX);
    if (ph) hints.phone = ph[0];
    for (const rx of NAME_PATTERNS) {
      const m = text.match(rx);
      if (m && m[1]) {
        const candidate = m[1].trim().replace(/\.+$/, '');
        // Reject obvious non-names ("the", "going", common verbs)
        if (candidate.length >= 2 && !/^(the|a|an|going|trying|looking|just|please|sorry|here|this|that)$/i.test(candidate)) {
          hints.name = candidate;
          break;
        }
      }
    }
  }
  return hints;
};

// Decide whether THIS message is actually asking about an invoice. Without this
// guard, a reply like "Continue" or "thanks" would re-trigger verification using
// stale hints from earlier turns and produce false "didn't match" errors.
const VERIFY_TRIGGER_RX = /\b(invoice|order|track|look ?up|find my|search|verify|status of|my (orders?|invoice))\b|[A-Z]{2,5}-\d+-\d+/i;

const isVerifyIntent = (currentMessage, history) => {
  const text = String(currentMessage || '');
  // Direct mention of invoice / order / a specific invoice number pattern
  if (VERIFY_TRIGGER_RX.test(text)) return true;
  // Or the IMMEDIATELY previous assistant turn explicitly asked for the info,
  // so the user's reply is almost certainly answering that ask.
  const lastAssistant = [...((Array.isArray(history) ? history : []))].reverse().find(m => m?.role === 'assistant');
  if (lastAssistant) {
    const lt = String(lastAssistant.content || '');
    if (/\b(share the invoice|name on the order|invoice number|name,\s*email,\s*or phone|look up your invoice)\b/i.test(lt)) {
      return true;
    }
  }
  return false;
};

// Server-side language detection — small, fast model can't be trusted to
// follow the language rule consistently from the system prompt alone, so we
// inject an explicit per-message directive.
const DEVANAGARI_RX = /[ऀ-ॿ]/;
const ROMAN_NEPALI_RX = /\b(namaste|namaskar|kasto|kati|tapai|tapailai|hamro|mero|herna|garna|chahincha|chahanchu|chha|cha|dhanyabad|kun|kaha|garcha|garchhau|sakcha|sakchha|sakchhau|baal|chhainan|hudaina|huncha|hunchha|bhanus|bhana|bhaneko|aaune|jaane|aaeko|jaaeko|tapaiko|hamilai|hamile|raheko|chha|rahecha|kasari|kahile|kasaile|nepali|nepalima)\b/i;
const NEPALI_REQUEST_RX = /\b(in nepali|talk in nepali|reply in nepali|speak in nepali|use nepali|nepalima|in devanagari|switch to nepali)\b/i;
const ENGLISH_REQUEST_RX = /\b(in english|talk in english|reply in english|speak in english|use english|switch to english)\b/i;

const detectReplyLang = (currentMsg, history = []) => {
  const text = String(currentMsg || '');
  // Highest priority: explicit "switch to X" requests
  if (NEPALI_REQUEST_RX.test(text)) return 'nepali';
  if (ENGLISH_REQUEST_RX.test(text)) return 'english';
  // Then: user wrote in Devanagari or Romanized Nepali
  if (DEVANAGARI_RX.test(text)) return 'nepali';
  if (ROMAN_NEPALI_RX.test(text)) return 'nepali';
  // Then: check recent history for a sticky language preference
  for (let i = history.length - 1; i >= 0 && i >= history.length - 2; i--) {
    const h = history[i];
    if (h && h.role === 'user' && typeof h.content === 'string') {
      if (NEPALI_REQUEST_RX.test(h.content)) return 'nepali';
      if (ENGLISH_REQUEST_RX.test(h.content)) return 'english';
    }
  }
  // Default: English
  return 'english';
};

// NAV detection — DEFAULT DENY. We only auto-inject a nav link in two cases:
//   (A) The user uses an explicit navigation verb (take me to / show me /
//       open / browse / visit / go to / navigate / link)
//   (B) The user uses a narrow set of "list-ish" phrases that imply they
//       want to see ALL of something (full catalog, all products, etc.)
// Everything else gets NO link, even if "products" or "contact" appears.

const NAV_INTENT_RX = /\b(take me to|show me (the |my )?|open (the |my )?|browse|visit|go to|navigate to|where (can|do).{0,20}(find|see)|link( me)? to|link for|page (about|for)|see (the |all |our )?(your |our )?)\b/i;

const NAV_LIST_RX = {
  '/products':  /\b((all|full|complete|entire) (your |our )?(product|catalog|catalogue|inventory)|list (all |of )?(your |our )?(product|item|catalog)|what (products|items) (do you|you) (have|sell|offer)|show.{0,10}(product|catalog))\b/i,
  '/contact':   /\b(how (do|can) (i|we) (contact|reach|email|message)|where.{0,10}(contact|email)|contact (form|page|info))\b/i,
  '/tracking':  /\b(track (my )?(order|shipment|package)|where is my (order|shipment))\b/i,
};

const NAV_KEYWORDS = [
  { path: '/products',  rx: /\b(product|catalog|catalogue|sourcing)\b/i },
  { path: '/contact',   rx: /\b(contact|reach (you|cellzen)|get in touch|inquir|quote)\b/i },
  { path: '/privacy',   rx: /\b(privacy|data collect|personal information)\b/i },
  { path: '/terms',     rx: /\b(terms (and|&) conditions|terms of (use|service)|refund policy|shipping policy)\b/i },
  { path: '/tracking',  rx: /\b(tracking page|order tracking)\b/i },
  { path: '/portfolio', rx: /\b(portfolio|past work|case stud)\b/i },
  { path: '/notices',   rx: /\b(news|notice|announcement)\b/i },
];

// Topical knowledge questions that should NEVER get a nav link.
const NO_NAV_RX = /\b(hs.?code|hs ?code|harmoni[sz]ed system|tariff|customs? dut(y|ies)|import dut(y|ies)|export dut(y|ies)|excise|vat( rate)?|tax( rate)?|classification|incoterms?|fob|cif|exw|how (much|many).{0,30}(duty|tax|cost|charge|vat))\b/i;

const detectNavPath = (msg) => {
  const text = String(msg || '');
  // Hard veto for HS / tariff / duty knowledge questions
  if (NO_NAV_RX.test(text)) return null;

  // (B) "List-ish" phrases — strong intent to see all of X
  for (const path in NAV_LIST_RX) {
    if (NAV_LIST_RX[path].test(text)) return path;
  }

  // (A) Explicit navigation verb + topic keyword
  if (!NAV_INTENT_RX.test(text)) return null;
  for (const { path, rx } of NAV_KEYWORDS) {
    if (rx.test(text)) return path;
  }
  return null;
};

// Strip [NAV:/path] tags the LLM hallucinated when the user didn't actually
// ask for navigation. Used to scrub the buffered response if our detector
// said no NAV but the model added one anyway.
const stripStrayNav = (text, allowedPath) => {
  if (allowedPath) return text;
  return String(text || '').replace(/\s*\[NAV:[^\]]*\]\s*/gi, ' ').replace(/\s+$/, '');
};

const identifyUser = async (req) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!User) return null;
    const user = await User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
    return user || null;
  } catch {
    return null;
  }
};

router.get('/health', (req, res) => {
  res.json({
    success: true,
    configured: Boolean(process.env.GROQ_API_KEY),
    provider: 'groq',
    model: MANAS_MODEL,
  });
});

router.post('/chat', async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      return res.status(503).json({
        success: false,
        message: 'MANAS is not configured. Please set GROQ_API_KEY in the server environment.',
      });
    }

    const { message, history = [], sessionId, verify } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ success: false, message: 'Message is too long (max 4000 characters)' });
    }

    const user = await identifyUser(req);

    // Verification — invoice lookup needs the invoice number PLUS any one
    // contact identifier (name OR email OR phone). Combine form data with
    // anything the user typed across recent chat turns.
    let verifiedCustomer = null;
    let matchedInvoice = null;
    let lookupFailure = null;
    if (!user) {
      // Only run verification when:
      //   (a) the verify form was used this turn (explicit user intent), OR
      //   (b) the current message looks invoice-related, OR
      //   (c) the previous assistant turn asked for verification info
      // Without this guard, a one-word reply like "Continue" or "thanks" would
      // re-fire the lookup using stale hints from much earlier turns and
      // produce false "didn't match" failures.
      const formProvidedNow = !!(verify?.invoiceNumber || verify?.email || verify?.phone || verify?.name);
      const verifyContext = formProvidedNow || isVerifyIntent(message, history);

      if (verifyContext) {
        const hints = extractVerifyHints(history, message);
        // Form data takes priority but we merge in extracted hints to fill gaps.
        const merged = {
          invoiceNumber: verify?.invoiceNumber || hints.invoiceNumber,
          name:          verify?.name          || hints.name,
          email:         verify?.email         || hints.email,
          phone:         verify?.phone         || hints.phone,
        };

        const hasContact = !!(merged.name || merged.email || merged.phone);

        // Path 1: invoice lookup (needs invoice # + ANY of name/email/phone)
        if (merged.invoiceNumber && hasContact) {
          matchedInvoice = await findInvoiceByNameAndNumber(merged);
          if (!matchedInvoice) {
            const numberOnly = await findInvoiceByNumberOnly(merged.invoiceNumber);
            if (numberOnly) {
              lookupFailure = {
                kind: 'wrong-contact',
                invoiceNumber: merged.invoiceNumber,
                providedName:  merged.name  || null,
                providedEmail: merged.email || null,
                providedPhone: merged.phone || null,
              };
            } else {
              lookupFailure = {
                kind: 'no-such-invoice',
                invoiceNumber: merged.invoiceNumber,
              };
            }
          }
        } else if (merged.invoiceNumber && !hasContact) {
          // Invoice number given but no contact field — incomplete
          lookupFailure = { kind: 'incomplete' };
        }

        // Path 2: legacy customer profile lookup (no invoice # specified)
        if (!matchedInvoice && !lookupFailure && merged.name && (merged.email || merged.phone)) {
          verifiedCustomer = await findCustomerByContact(merged);
        }
      }
    }

    const context = await buildContext({ message, user, verifiedCustomer, matchedInvoice, lookupFailure });

    const safeHistory = (Array.isArray(history) ? history : [])
      .slice(-6)
      .filter(m => m && typeof m.content === 'string' && m.content.length > 0)
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    // Force the reply language deterministically — small models drift otherwise.
    const replyLang = detectReplyLang(message, safeHistory);
    const langDirective = replyLang === 'nepali'
      ? 'IMPORTANT — REPLY ENTIRELY IN NEPALI DEVANAGARI (नेपाली देवनागरी). Do NOT use English or Romanized Nepali in your answer.'
      : 'IMPORTANT — REPLY ENTIRELY IN ENGLISH. Do NOT switch to Nepali, Hindi, or any other language.';

    // Detect navigation-relevant topic up front (used both as an AI hint and as
    // a server-side enforcement step after the stream completes).
    const detectedNavPath = detectNavPath(message);
    const navHint = detectedNavPath
      ? `\nNote: this question relates to ${detectedNavPath} — append [NAV:${detectedNavPath}] at the very end of your reply.`
      : '';

    const userTurn = context
      ? `${langDirective}${navHint}\n\nContext for this question:\n\n${context}\n\n---\n\nUser's question: ${message}`
      : `${langDirective}${navHint}\n\nUser's question: ${message}`;

    // OpenAI/Groq style messages: system → history → current user turn
    const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...safeHistory,
      { role: 'user', content: userTurn },
    ];

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    // Tell the frontend whether a NAV link is authorized for this turn.
    res.setHeader('X-Manas-Nav', detectedNavPath || 'none');
    // If we matched an invoice, mint a server-signed JWT token that proves
    // verification. The download endpoint trusts this token instead of
    // re-checking name/email — much more reliable since contact fields might
    // be stored in invoice_data JSONB rather than the indexed columns.
    if (matchedInvoice?.invoice_number) {
      res.setHeader('X-Manas-Invoice', matchedInvoice.invoice_number);
      const downloadToken = jwt.sign(
        {
          purpose: 'manas-invoice-download',
          inv: matchedInvoice.invoice_number,
          sid: sessionId || null,
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.setHeader('X-Manas-Invoice-Token', downloadToken);
    }
    res.setHeader('Access-Control-Expose-Headers', 'X-Manas-Nav, X-Manas-Invoice, X-Manas-Invoice-Token');

    // Retry the initial Groq connection on transient local network errors
    // (ENOBUFS / ECONNRESET / ETIMEDOUT — common when Cloudflare WARP / VPN
    // is squeezing socket buffers). Stream itself can't be retried mid-flow.
    const TRANSIENT_NET_CODES = new Set(['ENOBUFS', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH']);
    const isTransientNetErr = (err) => {
      const code = err?.cause?.code || err?.code || '';
      return TRANSIENT_NET_CODES.has(code);
    };

    let stream;
    let attempts = 0;
    const maxAttempts = 3;
    while (true) {
      try {
        stream = await client.chat.completions.create({
          model: MANAS_MODEL,
          messages,
          temperature: 0.6,
          max_tokens: 1500,
          top_p: 0.9,
          stream: true,
        });
        break;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts || !isTransientNetErr(err)) throw err;
        log.warn(`[MANAS] Transient net error (attempt ${attempts}/${maxAttempts}):`, err?.cause?.code || err?.message);
        await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempts - 1)));
      }
    }

    let fullResponse = '';
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content || '';
      if (text) {
        fullResponse += text;
        res.write(text);
      }
    }
    // Server-side NAV enforcement: if the AI didn't include [NAV:/path]
    // but the user's question topically calls for a page link, append it.
    if (detectedNavPath && !/\[NAV:/i.test(fullResponse)) {
      const tag = ` [NAV:${detectedNavPath}]`;
      res.write(tag);
      fullResponse += tag;
    }
    res.end();

    if (ManasConversation && sessionId) {
      // Persist nav link + matched invoice + verified customer name on the
      // assistant turn so the download / nav buttons can be re-rendered later
      // (after panel close/open or full page refresh).
      const assistantMsg = {
        role: 'assistant',
        content: fullResponse,
        ts: new Date().toISOString(),
      };
      if (detectedNavPath) assistantMsg.navPath = detectedNavPath;
      if (matchedInvoice?.invoice_number) {
        assistantMsg.matchedInvoice = matchedInvoice.invoice_number;
        // Mint a long-lived (90-day) signed token so even if the page is
        // refreshed and the message is reloaded from DB history, the buttons
        // can still authorize the download without re-verification.
        assistantMsg.invoiceToken = jwt.sign(
          {
            purpose: 'manas-invoice-download',
            inv: matchedInvoice.invoice_number,
            sid: sessionId || null,
          },
          JWT_SECRET,
          { expiresIn: '90d' }
        );
      }

      const newMessages = [
        ...(Array.isArray(history) ? history : []),
        { role: 'user', content: message, ts: new Date().toISOString() },
        assistantMsg,
      ].slice(-50);

      ManasConversation.upsert({
        session_id: String(sessionId),
        user_id: user?.id || null,
        user_role: user?.role || null,
        verified_customer_id: verifiedCustomer?.id || null,
        messages: newMessages,
      }).catch(err => log.warn('[MANAS] Persist failed (non-fatal):', err.message));
    }
  } catch (error) {
    // Log full error in dev; just message in prod (avoid leaking stack traces in logs).
    if (IS_PROD) log.error('[MANAS] Chat error:', error?.message || error);
    else log.error('[MANAS] Chat error:', error);
    if (!res.headersSent) {
      const status = error?.status;
      const isQuota = status === 429 || /quota|rate limit|too many requests/i.test(error?.message || '');
      const code = error?.cause?.code || error?.code || '';
      const isNetwork = ['ENOBUFS', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(code);

      let friendly;
      if (isQuota) {
        // Try to extract reset time from headers / error body
        const retryAfterHeader = error?.headers?.['retry-after']
          || error?.response?.headers?.get?.('retry-after');
        const bodyMsg = String(error?.error?.error?.message || error?.message || '');
        const secondsMatch = bodyMsg.match(/in\s+([\d.]+)\s*(s|seconds?|m|minutes?|h|hours?)/i)
          || (retryAfterHeader && [null, retryAfterHeader, 's']);
        let resetText = 'shortly';
        if (secondsMatch) {
          const num = parseFloat(secondsMatch[1]);
          const unit = (secondsMatch[2] || 's').toLowerCase();
          let secs = num;
          if (unit.startsWith('m')) secs = num * 60;
          else if (unit.startsWith('h')) secs = num * 3600;
          if (secs < 90) resetText = `in about ${Math.ceil(secs)} second${Math.ceil(secs) === 1 ? '' : 's'}`;
          else if (secs < 3600) resetText = `in about ${Math.ceil(secs / 60)} minute${Math.ceil(secs / 60) === 1 ? '' : 's'}`;
          else resetText = `in about ${Math.ceil(secs / 3600)} hour${Math.ceil(secs / 3600) === 1 ? '' : 's'}`;
        }
        friendly = `My free token quota is finished for now. The limit will reset ${resetText}. Please try again then, or contact us via the Contact page for urgent help.`;
      } else if (isNetwork) {
        friendly = 'I had trouble reaching the network. Please check your internet connection and try again in a moment.';
      } else {
        friendly = 'MANAS is temporarily unavailable. Please try again in a moment.';
      }
      return res.status(isQuota ? 429 : 500).json({ success: false, message: friendly });
    }
    try { res.end(); } catch (_) { /* socket already closed */ }
  }
});

// Fetch a single invoice's full data — used by the frontend's PDF download
// buttons. Access control accepts EITHER:
//   1. A signed download token issued during a successful verification (preferred)
//   2. Invoice number + any one of name/email/phone matching the row (fallback)
router.get('/invoice/:invoiceNumber', async (req, res) => {
  try {
    if (!Invoice) {
      return res.status(503).json({ success: false, message: 'Invoice service not configured' });
    }
    const invoiceNumber = String(req.params.invoiceNumber || '').trim();
    if (!invoiceNumber) {
      return res.status(400).json({ success: false, message: 'invoiceNumber is required' });
    }

    // Path 1: Signed token (most reliable — proves a prior successful verification)
    const token = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload?.purpose === 'manas-invoice-download'
            && String(payload?.inv || '').toUpperCase() === invoiceNumber.toUpperCase()) {
          const inv = await Invoice.findOne({
            where: { invoice_number: { [Op.iLike]: invoiceNumber } },
          });
          if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
          return res.json({ success: true, invoice: inv.toJSON() });
        }
      } catch (_) {
        // Token invalid/expired — fall through to contact-match path
      }
    }

    // Path 2: Contact matching (legacy fallback)
    const name  = String(req.query.name  || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();
    const phone = String(req.query.phone || '').trim();
    if (!name && !email && !phone) {
      return res.status(400).json({ success: false, message: 'A valid token, or one of name/email/phone, is required' });
    }
    const orConditions = [];
    if (name)  orConditions.push({ customer_name:  { [Op.iLike]: `%${name}%` } });
    if (email) orConditions.push({ customer_email: { [Op.iLike]: email } });
    const inv = await Invoice.findOne({
      where: {
        invoice_number: { [Op.iLike]: invoiceNumber },
        ...(orConditions.length > 0 ? { [Op.or]: orConditions } : {}),
      },
    });
    if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found or contact does not match' });
    return res.json({ success: true, invoice: inv.toJSON() });
  } catch (err) {
    log.warn('[MANAS] Invoice fetch failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not load invoice' });
  }
});

router.get('/history/:sessionId', async (req, res) => {
  // Always return success with empty messages on any failure — history is a
  // nice-to-have and should never break the chat UX.
  try {
    if (!ManasConversation) return res.json({ success: true, messages: [] });
    const conv = await ManasConversation.findOne({ where: { session_id: req.params.sessionId } });
    res.json({ success: true, messages: conv?.messages || [] });
  } catch (error) {
    log.warn('[MANAS] History fetch failed (returning empty):', error?.message);
    res.json({ success: true, messages: [] });
  }
});

module.exports = router;
