// Resolves the packing list's Product Name column from gtradea's raw 1688
// listing titles.
//
// Those titles are messy, machine-translated, keyword-stuffed marketing text.
// A wrong or garbled name here is a customs problem (mis-declared goods can
// mean fines, delays, or seizure), and the offline heuristic in
// routes/supplierOrders.js is a last resort, not a plan.
//
// Resolution order per row — first usable answer wins:
//
//   1. product_name_cache, source='manual' — a human's correction. Never
//      overwritten, never re-asked. This is how a name that a model keeps
//      getting wrong gets fixed permanently.
//   2. product_name_cache, source='llm' — already resolved on an earlier
//      export. Makes repeat exports free, instant, and identical.
//   3. Groq, one batched chat call per chunk of titles. Written back to (2).
//   4. Local GLiNER — strictly opt-in via PACKING_NER_ENABLED. See
//      productNameNer.js.
//   5. null — the caller falls back to its own heuristic. Never leave a
//      customs-facing field blank because a name lookup failed.
//
// ---------------------------------------------------------------------------
// WHY THE MODEL IS DISCOVERED AND NOT JUST NAMED
//
// This file used to hard-code `llama-3.3-70b-versatile`. Groq retired it. Every
// chunk then came back 404 model_not_found, extractProductNames returned all
// nulls, and the export quietly fell through to the heuristic — which shipped
// packing lists reading "Milk teas" for a blender, "And sizeses" for a
// miniskirt, "Pack suitables" for vacuum dust bags and "Be storeds" for a
// laptop bag. Nothing broke loudly; the sheet just went out wrong.
//
// So: the model is chosen at runtime from GET /v1/models intersected with
// PREFERRED_MODELS, and a model that 404s mid-run is struck off and the chunk
// retried on the next candidate. A provider retiring a model is now a log line
// and a different model, not a silently mis-declared consignment. And when
// every candidate fails, that is a console.error naming the reason, because the
// operator needs to know the column they are about to send to a broker was
// produced by the fallback.
//
// PRIVACY: step 3 sends 1688 *listing titles* (public supplier catalogue text —
// no customer, pricing, or shipment data) to Groq's API. Set
// PACKING_LLM_ENABLED=false to keep everything on-box.
const crypto = require('crypto');
const Groq = require('groq-sdk');
const nlp = require('compromise');
const { extractProductNames: extractWithNer } = require('./productNameNer');

// Best first. Measured on 60 real titles out of this catalogue plus the 16 that
// were reported wrong: gpt-oss-120b was the only one that both kept the
// listing's own head noun and never emitted a bare one-word name ("Cards",
// "Battery", "Doll" — too vague to declare). qwen3.8-27b is ~4x faster and a
// close second, so it is the first fallback; gpt-oss-20b is noticeably terser
// and is here only to keep the column populated at all.
const PREFERRED_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
// An explicit override still wins — but it is tried as a *candidate*, ahead of
// the preferred list, not as the only option. Pinning a single name is what
// broke this the first time.
const MODEL_OVERRIDE = process.env.PACKING_LLM_MODEL || '';
// On by default when a key exists — the whole point is that production gets
// good names without extra setup. Explicit 'false' opts out.
const LLM_ENABLED = String(process.env.PACKING_LLM_ENABLED || 'true').toLowerCase() !== 'false'
  && !!process.env.GROQ_API_KEY;
const NER_ENABLED = String(process.env.PACKING_NER_ENABLED || '').toLowerCase() === 'true';
// Titles per request. Small enough to stay well inside the context window and
// to keep one bad chunk from costing every row its name.
const CHUNK_SIZE = Number(process.env.PACKING_LLM_CHUNK || 20);
// Chunks in flight at once. Two, not three: this key is on Groq's on-demand
// tier at 8000 tokens per minute, and a chunk of 20 of these titles costs
// ~3200 — so three at once guarantees a 429 on the third. See the retry budget
// below for what happens when one is hit anyway.
const CHUNK_CONCURRENCY = Number(process.env.PACKING_LLM_CONCURRENCY || 2);
// How long a single call may take before it is abandoned.
const LLM_ATTEMPT_TIMEOUT_MS = Number(process.env.PACKING_LLM_TIMEOUT_MS || 25000);
// How long extractProductNames may spend WAITING OUT rate limits, in total,
// across all chunks. An export is a live HTTP request behind a proxy timeout,
// so it takes the short budget and lets the heuristic cover whatever is left.
// scripts/refresh-product-names.js passes { patient: true } and waits properly,
// which is the intended way to resolve a whole catalogue: warm the cache once,
// off the critical path, and every later export is served from the table.
const RETRY_BUDGET_MS = Number(process.env.PACKING_LLM_RETRY_BUDGET_MS || 20000);
const PATIENT_RETRY_BUDGET_MS = 15 * 60 * 1000;
// Set false to resolve names without writing them back (the refresh script's
// --dry-run).
let persistEnabled = true;

