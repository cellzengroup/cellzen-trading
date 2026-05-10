"""Quick sanity check on extracted HS data."""
import json
from collections import Counter, defaultdict

DATA = json.load(open(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\hs_tariff_extracted.json", encoding="utf-8"))

print(f"Total HS codes: {len(DATA)}")
print(f"Unique HS codes: {len(set(r['hs8'] for r in DATA))}")

# Field-completeness
fields = ["unit", "saarc", "other", "vat", "agriFee",
          "eff_saarc", "eff_india", "eff_tibet", "eff_other"]
for f in fields:
    have = sum(1 for r in DATA if r.get(f) is not None)
    print(f"  {f:14s}: {have:5d} populated ({have/len(DATA)*100:.1f}%)")

# Distribution of saarc duty rates
saarc = Counter(r.get("saarc") for r in DATA)
print(f"\nTop saarc rates: {saarc.most_common(10)}")

# Find rows with NO duty data (likely parsing failures or special "exempt" rows)
no_duty = [r for r in DATA if r.get("saarc") is None and r.get("other") is None]
print(f"\nRows with no SAARC and no Other duty: {len(no_duty)}")
if no_duty:
    print("First 5:")
    for r in no_duty[:5]:
        print(f"  page {r['page']:3d} hs8={r['hs8']}")

# Spot-check chapter 85 (electronics)
ch85 = [r for r in DATA if r["hs8"].startswith("85")]
print(f"\nChapter 85 (electronics): {len(ch85)} codes")
print("First 5:")
for r in ch85[:5]:
    print(f"  {r['hs8']} | unit={r.get('unit')} | saarc={r.get('saarc')} other={r.get('other')} | vat={r.get('vat')} | eff_o={r.get('eff_other')}")

# Duplicate check
dup = Counter(r['hs8'] for r in DATA)
dups = {k: v for k, v in dup.items() if v > 1}
print(f"\nDuplicate HS codes: {len(dups)} (top: {list(dups.items())[:10] if dups else 'none'})")
