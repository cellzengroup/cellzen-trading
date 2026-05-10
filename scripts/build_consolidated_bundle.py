"""Consolidate all 6,315 HS records into a single compact bundle for the frontend.

Why single bundle instead of 96 chapter files: predictable sub-millisecond
performance for every operation. With chapter splits, the FIRST lookup in any
new chapter pays a network roundtrip (~50–200ms). With a single bundle:
  - Initial panel load: one fetch (~150 KB gzipped) ≈ 200–500 ms
  - Every operation after that: pure in-memory dict lookup, < 0.5 ms

Output: frontend/src/data/hsTariff.bundle.json
Schema (compact):
  {
    "v":  "2082-83",                           # tariff version
    "n":  6315,                                # total codes
    "c":  {                                    # codes, keyed by 8-digit code
      "0101.21.00": {
        "d":  "Horses; live, pure-bred…",      # description
        "u":  "no",                            # unit
        "cs": 6,    "co": 10,                  # customs duty: SAARC, Other
        "e":  null, "a":  null, "t":  null,    # excise, agriFee, advTax (%)
        "v":  13,                              # VAT (%)
        "s":  null,                            # specific duty (NPR per unit)
        "es": 18.65, "ei": 19.78,              # effective rate: SAARC, India
        "et": 18.65, "eo": 24.30,              # effective rate: Tibet, Other
        "p":  13,                              # source PDF page
        "r":  false                            # reference-only flag (true → no rates)
      }, ...
    }
  }
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / "scripts" / "hs_tariff_extracted.json"
WCO  = ROOT / "scripts" / "wco_hs2017.csv"
OUT  = ROOT / "frontend" / "src" / "data" / "hsTariff.bundle.json"

# Reuse merger output if available; otherwise fall back to the raw extract.
# We ALWAYS read from the merged output to keep descriptions consistent.
import csv

wco_by_code = {}
with WCO.open(encoding="utf-8") as fh:
    for row in csv.DictReader(fh):
        wco_by_code[row["hscode"]] = row["description"].strip()

with SRC.open(encoding="utf-8") as fh:
    nepal = json.load(fh)

bundle_codes = {}
for r in nepal:
    code8 = r["hs8"]
    digits = code8.replace(".", "")
    code6 = digits[:6]
    code4 = digits[:4]

    description = (wco_by_code.get(code6)
                   or (wco_by_code.get(code4) + " (national subheading)" if wco_by_code.get(code4) else None)
                   or "(description unavailable)")

    is_ref = r.get("dataSource") == "reference"

    # Normalize specific duty.
    #
    # The extractor (post-rewrite) emits `specificDutyNpr` as a SINGLE scalar
    # already in the row's unit (i.e., per-quintal and per-thousand divisors
    # applied at extraction time). Older bundles may have emitted it as
    # a list of {x, value} objects — we still accept both forms here for
    # safety.
    raw_s = r.get("specificDutyNpr")
    spec = None
    if raw_s is not None:
        if isinstance(raw_s, list) and raw_s:
            first = raw_s[0]
            if isinstance(first, dict) and "value" in first:
                spec = float(first["value"])
            else:
                spec = float(first) if isinstance(first, (int, float)) else None
            # Legacy list-form values from chapter 17 were not yet
            # quintal-divided at extraction time, so apply that here.
            if spec is not None and code8.startswith("17") and r.get("unit") == "kg":
                spec = round(spec / 100, 4)
        elif isinstance(raw_s, (int, float)):
            spec = float(raw_s)

    record = {
        "d":  description,
        "u":  r.get("unit"),
        "cs": r.get("saarc"),
        "co": r.get("other"),
        "e":  r.get("excise"),
        "a":  r.get("agriFee"),
        "t":  r.get("advTax"),
        "v":  r.get("vat"),
        "s":  spec,
        "es": r.get("eff_saarc"),
        "ei": r.get("eff_india"),
        "et": r.get("eff_tibet"),
        "eo": r.get("eff_other"),
        "p":  r.get("page"),
    }
    if is_ref:
        record["r"] = 1  # mark reference-only entries; absent for main tariff

    # Drop null fields entirely from reference-only records to save bytes,
    # since they don't have rate data anyway.
    if is_ref:
        record = {k: v for k, v in record.items() if v is not None}
        record["r"] = 1
    else:
        # For main entries, keep all fields (even nulls) so the schema is
        # predictable in the runtime helper.
        pass

    bundle_codes[code8] = record

bundle = {
    "v": "2082-83",
    "n": len(bundle_codes),
    "c": bundle_codes,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(bundle, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
size = OUT.stat().st_size
print(f"Wrote {OUT.relative_to(ROOT)} ({size:,} bytes, {len(bundle_codes):,} codes)")
print(f"  avg {size // len(bundle_codes)} bytes per code")

# Quick stats
main_count = sum(1 for r in bundle_codes.values() if r.get("r") != 1)
ref_count  = len(bundle_codes) - main_count
print(f"  main tariff: {main_count:,}")
print(f"  reference-only (no rates): {ref_count:,}")
