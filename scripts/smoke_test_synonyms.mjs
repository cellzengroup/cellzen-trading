// Smoke test that exactly mirrors the new keyword + word-prefix matcher.
import { readFileSync } from "node:fs";

const bundle = JSON.parse(readFileSync(
  new URL("../frontend/src/data/hsTariff.bundle.json", import.meta.url),
  "utf-8",
));

const lowerDescIndex = [];
for (const code in bundle.c) {
  lowerDescIndex.push({
    code,
    descLower: (bundle.c[code].d || "").toLowerCase(),
    desc: bundle.c[code].d || "",
  });
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "or", "with", "without",
  "new", "used", "model", "type", "kind", "various", "assorted",
  "set", "kit", "item", "items", "piece", "pieces", "unit", "units",
  "is", "to", "in", "on", "at", "by", "be", "as",
]);
const SHORT_TOKEN_WHITELIST = new Set(["tv", "pc", "ac", "ab", "ev", "uv", "led", "lcd", "oled", "qled", "hd"]);

const CATEGORIES = [
  {
    triggers: [
      "gym", "gymnastic", "gymnastics", "fitness", "workout", "cardio", "exercise",
      "yoga", "pilates", "crossfit", "calisthenics",
      "dumbbell", "dumbbells", "dumbell", "dumbells", "dumb-bell", "dumb-bells",
      "barbell", "barbells", "barbel", "barbels",
      "kettlebell", "kettlebells", "kettlebel", "kettlebels", "kettle-bell",
      "weight", "weights", "weightlifting", "weight-lifting",
      "treadmill", "treadmils", "treadmil",
      "elliptical", "ellipticle",
      "rower", "stairclimber", "stairmaster", "spinning",
      "jumprope", "jump-rope", "skipping",
      "punching", "boxing-bag", "heavybag", "heavy-bag",
      "ab-roller", "abroller", "abs",
      "yogamat", "yoga-mat",
      "resistance-band",
    ],
    keywords: ["gymnastics", "athletics", "exercise", "weightlifting", "physical exercise", "physical training", "sports requisites"],
    chapters: ["95"],
  },
  {
    triggers: ["phone", "phones", "smartphone", "smartphones", "smart-phone", "cellphone", "cellphones", "cell-phone", "mobile", "iphone", "android", "samsung", "xiaomi", "redmi", "oppo", "vivo", "huawei", "smarphone", "smartfone", "fone"],
    keywords: ["telephone", "telephones", "smartphone", "smartphones", "cellular"],
    chapters: ["85"],
  },
  {
    triggers: ["tv", "television", "televisions", "smart-tv", "smarttv", "led-tv", "ledtv", "lcd-tv", "lcdtv", "oled-tv", "oledtv"],
    keywords: ["reception apparatus", "television", "monitor"],
    chapters: ["85"],
  },
  { triggers: ["laptop", "notebook", "computer", "desktop", "tablet", "ipad", "macbook", "chromebook"], keywords: ["data processing", "automatic data processing", "portable"], chapters: ["84"] },
  {
    triggers: ["fridge", "fridges", "frige", "frigde", "refrigerator", "refrigerators", "refridgerator", "refridgerators", "refrigerater", "refrigeraters", "freezer", "freezers", "deepfreeze", "deep-freeze", "icebox", "ice-box", "minifridge", "mini-fridge"],
    keywords: ["refrigerator", "refrigerators", "freezer", "freezers"],
    chapters: ["84"],
  },
  { triggers: ["aircon", "conditioner", "conditioning"], keywords: ["air conditioning"], chapters: ["84"] },
  { triggers: ["sneaker", "sneakers", "trainer", "trainers", "running"], keywords: ["sports footwear", "training shoes", "gym shoes"], chapters: ["64"] },
  { triggers: ["shoe", "shoes", "footwear", "boot", "boots", "sandal", "sandals"], keywords: ["footwear"], chapters: ["64"] },
  { triggers: ["jeans", "trousers", "trouser", "pants"], keywords: ["trousers"], chapters: ["61", "62"] },
  { triggers: ["microwave"], keywords: ["microwave"], chapters: ["85"] },
  { triggers: ["watch", "wristwatch", "smartwatch"], keywords: ["watch", "watches", "wrist-watch"], chapters: ["91"] },
];

const TRIGGER_TO_CATEGORY = new Map();
for (const cat of CATEGORIES) {
  for (const t of cat.triggers) {
    if (!TRIGGER_TO_CATEGORY.has(t)) TRIGGER_TO_CATEGORY.set(t, []);
    TRIGGER_TO_CATEGORY.get(t).push(cat);
  }
}

const tokenize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => (t.length >= 3 || SHORT_TOKEN_WHITELIST.has(t)) && !STOPWORDS.has(t));

const matchTerm = (descLower, term) => {
  if (term.includes(" ")) return descLower.indexOf(term) !== -1;
  let idx = 0;
  while ((idx = descLower.indexOf(term, idx)) !== -1) {
    if (idx === 0) return true;
    const prev = descLower.charCodeAt(idx - 1);
    const isWordChar = (prev >= 97 && prev <= 122) || (prev >= 48 && prev <= 57);
    if (!isWordChar) return true;
    idx += 1;
  }
  return false;
};

