// Extracts a short, ACCURATE product name from gtradea's full 1688 listing
// titles, for the packing list's Product Name column. Those titles are messy,
// translated, keyword-stuffed marketing text — a wrong or garbled product
// name on a packing list is a customs problem (mis-declared goods can mean
// fines, delays, or seizure), so this leans on a real NER model (GLiNER,
// zero-shot — no product-specific training needed) instead of regex
// guessing, which was producing nonsense like "Suitable" or "Driving
// outdoors" for products that were actually a phone lens filter and glasses.
//
// GLiNER.js (npm: gliner) runs the model locally via ONNX Runtime — no
// external API call, no per-request cost. The ~183MB quantized model isn't
// committed to git; it's downloaded once to a local cache on first use (see
// MODEL_URL below) and reused for the life of the process.
//
// 'gliner/node' pulls in onnxruntime-node, a native addon — deliberately NOT
// required at the top of this file. onnxruntime-node's prebuilt binary can
// fail to load on a given OS/libc combo (this exact package already needed a
// workaround on Windows — see below), and since this module is require()'d
// from a route file at server BOOT, a top-level throw here would crash the
// entire backend over one Excel column. Instead it's require()'d lazily,
// inside getGliner()'s try/catch, so a native-load failure just degrades
// this one feature (callers fall back to the heuristic name) — everything
// else keeps running.
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_URL = 'https://huggingface.co/onnx-community/gliner_small-v2/resolve/main/onnx/model_uint8.onnx';
const MODEL_DIR = path.join(__dirname, '..', '..', '.cache', 'gliner');
const MODEL_PATH = path.join(MODEL_DIR, 'model_uint8.onnx');
const ENTITY_LABELS = ['product'];
const SCORE_THRESHOLD = 0.2;

// ---------------------------------------------------------------- PRODUCTION
// This model is OPT-IN, and it will never download itself while serving a
// request. Both rules exist because doing otherwise took the packing-list
// export down in production with a 502:
//
//   * .cache/ is gitignored and the Railway container has an ephemeral disk, so
//     the model is absent after every single deploy. The old code then
//     fetched 183MB from HuggingFace *inside* the export request — far longer
//     than the platform's proxy timeout, so the client got a 502 while the
//     download was still running.
//   * Loading a 183MB quantized transformer spikes RSS well past the ~512MB
//     small-instance limit. That gets the process SIGKILL'd, which no
//     try/catch can intercept — the connection dies and the proxy reports a
//     502. Locally it always "worked" only because the model was already
//     cached and a dev box has RAM to spare.
//
// Falling back costs one column's polish (deriveShortProductName in
// routes/supplierOrders.js already handles every null we return); leaving it
// on cost the entire export. So: enable it deliberately, on a box with the
// memory for it, after pre-fetching the model with
// `node backend/scripts/prefetch-ner-model.js`.
const NER_ENABLED = String(process.env.PACKING_NER_ENABLED || '').toLowerCase() === 'true';
// Even when enabled, never let init+inference hold the export open forever.
const NER_TIMEOUT_MS = Number(process.env.PACKING_NER_TIMEOUT_MS || 20000);
// Set PACKING_NER_ALLOW_DOWNLOAD=true only for the prefetch script / a warm-up
// run — never for normal request-time use.
const ALLOW_DOWNLOAD = String(process.env.PACKING_NER_ALLOW_DOWNLOAD || '').toLowerCase() === 'true';

let warnedDisabled = false;
const warnOnce = (msg) => {
  if (warnedDisabled) return;
  warnedDisabled = true;
  console.log(`[productNameNer] ${msg} — packing list will use the heuristic product name.`);
};

// Reject rather than hang forever. Note the underlying work is NOT cancelled
// (ONNX inference isn't abortable); this just stops the HTTP request from
// waiting on it, so the export completes with heuristic names instead.
const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  promise.then(
    (v) => { clearTimeout(timer); resolve(v); },
    (e) => { clearTimeout(timer); reject(e); }
  );
});

