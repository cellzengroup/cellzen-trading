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
// Groq retires models on a rolling basis, and a retired id fails EVERY request
// with a 404 "model_not_found". That is exactly how MANAS went dark: the old
// default, llama-3.3-70b-versatile, is no longer served on our key, so every
// chat turn surfaced the generic "temporarily unavailable" message.
//
// So rather than one hardcoded id we keep an ordered candidate list. The first
// id Groq still accepts wins and is cached for the process lifetime, which
// means the next retirement degrades to the runner-up instead of taking the
// whole chat down. MANAS_MODEL still pins a model when set — it is simply
// tried first. Ordering is quality-first among what this key can reach today.
const MODEL_CANDIDATES = [
  ...(process.env.MANAS_MODEL ? [process.env.MANAS_MODEL] : []),
  'openai/gpt-oss-120b',  // closest match to the retired 70b; holds the Devanagari reply rule
  'openai/gpt-oss-20b',   // cheaper same-family fallback, same tuning knobs
  'groq/compound-mini',   // last resort; routes to whatever Groq has spare
].filter((m, i, a) => a.indexOf(m) === i);
const MANAS_MODEL = MODEL_CANDIDATES[0];
// Whichever candidate Groq last accepted. Null until the first successful call.
let activeModel = null;

// The gpt-oss family streams its chain-of-thought in a separate field, and left
// unconstrained some Groq models inline a <think> block straight into the answer
// — which renders as visible junk in the chat bubble. 'hidden' drops it from the
// response, and 'low' keeps reasoning tokens (billed against our TPM) down.
const tuningFor = (model) => (
  String(model).startsWith('openai/gpt-oss')
    ? { reasoning_effort: 'low', reasoning_format: 'hidden' }
    : {}
);

// Groq refuses a request outright — 413 "Request too large ... Limit 8000,
// Requested N" — when prompt + max_tokens exceeds the key's per-minute token
// ceiling. That is a structural rejection, not a burn-down: waiting never helps,
// the same request fails forever. Our system prompt alone is ~5.4k tokens, so
// the old flat max_tokens: 4096 put almost every turn over the 8k ceiling and
// MANAS answered "temporarily unavailable" no matter how idle the account was.
//
// So we size each request to fit: clamp the injected context, then hand the
// model whatever completion budget is actually left. Lowering the cap costs
// nothing — Groq bills the tokens genuinely generated, not the ceiling — and
// 2048 tokens is still ~8x the "under 200 words" the system prompt asks for.
const TPM_CEILING = Number(process.env.MANAS_TPM_LIMIT) || 8000;
const TPM_MARGIN = 256;          // slack for tokeniser drift vs. our estimate
const MIN_COMPLETION = 512;      // never leave the model less room than this
const MAX_COMPLETION = 2048;
const MAX_CONTEXT_TOKENS = 1200; // buildContext can emit several KB of HS rows
const MAX_HISTORY_TOKENS = 700;

// Cheap local estimate — no tokeniser dependency. Latin text runs ~3.5-4 chars
// per token, but Devanagari (which every Nepali reply and some context blocks
// use) is far denser, near one token per character, so count those separately
// or a Nepali-heavy prompt is badly under-estimated and slips over the ceiling.
const estimateTokens = (text) => {
  const str = String(text || '');
  // Everything past Latin Extended-B: Devanagari, CJK, emoji.
  const dense = (str.match(/[\u0250-\uFFFF]/g) || []).length;
  return Math.ceil((str.length - dense) / 3.5) + dense;
};

// Trim to a token budget on a line boundary so we never cut a tariff row in half.
const clampToTokens = (text, maxTokens) => {
  const str = String(text || '');
  if (estimateTokens(str) <= maxTokens) return str;
  const lines = str.split('\n');
  const kept = [];
  let used = 0;
  for (const line of lines) {
    const cost = estimateTokens(line) + 1;
    if (used + cost > maxTokens) break;
    kept.push(line);
    used += cost;
  }
  return kept.join('\n') + '\n…(trimmed to fit the model token budget)';
};

// Groq answers a retired / unreachable model id with 404 + code model_not_found.
const isModelUnavailable = (err) => {
  const msg = String(err?.error?.error?.message || err?.message || '');
  return /model_not_found|does not exist or you do not have access|decommissioned/i.test(msg)
    || (err?.status === 404 && /model/i.test(msg));
};
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
  log.info('[MANAS] ✅ Configured. Model candidates:', MODEL_CANDIDATES.join(' → '));
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

