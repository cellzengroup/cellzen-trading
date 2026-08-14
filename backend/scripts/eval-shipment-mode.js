// Measures how well the shipment-mode classifier actually works, instead of
// trusting that it does. Run it after ANY edit to dangerousGoodsLexicon.js,
// shipmentModeCorpus.js or the margin in shipmentMode.js:
//
//   node backend/scripts/eval-shipment-mode.js
//
// Stratified 5-fold cross-validation: the model is re-trained from scratch on
// 4/5 of the corpus and scored on the fifth it has never seen, five times over,
// so what's reported is generalisation rather than memorisation. The rules are
// stateless, so they're scored on every example directly.
//
// The number that matters most is LAND RECALL — the share of genuinely
// dangerous goods the system keeps off an aircraft. A missed lithium battery is
// a customs and safety incident; a clothing order wrongly routed to a truck is
// a slower delivery a staff member can fix from the dropdown in two seconds.
// The two errors are not equally bad and this report does not average them away.
const { EXAMPLES, HOLDOUT } = require('../inventory/services/shipmentModeCorpus');
const { _internals } = require('../inventory/services/shipmentMode');

const { classifyByRules, modelScore, trainClassifier, MODEL_LAND_MARGIN, LAND, AIR } = _internals;
const FOLDS = 5;

// Deterministic shuffle — a fixed seed means two runs of this script on the same
// corpus report the same numbers, so a change in the output is a change you made.
function seededShuffle(items, seed = 20260810) {
  const a = [...items];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Keep the land/air ratio of the full corpus inside every fold — with an
// unstratified split a fold can end up with almost no dangerous examples and the
// recall number for that fold becomes noise.
function stratifiedFolds(examples, k) {
  const folds = Array.from({ length: k }, () => []);
  for (const label of [LAND, AIR]) {
    seededShuffle(examples.filter((e) => e.label === label)).forEach((ex, i) => {
      folds[i % k].push(ex);
    });
  }
  return folds;
}

function blankTally() {
  return { tp: 0, fp: 0, tn: 0, fn: 0 };
}

// "Positive" = land (dangerous). tp/fn are therefore about dangerous goods
// caught vs missed, which is the asymmetry this whole file exists to expose.
function record(tally, actual, predicted) {
  if (actual === LAND && predicted === LAND) tally.tp++;
  else if (actual === AIR && predicted === LAND) tally.fp++;
  else if (actual === AIR && predicted === AIR) tally.tn++;
  else tally.fn++;
}

function report(name, t) {
  const total = t.tp + t.fp + t.tn + t.fn;
  const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '—').padStart(5);
  const accuracy = pct(t.tp + t.tn, total);
  const landRecall = pct(t.tp, t.tp + t.fn);
  const landPrec = pct(t.tp, t.tp + t.fp);
  const f1 =
    t.tp + t.fp && t.tp + t.fn
      ? (((2 * t.tp) / (2 * t.tp + t.fp + t.fn)) * 100).toFixed(1).padStart(5)
      : '  —  ';
  console.log(
    `${name.padEnd(26)} acc ${accuracy}%   land-recall ${landRecall}%   ` +
      `land-precision ${landPrec}%   F1 ${f1}%   ` +
      `(missed ${t.fn} dangerous, over-flagged ${t.fp} general)`
  );
}

async function main() {
  console.log(`Corpus: ${EXAMPLES.length} labelled titles ` +
    `(${EXAMPLES.filter((e) => e.label === LAND).length} land / ` +
    `${EXAMPLES.filter((e) => e.label === AIR).length} air)`);
  console.log(`Model land margin: ${MODEL_LAND_MARGIN}\n`);

  // ---- stage 1 alone: the lexicon, scored on everything (it learns nothing,
  // so there is no train/test split to respect).
  const rules = blankTally();
  const ruleMisses = [];
  for (const ex of EXAMPLES) {
    const predicted = classifyByRules(ex.text) ? LAND : AIR;
    record(rules, ex.label, predicted);
    if (predicted !== ex.label) ruleMisses.push({ ...ex, predicted });
  }
  report('rules only', rules);

  // ---- stage 2 alone, and the two combined, both under cross-validation.
  const model = blankTally();
  const combined = blankTally();
  const combinedMisses = [];
  const folds = stratifiedFolds(EXAMPLES, FOLDS);

  for (let i = 0; i < FOLDS; i++) {
    const test = folds[i];
    const train = folds.filter((_, j) => j !== i).flat();
    const classifier = await trainClassifier(train);

    for (const ex of test) {
      const scored = modelScore(classifier, ex.text);
      const modelSays = scored && scored.mode === LAND && scored.margin >= MODEL_LAND_MARGIN ? LAND : AIR;
      record(model, ex.label, modelSays);

      // Production order: a rule hit short-circuits, the model only speaks when
      // no regulated term matched.
      const predicted = classifyByRules(ex.text) ? LAND : modelSays;
      record(combined, ex.label, predicted);
      if (predicted !== ex.label) combinedMisses.push({ ...ex, predicted });
    }
  }
  report(`model only (${FOLDS}-fold)`, model);
  report(`rules + model (shipped)`, combined);

  // ---- the honest number. The corpus above can't test the lexicon (the
  // lexicon was extended until it covered it), so this scores the shipped
  // pipeline — trained on the FULL corpus, exactly as it runs in production —
  // against titles deliberately worded around the word list.
  const holdout = blankTally();
  const holdoutMisses = [];
  const shipped = await trainClassifier(EXAMPLES);
  for (const ex of HOLDOUT) {
    const scored = modelScore(shipped, ex.text);
    const modelSays = scored && scored.mode === LAND && scored.margin >= MODEL_LAND_MARGIN ? LAND : AIR;
    const predicted = classifyByRules(ex.text) ? LAND : modelSays;
    record(holdout, ex.label, predicted);
    if (predicted !== ex.label) holdoutMisses.push({ ...ex, predicted });
  }
  console.log('');
  report(`unseen-wording holdout`, holdout);

  const show = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title}`);
    for (const m of list.slice(0, 12)) {
      console.log(`  [want ${m.label}, got ${m.predicted}] ${m.text.slice(0, 88)}`);
    }
    if (list.length > 12) console.log(`  … and ${list.length - 12} more`);
  };
  show('Rule-stage errors:', ruleMisses);
  show('Shipped-pipeline errors (cross-validated):', combinedMisses);
  show('Unseen-wording holdout errors:', holdoutMisses);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