// Strip (Color: ...) / [silver] spec tags — noise for name extraction.
const stripSpecTags = (title) => String(title || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const titleHash = (cleanTitle) => crypto
  .createHash('sha256')
  .update(String(cleanTitle).toLowerCase())
  .digest('hex');

// Every rule here was written against a name this column actually got wrong.
// Rules 1-3 are the three ways the old output failed: it named the use-case
// instead of the goods ("Milk teas" for a blender), it swapped in a synonym the
// listing never used ("Water Bottle" for a water cup), and it grabbed a stray
// keyword out of a stuffed title ("Audio Guitar" for a charging transmitter).
// The worked examples are deliberately generic rather than lifted from this
// catalogue — they have to teach the rule, not memorise 361 products.
const PROMPT = `You name goods for a customs packing list. Each input is a raw, machine-translated 1688 (Chinese wholesale) listing title: keyword-stuffed marketing text.

Summarise the title into the shortest name that still says what the goods ARE. TWO words is the target. Three when two would be unclear. One ONLY when that single word is unmistakable on its own ("Miniskirt", "Scrunchie", "Blender", "Slippers"). Four is a failure unless the goods genuinely have a four-word name.

Think: what would someone call this if they were pointing at it in a shop?

MEANINGFUL BEATS SHORT. A name that could be almost anything has failed, however short it is. Never return a bare category noun: "Locator", "Car", "Battery", "Cushion", "Device", "Bag", "Case", "Machine", "Ribbon" say nothing about what is in the box. Qualify them with a word FROM THE TITLE - "Itag Locator", "Toy Car", "Phone Battery", "Backrest Pillow".

Take the qualifier from what the goods ARE, not from one use the seller lists. A tracker whose title mentions luggage, keys, wallets and pets is not a "Pet Locator" - the pet is one thing you could clip it to.

IF THE TITLE ALREADY CONTAINS A SHORT EVERYDAY NAME FOR THE SAME OBJECT, USE THAT. Sellers pad a name and then repeat it plainly later in the title: "High-Power Nail Phototherapy Lamp X5Plus Nail Lamp Smart Sensor" is a "Nail Lamp". Take the plain one.

When the title repeats one noun several times, that noun is almost always the goods - build the name on it.

Hard rules:
1. Name the goods in the box - never the thing they attach to, fit, hold, or are used with. A bag FOR a vacuum cleaner is a Dust Bag. A machine that MAKES a drink is a machine, not the drink.
2. Use the listing's OWN everyday head noun. Do not substitute a synonym: if it says "water cup", write "Water Cup", not "Water Bottle"; if it says "coat", do not write "jacket".
3. DELETE the material unless the name is meaningless without it. "Ceramic Table Lamp" -> "Table Lamp". "Stainless Steel Water Cup" -> "Water Cup". "Pure Cotton Boxer Briefs" -> "Boxer Briefs". Keep it only where the bare noun would be too vague to identify anything ("Silicone Mold" stays, because "Mold" alone is nothing).
4. DELETE decorative and redundant modifiers: Inner, Outer, Protective, Multifunctional, Portable, Magnetic, Thickened, Pleated, Dustproof, High-Power, Pure, Small, Large, Mini, Extra, New, Smart, Professional, Premium, Luxury, High-End. "Laptop Inner Bag" -> "Laptop Bag". "Dustproof Filter Paper Box" -> "Filter Paper Box".
5. DELETE brand, shop and platform names (Apple, Xiaomi, Amazon, Aliexpress, Cross-Border), colours, sizes, capacities, piece counts, model codes, years, seasons, and audience phrases (for Women, for Boys, Household).
6. KEEP a noun that defines the TYPE of product, even though it makes the name two words: "Water Cup" not "Cup"; "Table Lamp" not "Lamp"; "Dust Bag" not "Bag"; "Boxer Briefs" not "Briefs"; "Laptop Bag" not "Bag". This is the one thing you must not shorten away.
7. KEEP a word that changes what the goods ARE: Electric, Rechargeable, Insulated, Folding, Inflatable. Declaring "Toothbrush" for an electric one is a wrong declaration, not a short one.
8. Title Case. English. A real noun phrase naming a physical object. Never a fragment: never "Suitable", "And Sizes", "Be Stored", "Storage", "Applicable".

Worked examples (generic, not from this catalogue):
"Hot Sale Cross-Border Silicone Protective Sleeve for Airpods Pro Wireless Earphone Anti-Drop Cover Wholesale" -> "Earphone Case"
"Commercial Household Automatic Soybean Milk Machine Multifunctional Grinder for Soy Milk Rice Paste Breakfast Shop" -> "Soy Milk Machine"
"Factory Direct Replacement HEPA Filter Element 4 Pack Applicable to Xiaomi Air Purifier 2S 3H Pro" -> "HEPA Filter"
"2025 New Korean Style Sweet Girl Heart High-End Plaid Pleated Short Skirt All Colours and Sizes In Stock" -> "Short Skirt"
"316 Stainless Steel Thickened Premium Insulated Vacuum Travel Thermos Water Cup for Students 500ml" -> "Water Cup"

Respond with JSON only, exactly: {"names": ["name for 1", "name for 2", ...]}
The array MUST have exactly one entry per input, in the same order.`;

let cachedClient = null;
const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!process.env.GROQ_API_KEY) return null;
  // maxRetries: 0 — the SDK's own retries happen *inside* one withTimeout()
  // call, so a rate-limited request burned the whole attempt budget sleeping
  // and then reported a timeout rather than the 429 that caused it. Retrying
  // is handled below, where the wait is measured against a budget and the real
  // reason survives into the logs.
  cachedClient = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0 });
  return cachedClient;
};

