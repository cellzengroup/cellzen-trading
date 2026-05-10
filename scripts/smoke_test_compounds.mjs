// Test the new compound-product categories.
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
const SHORT = new Set(["tv","pc","ac","ab","ev","uv","led","lcd","oled","qled","hd"]);

// Replicate the production CATEGORIES (only the relevant ones for this test)
const CATEGORIES = [
  { triggers: ["furniture","chair","sofa","couch","bed","mattress","wardrobe","cupboard","armchair","stool"], keywords: ["furniture","chair","seat","bed","mattress"], chapters: ["94"] },
  { triggers: ["dining-table","diningtable","office-table","officetable","coffee-table","coffeetable","study-table","studytable","side-table","sidetable"], keywords: ["furniture","table","seat"], chapters: ["94"] },
  { triggers: ["nameplate","name-plate","namebadge","name-badge","nametag","name-tag","signplate","sign-plate","signboard","sign-board","signage"], keywords: ["sign plate","name-plate","address-plate","name plate","sign-plate"], chapters: ["83"] },
  { triggers: ["phonecase","phone-case","phonecover","phone-cover","iphonecase","iphone-case","iphonecover","iphone-cover","samsungcase","samsung-case","redmicase","redmi-case","androidcase","android-case","mobilecase","mobile-case","screenguard","screen-guard","screenprotector","screen-protector","tempered-glass","temperedglass"], keywords: ["plastic","case","cover","film"], chapters: ["39","42"] },
  { triggers: ["mousepad","mouse-pad","deskpad","desk-pad","floormat","floor-mat","doormat","door-mat","tablemat","table-mat","placemat","place-mat"], keywords: ["mat","floor covering","carpet"], chapters: ["39","42","57"] },
  { triggers: ["acrylic","plexiglass","perspex","lucite","acrylic-sheet","acrylicsheet"], keywords: ["acrylic","polymethyl","plastic"], chapters: ["39"] },
  // Original ones we keep
  { triggers: ["phone","smartphone","smartphones","cellphone","cellphones","cell-phone","mobile","iphone"], keywords: ["telephone","telephones","smartphone","smartphones","cellular"], chapters: ["85"] },
];

const TRIGGER_TO_CATEGORY = new Map();
for (const cat of CATEGORIES) for (const t of cat.triggers) {
  if (!TRIGGER_TO_CATEGORY.has(t)) TRIGGER_TO_CATEGORY.set(t, []);
  TRIGGER_TO_CATEGORY.get(t).push(cat);
}

const tokenize = (s) => String(s||"").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter(t => (t.length >= 3 || SHORT.has(t)) && !STOPWORDS.has(t));

const matchTerm = (descLower, term) => {
  if (term.includes(" ")) return descLower.indexOf(term) !== -1;
  let idx = 0;
  while ((idx = descLower.indexOf(term, idx)) !== -1) {
    if (idx === 0) return true;
    const p = descLower.charCodeAt(idx - 1);
    if (!((p>=97&&p<=122)||(p>=48&&p<=57))) return true;
    idx += 1;
  }
  return false;
};

function autoMatch(productName) {
  const tokens = tokenize(productName);
  if (!tokens.length) return null;

  const activeCategories = new Set();
  const singleWordChapters = new Set();
  const bigramChapters = new Set();
  for (const t of tokens) {
    const cats = TRIGGER_TO_CATEGORY.get(t);
    if (!cats) continue;
    for (const cat of cats) {
      activeCategories.add(cat);
      for (const ch of cat.chapters) singleWordChapters.add(ch);
    }
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    for (const b of [tokens[i]+tokens[i+1], tokens[i]+"-"+tokens[i+1]]) {
      const cats = TRIGGER_TO_CATEGORY.get(b);
      if (!cats) continue;
      for (const cat of cats) {
        activeCategories.add(cat);
        for (const ch of cat.chapters) bigramChapters.add(ch);
      }
    }
  }
  const hasChapterPref = singleWordChapters.size > 0 || bigramChapters.size > 0;
  const searchTerms = new Set(tokens);
  for (const cat of activeCategories) for (const kw of cat.keywords||[]) searchTerms.add(kw);
  const searchList = Array.from(searchTerms);

  const SINGLE_BONUS = 1000, BIGRAM_BONUS = 5000;
  let best = null, bestScore = 0, bestTermScore = 0, bestCode = "";
  const top = [];
  for (const e of lowerDescIndex) {
    let termScore = 0;
    for (const term of searchList) if (matchTerm(e.descLower, term)) termScore++;
    const ch2 = e.code.slice(0, 2);
    const inBg = bigramChapters.has(ch2);
    const inSg = singleWordChapters.has(ch2);
    const score = termScore + (inBg ? BIGRAM_BONUS : 0) + (inSg ? SINGLE_BONUS : 0);
    const inPref = inBg || inSg;
    if (score === 0) continue;
    const isPrim = e.code.endsWith(".00");
    const bestPrim = best && best.code.endsWith(".00");
    let isBetter = score > bestScore;
    if (!isBetter && score === bestScore) {
      if (isPrim && !bestPrim) isBetter = true;
      else if (isPrim === bestPrim && e.code < bestCode) isBetter = true;
    }
    if (isBetter) { bestScore = score; bestTermScore = termScore; best = e; bestCode = e.code; }
    top.push({ entry: e, score, termScore });
  }
  if (!best) return null;
  return {
    code: best.code, chapter: best.code.slice(0,2),
    inPref: bigramChapters.has(best.code.slice(0,2)) || singleWordChapters.has(best.code.slice(0,2)),
    termScore: bestTermScore, desc: best.desc,
  };
}

const cases = [
  "Acrylic table name plate",
  "Acrylic name plate",
  "Name plate",
  "Sign board",
  "Phone case",
  "iPhone case",
  "Screen guard",
  "Tempered glass",
  "Mouse pad",
  "Door mat",
  "Office table",
  "Dining table",
  "Acrylic sheet",
  "Sofa",
  "Wooden chair",
];

for (const name of cases) {
  const r = autoMatch(name);
  console.log(`\n"${name}"`);
  if (!r) { console.log("  → no match"); continue; }
  console.log(`  → ${r.code} ch.${r.chapter} ${r.inPref ? "✓" : ""}  termScore=${r.termScore}`);
  console.log(`    "${r.desc.slice(0, 80)}"`);
}
