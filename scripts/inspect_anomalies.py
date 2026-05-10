"""Look at suspect rows to find parsing edge cases."""
import json

DATA = json.load(open(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\hs_tariff_extracted.json", encoding="utf-8"))

# Find values that look impossible: customs duty >100 or VAT not in {0, 13}
print("Implausible duty values (saarc or other > 100):")
for r in DATA:
    s, o = r.get("saarc"), r.get("other")
    if (s and s > 100) or (o and o > 100):
        print(f"  page {r['page']:3d} {r['hs8']} | saarc={s} other={o} vat={r.get('vat')}")

print("\nUnusual VAT values (not None / 0 / 13):")
unusual = [r for r in DATA if r.get("vat") not in (None, 0, 0.0, 13, 13.0)]
print(f"  count = {len(unusual)}")
for r in unusual[:10]:
    print(f"  page {r['page']:3d} {r['hs8']} vat={r.get('vat')}")

# Check 0308.11.00
print("\n0308.11.00 detail:")
r = next((x for x in DATA if x["hs8"] == "0308.11.00"), None)
if r:
    for k, v in r.items():
        print(f"  {k}: {v}")

print("\n8501.32.00 detail:")
r = next((x for x in DATA if x["hs8"] == "8501.32.00"), None)
if r:
    for k, v in r.items():
        print(f"  {k}: {v}")