// Exports repeat the same titles constantly, so an in-process cache saves even
// the database round trip within one export. The durable cache is the table.
const CACHE_MAX = 2000;
const nameCache = new Map();
const cacheGet = (k) => nameCache.get(k);
const cacheSet = (k, v) => {
  if (nameCache.size >= CACHE_MAX) {
    // Cheapest sane eviction: drop the oldest insertion (Map preserves order).
    nameCache.delete(nameCache.keys().next().value);
  }
  nameCache.set(k, v);
};

// Warn once per DISTINCT message, not once per process. The old single-shot
// flag meant the first warning permanently muted every later one — so "model
// not found" hid "out of quota" hid "timed out", and an operator reading the
// logs saw one stale line explaining none of it.
const warned = new Set();
const warnOnce = (msg) => {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[productNames] ${msg}`);
};

const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  promise.then(
    (v) => { clearTimeout(timer); resolve(v); },
    (e) => { clearTimeout(timer); reject(e); }
  );
});

// --------------------------------------------------------------- MODEL CHOICE

// Candidates that have proved unusable this process (404, decommissioned, no
// entitlement). Struck off so the remaining chunks do not each re-discover it.
const deadModels = new Set();
let modelListPromise = null;

// The ids the key can actually call. A failure here is not fatal: we fall back
// to trying the preferred list blind, which is no worse than the old behaviour.
async function listAvailableModels(client) {
  if (!modelListPromise) {
    modelListPromise = withTimeout(client.models.list(), 10000, 'Groq model list')
      .then((res) => new Set((res?.data || []).map((m) => m.id)))
      .catch((e) => {
        warnOnce(`could not list Groq models (${e.message}); trying the preferred list blind.`);
        return null;
      });
  }
  return modelListPromise;
}

// Ordered candidates: the explicit override first, then the preferred list,
// minus anything already known dead. Filtered against the live catalogue when
// we have one, so a retired id is skipped before it costs a request.
async function candidateModels(client) {
  const available = await listAvailableModels(client);
  const ordered = [MODEL_OVERRIDE, ...PREFERRED_MODELS].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const id of ordered) {
    if (seen.has(id) || deadModels.has(id)) continue;
    seen.add(id);
    if (available && !available.has(id)) {
      warnOnce(`model ${id} is not available to this Groq key — skipping it.`);
      continue;
    }
    out.push(id);
  }
  return out;
}

// A 404 / decommissioned / unentitled model is permanent for this process, so
// strike it off and move to the next candidate. Anything else (rate limit,
// timeout, a malformed response) is transient or model-independent — retrying
// it on a different model would just burn quota.
// A shared, best-effort clock for how much longer this run may sleep waiting
// out rate limits. Shared across chunks on purpose: the limit is per-key and
// per-minute, so four chunks each waiting their own 60s is four minutes of an
// export hanging for one minute's worth of quota.
function makeRetryBudget(totalMs) {
  let remaining = totalMs;
  return {
    /** @returns {boolean} true if the caller may sleep for `ms` */
    async spend(ms) {
      if (ms > remaining) return false;
      remaining -= ms;
      await new Promise((r) => setTimeout(r, ms));
      return true;
    },
    get left() { return remaining; },
  };
}

const isRateLimited = (err) => {
  const status = err?.status || err?.response?.status;
  return status === 429 || `${err?.message || ''}`.toLowerCase().includes('rate_limit');
};

// Groq says exactly how long to wait, in a retry-after header and again in the
// message ("Please try again in 11.1075s"). Honour it: guessing with plain
// exponential backoff either wastes quota-time or hammers the limit again.
const retryAfterMs = (err) => {
  const header = err?.headers?.['retry-after'] || err?.response?.headers?.get?.('retry-after');
  const headerSec = Number(header);
  if (Number.isFinite(headerSec) && headerSec > 0) return Math.ceil(headerSec * 1000) + 250;
  const m = /try again in ([\d.]+)\s*s/i.exec(err?.message || '');
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 250;
  return 5000;
};

const isModelGone = (err) => {
  const status = err?.status || err?.response?.status;
  const text = `${err?.message || ''}`.toLowerCase();
  return status === 404
    || text.includes('model_not_found')
    || text.includes('does not exist')
    || text.includes('decommissioned')
    || text.includes('has been deprecated');
};

// ------------------------------------------------------------------ VALIDATION

// Reject anything that is clearly not a product name, so a bad model response
// degrades to the heuristic instead of printing junk on a customs document.
// Both lists are drawn from names this column actually produced.
const BAD_EXACT = new Set([
  'suitable', 'applicable', 'protection', 'protective', 'portable', 'universal',
  'professional', 'multifunctional', 'multi', 'storage', 'stored', 'accessories',
  'accessory', 'material', 'wholesale', 'product', 'goods', 'item', 'set', 'pack',
  'new', 'hot', 'high', 'and', 'the', 'for', 'n/a', 'na', 'none', 'unknown',
]);
// A name may not begin or end on a word that cannot carry a noun phrase — this
// is what "And Sizes", "Be Stored" and "Pack Suitable" all have in common.
//
// The two lists differ, and the difference is load-bearing: "can" opens a verb
// phrase ("Can Be Stored") but closes a perfectly good noun phrase — "Tinplate
// Tea Can" is a real product in this catalogue, and a single shared list threw
// it away. Same reasoning in reverse for the participles, which only ever end
// the fragments we are trying to catch.
const LEADING_STOPWORD = /^(and|or|the|a|an|for|with|in|of|to|on|by|be|is|are|can|suitable|applicable)$/i;
const TRAILING_STOPWORD = /^(and|or|the|a|an|for|with|in|of|to|on|by|be|is|are|suitable|applicable|stored|used|needed|included)$/i;

// ------------------------------------------------------------------ TIGHTENING

// The prompt asks for two words, and mostly gets them. This is the part that
// does not depend on the model being in a good mood: a deterministic strip of
// the qualifiers that make a name long without making it clearer. It runs on
// model output only — a manually pinned name is left exactly as the person
// typed it.
//
// Materials go first because they are the commonest padding in these listings
// ("316 Stainless Steel Thickened..." opens a third of the drinkware).
const MATERIAL_PREFIX = [
  'stainless steel', 'pure cotton', 'cotton-linen', 'cotton linen', 'merino wool',
  'all-copper', 'carbon steel', 'tempered glass', 'food grade', 'stainless',
  'steel', 'ceramic', 'porcelain', 'plastic', 'silicone', 'silicon', 'cotton',
  'wool', 'wooden', 'wood', 'glass', 'metal', 'leather', 'bamboo', 'rubber',
  'aluminum', 'aluminium', 'alloy', 'pu', 'pvc', 'abs', 'acrylic', 'nylon',
  'linen', 'velvet', 'satin', 'tinplate', 'copper', 'brass', 'iron', 'titanium',
  'resin', 'canvas', 'latex', 'eva', 'suede',
  // NOT 'denim': "Denim Jacket" is the garment's everyday name, and stripping
  // it left a bare "Jacket" that says less than the listing did. A material is
  // only padding when the product is the same product without it.
];
// Adjectives that describe how nice the thing is, not what it is. Deliberately
// does NOT include words that change what the goods ARE — "Electric",
// "Rechargeable", "Insulated", "Folding", "Inflatable" all stay, because a
// customs broker reading "Toothbrush" where the box holds an electric one has
// been told the wrong thing.
const DECOR_PREFIX = [
  'inner', 'outer', 'protective', 'multifunctional', 'multi-functional', 'multi',
  'portable', 'magnetic', 'thickened', 'pleated', 'dustproof', 'dust-proof',
  'high-power', 'high-end', 'high-quality', 'pure', 'small', 'large', 'mini',
  'extra', 'new', 'smart', 'professional', 'premium', 'luxury', 'upgraded',
  'fashion', 'fashionable', 'simple', 'cute', 'lovely', 'nordic', 'korean',
  'japanese', 'european', 'american', 'creative', 'commercial-grade',
  'commercial', 'household', 'trendy', 'hot-selling', 'anti-slip', 'non-slip',
];
// Head nouns too generic to stand alone. "Bag" names nothing; "Laptop Bag"
// does. A modifier is only stripped when what survives is either two words or
// a single word NOT on this list — which is what keeps "Inner Bag" from
// collapsing to "Bag" while "Small Blender" still collapses to "Blender".
const GENERIC_HEAD = new Set([
  'bag', 'box', 'case', 'cup', 'pot', 'jar', 'can', 'lamp', 'light', 'mold',
  'mould', 'holder', 'stand', 'rack', 'shelf', 'cover', 'clip', 'band', 'strap',
  'set', 'kit', 'pad', 'mat', 'ring', 'tape', 'paper', 'board', 'tool', 'machine',
  'device', 'toy', 'doll', 'bottle', 'brush', 'pen', 'cable', 'charger', 'stick',
  'sleeve', 'cushion', 'pillow', 'sheet', 'film', 'net', 'rope', 'belt', 'chain',
]);

const stripOnePrefix = (words, list) => {
  for (const prefix of list) {
    const parts = prefix.split(' ');
    if (parts.length > words.length - 1) continue; // never strip everything
    const head = words.slice(0, parts.length).map((w) => w.toLowerCase()).join(' ');
    if (head !== prefix) continue;
    const rest = words.slice(parts.length);
    // Allowed if two or more words survive, or the single survivor names
    // something specific on its own.
    if (rest.length >= 2 || !GENERIC_HEAD.has(rest[0].toLowerCase())) return rest;
  }
  return null;
};

function tightenName(value) {
  let words = String(value == null ? '' : value).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return value;
  // Loop: "Pure Cotton Thickened Boxer Briefs" needs two passes.
  for (let i = 0; i < 4; i++) {
    const next = stripOnePrefix(words, MATERIAL_PREFIX) || stripOnePrefix(words, DECOR_PREFIX);
    if (!next) break;
    words = next;
  }
  return words.join(' ');
}

const sanitize = (value) => {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!s || s.length < 3 || s.length > 60) return null;
  if (!/[a-z]/i.test(s)) return null; // must contain letters, not just digits
  const words = s.split(' ');
  if (words.length > 6) return null;
  if (BAD_EXACT.has(s.toLowerCase())) return null;
  if (LEADING_STOPWORD.test(words[0]) || TRAILING_STOPWORD.test(words[words.length - 1])) return null;
  return s;
};

// ------------------------------------------------------------------ VALIDATION
// (the real gate — sanitize above is only the cheap shape check)

// Nouns that name a container or a category rather than a product. Alone on a
// customs form they say nothing: "Locator" does not distinguish a pet tag from
// a GPS tracker, "Car" could be a vehicle or a die-cast toy, "Cushion" could be
// anything stuffed. Each MUST carry the word that says what kind.
//
// This is the guard against the opposite failure from the one we started with:
// pushing for two-word names produced 30 one-word ones, and some of those
// ("Locator", "Car", "Battery", "Headboard Cushion" losing its "Pillow") were
// as useless as the mangled plurals they replaced. Short is the goal; vague
// never was.
const VAGUE_ALONE = new Set([
  ...GENERIC_HEAD,
  'locator', 'tracker', 'battery', 'car', 'sink', 'stove', 'blush', 'ribbon',
  'equipment', 'accessory', 'accessories', 'component', 'part', 'parts',
  'container', 'organizer', 'organiser', 'dispenser', 'appliance', 'gadget',
  'fabric', 'cloth', 'material', 'frame', 'panel', 'sheet', 'plate', 'block',
  // Machine translation renders 套装 as "suit", which reads as clothing; and a
  // bare cosmetics category ("Foundation") could be make-up or a building part.
  'suit', 'foundation', 'jacket', 'coat', 'ball', 'shirt', 'pants', 'bar',
  'lamp', 'bulb', 'mould', 'cushion', 'pillow', 'bag', 'case', 'cover',
]);

const tokenSet = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
// Cheap morphological variants, so "Cases" in the title grounds "Case" in the
// name and vice versa. Deliberately not a stemmer: over-stemming produced
// false matches ("cases" -> "cas") that made the check useless.
const wordVariants = (b) => {
  const o = new Set([b]);
  if (b.endsWith('ies')) o.add(`${b.slice(0, -3)}y`);
  if (b.endsWith('es')) o.add(b.slice(0, -2));
  if (b.endsWith('s')) o.add(b.slice(0, -1));
  if (b.endsWith('y')) o.add(`${b.slice(0, -1)}ies`);
  o.add(`${b}s`);
  o.add(`${b}es`);
  return o;
};

// Is every content word of the name actually present in the listing title?
// This is what stops a model quietly renaming goods to a near-synonym — the
// "Water Cup" listing coming out as "Water Bottle" is the exact complaint this
// column started with, and no amount of prompt wording reliably prevents it.
function ungroundedWords(name, title) {
  const T = tokenSet(title);
  return [...tokenSet(name)].filter((w) => w.length > 2 && ![...wordVariants(w)].some((v) => T.has(v)));
}

// compromise earns its place here: a name has to END on a noun. Models
// occasionally return a trailing adjective or participle ("Anti-Lost",
// "Insulated") that reads like a name but declares nothing.
function endsOnNoun(name) {
  const terms = nlp(name).json()[0]?.terms || [];
  const last = terms[terms.length - 1];
  if (!last) return false;
  // Unknown proper-ish words (brand-like, e.g. "Airtag") tag as neither; treat
  // an unrecognised capitalised token as a noun rather than rejecting it.
  return last.tags.includes('Noun') || last.tags.includes('ProperNoun')
    || (!last.tags.includes('Adjective') && !last.tags.includes('Verb'));
}

/**
 * @returns {{ok: true, value: string} | {ok: false, hard: boolean, reason: string}}
 *   `hard` failures are dropped if a repair pass cannot fix them; soft ones
 *   (a wording mismatch) are accepted afterwards, because a slightly-off name
 *   still beats the offline heuristic.
 */
function validateName(raw, title) {
  const value = sanitize(tightenName(raw));
  if (!value) return { ok: false, hard: true, reason: 'not a usable product name' };
  const words = value.split(' ');
  if (words.length > 4) return { ok: false, hard: true, reason: 'longer than 4 words' };
  if (words.length === 1 && VAGUE_ALONE.has(words[0].toLowerCase())) {
    return {
      ok: false,
      hard: true,
      reason: `"${value}" alone does not say what the goods are — keep the word that identifies the kind (e.g. "Pet Locator", "Toy Car", "Backrest Pillow")`,
    };
  }
  // A lone "Anti-Lost" / "Non-Slip" / "Multi-Functional" is a modifier that has
  // lost its noun. compromise cannot rule on these — an unknown hyphenated
  // token tags as nothing, and endsOnNoun deliberately gives unknown tokens the
  // benefit of the doubt so brand-ish names like "Airtag" survive.
  if (words.length === 1 && /^(anti|non|multi|semi|ultra|super|pre|re|self|all)-/i.test(words[0])) {
    return { ok: false, hard: true, reason: `"${value}" is a modifier, not a product — say what the ${value.toLowerCase()} thing IS` };
  }
  // Machine-translation tails. 1688 renders 套装 ("set", "kit") as "suit", so
  // an Xbox controller battery kit arrived as "Battery Suit" — which reads as
  // clothing on a customs form. The listing's English is not always English.
  if (/^(suit|suits|sets?|type|series|style|model)$/i.test(words[words.length - 1]) && words.length <= 2) {
    return {
      ok: false,
      hard: true,
      reason: `"${value}" ends on a mistranslated filler word — 1688 renders 套装 as "suit"; name the goods themselves (e.g. "Battery Pack", not "Battery Suit")`,
    };
  }
  if (!endsOnNoun(value)) {
    return { ok: false, hard: true, reason: `"${value}" does not end on a noun — a name must name a thing` };
  }
  const missing = ungroundedWords(value, title);
  if (missing.length) {
    return {
      ok: false,
      hard: false,
      reason: `${missing.map((w) => `"${w}"`).join(', ')} ${missing.length > 1 ? 'do' : 'does'} not appear in the listing title — use the listing's own wording`,
    };
  }
  return { ok: true, value };
}

