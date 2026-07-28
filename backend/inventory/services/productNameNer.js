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

      if (!fs.existsSync(MODEL_PATH)) await downloadModel();
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
  const cleaned = titles.map(stripSpecTags);
  let gliner;
  try {
    gliner = await getGliner();
  } catch {
    return titles.map(() => null);
  }

  try {
    const results = await gliner.inference({
      texts: cleaned,
      entities: ENTITY_LABELS,
      threshold: SCORE_THRESHOLD,
    });
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
