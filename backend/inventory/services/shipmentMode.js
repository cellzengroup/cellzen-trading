// Decides whether a 1688 procurement item must travel BY LAND (dangerous /
// air-restricted goods) or can go BY AIR (general cargo), from the product
// title alone. Drives the Mode column in the warehouse 1688 panel, where staff
// can override any answer from a dropdown.
//
// THREE STAGES, in this order, and the order is the whole design:
//
//   1. HAZARD RULES — dangerousGoodsLexicon.js, matched with Aho-Corasick (one
//      pass over the title for all ~350 terms, and it matches Chinese as
//      happily as English because it works on characters, not whitespace
//      tokens). If a regulated term is present, the answer is LAND and no later
//      stage is consulted. A statistical model must never be able to talk the
//      system out of "lithium battery": mis-declared dangerous goods on an
//      aircraft is a safety and customs problem, not a ranking error.
//
//   2. AIR CATEGORIES — AIR_CATEGORIES in the same lexicon: product families
//      the warehouse always flies by default, seating furniture (chairs, sofas)
//      being the first. These are things the model kept mis-reading from the
//      marketing words around them, where the right answer is not in doubt and
//      a fixed list is more honest than nudging the corpus until the guess
//      lands. It sits BELOW the hazard rules on purpose, so an electric massage
//      chair still matches 'electric' at stage 1 and still goes by land.
//
//   3. MODEL — a naive-Bayes classifier (npm `bayes`) trained at startup on
//      shipmentModeCorpus.js. This is what generalises past the word list:
//      1688 titles are machine-translated marketing text, so a power bank
//      arrives as "charge treasure", "portable power supply" or "mobile energy
//      source", and no lexicon ever finishes. The model only gets a vote on
//      titles no earlier stage claimed, and only when it is confident —
//      below the margin the answer falls back to AIR, which is what the
//      overwhelming majority of a clothing/accessories catalogue actually is.
//
// Everything here is deterministic and offline: no API call, no downloaded
// weights, ~2MB of RSS. That is deliberate — see the header of
// productNameNer.js for what happened the last time this backend loaded a real
// model inside a request.
const AhoCorasick = require('ahocorasick');
const bayes = require('bayes');
const { HAZARD_CLASSES, SUPPRESSORS, AIR_CATEGORIES } = require('./dangerousGoodsLexicon');
const { EXAMPLES } = require('./shipmentModeCorpus');

const LAND = 'land';
const AIR = 'air';

// How far ahead of AIR the model has to score before it may call something
// dangerous on its own. Expressed as a LENGTH-NORMALISED log-odds (see
// modelScore) so it means the same thing for a six-word title and a forty-word
// one — a raw log-probability gap grows with length and would quietly make long
// titles easier to flag.
//
// 0 means "whichever class the model scores higher", i.e. no extra evidence is
// demanded before flagging. That is on purpose. Sweeping the threshold against
// the unseen-wording holdout (backend/scripts/eval-shipment-mode.js) gives:
//
//     margin   accuracy   land-recall   missed dangerous   over-flagged
//      0.35      77.8%        55.6%            8                0
//      0.15      88.9%        83.3%            3                1
//      0.00      97.2%       100.0%            0                1
//
// and it stays flat below 0, so this is a plateau rather than a fitted spike.
// The trade it makes is the right way round: an over-flagged jacket costs one
// click in the panel's dropdown, a missed power bank is undeclared dangerous
// goods in an aircraft hold. Re-run the eval after touching the corpus.
const MODEL_LAND_MARGIN = Number(process.env.SHIPMENT_MODE_MARGIN || 0);

// ------------------------------------------------------------------ tokenizer
// Shared by training and inference — they MUST tokenize identically or the
// model scores against a vocabulary it never learned.
//
// Chinese has no spaces, so a whitespace/word tokenizer (natural's included)
// silently drops every CJK title on the floor. Han runs are emitted as
// character unigrams AND bigrams instead: 充电宝 contributes 充, 电, 宝, 充电,
// 电宝, and it's the bigrams that actually carry the meaning.
const HAN_RUN = /[㐀-䶿一-鿿豈-﫿]+/g;
const LATIN_WORD = /[a-z][a-z0-9]*|[0-9]+[a-z]+/g;