// ------------------------------------------------------------- DURABLE CACHE

// Every function here is best-effort. The packing list must still export if the
// cache table is missing, unreachable, or read-only — it is an optimisation and
// a correction channel, never a dependency.
function getModel() {
  try {
    return require('../models').ProductNameCache || null;
  } catch {
    return null;
  }
}

/** @returns {Promise<Map<string, {name: string, source: string}>>} by title hash */
async function loadCached(hashes) {
  const model = getModel();
  const found = new Map();
  if (!model || !hashes.length) return found;
  try {
    const rows = await model.findAll({
      where: { title_hash: hashes },
      attributes: ['title_hash', 'name', 'source'],
      raw: true,
    });
    rows.forEach((r) => found.set(r.title_hash, { name: r.name, source: r.source }));
  } catch (e) {
    warnOnce(`product_name_cache unreadable (${e.message}) — names will be recomputed this export.`);
  }
  return found;
}

// Written with updateOnDuplicate so two exports running at once cannot collide,
// and so a re-run after a model swap refreshes the row in place. `source` is in
// the update list but a manual row never reaches here: resolveNames filters
// those out before the model is ever asked.
async function saveResolved(rows) {
  const model = getModel();
  if (!model || !rows.length || !persistEnabled) return;
  try {
    await model.bulkCreate(rows, {
      updateOnDuplicate: ['title', 'name', 'source', 'model', 'updatedAt'],
    });
  } catch (e) {
    warnOnce(`could not write product_name_cache (${e.message}) — names resolved but not persisted.`);
  }
}

