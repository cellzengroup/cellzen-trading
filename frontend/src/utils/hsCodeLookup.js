// Single-bundle, sub-millisecond HS code lookup.
//
// Architecture: one consolidated bundle (~1.6 MB raw / ~150 KB gzipped) lazy-
// loaded on first call. After that, every operation is pure in-memory:
//
//   - lookupByCode():       O(1) Map.get  →  < 0.001 ms
//   - searchByDescription(): linear scan over a precomputed lowercase index,
//                            6,315 entries → ~0.5–1 ms
//   - calculateImportCost(): pure JS arithmetic on a single object → ~0.0001 ms
//
// The bundle uses short field names (d, u, cs, co, …) for compactness; the
// `unpack()` helper expands them to the friendly schema the UI expects.

let bundlePromise = null;          // single in-flight promise for the lazy import
let bundleData = null;             // unpacked records: Map<code, record>
let lowerDescIndex = null;         // [{code, descLower, descOriginal}] for fast search

const FRIENDLY_FIELDS = {
  // Short bundle field → friendly runtime field
  d: "description",
  u: "unit",
  p: "page",
  s: "specificDutyNpr",
  e: "excise",
  a: "agriFee",
  t: "advTax",
  v: "vat",
  // cs/co fold into customsDuty.{saarc,other}
  // es/ei/et/eo fold into effectiveRate.{saarc,india,tibet,other}
  // r → dataSource
};

// Coerce the bundle's `s` field to a single Number-or-null. The current
// build emits a scalar; older bundles emitted [{x, value}] objects from the
// extractor. Either form yields a usable scalar here.
const coerceSpecific = (s) => {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (Array.isArray(s) && s.length > 0) {
    const first = s[0];
    if (typeof first === "number") return Number.isFinite(first) ? first : null;
    if (first && typeof first === "object" && typeof first.value === "number") {
      return Number.isFinite(first.value) ? first.value : null;
    }
  }
  return null;
};

const unpack = (code, packed) => {
  const out = {
    code,
    heading: code.slice(0, 4),       // "8517.13.00" → "8517"
    chapter: code.slice(0, 2),       // "8517.13.00" → "85"
    description:    packed.d,
    unit:           packed.u,
    page:           packed.p,
    specificDutyNpr: coerceSpecific(packed.s),
    excise:         packed.e ?? null,
    agriFee:        packed.a ?? null,
    advTax:         packed.t ?? null,
    vat:            packed.v ?? null,
    customsDuty: {
      saarc: packed.cs ?? null,
      other: packed.co ?? null,
    },
    effectiveRate: {
      saarc: packed.es ?? null,
      india: packed.ei ?? null,
      tibet: packed.et ?? null,
      other: packed.eo ?? null,
    },
    dataSource: packed.r ? "reference" : "main",
  };
  return out;
};

const buildIndices = (bundleJson) => {
  const codes = bundleJson.c;
  const data = new Map();
  const lowers = [];
  for (const code in codes) {
    const packed = codes[code];
    data.set(code, unpack(code, packed));
    lowers.push({
      code,
      descLower: (packed.d || "").toLowerCase(),
      desc: packed.d || "",
    });
  }
  return { data, lowers };
};

const ensureLoaded = () => {
  if (bundleData) return Promise.resolve();
  if (bundlePromise) return bundlePromise;
  bundlePromise = import("../data/hsTariff.bundle.json")
    .then((mod) => {
      const indices = buildIndices(mod.default || mod);
      bundleData = indices.data;
      lowerDescIndex = indices.lowers;
      return null;
    })
    .catch((err) => {
      bundlePromise = null; // allow retry
      console.error("Failed to load HS tariff bundle:", err);
      throw err;
    });
  return bundlePromise;
};

// --- Public API ---

const normalizeCode = (input) => {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
};

// Preload the bundle. Call this when the panel mounts so subsequent
// operations are instant.
export const preloadTariff = () => ensureLoaded();

// Has the bundle finished loading? Useful for showing a skeleton.
export const isReady = () => bundleData !== null;

// Sync lookup — only call after `await preloadTariff()` (or check isReady()).
// Returns null if not yet loaded or if code isn't in the tariff.
export const lookupByCode = (input) => {
  if (!bundleData) return null;
  const code = normalizeCode(input);
  if (!code) return null;
  return bundleData.get(code) || null;
};

// Async wrapper that ensures the bundle is loaded before lookup.
export const lookupByCodeAsync = async (input) => {
  await ensureLoaded();
  return lookupByCode(input);
};