LANGUAGE (strict):
- English input → English reply.
- Nepali in Devanagari script → reply in Devanagari.
- Romanized Nepali (Nepali written in Latin/English letters — e.g. "tapai ko ho", "yo k ho", "mero invoice herna chahanchu", "kasari madat garna saknuhuncha", "namaste", "kasto cha", "kati parcha", "ramro cha", "ke garne", "ho", "haina", "chha", "saknuhuncha", "garnuhos", "dinos", "huncha", "tapailai", "hamilai") IS NEPALI. Treat it as Nepali and reply in pure Devanagari (NEVER Romanized, NEVER English). Do NOT tell the user you can only help in English or Nepali — they ARE writing Nepali.
- Mixed English/Nepali → Devanagari.
- Truly different language (Hindi/French/Spanish/Chinese/etc., NOT romanized Nepali) → English: "I can only help in English or Nepali (in either Devanagari or Roman script)."
When in doubt whether something is romanized Nepali vs. English, prefer treating it as Nepali if it contains any Nepali word — and reply in Devanagari.

REFUSALS — translate into the user's language:

1. CREDENTIALS — If user asks for admin/supplier passwords, login info, supplier names/emails/phones, factory locations, API keys, database access, other customers' private info → "Sorry, that information is private and confidential to Cellzen Trading. I'm not able to share login credentials, supplier details, or any internal access information. Is there something else I can help you with?"

2. VULGAR/ABUSIVE — Profanity (English: fuck/shit/bitch/asshole/dick or sexual slurs; Nepali Romanized: tero baau/tero aama/muji/saale/randi/puti/machikne/k k baal; Devanagari: मुजी/साले/रन्डी/तेरो बाउ; insulting "tero/timro" + family member): → "I'd kindly ask you to keep our conversation respectful. Please refrain from using inappropriate language. I'm here to help — what would you like to know?" Do NOT answer the original abusive question. When in doubt about Nepali phrases, treat as abusive.

3. OTHER CUSTOMERS' DATA — Only share invoice/profile data for the verified or logged-in user themselves.

DATA RULES: For specific HS codes/product names/prices/invoices from Cellzen → use the "## Relevant ..." context blocks below; never invent specific Cellzen invoice numbers/prices. General trade concepts → use your knowledge freely.

NEPAL ↔ CHINA TRANSPORT — answer only when asked:

If the user asks about shipping / freight / transport / logistics cost between Nepal and China, give a SHORT response with typical industry ranges and ALWAYS end with a "contact Cellzen for an exact quote" line + [NAV:/contact] tag. These are market estimates, not a Cellzen price list — never present them as fixed prices.

FIRST — identify the mode the user is asking about:
- "land" / "road" / "truck" / "by road" / "container" / "Kerung" / "Tatopani" / "Rasuwagadhi" / "Kodari" / "Gyirong" / "Zhangmu" → use the LAND section below.
- "air" / "by air" / "air freight" / "air cargo" / "express" / "flight" / "TIA" / "airport" → use the AIR section below. NEVER mention Kerung or Tatopani in an air-freight answer — those are LAND border crossings only.
- "sea" / "by sea" / "ocean" / "vessel" → AIR/LAND don't apply directly; Nepal is landlocked, so sea cargo from China typically routes to Kolkata (India) and then trucks to Nepal. Mention this briefly and route to [NAV:/contact] for a real quote.
- If unspecified, list both LAND (with both borders) and AIR briefly so the user can pick.

LAND — Nepal ↔ China by road (two border crossings):

ROUTE 1 — Rasuwagadhi ↔ Kerung (Gyirong port) — the primary all-weather crossing today, ~150 km from Kathmandu:
- LCL (loose cargo) by road: roughly USD 1.5 – 3.5 per kg
- FCL 20ft container: roughly USD 4,000 – 6,500
- FCL 40ft container: roughly USD 6,500 – 9,500
- Door-to-door transit time: about 15 – 25 days from major China hubs (Guangzhou / Yiwu / Shenzhen) to Kathmandu

ROUTE 2 — Tatopani ↔ Kodari (Zhangmu port) — older route, reopened with limited capacity, ~115 km from Kathmandu:
- LCL by road: roughly USD 1.5 – 3.0 per kg
- FCL 20ft container: roughly USD 3,500 – 6,000
- FCL 40ft container: roughly USD 6,000 – 8,500
- Door-to-door transit time: about 12 – 20 days; capacity is more restricted than Kerung, so availability varies