// Marketing filler that appears with roughly equal frequency in both classes.
// Dropping it doesn't change the decision, it just keeps the vocabulary (and so
// the Laplace smoothing denominator) from being dominated by noise.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'you', 'your', 'our',
  'new', 'hot', 'sale', 'wholesale', 'free', 'shipping', 'quality', 'high',
  'best', 'style', 'fashion', 'fashionable', 'cross', 'border', 'custom',
  'customized', 'oem', 'odm', 'factory', 'direct', 'supply', 'price', 'cheap',
  'pcs', 'set', 'sets', 'pack', 'piece', 'pieces', 'multi', 'super', 'ultra',
  'pro', 'plus', 'max', 'mini', 'large', 'small', 'size', 'color', 'colors',
  'colour', 'inch', 'cm', 'mm',
]);

// gtradea titles carry a trailing variant blob — "(Color: Orange base*uv+cpl,
// Size: iPhone 17 Pro)" — which is per-SKU noise, not a description of the
// goods. It was putting a camera lens film on a truck, because "Size: iPhone 17
// Pro" contains a device name the lexicon watches for.
//
// Only parentheticals that OPEN with a known variant key are dropped, never
// every bracket: a title reading "(with lithium battery)" has to keep its
// battery. Both the rules and the model read the stripped form, so neither is
// scoring against packaging metadata.
// Two alternatives rather than one bracket-agnostic pattern, because these blobs
// nest the OTHER bracket type — "(Color: …nd-32[4-piece set all-inclusive], Size:
// iPhone 17 Pro)" — and a class that excluded both stopped at the inner "[" and
// left the whole tag, and the iPhone in it, in play.
const VARIANT_KEY = 'color|colour|size|style|specification|spec|model|version|type|颜色|规格|尺寸|型号|款式';
const VARIANT_TAG = new RegExp(
  `\\(\\s*(?:${VARIANT_KEY})\\s*[:：][^)]*\\)|\\[\\s*(?:${VARIANT_KEY})\\s*[:：][^\\]]*\\]`,
  'gi'
);
const stripVariantTags = (text) => String(text || '').replace(VARIANT_TAG, ' ');

function tokenize(text) {
  const s = stripVariantTags(text).toLowerCase();
  const out = [];
  for (const w of s.match(LATIN_WORD) || []) {
    if (w.length > 1 && !STOPWORDS.has(w)) out.push(w);
  }
  for (const run of s.match(HAN_RUN) || []) {
    for (let i = 0; i < run.length; i++) {
      out.push(run[i]);
      if (i + 1 < run.length) out.push(run.slice(i, i + 2));
    }
  }
  return out;
}

// ---------------------------------------------------------------- rule engine
// One automaton for the hazard terms, one for the suppressors. Both are built
// once at require time — construction is the expensive half of Aho-Corasick and
// searching is then linear in the title length regardless of how many terms the
// lexicon grows to.
const TERM_CLASS = new Map(); // term -> hazard class entry
for (const cls of HAZARD_CLASSES) {
  for (const term of cls.terms) {
    const t = term.toLowerCase();
    if (!TERM_CLASS.has(t)) TERM_CLASS.set(t, cls);
  }
}
const hazardAc = new AhoCorasick([...TERM_CLASS.keys()]);
const suppressorAc = new AhoCorasick(SUPPRESSORS.map((s) => s.toLowerCase()));

const isLetter = (ch) => !!ch && ch >= 'a' && ch <= 'z';
const isDigit = (ch) => !!ch && ch >= '0' && ch <= '9';

// Is this hit a whole word rather than a fragment of a longer one?
//
// Applied per END of the term, and only to the Latin side: 'bag' must not match
// inside 'cabbage', but '18650' SHOULD match in '18650x4' only at a non-digit
// boundary, and 'mah' has to be allowed to follow a digit so that '20000mAh'
// counts. Chinese terms have no word boundaries to check, so they always pass.
function isWholeWord(hay, start, end, term) {
  if (!/[a-z0-9]/.test(term)) return true; // pure CJK term
  const before = start > 0 ? hay[start - 1] : '';
  const after = end + 1 < hay.length ? hay[end + 1] : '';
  const headOk = isDigit(term[0]) ? !isLetter(before) && !isDigit(before) : !isLetter(before);
  const tailOk = isDigit(term[term.length - 1])
    ? !isLetter(after) && !isDigit(after)
    : !isLetter(after);
  return headOk && tailOk;
}

// ahocorasick returns [[endIndexInclusive, [matchedTerms]], ...].
function findSpans(ac, hay) {
  const spans = [];
  for (const [end, terms] of ac.search(hay)) {
    for (const term of terms) {
      const start = end - term.length + 1;
      spans.push({ term, start, end });
    }
  }
  return spans;
}