// Sync search — only call after the bundle is loaded.
// Matches by description substring (case-insensitive) OR by 8-digit code prefix.
export const searchByDescription = (query, { limit = 50 } = {}) => {
  if (!bundleData) return [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const digits = q.replace(/\D/g, "");
  const out = [];
  const idx = lowerDescIndex;
  const len = idx.length;
  for (let i = 0; i < len; i++) {
    const entry = idx[i];
    const codeMatch = digits && entry.code.replace(/\D/g, "").startsWith(digits);
    const descMatch = entry.descLower.indexOf(q) !== -1;
    if (codeMatch || descMatch) {
      out.push({ code: entry.code, description: entry.desc });
      if (out.length >= limit) break;
    }
  }
  return out;
};

export const searchByDescriptionAsync = async (query, options) => {
  await ensureLoaded();
  return searchByDescription(query, options);
};

const SAARC_CODES = ["IN", "BD", "LK", "PK", "BT", "MV", "AF"];

const bucketsFor = (origin) => {
  const key = String(origin || "").toUpperCase();
  const isSaarc = SAARC_CODES.includes(key);
  return {
    customs: isSaarc ? "saarc" : "other",
    effective:
      key === "IN"      ? "india"
      : key === "TIBET" ? "tibet"
      : isSaarc         ? "saarc"
      : "other",
  };
};

// Sync calc — assumes bundle is loaded.
export const calculateImportCost = ({
  code,
  cifValue,
  originCountry,
  quantity = 1,
} = {}) => {
  if (!bundleData) return { error: "Tariff not loaded yet — call preloadTariff() first", code };
  const row = lookupByCode(code);
  if (!row) return { error: `HS code ${code} not found in tariff`, code };
  if (typeof cifValue !== "number" || cifValue <= 0) {
    return { error: "cifValue must be a positive number", code };
  }

  const { customs: customsBucket, effective: effBucket } = bucketsFor(originCountry);
  const customsRate   = row.customsDuty[customsBucket];
  const effectiveRate = row.effectiveRate[effBucket];

  const customsDuty = customsRate != null ? (cifValue * customsRate) / 100 : null;
  const excise      = row.excise   != null ? (cifValue * row.excise)   / 100 : null;
  const agriFee     = row.agriFee  != null ? (cifValue * row.agriFee)  / 100 : null;
  const advTax      = row.advTax   != null ? (cifValue * row.advTax)   / 100 : null;
  const specificDuty = row.specificDutyNpr != null && quantity > 0
    ? row.specificDutyNpr * quantity
    : null;

  const vatBase = cifValue
    + (customsDuty || 0)
    + (excise || 0)
    + (agriFee || 0)
    + (specificDuty || 0);
  const vat = row.vat != null ? (vatBase * row.vat) / 100 : null;

  const totalLanded = cifValue
    + (customsDuty || 0)
    + (excise || 0)
    + (agriFee || 0)
    + (specificDuty || 0)
    + (advTax || 0)
    + (vat || 0);

  return {
    code: row.code,
    description: row.description,
    unit: row.unit,
    quantity,
    originCountry: originCountry || null,
    rateBucket: customsBucket,
    cifValue,
    breakdown: {
      customsRate,            customsDuty,
      excise:         row.excise,         exciseAmount:    excise,
      agriFee:        row.agriFee,        agriFeeAmount:   agriFee,
      advTax:         row.advTax,         advTaxAmount:    advTax,
      vat:            row.vat,            vatAmount:       vat,
      specificDutyNpr: row.specificDutyNpr, specificDutyAmount: specificDuty,
    },
    totalLanded,
    landedFromEffectiveRate: effectiveRate != null ? cifValue * (1 + effectiveRate / 100) : null,
    effectiveRatePct: effectiveRate,
  };
};

export const calculateImportCostAsync = async (params) => {
  await ensureLoaded();
  return calculateImportCost(params);
};

// --- Auto-match for invoice product names ---
//
// Heuristic: tokenize the product name (skip generic words), search the tariff,
// and score the top result by how many product-name tokens appear in the
// description. Returns { code, confidence: "high"|"medium"|"low"|"none",
// alternatives } so the UI can colour-code the indicator dot.

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "or", "with", "without",
  "new", "used", "model", "type", "kind", "various", "assorted",
  "set", "kit", "item", "items", "piece", "pieces", "unit", "units",
  "is", "to", "in", "on", "at", "by", "be", "as",
]);

// Short product abbreviations that should NOT be filtered by the length>=3
// rule. Without this, "TV", "PC", "AC", "AB" would be dropped before matching.
const SHORT_TOKEN_WHITELIST = new Set([
  "tv", "pc", "ac", "ab", "ev", "uv", "led", "lcd", "oled", "qled", "hd",
]);

