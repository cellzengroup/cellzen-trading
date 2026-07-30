// Resolves the packing list's Product Name column from gtradea's raw 1688
// listing titles.
//
// Those titles are messy, machine-translated, keyword-stuffed marketing text.
// A wrong or garbled name here is a customs problem (mis-declared goods can
// mean fines, delays, or seizure), and the pure-regex heuristic in
// routes/supplierOrders.js demonstrably produces nonsense on them ("Suitable",
// "Cup fors", "Protection againsts").
//
// This module is the single entry point the export route calls. It tries the
// strategies in order and returns the first usable name per row:
//
//   1. Groq (default when GROQ_API_KEY is set) — one batched chat call per
//      chunk of titles. No local model, so no 183MB download and no memory
//      spike; that combination is exactly what was 502-ing the export in
//      production (see the note at the top of productNameNer.js).
//   2. Local GLiNER — strictly opt-in via PACKING_NER_ENABLED, for setups that
//      must not call an external API. See productNameNer.js.
//   3. null — the caller falls back to its own heuristic. Never leave a
//      customs-facing field blank because a name lookup failed.
//
// PRIVACY: strategy 1 sends 1688 *listing titles* (public supplier catalogue
// text — no customer, pricing, or shipment data) to Groq's API. Set
// PACKING_LLM_ENABLED=false to keep everything on-box.
const Groq = require('groq-sdk');
const { extractProductNames: extractWithNer } = require('./productNameNer');

const LLM_MODEL = process.env.PACKING_LLM_MODEL || 'llama-3.3-70b-versatile';
// On by default when a key exists — the whole point is that production gets
// good names without extra setup. Explicit 'false' opts out.
const LLM_ENABLED = String(process.env.PACKING_LLM_ENABLED || 'true').toLowerCase() !== 'false'
  && !!process.env.GROQ_API_KEY;
const NER_ENABLED = String(process.env.PACKING_NER_ENABLED || '').toLowerCase() === 'true';
const LLM_TIMEOUT_MS = Number(process.env.PACKING_LLM_TIMEOUT_MS || 25000);
// Titles per request. Small enough to stay well inside the context window and
// to keep one bad chunk from costing every row its name.
const CHUNK_SIZE = Number(process.env.PACKING_LLM_CHUNK || 25);
// Chunks in flight at once.
const CHUNK_CONCURRENCY = 3;

// Strip (Color: ...) / [silver] spec tags — noise for name extraction.
const stripSpecTags = (title) => String(title || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const PROMPT = `You extract concise commercial product names for a customs packing list.

For each numbered listing title, return the plain product name: what the item actually IS.

Rules:
- 2 to 5 words, Title Case, English.
- Keep the noun that identifies the goods (e.g. "Wireless Earbuds", "Curtain Fabric", "Steam Iron").
- Drop marketing words, quantities, colors, sizes, model codes, shop names, and "suitable for"/"applicable to" phrasing.
- Never return a fragment that isn't a product (e.g. never "Suitable", "Protection", "Portable").
- If the title is too vague to identify the goods, return the single best noun phrase you can.

Respond with JSON only, exactly: {"names": ["name for 1", "name for 2", ...]}
The array MUST have exactly one entry per input, in the same order.`;

let cachedClient = null;
const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!process.env.GROQ_API_KEY) return null;
  cachedClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return cachedClient;
};

// Exports repeat the same titles constantly (same 1688 catalogue, re-exported
// whenever staff want a fresh sheet), so caching by title makes all but the
// first export free. Bounded so a long-lived process can't grow unbounded.
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

let warnedOnce = false;
const warnOnce = (msg) => {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(`[productNames] ${msg}`);
};

const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  promise.then(
    (v) => { clearTimeout(timer); resolve(v); },
    (e) => { clearTimeout(timer); reject(e); }
  );
});

// Reject anything that's clearly not a product name, so a bad model response
// degrades to the heuristic instead of printing junk on a customs document.
const BAD_NAME = /^(suitable|applicable|protection|portable|universal|professional|multi|new|hot|high|for|and|the|n\/?a|none|unknown)$/i;
const sanitize = (value) => {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!s || s.length < 3 || s.length > 60) return null;
  if (BAD_NAME.test(s)) return null;
  if (!/[a-z]/i.test(s)) return null; // must contain letters, not just digits
  return s;
};

// One Groq call for one chunk. Returns an array aligned to `titles`, entries
// either a clean name or null.
async function nameChunkWithLlm(client, titles) {
  const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const res = await withTimeout(client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: numbered },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
    max_tokens: 2048,
  }), LLM_TIMEOUT_MS, 'Groq product-name call');

  const raw = res?.choices?.[0]?.message?.content || '';
  let names;
  try {
    names = JSON.parse(raw)?.names;
  } catch {
    throw new Error('model returned non-JSON');
  }
  if (!Array.isArray(names) || names.length !== titles.length) {
    // A length mismatch means the rows can't be trusted to line up, and a
    // misaligned name is worse than no name on a customs document.
    throw new Error(`expected ${titles.length} names, got ${Array.isArray(names) ? names.length : typeof names}`);
  }
  return names.map(sanitize);
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
 * @returns {Promise<(string|null)[]>} same length/order as `titles`; null means
 *   "caller should use its own fallback".
 */
async function extractProductNames(titles) {
  const list = Array.isArray(titles) ? titles : [];
  if (!list.length) return [];

  const cleaned = list.map(stripSpecTags);
  const out = new Array(list.length).fill(null);

  if (LLM_ENABLED) {
    const client = getClient();
    if (client) {
      // Only ask the model about titles we don't already have cached.
      const pending = [];
      cleaned.forEach((title, i) => {
        if (!title) return;
        const hit = cacheGet(title);
        if (hit !== undefined) out[i] = hit;
        else pending.push({ title, i });
      });

      if (pending.length) {
        const chunks = [];
        for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
          chunks.push(pending.slice(i, i + CHUNK_SIZE));
        }
        let failures = 0;
        await runChunks(chunks, CHUNK_CONCURRENCY, async (chunk) => {
          try {
            const names = await nameChunkWithLlm(client, chunk.map((c) => c.title));
            chunk.forEach((c, k) => {
              out[c.i] = names[k];
              cacheSet(c.title, names[k]);
            });
          } catch (e) {
            // Leave this chunk's rows null — the caller's heuristic covers them.
            failures += 1;
            warnOnce(`Groq naming failed for a chunk (${e.message}); those rows fall back to the heuristic.`);
          }
        });
        if (failures && failures === chunks.length) {
          warnOnce('Groq naming failed for every chunk — check GROQ_API_KEY / quota.');
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

module.exports = { extractProductNames };
