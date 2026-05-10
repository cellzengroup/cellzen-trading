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

const unpack = (code, packed) => {
  const out = {
    code,
    heading: code.slice(0, 4),       // "8517.13.00" → "8517"
    chapter: code.slice(0, 2),       // "8517.13.00" → "85"
    description:    packed.d,
    unit:           packed.u,
    page:           packed.p,
    specificDutyNpr: packed.s ?? null,
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

// --- Const exports for static UI labels ---

export const TOTAL_CODE_COUNT = 6315;