// Product categories. Each entry has three fields:
//   - triggers: CASUAL words a user might type ("gym", "fridge", "phone")
//   - keywords: FORMAL HS-tariff terms to search for in descriptions when this
//               category is activated. Without these, "fridge" wouldn't find
//               anything because WCO descriptions say "refrigerator", not
//               "fridge". With them, the matcher knows what to look for.
//   - chapters: 2-digit HS chapter prefixes that get a +1000 score bonus when
//               this category is activated, so results land in the right area
//               of the tariff even when keyword overlap is weak.
//
// Single-word keywords are matched by word-prefix (so "phone" matches "phones"
// but NOT "telephone"). Multi-word keywords are matched as substrings.
const CATEGORIES = [
  // Sports & fitness equipment — HS 95.
  //
  // Triggers cover common MISSPELLINGS (dumbell with one b, treadmil,
  // kettlebel, ellipticle) and casual/shortened forms (abs, cardio) because
  // people don't always spell perfectly when entering invoice line items.
  //
  // Words that have multiple meanings (e.g., "iron", "bench", "press", "mat",
  // "ball", "rope", "rack") are deliberately NOT included as standalone
  // triggers — they'd pull unrelated products into chapter 95. For things
  // like "yoga mat" or "weight bench", the OTHER token ("yoga", "weight")
  // triggers the category and the multi-word match still lands correctly.
  {
    triggers: [
      // Category words
      "gym", "gymnastic", "gymnastics", "fitness", "workout", "cardio", "exercise",
      "yoga", "pilates", "crossfit", "calisthenics",
      // Free weights (with common "one b" typo)
      "dumbbell", "dumbbells", "dumbell", "dumbells", "dumb-bell", "dumb-bells",
      "barbell", "barbells", "barbel", "barbels",
      "kettlebell", "kettlebells", "kettlebel", "kettlebels", "kettle-bell",
      "weight", "weights", "weightlifting", "weight-lifting",
      // Machines (with common typos)
      "treadmill", "treadmils", "treadmil",
      "elliptical", "ellipticle",
      "rower", "stairclimber", "stairmaster", "spinning",
      // Specific gym accessories (unambiguous)
      "jumprope", "jump-rope", "skipping",
      "punching", "boxing-bag", "heavybag", "heavy-bag",
      "ab-roller", "abroller", "abs",
      "yogamat", "yoga-mat",
      "resistance-band",
    ],
    keywords: [
      "gymnastics", "athletics", "exercise", "weightlifting",
      "physical exercise", "physical training", "sports requisites",
    ],
    chapters: ["95"],
  },
  { triggers: ["football", "soccer", "basketball", "volleyball", "cricket", "tennis", "badminton"],
    keywords: ["sports"], chapters: ["95"] },

  // Mobile phones / smartphones / telephones — HS 85.
  // Triggers include common variants and brand names users actually type.
  {
    triggers: [
      "phone", "phones", "smartphone", "smartphones", "smart-phone",
      "cellphone", "cellphones", "cell-phone",
      "mobile",  // "mobile" as standalone product name = phone
      "iphone", "android", "samsung", "xiaomi", "redmi", "oppo", "vivo", "huawei",
      // Common typos
      "smarphone", "smartfone", "fone",
    ],
    keywords: ["telephone", "telephones", "smartphone", "smartphones", "cellular"],
    chapters: ["85"],
  },

  // Television receivers (what consumers buy) — HS 85.28 specifically.
  // The keyword "reception apparatus" is the formal HS term for TV receivers,
  // which distinguishes them from broadcasting/transmission gear in 85.25.
  { triggers: ["tv", "television", "televisions", "smart-tv", "smarttv", "led-tv", "ledtv", "lcd-tv", "lcdtv", "oled-tv", "oledtv"],
    keywords: ["reception apparatus", "television", "monitor"], chapters: ["85"] },

  // Audio — HS 85
  { triggers: ["headphone", "headphones", "earphone", "earphones", "earbud", "earbuds"],
    keywords: ["headphone", "headphones", "earphone", "earphones"], chapters: ["85"] },
  { triggers: ["speaker", "loudspeaker", "soundbar"],
    keywords: ["loudspeaker", "loudspeakers"], chapters: ["85"] },

  // Computing & data processing — HS 84
  {
    triggers: ["laptop", "notebook", "computer", "desktop", "tablet", "ipad", "macbook", "chromebook"],
    keywords: ["data processing", "automatic data processing", "portable"],
    chapters: ["84"],
  },
  { triggers: ["printer", "scanner"],
    keywords: ["printer", "printing", "scanner"], chapters: ["84"] },
  { triggers: ["keyboard", "mouse"],
    keywords: ["keyboard"], chapters: ["84"] },
  { triggers: ["monitor", "display"],
    keywords: ["monitor"], chapters: ["85"] },

  // Refrigeration — HS 84. Includes the very common "refridgerator" and
  // "refrigerater" misspellings, and short forms like "ice-box", "deep-freeze".
  {
    triggers: [
      "fridge", "fridges", "frige", "frigde",
      "refrigerator", "refrigerators",
      "refridgerator", "refridgerators", "refrigerater", "refrigeraters",
      "freezer", "freezers",
      "deepfreeze", "deep-freeze",
      "icebox", "ice-box",
      "minifridge", "mini-fridge",
    ],
    keywords: ["refrigerator", "refrigerators", "freezer", "freezers"],
    chapters: ["84"],
  },

  // Other home appliances
  { triggers: ["washing", "washer"],
    keywords: ["washing", "laundry"], chapters: ["84"] },
  { triggers: ["dryer", "dishwasher"],
    keywords: ["dryer", "dish washing", "dishwasher"], chapters: ["84"] },
  { triggers: ["microwave"],
    keywords: ["microwave"], chapters: ["85"] },
  { triggers: ["oven", "stove", "cooker"],
    keywords: ["oven", "stove", "cooker"], chapters: ["73", "85"] },
  { triggers: ["aircon", "conditioner", "conditioning"],
    keywords: ["air conditioning"], chapters: ["84"] },
  { triggers: ["heater", "heating"],
    keywords: ["heater", "heating"], chapters: ["85"] },
  { triggers: ["blender", "mixer", "grinder"],
    keywords: ["blender", "grinder"], chapters: ["85"] },
  { triggers: ["vacuum"],
    keywords: ["vacuum"], chapters: ["85"] },

  // Camera — HS 85, 90
  { triggers: ["camera", "camcorder"],
    keywords: ["camera", "cameras"], chapters: ["85", "90"] },

  // Charger / cable — HS 85
  { triggers: ["charger", "adapter", "cable", "powerbank"],
    keywords: ["charger", "adaptor", "cable"], chapters: ["85"] },

  // Lighting — HS 85, 94
  { triggers: ["led", "bulb", "bulbs"],
    keywords: ["lamp", "lamps", "light"], chapters: ["85", "94"] },
  { triggers: ["lamp", "lighting", "chandelier"],
    keywords: ["lamp", "lamps", "lighting"], chapters: ["94"] },

  // Clothing (knit) — HS 61
  { triggers: ["tshirt", "shirt", "shirts", "polo"],
    keywords: ["shirt", "shirts", "t-shirt"], chapters: ["61", "62"] },
  { triggers: ["jeans", "trousers", "trouser", "pants"],
    keywords: ["trousers"], chapters: ["61", "62"] },
  { triggers: ["jacket", "coat", "blazer"],
    keywords: ["jacket", "coat", "anorak"], chapters: ["61", "62"] },
  { triggers: ["dress", "gown"],
    keywords: ["dress", "dresses", "gown"], chapters: ["61", "62"] },
  { triggers: ["sock", "socks"],
    keywords: ["socks", "stockings", "hosiery"], chapters: ["61"] },
  { triggers: ["sweater", "pullover", "cardigan", "hoodie"],
    keywords: ["pullover", "cardigan", "sweater"], chapters: ["61"] },

  // Footwear — HS 64. Sports shoes (sneakers, training shoes, gym shoes,
  // tennis shoes) live in 6404; "sports footwear" as a keyword pulls those
  // entries up over 6401 (waterproof) when the user types "sneakers".
  {
    triggers: ["sneaker", "sneakers", "trainer", "trainers", "running"],
    keywords: ["sports footwear", "training shoes", "gym shoes"],
    chapters: ["64"],
  },
  {
    triggers: ["shoe", "shoes", "footwear", "boot", "boots",
               "sandal", "sandals", "heel", "heels", "slipper", "slippers"],
    keywords: ["footwear"],
    chapters: ["64"],
  },

  // Bags / luggage — HS 42
  { triggers: ["bag", "handbag", "backpack", "luggage", "suitcase", "wallet", "purse"],
    keywords: ["handbag", "luggage", "suitcase", "wallet"], chapters: ["42"] },

  // Furniture — HS 94. "table" is intentionally NOT a top-level trigger
  // because it has too many non-furniture meanings ("name plate table",
  // "periodic table", "table salt", "table tennis"). The bigram detection
  // catches "dining table" / "office table" via the dining/office triggers.
  { triggers: ["furniture", "chair", "sofa", "couch", "bed", "mattress", "wardrobe", "cupboard", "armchair", "stool"],
    keywords: ["furniture", "chair", "seat", "bed", "mattress"], chapters: ["94"] },
  // Tables ONLY when explicitly paired with a furniture context word
  { triggers: ["dining-table", "diningtable", "office-table", "officetable",
               "coffee-table", "coffeetable", "study-table", "studytable",
               "side-table", "sidetable"],
    keywords: ["furniture", "table", "seat"], chapters: ["94"] },

  // Sign-plates, name-plates, address-plates — HS 83.10
  // Catches "name plate", "sign plate", "name-plate", "signboard", etc.
  // Bigram detection handles "name" + "plate" → "nameplate" / "name-plate".
  {
    triggers: ["nameplate", "name-plate", "namebadge", "name-badge", "nametag", "name-tag",
               "signplate", "sign-plate", "signboard", "sign-board", "signage"],
    keywords: ["sign plate", "name-plate", "address-plate", "name plate", "sign-plate"],
    chapters: ["83"],
  },

  // Phone cases / covers / screen protectors — HS 39 (plastic articles) or
  // 42 (leather goods). Bigrams catch "phone case" / "screen guard" / etc.
  // Brand-specific bigrams ("iphonecase", "samsungcase", "redmicase") ensure
  // the case wins over the phone category when the user includes a brand name.
  {
    triggers: [
      "phonecase", "phone-case", "phonecover", "phone-cover",
      "iphonecase", "iphone-case", "iphonecover", "iphone-cover",
      "samsungcase", "samsung-case", "redmicase", "redmi-case",
      "androidcase", "android-case", "mobilecase", "mobile-case",
      "screenguard", "screen-guard", "screenprotector", "screen-protector",
      "tempered-glass", "temperedglass",
    ],
    keywords: ["plastic", "case", "cover", "film"],
    chapters: ["39", "42"],
  },

  // Mouse pads / desk pads / floor mats (NOT yoga mats — those are in gym)
  {
    triggers: ["mousepad", "mouse-pad", "deskpad", "desk-pad",
               "floormat", "floor-mat", "doormat", "door-mat",
               "tablemat", "table-mat", "placemat", "place-mat"],
    keywords: ["mat", "floor covering", "carpet"],
    chapters: ["39", "42", "57"],
  },

  // Acrylic articles — bigrams catch "acrylic [thing]" combinations
  {
    triggers: ["acrylic", "plexiglass", "perspex", "lucite",
               "acrylic-sheet", "acrylicsheet", "acrylic-board", "acrylicboard"],
    keywords: ["acrylic", "polymethyl", "plastic"],
    chapters: ["39"],
  },

  // Personal care
  { triggers: ["shampoo"],         keywords: ["shampoo", "hair preparation"], chapters: ["33"] },
  { triggers: ["perfume", "cologne", "fragrance"], keywords: ["perfume"], chapters: ["33"] },
  { triggers: ["lotion", "moisturizer"], keywords: ["skin", "lotion"], chapters: ["33"] },
  { triggers: ["lipstick", "makeup", "mascara"], keywords: ["lip", "make-up", "makeup"], chapters: ["33"] },
  { triggers: ["soap"],            keywords: ["soap"], chapters: ["34"] },
  { triggers: ["detergent"],       keywords: ["detergent"], chapters: ["34"] },
  { triggers: ["toothpaste", "toothbrush"], keywords: ["dentifrice", "toothbrush"], chapters: ["33", "96"] },
  { triggers: ["razor", "shaver", "trimmer"], keywords: ["razor", "shaver"], chapters: ["82"] },
  { triggers: ["diaper", "diapers"], keywords: ["diaper", "napkin"], chapters: ["96"] },

  // Food & drink
  { triggers: ["coffee"],   keywords: ["coffee"], chapters: ["09"] },
  { triggers: ["tea"],      keywords: ["tea"], chapters: ["09"] },
  { triggers: ["chocolate", "cocoa"], keywords: ["chocolate", "cocoa"], chapters: ["18"] },
  { triggers: ["sugar"],    keywords: ["sugar"], chapters: ["17"] },
  { triggers: ["rice"],     keywords: ["rice"], chapters: ["10"] },
  { triggers: ["flour"],    keywords: ["flour"], chapters: ["11"] },
  { triggers: ["beer"],     keywords: ["beer"], chapters: ["22"] },
  { triggers: ["wine"],     keywords: ["wine"], chapters: ["22"] },
  { triggers: ["whisky", "whiskey", "vodka", "rum", "gin"], keywords: ["whisky", "spirits"], chapters: ["22"] },
  { triggers: ["juice"],    keywords: ["juice"], chapters: ["20"] },
  { triggers: ["biscuit", "biscuits", "cookie", "cookies"], keywords: ["biscuit", "biscuits"], chapters: ["19"] },
  { triggers: ["noodle", "noodles", "pasta"], keywords: ["pasta", "noodles"], chapters: ["19"] },

  // Auto / transport
  { triggers: ["car", "automobile"], keywords: ["motor cars", "passenger"], chapters: ["87"] },
  { triggers: ["motorcycle", "motorbike", "scooter"], keywords: ["motorcycle"], chapters: ["87"] },
  { triggers: ["truck", "lorry"], keywords: ["motor vehicles", "transport"], chapters: ["87"] },
  { triggers: ["tire", "tyre", "tires", "tyres"], keywords: ["tyres", "tires"], chapters: ["40"] },
  { triggers: ["bicycle", "cycle"], keywords: ["bicycle"], chapters: ["87"] },

  // Batteries — HS 85
  { triggers: ["battery", "batteries"], keywords: ["accumulator", "battery", "cell"], chapters: ["85"] },

  // Watches — HS 91
  { triggers: ["watch", "wristwatch", "smartwatch"], keywords: ["watch", "watches", "wrist-watch"], chapters: ["91"] },

  // Toys — HS 95
  { triggers: ["toy", "toys", "doll", "dolls", "lego"], keywords: ["toy", "toys", "doll", "dolls"], chapters: ["95"] },

  // Tools — HS 82, 84
  { triggers: ["drill"], keywords: ["drilling"], chapters: ["82", "84"] },
  { triggers: ["hammer"], keywords: ["hammer"], chapters: ["82"] },
  { triggers: ["screwdriver"], keywords: ["screwdriver"], chapters: ["82"] },

  // Stationery
  { triggers: ["pen", "pens", "ballpoint"], keywords: ["ball-point", "ballpoint"], chapters: ["96"] },
  { triggers: ["pencil", "pencils"], keywords: ["pencil"], chapters: ["96"] },
];