// ------------------------------------------------------------------ LLM CALLS

// One Groq call for one chunk, walking the candidate models until one answers,
// and waiting out rate limits within the run's shared budget. Returns an array
// aligned to `titles`, entries either a clean name or null, plus the model that
// produced them.
async function nameChunkWithLlm(client, titles, budget) {
  const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const candidates = await candidateModels(client);
  if (!candidates.length) throw new Error('no usable Groq chat model available');

  let lastErr;
  for (const model of candidates) {
    if (deadModels.has(model)) continue;
    // Attempts against THIS model. A 429 is not the model's fault, so it does
    // not count as a reason to move on — it counts as a reason to wait.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await withTimeout(client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: numbered },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
          max_tokens: 4096,
        }), LLM_ATTEMPT_TIMEOUT_MS, `Groq product-name call (${model})`);

        const raw = res?.choices?.[0]?.message?.content || '';
        let names;
        try {
          names = JSON.parse(raw)?.names;
        } catch {
          throw new Error('model returned non-JSON');
        }
        if (!Array.isArray(names) || names.length !== titles.length) {
          // A length mismatch means the rows cannot be trusted to line up, and
          // a misaligned name is worse than no name on a customs document.
          throw new Error(`expected ${titles.length} names, got ${Array.isArray(names) ? names.length : typeof names}`);
        }
        return { names, model };
      } catch (e) {
        lastErr = e;
        if (isModelGone(e)) {
          deadModels.add(model);
          warnOnce(`Groq model ${model} is gone (${e.message.slice(0, 120)}) — falling back to the next candidate.`);
          break; // next model
        }
        if (isRateLimited(e)) {
          const wait = retryAfterMs(e);
          if (await budget.spend(wait)) continue; // waited; try the same model again
          warnOnce(`Groq rate limit hit and the retry budget is spent (needed ${Math.round(wait / 1000)}s more).`);
          break; // out of patience — try another model, which has its own limit
        }
        if (attempt < 3) continue; // transient: a timeout or a malformed reply
        break;
      }
    }
  }
  throw lastErr || new Error('every Groq model candidate failed');
}