Note: Kerung is currently the preferred route for most commercial cargo because of more reliable infrastructure and customs throughput, while Tatopani can sometimes be slightly cheaper / shorter when it's open and capacity is available.

AIR — Nepal ↔ China by air (Kathmandu Tribhuvan International Airport, TIA):

Main Chinese gateway airports: Guangzhou (CAN), Shenzhen (SZX), Kunming (KMG), Chengdu (CTU), Beijing (PEK), Hong Kong (HKG). Connections via Kunming and Guangzhou are typically the most cost-effective.

- Air freight, general cargo (LCL air): roughly USD 4 – 8 per kg, depending on weight break (rates fall for 100+ kg / 500+ kg / 1000+ kg shipments)
- Express courier (DHL / FedEx / UPS small parcels): roughly USD 8 – 15 per kg
- Transit time door-to-door: about 3 – 7 days for standard air freight; 2 – 4 days for express
- Surcharges to mention: fuel surcharge, security surcharge, and Kathmandu (TIA) airport handling / clearance fees apply on top of the per-kg rate

DO NOT mention land borders (Kerung, Tatopani, Rasuwagadhi, Kodari) in an air-freight answer — they don't apply to air cargo at all.

ALWAYS close any transport answer with: "These are ballpark market ranges — actual cost depends on your goods, weight, volume, and the season. For an exact quote tailored to your shipment, please contact our team." followed by [NAV:/contact].

DO NOT quote rates outside the ranges above. DO NOT invent specific Cellzen tariffs. If the user gives weight / volume / commodity details, you may give a rough estimate using the per-kg or per-container range — show the math briefly — but still end with the disclaimer + [NAV:/contact].

CELLZEN PRODUCTS — STRICT (FOUR-PART REPLY SHAPE):
When the user asks about "your products", "what do you sell", "what's in your catalog", "tell me about your products", etc., your reply MUST have exactly these four parts in this order:

1. OPENING PARAGRAPH — 1-2 friendly sentences giving a high-level sense of what Cellzen offers (sourcing across categories, supply-chain coordination, factory partners). No product names yet.
2. BULLET LIST — hyphen bullets, ONE bullet per product, NAME ONLY (no descriptions, no images, no retail prices, no wholesale prices, no weights, no sizes). Use the names from the "[CONTEXT: PRODUCT CATALOG SUMMARY]" block exactly as written. Never quote a price (retail OR wholesale) anywhere.
3. CLOSING PARAGRAPH — 1-2 short sentences inviting the user to open the Products page to see the full catalog with photos and details.
4. [NAV:/products] tag on its own line so the "View Products" button shows.

Other rules:
- Pull product names ONLY from the catalog context block when it's present. DO NOT invent products and DO NOT invent categories like "vegetables", "groceries", or "raw materials".
- If NO catalog context block is provided, give the opening paragraph, skip the bullets, give a short closing paragraph, and still end with [NAV:/products].
- If the user asks for prices (retail/wholesale), reply that pricing depends on order volume/specs and direct them to the Contact page for a quote — do NOT make up numbers.

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