// Reverse index: trigger word → its category entry. We need the whole entry
// (not just chapters) because we use both `keywords` and `chapters` at match
// time.
const TRIGGER_TO_CATEGORY = new Map();
for (const cat of CATEGORIES) {
  for (const t of cat.triggers) {
    if (!TRIGGER_TO_CATEGORY.has(t)) TRIGGER_TO_CATEGORY.set(t, []);
    TRIGGER_TO_CATEGORY.get(t).push(cat);
  }
}

// Match a search term in a description.
//   - Single-word terms use word-PREFIX matching: "phone" matches "phones" or
//     "phoned" but NOT "telephone" (since "phone" doesn't START a word in
//     "telephone"). This avoids substring false positives like "mat" matching
//     "mammals" or "pant" matching "pantothenic".
//   - Multi-word terms use plain substring (they're specific enough).
const matchTerm = (descLower, term) => {
  if (term.includes(" ")) return descLower.indexOf(term) !== -1;
  let idx = 0;
  while ((idx = descLower.indexOf(term, idx)) !== -1) {
    if (idx === 0) return true;
    const prev = descLower.charCodeAt(idx - 1);
    // Non-letter/digit before the term means we're at a word START
    const isWordChar = (prev >= 97 && prev <= 122) // a-z
                    || (prev >= 48 && prev <= 57); // 0-9
    if (!isWordChar) return true;
    idx += 1;
  }
  return false;
};