// Drop a hazard hit that OVERLAPS a suppressor phrase at all — 'phone case'
// kills the 'phone' inside it, so a phone case is general cargo, while "phone
// case and power bank" keeps its power bank hit and still ships by land.
//
// Overlap rather than full containment, because the two lists rarely line up on
// the same word: "Mobile Phone Stand" matches the hazard 'mobile phone' at 0-11
// and the suppressor 'phone stand' at 7-17, so a containment test kept the hit
// and put a lump of aluminium on a truck. Enumerating every prefix ('mobile
// phone stand', 'cell phone stand', …) is a losing game; overlapping is the
// general rule. It stays safe because suppressors are specific multi-word
// phrases — a genuine second hazard elsewhere in the title doesn't touch them.
function applySuppressors(hits, suppressed) {
  if (!suppressed.length) return hits;
  return hits.filter(
    (h) => !suppressed.some((s) => s.start <= h.end && s.end >= h.start)
  );
}

function classifyByRules(title) {
  const hay = stripVariantTags(title).toLowerCase();
  if (!hay) return null;

  const raw = findSpans(hazardAc, hay).filter((h) => isWholeWord(hay, h.start, h.end, h.term));
  if (!raw.length) return null;

  const kept = applySuppressors(raw, findSpans(suppressorAc, hay));
  if (!kept.length) return null;

  // Report in lexicon order so the reason reads the same way every time for the
  // same title, rather than following whatever order the automaton emitted.
  const byClass = new Map();
  for (const hit of kept) {
    const cls = TERM_CLASS.get(hit.term);
    if (!byClass.has(cls.key)) byClass.set(cls.key, { cls, terms: new Set() });
    byClass.get(cls.key).terms.add(hit.term);
  }
  const ordered = HAZARD_CLASSES.filter((c) => byClass.has(c.key)).map((c) => byClass.get(c.key));

  return {
    hazardClass: ordered[0].cls.key,
    label: ordered[0].cls.label,
    matched: ordered.flatMap((o) => [...o.terms]),
    reason: ordered
      .map((o) => `${o.cls.label} (${[...o.terms].map((t) => `"${t}"`).join(', ')})`)
      .join('; '),
  };
}

// ------------------------------------------------------- always-air categories
// Stage 1.5. Same machinery as the hazard rules — one automaton, whole-word
// checked on the Latin side — but it answers AIR, and it runs only once the
// hazard rules have declined to speak. See AIR_CATEGORIES in the lexicon for
// why that ordering is the whole safety argument.
const AIR_TERM_CLASS = new Map(); // term -> air category entry
for (const cls of AIR_CATEGORIES) {
  for (const term of cls.terms) {
    const t = term.toLowerCase();
    if (!AIR_TERM_CLASS.has(t)) AIR_TERM_CLASS.set(t, cls);
  }
}
const airCategoryAc = new AhoCorasick([...AIR_TERM_CLASS.keys()]);

function classifyAirCategory(title) {
  const hay = stripVariantTags(title).toLowerCase();
  if (!hay) return null;

  const hits = findSpans(airCategoryAc, hay).filter((h) => isWholeWord(hay, h.start, h.end, h.term));
  if (!hits.length) return null;

  const byClass = new Map();
  for (const hit of hits) {
    const cls = AIR_TERM_CLASS.get(hit.term);
    if (!byClass.has(cls.key)) byClass.set(cls.key, { cls, terms: new Set() });
    byClass.get(cls.key).terms.add(hit.term);
  }
  // Lexicon order, so the same title always reports the same category.
  const ordered = AIR_CATEGORIES.filter((c) => byClass.has(c.key)).map((c) => byClass.get(c.key));

  return {
    categoryKey: ordered[0].cls.key,
    label: ordered[0].cls.label,
    matched: ordered.flatMap((o) => [...o.terms]),
    reason: ordered
      .map((o) => `${o.cls.label} (${[...o.terms].map((t) => `"${t}"`).join(', ')})`)
      .join('; '),
  };
}

// ------------------------------------------------------------------- the model
// Trained lazily and exactly once. `bayes`'s learn() is async (it awaits the
// tokenizer even when the tokenizer is synchronous), so training can't happen at
// require time — the promise is cached instead and every caller awaits the same
// one.
let classifierPromise = null;

function trainClassifier(examples) {
  const classifier = bayes({ tokenizer: tokenize });
  return (async () => {
    for (const ex of examples) await classifier.learn(ex.text, ex.label);
    return classifier;
  })();
}

function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = trainClassifier(EXAMPLES).catch((e) => {
      // A broken model must not take the panel down: every caller below treats
      // a null classifier as "no opinion", which lands on AIR unless a rule
      // already said otherwise.
      console.error('[shipmentMode] classifier training failed — rules only:', e.message);
      return null;
    });
  }
  return classifierPromise;
}

