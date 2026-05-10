"""Merge Nepal-extracted duty rates with WCO HS English descriptions.

Input:
  - hs_tariff_extracted.json  (Nepal duty rates, keyed by 8-digit code)
  - wco_hs2022.csv            (WCO English descriptions: 2/4/6-digit hierarchy)

Output:
  - frontend/src/data/hsTariff.json  (final, English, structured)

Each output row has:
  {
    code:        "0101.21.00",          # 8-digit Nepal code
    code6:       "010121",              # 6-digit WCO subheading
    heading:     "0101",                # 4-digit WCO heading
    chapter:     "01",                  # 2-digit chapter
    section:     "I",                   # WCO section (Roman)
    description: "Horses; live, pure-bred breeding animals",  # WCO English
    headingDesc: "Horses, asses, mules and hinnies; live",
    chapterDesc: "Animals; live",
    unit:        "no",
    customsDuty: { saarc: 6, other: 10 },
    excise:      null,
    agriFee:     5,                     # 5% (with footnote when star=true)
    advTax:      null,
    vat:         13,
    effectiveRate: { saarc: 18.65, india: 19.78, tibet: 18.65, other: 24.30 }
  }
"""
import csv
import json
from pathlib import Path
from collections import defaultdict

EXTRACTED = Path(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\hs_tariff_extracted.json")
WCO_CSV   = Path(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\wco_hs2022.csv")
OUT_FRONT = Path(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\frontend\src\data\hsTariff.json")
OUT_META  = Path(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\frontend\src\data\hsTariff.meta.json")

# --- 1. Load WCO English data ---
wco_by_code = {}    # code (no dots, padded) -> {description, parent, level, section}
sections = {}       # section roman numeral -> seen
with WCO_CSV.open(encoding="utf-8") as fh:
    for row in csv.DictReader(fh):
        wco_by_code[row["hscode"]] = {
            "description": row["description"].strip(),
            "parent":      row["parent"].strip(),
            "level":       int(row["level"]),
            "section":     row["section"].strip(),
        }
        sections[row["section"]] = True

print(f"Loaded WCO HS data: {len(wco_by_code)} codes "
      f"across {len(sections)} sections")

def lookup(code: str):
    """Return WCO entry or None."""
    return wco_by_code.get(code)

# --- 2. Load Nepal extracted data ---
with EXTRACTED.open(encoding="utf-8") as fh:
    nepal = json.load(fh)
print(f"Loaded Nepal extracted data: {len(nepal)} HS codes")

# --- 3. Merge ---
merged = []
hits_6, hits_4, misses = 0, 0, 0
miss_examples = []

for r in nepal:
    code8 = r["hs8"]                  # "0101.21.00"
    digits = code8.replace(".", "")   # "01012100"
    code6  = digits[:6]               # "010121"
    code4  = digits[:4]               # "0101"
    code2  = digits[:2]               # "01"

    wco6 = lookup(code6)
    wco4 = lookup(code4)
    wco2 = lookup(code2)

    if wco6:
        description = wco6["description"]
        hits_6 += 1
    elif wco4:
        description = wco4["description"] + " (national subheading)"
        hits_4 += 1
    else:
        description = "(description unavailable — code not found in WCO HS 2022)"
        misses += 1
        if len(miss_examples) < 10:
            miss_examples.append(code8)

    # Specific duty (Rs/unit) for sugar / tobacco / alcohol / petroleum.
    # These are alternative or additive to the ad-valorem rates and matter
    # for accurate landed-cost calculation on those goods.
    specific_duty_npr = None
    raw_spec = r.get("specificDutyNpr")
    if raw_spec is not None:
        # New extractor emits a scalar (already per-row-unit normalized).
        # Older extractors emitted a list of {x, value} dicts.
        if isinstance(raw_spec, (int, float)):
            specific_duty_npr = float(raw_spec)
        elif isinstance(raw_spec, list) and raw_spec:
            specific_duty_npr = max(d.get("value", 0) for d in raw_spec if isinstance(d, dict))

    # Slim runtime record. Dropped fields (saved ~700 KB raw / ~35 KB gzipped):
    #   - code6        → derive at runtime from code (`code.replace(/\D/g,'').slice(0,6)`)
    #   - section      → unused in UI
    #   - headingDesc  → unused in UI
    #   - chapterDesc  → unused in UI
    # Numeric customsDuty / effectiveRate are kept as flat floats; the nested
    # objects are intentionally preserved for clarity over byte-shaving.
    merged.append({
        "code":          code8,
        "heading":       code4,
        "chapter":       code2,
        "description":   description,
        "unit":          r.get("unit"),
        "customsDuty": {
            "saarc":     r.get("saarc"),
            "other":     r.get("other"),
        },
        "excise":            r.get("excise"),
        "agriFee":           r.get("agriFee"),
        "advTax":            r.get("advTax"),
        "vat":               r.get("vat"),
        "specificDutyNpr":   specific_duty_npr,
        "effectiveRate": {
            "saarc":     r.get("eff_saarc"),
            "india":     r.get("eff_india"),
            "tibet":     r.get("eff_tibet"),
            "other":     r.get("eff_other"),
        },
        "dataSource":    r.get("dataSource", "main"),
        "page":          r.get("page"),
    })

print(f"\nDescription match results:")
print(f"  6-digit WCO match (best):     {hits_6:5d} ({hits_6/len(nepal)*100:.1f}%)")
print(f"  4-digit fallback:             {hits_4:5d} ({hits_4/len(nepal)*100:.1f}%)")
print(f"  no match (HS 2022 additions): {misses:5d} ({misses/len(nepal)*100:.1f}%)")
if miss_examples:
    print(f"  example unmatched codes: {miss_examples}")

# --- 4. Write output ---
OUT_FRONT.parent.mkdir(parents=True, exist_ok=True)
OUT_FRONT.write_text(json.dumps(merged, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(f"\nWrote {OUT_FRONT.relative_to(OUT_FRONT.parents[3])} "
      f"({OUT_FRONT.stat().st_size:,} bytes, {len(merged)} entries)")

# Metadata sidecar
meta = {
    "source":         "Nepal Customs Tariff 2082/83 (FY 2025/26 BS)",
    "publisher":      "Department of Customs, Ministry of Finance, Government of Nepal",
    "extractedFrom":  "Customs_Tarrif_2083.pdf (689 pages)",
    "descriptionSource": "WCO Harmonized System 2017 (public dataset, datasets/harmonized-system)",
    "totalEntries":   len(merged),
    "matchStats": {
        "wco6digit":  hits_6,
        "wco4digit":  hits_4,
        "noMatch":    misses,
    },
    "schema": {
        "code":          "8-digit Nepal HS code, formatted as XXXX.XX.XX",
        "code6":         "6-digit WCO international subheading",
        "heading":       "4-digit WCO heading",
        "chapter":       "2-digit chapter",
        "section":       "WCO section (Roman numeral)",
        "description":   "English description from WCO HS 2022 (best 6-digit match)",
        "unit":          "Unit of measure: kg | L | m | m2 | m3 | no | carat | ton",
        "customsDuty":   "Customs duty %: { saarc, other }",
        "excise":        "Excise duty % (अन्तःशुल्क)",
        "agriFee":       "Agriculture reform fee % (कृषि सुधार शुल्क)",
        "advTax":        "Advance income tax % (अग्रिम आय कर)",
        "vat":           "Value added tax % (मू.अ.कर)",
        "effectiveRate": "Total effective tax rate %: { saarc, india, tibet, other }",
        "page":          "Source PDF page (1-indexed)",
    },
    "notes": [
        "Item descriptions in the source PDF are in Nepali (Devanagari) — those have been replaced with English equivalents from the WCO HS standard, which Nepal officially follows.",
        "The 6-digit code (code6) is internationally standardized; the last 2 digits are Nepal-specific national subdivisions.",
        "Some HS 2022 additions (e.g. specific lithium-battery codes) won't match HS 2022 and fall back to the parent heading description.",
        "Some rates may be null when the source row had blank cells (e.g. excise blank for non-excisable goods).",
    ],
}
OUT_META.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Wrote metadata sidecar: {OUT_META.name}")

# Final spot-check: print a few entries the user can sanity-check
print("\n--- Spot check: sample entries ---")
for code in ["0101.21.00", "0308.11.00", "8501.10.00", "8517.13.00", "8703.80.10"]:
    hit = next((m for m in merged if m["code"] == code), None)
    if hit:
        print(f"\n  {hit['code']}  [{hit['unit']}]")
        print(f"    {hit['description']}")
        print(f"    customs: SAARC {hit['customsDuty']['saarc']}% | Other {hit['customsDuty']['other']}%")
        print(f"    VAT: {hit['vat']}%   excise: {hit['excise']}   agriFee: {hit['agriFee']}")
        print(f"    effective: SAARC {hit['effectiveRate']['saarc']}% | "
              f"India {hit['effectiveRate']['india']}% | "
              f"Tibet {hit['effectiveRate']['tibet']}% | "
              f"Other {hit['effectiveRate']['other']}%")