const tokenize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => (t.length >= 3 || SHORT_TOKEN_WHITELIST.has(t)) && !STOPWORDS.has(t));

// Score bonus when an entry's chapter matches the user's product category.
// Two tiers:
//   SINGLE_WORD_BONUS — when one of the user's tokens matches a trigger
//                       (e.g., "phone" → chapter 85)
//   BIGRAM_BONUS      — when a TWO-WORD compound matches a trigger
//                       (e.g., "phone case" → "phonecase" → chapter 39)
// Bigrams beat single-words decisively because they convey more specific
// intent: "phone case" should land in plastic/leather cases (39/42), NOT
// in telephones (85), even though "phone" alone would point to 85.
const SINGLE_WORD_BONUS = 1000;
const BIGRAM_BONUS = 5000;

export const autoMatchHsCode = (productName) => {
  if (!bundleData) return { code: null, confidence: "none", alternatives: [] };
  const trimmed = String(productName || "").trim();
  if (!trimmed) return { code: null, confidence: "none", alternatives: [] };

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return { code: null, confidence: "none", alternatives: [] };

  // Step 1: which categories do the user's tokens activate?
  // Single tokens AND bigrams (joined + hyphenated) are checked separately so
  // we can give bigram-matched categories a stronger chapter bonus than
  // single-word ones. E.g., "phone case" should land in plastic cases (39/42)
  // even though "phone" alone would activate telephones (85).
  const activeCategories = new Set();
  const singleWordChapters = new Set();
  const bigramChapters = new Set();

  // Single-word triggers
  for (const t of tokens) {
    const cats = TRIGGER_TO_CATEGORY.get(t);
    if (!cats) continue;
    for (const cat of cats) {
      activeCategories.add(cat);
      for (const ch of cat.chapters) singleWordChapters.add(ch);
    }
  }
  // Bigram triggers (joined and hyphenated forms of adjacent tokens)
  for (let i = 0; i < tokens.length - 1; i++) {
    const variants = [tokens[i] + tokens[i + 1], tokens[i] + "-" + tokens[i + 1]];
    for (const b of variants) {
      const cats = TRIGGER_TO_CATEGORY.get(b);
      if (!cats) continue;
      for (const cat of cats) {
        activeCategories.add(cat);
        for (const ch of cat.chapters) bigramChapters.add(ch);
      }
    }
  }
  const hasChapterPref = singleWordChapters.size > 0 || bigramChapters.size > 0;

  // Step 2: build the search-term list. Always includes the user's literal
  // tokens. If any category was activated, also include that category's
  // formal HS-tariff keywords so the matcher knows to look for "refrigerator"
  // when the user typed "fridge", or "telephone" when they typed "phone".
  const searchTerms = new Set(tokens);
  for (const cat of activeCategories) {
    for (const kw of cat.keywords || []) searchTerms.add(kw);
  }
  const searchList = Array.from(searchTerms);

  // Step 3: score every entry.
  let best = null;
  let bestScore = 0;
  let bestTermScore = 0;
  let bestCode = "";
  const top = [];
  const idx = lowerDescIndex;
  const len = idx.length;

  for (let i = 0; i < len; i++) {
    const e = idx[i];
    let termScore = 0;
    for (let j = 0; j < searchList.length; j++) {
      if (matchTerm(e.descLower, searchList[j])) termScore++;
    }
    // Bigram-matched chapters dominate single-word ones. Both are added
    // (so a chapter activated by both gets the larger bonus).
    const ch2 = e.code.slice(0, 2);
    const inBigram = bigramChapters.has(ch2);
    const inSingle = singleWordChapters.has(ch2);
    const score = termScore
      + (inBigram ? BIGRAM_BONUS : 0)
      + (inSingle ? SINGLE_WORD_BONUS : 0);

    // Drop entries with no signal at all
    if (score === 0) continue;

    // Tie-breaker: codes ending in .00 (primary entries in their subheading)
    // are preferred over .10 / .90 / .99 specializations; then by ascending
    // code (which usually puts more general headings first).
    const isPrimary = e.code.endsWith(".00");
    const bestIsPrimary = best && best.code.endsWith(".00");
    let isBetter = score > bestScore;
    if (!isBetter && score === bestScore) {
      if (isPrimary && !bestIsPrimary) isBetter = true;
      else if (isPrimary === bestIsPrimary && e.code < bestCode) isBetter = true;
    }
    if (isBetter) {
      bestScore = score;
      bestTermScore = termScore;
      best = e;
      bestCode = e.code;
    }
    top.push({ entry: e, score, termScore });
  }

  if (!best) return { code: null, confidence: "none", alternatives: [] };

  // "Preferred" for sorting/confidence = either bigram-matched OR single-word-matched chapter
  const inAnyPreferred = (code) => {
    const ch = code.slice(0, 2);
    return bigramChapters.has(ch) || singleWordChapters.has(ch);
  };

  // Sort alternatives: prefer entries IN any preferred chapter (bigram first,
  // then single-word), then by raw term score desc, then code asc.
  top.sort((a, b) => {
    const aBg = bigramChapters.has(a.entry.code.slice(0, 2));
    const bBg = bigramChapters.has(b.entry.code.slice(0, 2));
    if (aBg !== bBg) return aBg ? -1 : 1;
    const aP = inAnyPreferred(a.entry.code);
    const bP = inAnyPreferred(b.entry.code);
    if (aP !== bP) return aP ? -1 : 1;
    if (b.termScore !== a.termScore) return b.termScore - a.termScore;
    return a.entry.code.localeCompare(b.entry.code);
  });
  const alternatives = top.slice(0, 5).map((t) => ({
    code: t.entry.code,
    description: t.entry.desc,
    score: t.termScore,
  }));

  // Confidence reflects whether the matcher had real signal beyond chapter
  // preference alone. Bigram match + at least 1 term match = high confidence.
  const inPreferredFinal = inAnyPreferred(best.code);
  let confidence;
  if (inPreferredFinal && bestTermScore >= 1) confidence = "high";
  else if (bestTermScore >= 2) confidence = "high";
  else if (bestTermScore >= 1 || inPreferredFinal) confidence = "medium";
  else confidence = "low";

  return { code: best.code, confidence, alternatives };
};