// Strip (Color: ...) / [silver] spec tags — noise for name extraction, same
// cleanup the old heuristic used.
const stripSpecTags = (title) => String(title || '')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\[[^\]]*\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function downloadModel() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    const tmpPath = `${MODEL_PATH}.download`;
    const file = fs.createWriteStream(tmpPath);
    console.log('[productNameNer] downloading GLiNER model (~183MB, one-time)...');
    const request = (url) => {
      https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location); // HF resolve URLs redirect to a CDN host
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`model download failed (HTTP ${res.statusCode})`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => {
          fs.renameSync(tmpPath, MODEL_PATH);
          console.log('[productNameNer] model downloaded.');
          resolve();
        }));
      }).on('error', reject);
    };
    request(MODEL_URL);
    file.on('error', reject);
  });
}

// Lazy singleton — the model is only loaded (and downloaded, on first-ever
// use) the first time a packing list is exported, then reused for the life of
// the process. A failed init (bad network, unsupported platform) is cached
// too, so a broken environment fails fast instead of retrying a 183MB
// download on every subsequent export.
let glinerPromise = null;
function getGliner() {
  if (!glinerPromise) {
    glinerPromise = (async () => {
      // Windows quirk: requiring 'gliner/node' pulls in onnxruntime-node via
      // @xenova/transformers' OWN nested copy. On Windows that second/
      // indirect load of the native addon can fail with "The operating
      // system cannot run %1" even though the exact same file loads fine on
      // its own — pre-requiring onnxruntime-node here first avoids the
      // double-load path. Harmless no-op on platforms that don't need it.
      require('onnxruntime-node');
      const { Gliner } = require('gliner/node');

      // Request-time downloads are what produced the production 502 (see the
      // note at the top of this file). Only the prefetch script may download.
      if (!fs.existsSync(MODEL_PATH)) {
        if (!ALLOW_DOWNLOAD) {
          throw new Error(
            'GLiNER model not cached. Run `node backend/scripts/prefetch-ner-model.js` on this host, '
            + 'or leave PACKING_NER_ENABLED unset to use the heuristic name.'
          );
        }
        await downloadModel();
      }
      const gliner = new Gliner({
        tokenizerPath: 'onnx-community/gliner_small-v2',
        onnxSettings: { modelPath: MODEL_PATH },
        maxWidth: 12,
      });
      await gliner.initialize();
      return gliner;
    })().catch((e) => {
      console.error('[productNameNer] GLiNER init failed — packing list will fall back to the heuristic name:', e.message);
      throw e;
    });
  }
  return glinerPromise;
}

// Batched: one inference call for every title, not one per row — GLiNER.js
// accepts an array of texts natively and this is meaningfully faster than N
// separate calls for a multi-row packing list.
//
// Returns an array the same length as `titles`, each entry either the
// best-scoring "product" span's text (verbatim casing from the listing) or
// null when GLiNER found nothing confident enough / isn't available at all —
// callers should fall back to something else (never silently leave a
// customs-facing field blank because of that).
async function extractProductNames(titles) {
  // Opt-in only. Disabled is the safe default: the caller's heuristic covers
  // every null, and this path can otherwise take the whole export down.
  if (!NER_ENABLED) {
    warnOnce('NER disabled (set PACKING_NER_ENABLED=true to enable)');
    return titles.map(() => null);
  }

  const cleaned = titles.map(stripSpecTags);
  let gliner;
  try {
    gliner = await withTimeout(getGliner(), NER_TIMEOUT_MS, 'GLiNER init');
  } catch (e) {
    warnOnce(`GLiNER unavailable: ${e.message}`);
    return titles.map(() => null);
  }

  try {
    const results = await withTimeout(gliner.inference({
      texts: cleaned,
      entities: ENTITY_LABELS,
      threshold: SCORE_THRESHOLD,
    }), NER_TIMEOUT_MS, 'GLiNER inference');
    return results.map((spans) => {
      if (!Array.isArray(spans) || !spans.length) return null;
      const best = spans.reduce((a, b) => (b.score > a.score ? b : a));
      const text = String(best.spanText || '').trim();
      return text || null;
    });
  } catch (e) {
    console.error('[productNameNer] inference failed — falling back per-row:', e.message);
    return titles.map(() => null);
  }
}

module.exports = { extractProductNames };