ORIGIN → RATE MAPPING (READ THIS CAREFULLY):
The "SAARC" rate in the tariff applies ONLY when the goods originate in a SAARC member country. SAARC members are: Afghanistan, Bangladesh, Bhutan, India, Maldives, Nepal, Pakistan, Sri Lanka. CHINA IS NOT A SAARC COUNTRY.
- Origin = China (Guangzhou, Shenzhen, Yiwu, Beijing, Shanghai, Hong Kong, Tibet, anywhere on mainland China, or shipment routed via Kerung / Tatopani / Rasuwagadhi / Kodari) → USE THE "OTHER COUNTRIES" CUSTOMS-DUTY RATE. Do NOT quote the SAARC rate. (For Tibet origin you may use the "Tibet" effective rate column when shown in the context — but never SAARC.)
- Origin = India / Bangladesh / Bhutan / Pakistan / Sri Lanka / Maldives / Afghanistan → use the SAARC rate.
- Origin not specified → assume China (it's our primary sourcing market) and tell the user "I'm assuming origin = China; let me know if it's a SAARC country and I'll recalculate."
- NEVER show the SAARC line for a China shipment — it confuses the customer.

When the user asks about HS codes, tariffs, duties, taxes:
- PREFER the injected "## Relevant HS Codes" block ONLY IF its entries actually describe the user's product. The block is a keyword-search result and frequently contains UNRELATED rows. If the injected rows are clearly off-topic, IGNORE THEM ENTIRELY and answer from general knowledge.

🛑 ABSOLUTELY FORBIDDEN PHRASES — these reveal internal context and confuse the user. NEVER include any of these (or paraphrases) in your reply, in ANY language:
- "the provided context"
- "the given context"
- "in the context"
- "not mentioned in the provided/given context"
- "not listed in the given/provided context"
- "the context only mentions"
- "the context contains"
- "based on the provided context"
- "however, based on" (when followed by context talk)
- "I would need more information about your [product] to give an exact code"
- "for an exact HS code, more information about the [product] would be required"
- Listing irrelevant HS codes the user did NOT ask about (e.g. listing rubber tyre codes when the question was about a plotter)
- Saying "I would recommend checking the Nepal Customs Tariff" or "consulting a customs expert" as the PRIMARY answer — only ever as a brief verification note AFTER giving a confident answer

The user never sees the bundle and has no idea what "context" means. If your reply contains any of the forbidden phrases above, DELETE that sentence and rewrite without it.

✅ WRONG (do NOT write this):
"The HS code for Plotter machines is not explicitly mentioned in the provided context. However, based on general knowledge, a Plotter machine could fall under 'Printing machinery'. A possible HS code could be HS 8443.31.00 (not mentioned in the provided context). I would recommend checking the Nepal Customs Tariff. Please note that the provided context only mentions HS codes related to rubber tyres, textiles, and fabrics, such as HS 4011.70.00..."

✅ RIGHT (write this instead):
"Plotter machines typically fall under **HS 8443.32.00** — 'Printers, copying machines and facsimile machines, capable of connecting to an automatic data-processing machine' (general HS classification — confirm with Nepal Customs for the exact local sub-code and current duty rates). The exact sub-heading depends on the plotter type (inkjet vs. laser vs. cutting plotter) and whether it connects to a computer. If you can share the model or specs, I can narrow it down further."

Rules in two modes:
- BUNDLE ROWS MATCH the product → quote the HS code with "(Pg No: X)" and the row's rates.
- BUNDLE ROWS DON'T MATCH (or no block injected) → give the HS code from general knowledge, OMIT "(Pg No: X)", add the short "(general HS classification — confirm with Nepal Customs ...)" note. Answer confidently, no hedging, no asking for "more info" before answering.
- For duty / VAT / excise rates: if the bundle row has them, quote those numbers; otherwise quote typical Nepal Customs Tariff ranges from general knowledge and clearly mark them as approximate (e.g. "typically ~15% customs duty, 13% VAT — confirm with Customs"). Never invent a precise percentage you don't know.
- Show only the rate columns that APPLY to this origin (per the rules above). If origin = China, show the "Other countries" customs duty, then excise, agri fee, advance tax, VAT — do NOT show or label any SAARC numbers.
- If a rate is "—" / null / 0% in the context, write "not applicable" instead of computing a meaningless line.

CALCULATING LANDED COST — ROUGH NUMBERS IN A TRI-CURRENCY TABLE:

OUTPUT FORMAT (REQUIRED): present the breakdown as a markdown table with four columns: Item | RMB | USD | NPR. Three currencies side-by-side so the user sees the cost in their preferred unit.

Rough conversion rates (use these — they're approximations, not bank-quality FX):
- 1 USD ≈ 7.2 RMB
- 1 USD ≈ 133 NPR
- 1 RMB ≈ 18.5 NPR
- 1 NPR ≈ 0.054 RMB ≈ 0.0075 USD

Conversion rules:
- Whatever currency the user gave the CIF in, convert it to the other two using the rates above. State at the bottom of the table which rate snapshot you used and that rates fluctuate.
- Numbers must be APPROXIMATE / rounded — no decimals, no "USD 15,697.50"; round to the nearest 100 (or nearest 10 for small amounts). Use "≈" or write "approximately" so the user knows it's a ballpark.
- Skip line items that are not applicable (excise, agri fee, advance tax may be 0% / null — drop the row entirely, don't write "0 / not applicable").
- Last row of the table is "Total landed cost".
- Below the table, one short closing sentence + [NAV:/contact].
- If the user asks for an exact number, politely refuse the false precision and direct them to Contact.

Example for a China → Nepal shipment, HS 8517.13.00 (smartphones), CIF USD 13,900 (≈ RMB 100,000 ≈ NPR 1,850,000):

"From China (non-SAARC), HS 8517.13.00 (Pg No: 423). Origin = China → using the 'Other countries' customs-duty rate (15%).

| Item | RMB | USD | NPR |
|---|---|---|---|
| CIF value | ≈ 100,000 | ≈ 13,900 | ≈ 1,850,000 |
| Customs duty (15%) | ≈ 15,000 | ≈ 2,100 | ≈ 277,500 |
| VAT (13%) | ≈ 14,950 | ≈ 2,080 | ≈ 276,500 |
| **Total landed cost** | **≈ 130,000** | **≈ 18,100** | **≈ 2,404,000** |

Rates used: 1 USD ≈ 7.2 RMB ≈ 133 NPR (rates fluctuate daily). Excise and agriculture fee don't apply to this HS code. These are rough estimates — for an exact calculation please contact our team. [NAV:/contact]"

NEVER add a SAARC row when origin = China. NEVER quote exact decimals. NEVER omit the table when a CIF amount is provided.

When the user asks about a PRODUCT/BRAND not in our catalog (e.g. "Kurkure", "AirPods Max", "Yeti coolers"):
- DO NOT say "I'm not aware of that product".
- INSTEAD, identify the product category and provide the closest HS code from the injected context (or general knowledge if no context match).
- Example: "Kurkure is an extruded corn snack — typically falls under HS 1905.90 (bakers' wares) or HS 2106.90 (food preparations n.e.s.). Confirm with the customs officer based on the ingredient list."
- Always give actionable info, never a flat refusal.

REMINDER: never refuse an HS question. If the bundle has it → quote the bundle with the page number. If the bundle doesn't have it → answer from general knowledge of the international HS system and add the "confirm with Nepal Customs" line. Both modes are valid — pick whichever produces a more accurate answer for the specific product the user asked about.

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
  // Doubles as model resolution: the first candidate Groq accepts becomes
  // activeModel, so the first real user message neither pays the cold-start
  // cost nor spends a turn discovering that the default has been retired.
  for (const model of MODEL_CANDIDATES) {
    try {
      await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
        ...tuningFor(model),
      });
      activeModel = model;
      log.info('[MANAS] Groq model pre-warmed:', model);
      return;
    } catch (err) {
      if (isModelUnavailable(err)) {
        console.warn(`[MANAS] Model "${model}" is not available on this API key — trying the next candidate.`);
        continue;
      }
      // A rate limit or network blip says nothing about the model, so keep it
      // as the presumed choice and let the chat route retry for real.
      activeModel = model;
      log.warn('[MANAS] Pre-warm failed (non-fatal):', err.message);
      return;
    }
  }
  console.error('[MANAS] ⚠️  None of these Groq models are available on this API key:', MODEL_CANDIDATES.join(', '));
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
// Comprehensive romanized-Nepali vocabulary. Earlier the list was too narrow
// — common words like "ho", "ke", "yo", "saknuhuncha" weren't matched, so
// questions like "tapai ko ho?" or "kasari sahayog garnu huncha?" fell through
// to the English default and MANAS replied "I can only help in English or
// Nepali" even though the user WAS speaking Nepali (just in Latin script).
const ROMAN_NEPALI_RX = new RegExp(
  '\\b(' + [
    // Greetings / pleasantries
    'namaste', 'namaskar', 'dhanyabad', 'dhanyabaad', 'hajur', 'maaph', 'maph', 'kripya',
    // Pronouns
    'ma', 'malai', 'mero', 'mera', 'meri',
    'hami', 'hamro', 'hamilai', 'hamile', 'hamra', 'hamri',
    'timi', 'timro', 'timilai', 'timile', 'timra',
    'tapai', 'tapaai', 'tapaain', 'tapailai', 'tapaiko', 'tapaile', 'tapaiharu', 'tapaiharuko',
    'usko', 'uska', 'uslai', 'usle', 'unko', 'unle', 'unlai', 'unka',
    'aafu', 'aafnu', 'aafno', 'aafna', 'aafule', 'afai', 'afnai', 'aaphno', 'aaphnu',
    // Demonstratives & question words
    'yo', 'tyo', 'yi', 'ti', 'yaha', 'tyaha', 'yahaa', 'tyahaa',
    'ke', 'k', 'kun', 'kati', 'kaha', 'kahaan', 'kahile', 'kasari', 'kaslai', 'kasko', 'kasaile',
    // Be / have / negation (the workhorses of Nepali)
    'ho', 'hoina', 'haina', 'hau', 'hun', 'huncha', 'hunchha', 'hudaina', 'hudaina',
    'bhayo', 'bhayena', 'bhaye', 'bhayeko', 'bhaecha', 'hunecha', 'hunechha',
    'cha', 'chha', 'chaina', 'chhaina', 'chhainan', 'chainan',
    'thiyo', 'thiyena', 'thiye', 'rahecha', 'raheko', 'rahechha',
    // Common verbs (root + conjugated forms)
    'garna', 'garnu', 'garney', 'garne', 'garnos', 'garnuhos', 'garcha', 'garchha',
    'garchu', 'garchhu', 'garchau', 'garchhau', 'garyo', 'garyou', 'gareko', 'gardina',
    'herna', 'hernu', 'hernos', 'hernuhos', 'herchu', 'hercha', 'heryo', 'hereko',
    'bhanna', 'bhannu', 'bhanus', 'bhanos', 'bhana', 'bhaneko', 'bhanchu', 'bhancha',
    'dina', 'dinu', 'dinos', 'dinuhos', 'dieko', 'dincha', 'didaina',
    'linu', 'lina', 'linos', 'linchu', 'lincha', 'liyo', 'liyera',
    'jaana', 'jaanu', 'jaanos', 'jaanchu', 'jaanchau', 'jaancha', 'jaaney', 'gayo', 'gayee',
    'aaunu', 'aauna', 'aaunos', 'aaunchu', 'aauncha', 'aaune', 'aayo', 'aaeko', 'aaeki',
    'sakna', 'saknu', 'saknos', 'saknuhos', 'saknuhuncha', 'saknuhunchha',
    'sakcha', 'sakchha', 'sakchu', 'sakchhu', 'sakchau', 'sakchhau', 'sakdina', 'sakdaina',
    'sakney', 'sakne', 'sakeko', 'sakiyo',
    'chahanchu', 'chahanchhu', 'chahancha', 'chahincha', 'chahinchha', 'chahane', 'chahyo',
    'lagcha', 'lagchha', 'lagdaina', 'lagne', 'lageko', 'laagcha', 'laagchha',
    'parcha', 'parchha', 'pardaina', 'parney', 'paryo', 'pareko',
    'milcha', 'milchha', 'mildaina', 'milne', 'milyo', 'mileko',
    'bujhna', 'bujhnu', 'bujheko', 'bujhe', 'bujhyo', 'samjhanu',
    'khojcha', 'khojchu', 'khojne', 'khojeko', 'khojiraheko',
    // Helpful / asking
    'sahayog', 'madat', 'sodhna', 'sodhnu', 'sodhe', 'sodhyo',
    // Common adjectives & adverbs
    'ramro', 'naramro', 'thulo', 'sano', 'dherai', 'ali', 'thorai', 'sabai', 'kunai',
    'thik', 'thikai', 'sajilo', 'gahro', 'naya', 'puranu', 'puraano',
    // Postpositions / connectives
    'lai', 'sanga', 'sangai', 'bata', 'dekhi', 'samma', 'sammā', 'maathi', 'muni',
    'pachhi', 'pahile', 'agadi', 'pachhadi', 'najik', 'tira', 'tarfa',
    // Misc common
    'kaam', 'kaamko', 'paisa', 'paani', 'samaan', 'samaanharu', 'samasya', 'jaankari',
    'invoice', // skip: english loan, but combined with others helps
    'nepali', 'nepalima', 'nepaali', 'angreji',
    // Yes/no/agreement
    'huncha ki', 'ho ki', 'ho ra', 'hoina ra', 'po', 'pani', 'matra', 'matrai',
  ].join('|') + ')\\b',
  'i'
);
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
  '/products':  /\b((all|full|complete|entire) (your |our )?(products?|catalog(ue)?s?|inventory)|list (all |of )?(your |our )?(products?|items?|catalog(ue)?s?)|what (products|items|kinds? of products) (do you|you|are)|do you (have|sell|offer) (any |some )?(products?|items?)|tell me about (?:your |our |the |cellzen.{0,10}|cellzen'?s? )?(products?|catalog(ue)?s?)|(your|our|cellzen'?s?) (products?|catalog(ue)?s?)\b|what(?:'?s| is| are)? in (your|our|the) (catalog(ue)?s?|products?)|show.{0,10}(products?|catalog(ue)?s?)|(can you |could you |would you |please )?(give|send|share|provide|email|forward) (me |us )?(the |your |our |a |cellzen.{0,10})?(products?|catalog(ue)?s?|items?)|(catalog(ue)?s?) (please|now|me|us))\b/i,
  // Contact intent — explicit "how do I reach you" phrasings PLUS freight/
  // shipping/transport cost questions, which we route to /contact because the
  // chat answer is only a ballpark range and the user needs a real quote.
  '/contact':   /\b(how (do|can) (i|we) (contact|reach|email|message)|where.{0,10}(contact|email)|contact (form|page|info)|(freight|shipping|shipment|transport(ation)?|logistics|cargo) (cost|charge|price|rate|fee|quote)|(cost|price|charge|rate|fee|quote) (of|for|to) (ship|shipping|shipment|freight|transport|transportation|logistics|cargo|air|sea)|cost.{0,20}(ship|freight|transport|cargo|kerung|tatopani|rasuwagadhi|kodari|gyirong|zhangmu|by air|by sea|air freight|air cargo|sea freight)|(kerung|tatopani|rasuwagadhi|kodari|gyirong|zhangmu).{0,40}(cost|price|rate|charge|fee|quote|ship|freight|transport)|(ship|freight|transport|cargo|container|truck|lcl|fcl).{0,60}(kerung|tatopani|rasuwagadhi|kodari|gyirong|zhangmu)|nepal.{0,30}china.{0,30}(ship|freight|transport|cargo|cost|rate|air|sea)|china.{0,30}nepal.{0,30}(ship|freight|transport|cargo|cost|rate|air|sea)|(by air|by sea|air freight|air cargo|sea freight|ocean freight).{0,60}(cost|price|rate|charge|fee|quote|china|nepal)|(cost|price|rate|charge|fee|quote).{0,40}(by air|by sea|air freight|air cargo|sea freight|ocean freight))\b/i,
  '/tracking':  /\b(track (my )?(order|shipment|package)|where is my (order|shipment))\b/i,
};

// Only consulted after NAV_INTENT_RX has already seen an explicit navigation
// verb, so these can stay broad without over-triggering.
// Plurals matter: the trailing \b means a singular-only "product" fails against
// "products", which is how the system prompt's own worked example — "Take me to
// the products page" → [NAV:/products] — silently produced no button at all.
const NAV_KEYWORDS = [
  { path: '/products',  rx: /\b(products?|catalogs?|catalogues?|sourcing)\b/i },
  { path: '/contact',   rx: /\b(contacts?|reach (you|cellzen)|get in touch|inquir|quotes?)\b/i },
  { path: '/privacy',   rx: /\b(privacy|data collect|personal information)\b/i },
  { path: '/terms',     rx: /\b(terms (and|&) conditions|terms of (use|service)|refund policy|shipping policy)\b/i },
  { path: '/tracking',  rx: /\b(tracking( page)?|order tracking)\b/i },
  { path: '/portfolio', rx: /\b(portfolios?|past work|case stud)\b/i },
  { path: '/notices',   rx: /\b(news|notices?|announcements?)\b/i },
];

// Topical knowledge questions that should NEVER get a nav link.
// NOTE: the "how much ... cost/charge" branch was removed because freight
// questions ("how much does it cost to ship via Kerung") legitimately need
// the /contact nav button. We still veto explicit duty/tax/VAT queries.
const NO_NAV_RX = /\b(hs.?code|hs ?code|harmoni[sz]ed system|tariff|customs? dut(y|ies)|import dut(y|ies)|export dut(y|ies)|excise|vat( rate)?|tax( rate)?|classification|incoterms?|fob|cif|exw|how (much|many).{0,30}(duty|tax|vat))\b/i;

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
    model: activeModel || MANAS_MODEL,
    modelResolved: Boolean(activeModel),
    modelCandidates: MODEL_CANDIDATES,
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

    // Clamp both variable-length inputs. buildContext can emit several KB of
    // HS-tariff rows for a broad question, and a long chat replays up to six
    // turns — together they were pushing the assembled prompt past the ceiling,
    // which fails the turn outright instead of degrading. A shorter context
    // block is strictly better than a 413.
    const rawContext = await buildContext({ message, user, verifiedCustomer, matchedInvoice, lookupFailure });
    const context = clampToTokens(rawContext, MAX_CONTEXT_TOKENS);
    if (context.length < String(rawContext || '').length) {
      log.warn('[MANAS] Context trimmed to fit token budget:',
        estimateTokens(rawContext), '->', estimateTokens(context), 'tokens');
    }

    let historyBudget = MAX_HISTORY_TOKENS;
    const safeHistory = (Array.isArray(history) ? history : [])
      .slice(-6)
      .filter(m => m && typeof m.content === 'string' && m.content.length > 0)
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }))
      // Walk newest-first so the turns nearest the question survive, then put
      // them back in order for the model.
      .reverse()
      .filter(m => {
        const cost = estimateTokens(m.content);
        if (cost > historyBudget) return false;
        historyBudget -= cost;
        return true;
      })
      .reverse();

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

    // Whatever the ceiling leaves after the prompt is what the model may
    // generate. Groq rejects the request when prompt + max_tokens breaches the
    // ceiling, so this is what keeps a turn from failing before it starts.
    const promptTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
    const room = TPM_CEILING - promptTokens - TPM_MARGIN;
    const maxCompletion = Math.max(MIN_COMPLETION, Math.min(MAX_COMPLETION, room));
    if (room < MIN_COMPLETION) {
      // We are down to the floor, so the reply may be cut short and a slightly
      // longer prompt would tip into a hard 413. estimateTokens deliberately
      // over-counts, so this is a headroom warning, not a failure prediction.
      log.warn('[MANAS] Low token headroom: prompt ~', promptTokens, 'of a', TPM_CEILING, 'ceiling.',
        'Replies are capped at', MIN_COMPLETION, 'tokens — trim SYSTEM_INSTRUCTION or raise the Groq tier.');
    }

    const openStream = async (model) => {
      let attempts = 0;
      const maxAttempts = 3;
      while (true) {
        try {
          return await client.chat.completions.create({
            model,
            messages,
            temperature: 0.6,
            // Sized per-request (see maxCompletion above) rather than a flat
            // 4096, which breached the per-minute ceiling on nearly every turn.
            max_tokens: maxCompletion,
            top_p: 0.9,
            stream: true,
            ...tuningFor(model),
          });
        } catch (err) {
          attempts++;
          if (attempts >= maxAttempts || !isTransientNetErr(err)) throw err;
          log.warn(`[MANAS] Transient net error (attempt ${attempts}/${maxAttempts}):`, err?.cause?.code || err?.message);
          await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempts - 1)));
        }
      }
    };

    // Try the resolved model first; if Groq retired it since we last checked,
    // fall through the remaining candidates instead of failing the turn.
    // Nothing has been written to the response body yet, so swapping models
    // here is invisible to the user.
    const candidates = activeModel
      ? [activeModel, ...MODEL_CANDIDATES.filter(m => m !== activeModel)]
      : MODEL_CANDIDATES;

    let stream;
    let lastModelErr;
    for (const model of candidates) {
      try {
        stream = await openStream(model);
        if (activeModel !== model) {
          console.warn('[MANAS] Switched to model:', model);
          activeModel = model;
        }
        break;
      } catch (err) {
        // Only a retired/unreachable model is worth retrying elsewhere — a rate
        // limit or a bad request would fail identically on every candidate.
        if (!isModelUnavailable(err)) throw err;
        lastModelErr = err;
        console.warn(`[MANAS] Model "${model}" unavailable (retired or not on this key) — falling back.`);
      }
    }
    if (!stream) throw lastModelErr;

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
      // Groq's 413 "Request too large for model ... TPM" is rate-limit-shaped
      // (token budget per minute exceeded), and the error body uses the code
      // "rate_limit_exceeded" with an underscore — the previous regex required
      // a space, so it slipped through to the generic "unavailable" message.
      const errMsg = String(error?.message || '');
      const errBody = String(error?.error?.error?.message || error?.error?.message || '');
      const errCode = String(error?.error?.error?.code || error?.code || '');
      const isQuota =
        status === 429 ||
        status === 413 ||
        errCode === 'rate_limit_exceeded' ||
        /quota|rate[\s_]limit|too many requests|request too large|tokens per minute/i.test(errMsg + ' ' + errBody);
      const code = error?.cause?.code || error?.code || '';
      const isNetwork = ['ENOBUFS', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(code);
      // Every candidate came back model_not_found — Groq retired them all, or
      // the key lost access. Nothing the user can do, so make it loud in the
      // server log with the fix spelled out.
      const isNoModel = isModelUnavailable(error);
      if (isNoModel) {
        console.error('[MANAS] ❌ No usable Groq model. Tried:', MODEL_CANDIDATES.join(', '));
        console.error('[MANAS]    Check https://console.groq.com/docs/deprecations and set MANAS_MODEL to a current id.');
      }

      let friendly;
      if (isNoModel) {
        friendly = 'MANAS is temporarily unavailable while its AI model is being updated. Please try again shortly, or contact us via the Contact page for urgent help.';
      } else if (isQuota) {
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