// --- Unit-aware quantity helper ---
//
// Specific duties (Rs/unit) in the Nepal tariff multiply by the QUANTITY in
// the unit specified by the HS row, NOT by the invoice line's quantity.
//
// First we check whether the invoice line's `unit` MATCHES the HS row's unit:
//   - row "kg" + invoice "KG"      → use item.quantity (it's already in kg)
//   - row "L"  + invoice "Litre"   → use item.quantity (already in litres)
//   - row "no" + invoice "Unit"    → use item.quantity (already pieces)
//   - row "ton" + invoice "KG"     → use item.quantity / 1000
// Otherwise fall back to dedicated measurement fields:
//   - row "kg"  + invoice "Box"/"Pallet"/"Carton" → use item.weight
//   - row "ton" → use item.weight / 1000
//   - row "m3"  → use item.cbm
//   - everything else → item.quantity
//
// Returns 0 if the required measurement is missing (UI shows a warning).
const norm = (s) => String(s || "").toLowerCase().trim();
const isLitreInvUnit = (u) => u === "litre" || u === "l" || u === "ltr";
const isPieceInvUnit = (u) => u === "unit" || u === "no" || u === "pcs" || u === "piece";
const isKgInvUnit    = (u) => u === "kg" || u === "kgs" || u === "kilogram" || u === "kilograms";