// Second look at the names that failed validation. Cheap (only the rejects go
// back, usually a handful) and it fixes the interesting failures rather than
// dumping them on the offline heuristic: the model is told which name was
// rejected and exactly why, which is far more use to it than another round of
// general prompt wording.
//
// Best-effort throughout — a failed repair just leaves the original verdict.
const REPAIR_PROMPT = `You are correcting product names that were rejected for a customs packing list.

For each item you are given the listing title, the name that was rejected, and the reason.

Fix the reason. Keep everything else about the name the same, and keep it SHORT - two or three words, Title Case.
A name must say what the goods ARE, using the listing's own wording. It must never be a bare category noun.

Respond with JSON only, exactly: {"names": ["fixed name for 1", "fixed name for 2", ...]}
The array MUST have exactly one entry per input, in the same order.`;

async function repairNames(client, model, items, budget) {
  const numbered = items.map((it, i) => (
    `${i + 1}. TITLE: ${it.title}\n   REJECTED: "${it.bad}"\n   REASON: ${it.reason}`
  )).join('\n');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await withTimeout(client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: REPAIR_PROMPT },
          { role: 'user', content: numbered },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: 2048,
      }), LLM_ATTEMPT_TIMEOUT_MS, `Groq name-repair call (${model})`);
      const names = JSON.parse(res?.choices?.[0]?.message?.content || '').names;
      if (!Array.isArray(names) || names.length !== items.length) return null;
      return names;
    } catch (e) {
      if (isRateLimited(e) && await budget.spend(retryAfterMs(e))) continue;
      return null;
    }
  }
  return null;
}

