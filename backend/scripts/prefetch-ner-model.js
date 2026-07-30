require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Downloads + warms the GLiNER model used for the packing list's Product Name
// column, so it is ready on disk BEFORE any request needs it.
//
// Why this is a separate script: the export route must never download 183MB
// while a client waits (that produced a production 502 — see the note at the
// top of inventory/services/productNameNer.js). So downloading is gated behind
// PACKING_NER_ALLOW_DOWNLOAD, which this script sets for itself.
//
//   node backend/scripts/prefetch-ner-model.js
//
// Run it on the machine that serves the export, as part of the deploy, and
// only if you actually want NER names AND the instance has the RAM for a
// 183MB model (a ~512MB instance does not). Otherwise skip it entirely and
// leave PACKING_NER_ENABLED unset — the heuristic name is used instead and the
// export works fine.
//
// NOTE: on a host with an ephemeral filesystem (Render et al.) the cache is
// wiped by every deploy, so this must run on each boot to be of any use.
process.env.PACKING_NER_ALLOW_DOWNLOAD = 'true';
process.env.PACKING_NER_ENABLED = 'true';
// Warm-up has no client waiting on it, so don't let the request-time timeout
// abort a legitimately slow first download/load.
process.env.PACKING_NER_TIMEOUT_MS = process.env.PACKING_NER_TIMEOUT_MS || '600000';

const { extractProductNames } = require('../inventory/services/productNameNer');

(async () => {
  console.log('Warming the GLiNER model (first run downloads ~183MB)...');
  const started = Date.now();
  try {
    // A real inference call, so the tokenizer fetch + ONNX session are warmed
    // too — not just the .onnx file put on disk.
    const [name] = await extractProductNames(['Bluetooth wireless earbuds noise cancelling for sports']);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (name) {
      console.log(`Model ready in ${secs}s — sample extraction: "${name}"`);
      console.log('Set PACKING_NER_ENABLED=true on the server to use it.');
    } else {
      // extractProductNames swallows its own failures by design (it returns
      // nulls so the export can proceed); surface that here as a real failure,
      // since warming up is this script's entire job.
      console.error(`Warm-up returned no name after ${secs}s — see the [productNameNer] log line above.`);
      console.error('Leave PACKING_NER_ENABLED unset; the export will use the heuristic name.');
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('Warm-up failed:', e.message);
    process.exitCode = 1;
  }
})();