export const unitQuantityForItem = (item, rowUnit) => {
  if (!rowUnit) return parseFloat(item?.quantity) || 0;
  const u = norm(rowUnit);
  const inv = norm(item?.unit);

  // Direct match: invoice unit matches HS row unit → quantity IS the measurement
  if (u === "kg"  && isKgInvUnit(inv))    return parseFloat(item?.quantity) || 0;
  if (u === "L"   && isLitreInvUnit(inv)) return parseFloat(item?.quantity) || 0;
  if (u === "no"  && isPieceInvUnit(inv)) return parseFloat(item?.quantity) || 0;
  if (u === "ton" && isKgInvUnit(inv))    return (parseFloat(item?.quantity) || 0) / 1000;

  // Fallback: invoice unit is Box/Pallet/Carton/etc. → need dedicated measurement
  if (u === "kg")               return parseFloat(item?.weight) || 0;
  if (u === "ton" || u === "t") return (parseFloat(item?.weight) || 0) / 1000;
  if (u === "m3" || u === "cbm" || u === "m³") return parseFloat(item?.cbm) || 0;
  return parseFloat(item?.quantity) || 0;
};

// Returns which field on the item supplies the multiplier for this unit, so
// the UI can prompt the user to fill the right input.
//   "weight" | "cbm" | "quantity" | null (if no specific-duty multiplier needed)
//
// itemUnit is optional — when provided, lets us return "quantity" if the
// invoice line is already in the right unit (KG/Litre/Unit) and no separate
// weight/cbm field is needed.
export const requiredFieldForUnit = (rowUnit, itemUnit) => {
  if (!rowUnit) return "quantity";
  const u = norm(rowUnit);
  const inv = norm(itemUnit);

  // Direct match → quantity IS the right field
  if (u === "kg"  && isKgInvUnit(inv))    return "quantity";
  if (u === "L"   && isLitreInvUnit(inv)) return "quantity";
  if (u === "no"  && isPieceInvUnit(inv)) return "quantity";
  if (u === "ton" && isKgInvUnit(inv))    return "quantity";

  if (u === "kg" || u === "ton" || u === "t") return "weight";
  if (u === "m3" || u === "cbm" || u === "m³") return "cbm";
  return "quantity";
};