// Name one chunk and then hold every answer up to validateName, repairing what
// fails. Returns names aligned to `titles`, each either final or null.
async function nameAndRepairChunk(client, titles, budget) {
  const { names, model } = await nameChunkWithLlm(client, titles, budget);
  const verdicts = titles.map((title, k) => validateName(names[k], title));
  const out = verdicts.map((v) => (v.ok ? v.value : null));

  const failed = [];
  verdicts.forEach((v, k) => {
    if (!v.ok) failed.push({ k, title: titles[k], bad: names[k], reason: v.reason });
  });
  if (!failed.length) return { names: out, model };

  const fixes = await repairNames(client, model, failed, budget);
  failed.forEach((f, i) => {
    const retry = fixes && fixes[i] !== undefined ? validateName(fixes[i], f.title) : null;
    if (retry && retry.ok) {
      out[f.k] = retry.value;
      return;
    }
    // Repair did not land. A soft failure (wording the title does not use, such
    // as "Mold" for a listing that spells it "Mould") is still a real name, so
    // keep it; a hard one is dropped to the heuristic.
    const original = verdicts[f.k];
    if (!original.hard) {
      const kept = sanitize(tightenName(f.bad));
      if (kept) out[f.k] = kept;
    }
  });
  return { names: out, model };
}

// Bounded worker pool over chunk indexes (same shape as mapWithConcurrency in
// routes/supplierOrders.js).
async function runChunks(chunks, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, chunks.length) }, async () => {
    while (next < chunks.length) {
      const i = next++;
      await fn(chunks[i], i);
    }
  });
  await Promise.all(workers);
}

