require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Resolve, review and correct the packing list's Product Name column, outside
// an export.
//
// The export resolves names on demand, so none of this is required to get a
// correct sheet. It exists because the names are a customs declaration and you
// want to be able to read them all at once, before a forwarder does:
//
//   node backend/scripts/refresh-product-names.js
//       Resolve every distinct listing title that has no name yet, write them
//       to product_name_cache, and print the lot. Safe to re-run: already
//       resolved titles are skipped, so this costs nothing the second time.
//
//   node backend/scripts/refresh-product-names.js --dry-run
//       Same, but writes nothing. Use it to see what a prompt or model change
//       would do before it reaches the table.
//
//   node backend/scripts/refresh-product-names.js --force
//       Re-resolve titles that already have an 'llm' name (after a model or
//       prompt change). Manual corrections are never touched.
//
//   node backend/scripts/refresh-product-names.js --list
//       Print what is cached, newest first. No API calls.
//
//   node backend/scripts/refresh-product-names.js --offline
//       Print what the offline heuristic would produce for every title, with no
//       API calls and no writes. This is what the sheet falls back to when Groq
//       is unreachable — worth eyeballing before you rely on it.
//
//   node backend/scripts/refresh-product-names.js --set "<title substring>" "<name>"
//       Pin a name by hand. Matches one title, marks it source='manual', and no
//       model will ever overwrite it. This is the fix for a name a model keeps
//       getting wrong — cheaper and more certain than another prompt edit.
const { sequelize, SupplierOrder, ProductNameCache } = require('../inventory/models');
const { extractProductNames, setManualName, _internals } = require('../inventory/services/productNames');

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const DRY_RUN = has('--dry-run');
const FORCE = has('--force');
const LIST = has('--list');
const OFFLINE = has('--offline');
const setIdx = argv.indexOf('--set');

const pad = (s, n) => String(s == null ? '' : s).padEnd(n);
const clip = (s, n) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function distinctTitles() {
  const rows = await SupplierOrder.findAll({
    attributes: ['product_name'],
    raw: true,
  });
  const seen = new Map(); // cleaned title -> raw title
  rows.forEach((r) => {
    const clean = _internals.stripSpecTags(r.product_name || '');
    if (clean && !seen.has(clean)) seen.set(clean, r.product_name);
  });
  return [...seen.values()];
}

async function doList() {
  const rows = await ProductNameCache.findAll({
    order: [['updatedAt', 'DESC']],
    raw: true,
  });
  if (!rows.length) {
    console.log('product_name_cache is empty — run this script with no flags to fill it.');
    return;
  }
  console.log(`${rows.length} cached name${rows.length === 1 ? '' : 's'}\n`);
  console.log(`${pad('NAME', 32)}${pad('SOURCE', 9)}${pad('MODEL', 22)}TITLE`);
  rows.forEach((r) => {
    console.log(`${pad(clip(r.name, 31), 32)}${pad(r.source, 9)}${pad(clip(r.model || '-', 21), 22)}${clip(r.title, 70)}`);
  });
  const manual = rows.filter((r) => r.source === 'manual').length;
  console.log(`\n${manual} pinned by hand, ${rows.length - manual} from a model.`);
}

async function doSet() {
  const needle = argv[setIdx + 1];
  const name = argv[setIdx + 2];
  if (!needle || !name) {
    console.error('Usage: --set "<title substring>" "<product name>"');
    process.exitCode = 1;
    return;
  }
  const titles = await distinctTitles();
  const matches = titles.filter((t) => t.toLowerCase().includes(needle.toLowerCase()));
  if (!matches.length) {
    console.error(`No listing title contains "${needle}".`);
    process.exitCode = 1;
    return;
  }
  if (matches.length > 1) {
    console.error(`"${needle}" matches ${matches.length} titles — narrow it:`);
    matches.slice(0, 10).forEach((t) => console.error(`  - ${clip(t, 110)}`));
    process.exitCode = 1;
    return;
  }
  const saved = await setManualName(matches[0], name);
  console.log(`✅ pinned "${saved}" (source=manual, no model will change it)`);
  console.log(`   ${clip(matches[0], 110)}`);
}

async function doResolve() {
  const titles = await distinctTitles();
  if (!titles.length) {
    console.log('No supplier orders with a product name.');
    return;
  }
  console.log(`${titles.length} distinct listing title${titles.length === 1 ? '' : 's'}${DRY_RUN ? ' (dry run — nothing will be written)' : ''}${FORCE ? ' (forcing re-resolution)' : ''}\n`);

  if (OFFLINE) {
    // Require the route lazily: it pulls in the whole inventory model graph.
    const { deriveShortProductName } = require('../inventory/routes/supplierOrders');
    console.log(`${pad('OFFLINE FALLBACK', 32)}TITLE`);
    titles.forEach((t) => console.log(`${pad(clip(deriveShortProductName(t), 31), 32)}${clip(t, 90)}`));
    console.log('\nNo API calls made, nothing written.');
    return;
  }

  if (DRY_RUN) _internals.setPersistEnabled(false);
  const t0 = Date.now();
  // patient: this is the off-critical-path run, so it waits out Groq's
  // per-minute token limit instead of dropping rows to the heuristic the way a
  // live export has to.
  const names = await extractProductNames(titles, { force: FORCE, patient: true });
  const elapsed = Date.now() - t0;

  const unresolved = [];
  console.log(`${pad('PRODUCT NAME', 32)}TITLE`);
  titles.forEach((t, i) => {
    if (!names[i]) unresolved.push(t);
    console.log(`${pad(clip(names[i] || '(fallback)', 31), 32)}${clip(t, 90)}`);
  });

  const ok = names.filter(Boolean).length;
  console.log(`\n${ok}/${titles.length} resolved in ${(elapsed / 1000).toFixed(1)}s.`);
  if (unresolved.length) {
    // Not a crash: the export still prints a heuristic name for these. But it
    // is the one thing worth acting on, so it does not scroll past.
    console.log(`\n⚠️  ${unresolved.length} title${unresolved.length === 1 ? '' : 's'} fell back to the offline heuristic:`);
    unresolved.slice(0, 15).forEach((t) => console.log(`   - ${clip(t, 110)}`));
    console.log('   Check GROQ_API_KEY and quota, then re-run. See the warnings above for the reason.');
    process.exitCode = 1;
  }
}

async function main() {
  if (!sequelize || !SupplierOrder || !ProductNameCache) {
    console.error('Database not configured (DATABASE_URL).');
    process.exitCode = 1;
    return;
  }
  try {
    await ProductNameCache.sync(); // so a first run does not need the migration
    if (LIST) await doList();
    else if (setIdx !== -1) await doSet();
    else await doResolve();
  } catch (error) {
    console.error('Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