// Map the HS row's unit (kg/L/no/m3/etc.) to the matching invoice-line
// unit option (KG/Litre/Unit). Returns null if no matching invoice option
// exists — the UI should leave the user's choice alone in that case.
export const invoiceUnitForHsUnit = (hsUnit) => {
  if (!hsUnit) return null;
  const u = norm(hsUnit);
  if (u === "kg" || u === "ton" || u === "t") return "KG";
  if (u === "L") return "Litre";
  if (u === "no" || u === "gota") return "Unit";
  return null;
};

// Spirits codes (chapter 22) where Nepal customs charges duty per "LP-litre"
// (litre of pure alcohol = bulk litres × ABV%). The PDF shows the rate as
// Rs/L but the actual basis is LP-litres. Without ABV scaling, a 40% whisky
// shipment would be charged 2.5× too much customs duty.
//
//   2207.10.00 / 2207.20.00 — undenatured / denatured ethyl alcohol
//   2208.20.x..2208.90.x   — distilled spirits (whisky, vodka, rum, gin, etc.)
//   2208.10.x              — compound alcoholic preparations (NOT LP-litre)
export const isLpLitreCode = (code) => {
  if (!code) return false;
  if (code.startsWith("2207.")) return true;
  if (code.startsWith("2208.") && !code.startsWith("2208.10")) return true;
  return false;
};

// Default ABV % to use for an LP-litre spirits code when the user hasn't
// entered one. 40% covers most spirits (whisky, vodka, rum, gin, brandy).
// Beer (~5%) and wine (~12%) aren't in this list — they're charged per bulk
// litre, not per LP-litre.
export const defaultAbvForCode = (code) => {
  if (!isLpLitreCode(code)) return null;
  if (code.startsWith("2207.")) return 95;  // pure ethanol ≈ 95%
  return 40;                                 // typical spirits
};

// The effective multiplier for a row's specific duty.
//   - For most rows: just the unit-mapped quantity (kg → weight, m³ → cbm, etc.)
//   - For LP-litre spirits codes with unit "L": volume × ABV/100 (so charging
//     happens on litre-of-pure-alcohol basis, matching Nepal's actual rule).
//
// `item.alcoholAbv` is the per-item ABV %. Falls back to the per-code default.
export const effectiveDutyMultiplier = (item, row) => {
  let qty = unitQuantityForItem(item, row?.unit);
  if (row && isLpLitreCode(row.code) && row.unit === "L") {
    const abv = parseFloat(item?.alcoholAbv);
    const effectiveAbv = Number.isFinite(abv) && abv > 0 ? abv : defaultAbvForCode(row.code);
    if (effectiveAbv) qty = qty * (effectiveAbv / 100);
  }
  return qty;
};

// --- Const exports for static UI labels ---

export const TOTAL_CODE_COUNT = 6315;