/**
 * @param {string[]} titles raw 1688 listing titles
 * @param {{ force?: boolean, patient?: boolean }} [options]
 *   force=true ignores cached 'llm' rows (manual corrections are still
 *   honoured); patient=true allows minutes of rate-limit waiting instead of
 *   seconds. Both are for scripts/refresh-product-names.js — an export takes
 *   the defaults so it cannot hang behind a proxy timeout.
 * @returns {Promise<(string|null)[]>} same length/order as `titles`; null means
 *   "caller should use its own fallback".
 */
async function extractProductNames(titles, options = {}) {
  const list = Array.isArray(titles) ? titles : [];
  if (!list.length) return [];

  const force = !!options.force;
  const cleaned = list.map(stripSpecTags);
  const out = new Array(list.length).fill(null);

  // 1 + 2. Durable cache. A manual correction always wins, even under --force.
  const hashes = cleaned.map((t) => (t ? titleHash(t) : null));
  const cached = await loadCached([...new Set(hashes.filter(Boolean))]);
  cleaned.forEach((title, i) => {
    if (!title) return;
    const hit = cached.get(hashes[i]);
    if (!hit) return;
    if (hit.source === 'manual' || !force) out[i] = hit.name;
  });

  if (LLM_ENABLED) {
    const client = getClient();
    if (client) {
      // Only ask the model about titles that are still unresolved.
      const pending = [];
      cleaned.forEach((title, i) => {
        if (!title || out[i]) return;
        const hit = cacheGet(title);
        if (hit !== undefined) out[i] = hit;
        else pending.push({ title, i });
      });

      if (pending.length) {
        // One title can appear on many rows; ask about each distinct one once.
        const byTitle = new Map();
        pending.forEach((p) => {
          const group = byTitle.get(p.title);
          if (group) group.push(p.i);
          else byTitle.set(p.title, [p.i]);
        });
        const distinct = [...byTitle.keys()];

        const chunks = [];
        for (let i = 0; i < distinct.length; i += CHUNK_SIZE) {
          chunks.push(distinct.slice(i, i + CHUNK_SIZE));
        }
        let failures = 0;
        const toPersist = [];
        const budget = makeRetryBudget(options.patient ? PATIENT_RETRY_BUDGET_MS : RETRY_BUDGET_MS);
        await runChunks(chunks, CHUNK_CONCURRENCY, async (chunk) => {
          try {
            const { names, model } = await nameAndRepairChunk(client, chunk, budget);
            chunk.forEach((title, k) => {
              const name = names[k];
              byTitle.get(title).forEach((rowIdx) => { out[rowIdx] = name; });
              cacheSet(title, name);
              if (name) toPersist.push({ title_hash: titleHash(title), title, name, source: 'llm', model });
            });
          } catch (e) {
            // Leave this chunk's rows null — the caller's heuristic covers them.
            failures += 1;
            warnOnce(`Groq naming failed for a chunk (${e.message}); those rows fall back to the heuristic.`);
          }
        });
        await saveResolved(toPersist);

        if (failures) {
          // Loud, and never muted by warnOnce: whoever is about to send this
          // sheet to a broker needs to know part of the column is guesswork.
          const scope = failures === chunks.length ? 'every chunk' : `${failures}/${chunks.length} chunks`;
          console.error(
            `[productNames] Groq naming failed for ${scope} — those Product Name cells are offline-heuristic guesses. `
            + 'Run `node backend/scripts/refresh-product-names.js` to resolve them properly and cache the result; '
            + 'if that also fails, check GROQ_API_KEY, quota, and that a model in PREFERRED_MODELS is still served.'
          );
        }
      }

      if (out.some((v) => v)) return out;
    } else {
      warnOnce('PACKING_LLM_ENABLED but GROQ_API_KEY is missing — falling back.');
    }
  }

  // Opt-in local model, for deployments that must not call an external API.
  if (NER_ENABLED) {
    try {
      const nerNames = await extractWithNer(list);
      return nerNames.map((n, i) => out[i] || sanitize(n));
    } catch (e) {
      warnOnce(`Local NER fallback failed: ${e.message}`);
    }
  }

  return out;
}

/**
 * Pin a name so no model can change it again. The correction channel behind
 * `source: 'manual'` — see the note on the model.
 */
async function setManualName(rawTitle, name) {
  const model = getModel();
  if (!model) throw new Error('database not configured');
  const title = stripSpecTags(rawTitle);
  const clean = sanitize(name);
  if (!title) throw new Error('title is empty');
  if (!clean) throw new Error(`"${name}" is not a usable product name`);
  await model.upsert({ title_hash: titleHash(title), title, name: clean, source: 'manual', model: null });
  nameCache.delete(title);
  return clean;
}

module.exports = {
  extractProductNames,
  setManualName,
  // For the refresh script and tests.
  _internals: {
    stripSpecTags,
    titleHash,
    sanitize,
    candidateModels,
    getClient,
    setPersistEnabled: (v) => { persistEnabled = !!v; },
  },
};