const CHAPTER_BONUS = 1000;

function autoMatch(productName) {
  const tokens = tokenize(productName);
  if (!tokens.length) return null;

  // Bigram detection — handles space-separated multi-word triggers
  const triggerCandidates = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    triggerCandidates.push(tokens[i] + tokens[i + 1]);
    triggerCandidates.push(tokens[i] + "-" + tokens[i + 1]);
  }

  const activeCategories = new Set();
  const preferredChapters = new Set();
  for (const t of triggerCandidates) {
    const cats = TRIGGER_TO_CATEGORY.get(t);
    if (!cats) continue;
    for (const cat of cats) {
      activeCategories.add(cat);
      for (const ch of cat.chapters) preferredChapters.add(ch);
    }
  }
  const hasChapterPref = preferredChapters.size > 0;

  const searchTerms = new Set(tokens);
  for (const cat of activeCategories) {
    for (const kw of cat.keywords || []) searchTerms.add(kw);
  }
  const searchList = Array.from(searchTerms);

  let best = null, bestScore = 0, bestTermScore = 0, bestCode = "";
  const top = [];
  for (const e of lowerDescIndex) {
    let termScore = 0;
    for (const term of searchList) if (matchTerm(e.descLower, term)) termScore++;
    const inPreferred = hasChapterPref && preferredChapters.has(e.code.slice(0, 2));
    const score = termScore + (inPreferred ? CHAPTER_BONUS : 0);
    if (score === 0) continue;
    const isPrimary = e.code.endsWith(".00");
    const bestIsPrimary = best && best.code.endsWith(".00");
    let isBetter = score > bestScore;
    if (!isBetter && score === bestScore) {
      if (isPrimary && !bestIsPrimary) isBetter = true;
      else if (isPrimary === bestIsPrimary && e.code < bestCode) isBetter = true;
    }
    if (isBetter) { bestScore = score; bestTermScore = termScore; best = e; bestCode = e.code; }
    top.push({ entry: e, score, termScore });
  }
  if (!best) return null;

  top.sort((a, b) => {
    const aPref = hasChapterPref && preferredChapters.has(a.entry.code.slice(0, 2));
    const bPref = hasChapterPref && preferredChapters.has(b.entry.code.slice(0, 2));
    if (aPref !== bPref) return aPref ? -1 : 1;
    if (b.termScore !== a.termScore) return b.termScore - a.termScore;
    return a.entry.code.localeCompare(b.entry.code);
  });

  const inFinal = hasChapterPref && preferredChapters.has(best.code.slice(0, 2));
  let confidence;
  if (inFinal && bestTermScore >= 1) confidence = "high";
  else if (bestTermScore >= 2) confidence = "high";
  else if (bestTermScore >= 1 || inFinal) confidence = "medium";
  else confidence = "low";

  return {
    code: best.code, chapter: best.code.slice(0, 2),
    inPreferred: inFinal,
    confidence,
    termScore: bestTermScore,
    desc: best.desc,
    altList: top.slice(1, 4).map(t => ({ code: t.entry.code, desc: t.entry.desc, ts: t.termScore })),
  };
}

const cases = [
  // Common typos that should still work
  "Dumbell",                  // single-b typo
  "Dumbells Set",             // single-b typo plural
  "dumb bell",                // space-separated
  "kettlebel",                // single-l
  "treadmil",                 // single-l
  "ellipticle",               // wrong vowel
  "barbel",                   // single-l
  "Refridgerator",            // common typo
  "Smarphone",                // missing t
  "fone",                     // slang
  // Specific gym equipment
  "Gym",
  "Gym Equipment",
  "Heavy Weights",
  "Dumbbell Set",
  "Barbell 20kg",
  "Kettlebell",
  "Treadmill",
  "Punching Bag",
  "Jump Rope",
  "Yoga Mat",
  "Resistance Band",
  "Ab Roller",
  // Phones (with brand names + typos)
  "Phone",
  "iPhone 15",
  "Samsung Galaxy",
  "Smartphone XYZ",
  // Other common products
  "Refrigerator",
  "Fridge",
  "TV 55 inch",
  "Smart TV",
  "Television",
  "Laptop Computer",
  "Sneakers",
  "Running Shoes",
  "Jeans",
  "Air Conditioner",
  "Stainless Steel Pipe",
  "Microwave Oven",
  "Smart Watch",
];

for (const name of cases) {
  const r = autoMatch(name);
  console.log(`\n"${name}" — tokens [${tokenize(name).join(", ")}]`);
  if (!r) { console.log("  → no match"); continue; }
  console.log(`  → ${r.code} ch.${r.chapter} ${r.inPreferred ? "✓ preferred" : ""}`);
  console.log(`    "${r.desc}"`);
  console.log(`    confidence: ${r.confidence}, term hits: ${r.termScore}`);
}