// Per-category log-probability, computed from the library's own public pieces
// (categorize() returns the winning label but discards the scores, and the
// margin is exactly what's needed to know whether to trust it).
function modelScore(classifier, text) {
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  const freq = classifier.frequencyTable(tokens);
  const logs = {};
  for (const category of Object.keys(classifier.categories)) {
    let lp = Math.log(classifier.docCount[category] / classifier.totalDocuments);
    for (const token of Object.keys(freq)) {
      lp += freq[token] * Math.log(classifier.tokenProbability(token, category));
    }
    logs[category] = lp;
  }
  if (!(LAND in logs) || !(AIR in logs)) return null;

  // Length-normalised log-odds: how much more land-like each token is on
  // average. Stable across title lengths in a way the raw gap is not.
  const margin = (logs[LAND] - logs[AIR]) / tokens.length;
  // Softmax over the raw gap, for display only.
  const confidence = 1 / (1 + Math.exp(-(logs[LAND] - logs[AIR])));
  return { margin, confidence, mode: margin > 0 ? LAND : AIR, tokens: tokens.length };
}

// ------------------------------------------------------------------ public API
// Returns, for one title:
//   mode        'land' | 'air'   — the recommendation
//   source      'rule' | 'category' | 'model' | 'default'
//   reason      short human sentence for the tooltip in the 1688 panel
//   hazardClass the lexicon class that fired, when source === 'rule'
//   confidence  0..1
async function classifyShipmentMode(title) {
  const rule = classifyByRules(title);
  if (rule) {
    return {
      mode: LAND,
      source: 'rule',
      hazardClass: rule.hazardClass,
      matched: rule.matched,
      reason: `Restricted for air freight — ${rule.reason}`,
      confidence: 1,
    };
  }

  // Product families the warehouse always flies unless a human says otherwise —
  // seating furniture today. Deliberately AFTER the hazard rules and BEFORE the
  // model: it can overrule a statistical guess, never a regulated term.
  const category = classifyAirCategory(title);
  if (category) {
    return {
      mode: AIR,
      source: 'category',
      hazardClass: null,
      matched: category.matched,
      reason: `${category.label} — ships by air by default.`,
      confidence: 1,
    };
  }

  const classifier = await getClassifier();
  const scored = classifier ? modelScore(classifier, title) : null;
  if (!scored) {
    return {
      mode: AIR,
      source: 'default',
      hazardClass: null,
      matched: [],
      reason: 'No product description to check — defaulted to air.',
      confidence: 0,
    };
  }

  if (scored.mode === LAND && scored.margin >= MODEL_LAND_MARGIN) {
    return {
      mode: LAND,
      source: 'model',
      hazardClass: null,
      matched: [],
      reason: 'No regulated term in the title, but the wording matches dangerous goods — please confirm.',
      confidence: scored.confidence,
    };
  }

  return {
    mode: AIR,
    source: scored.mode === AIR ? 'model' : 'default',
    hazardClass: null,
    matched: [],
    reason: 'No dangerous-goods signal found — general cargo.',
    confidence: 1 - scored.confidence,
  };
}

// Batch form — trains once, then classifies the whole page of orders. Used by
// the 1688 list route, which annotates up to 5000 rows per request.
async function classifyShipmentModes(titles) {
  await getClassifier(); // pay training once, not per title
  return Promise.all(titles.map((t) => classifyShipmentMode(t)));
}

// The two spellings of the same fact. This module and supplier_orders speak
// 'air' | 'land'; warehouse_items.shipment_from and every label the printer
// produces speak 'By Air' | 'By Land'. Converting in one place keeps a stray
// 'land' out of a column the label renderer reads literally.
const SHIPMENT_FROM = { [AIR]: 'By Air', [LAND]: 'By Land' };
const toShipmentFrom = (mode) => SHIPMENT_FROM[mode] || 'By Air';

// The mode a 1688 order actually ships in: the staff override when there is
// one, otherwise the classifier's answer. Takes the SupplierOrder row so the
// put-away route and the 1688 panel can't drift apart on the precedence rule.
async function effectiveOrderMode(order) {
  const override = String(order?.ship_mode_override || '').trim().toLowerCase();
  if (override === LAND || override === AIR) return override;
  const { mode } = await classifyShipmentMode(order?.product_name || '');
  return mode;
}

module.exports = {
  classifyShipmentMode,
  classifyShipmentModes,
  effectiveOrderMode,
  toShipmentFrom,
  // exported for backend/scripts/eval-shipment-mode.js
  _internals: {
    tokenize, classifyByRules, classifyAirCategory, modelScore, trainClassifier,
    MODEL_LAND_MARGIN, LAND, AIR,
  },
};
