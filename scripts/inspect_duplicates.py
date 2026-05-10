"""Inspect HS code duplicates: are they true duplicates (different sections of PDF
   with different rates), or parsing artifacts?"""
import json
from collections import defaultdict

DATA = json.load(open(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\hs_tariff_extracted.json", encoding="utf-8"))

by_code = defaultdict(list)
for r in DATA:
    by_code[r["hs8"]].append(r)

# Look at codes appearing multiple times
codes_with_dupes = {k: v for k, v in by_code.items() if len(v) > 1}
print(f"Codes appearing >1 time: {len(codes_with_dupes)}")

# Sample a few and show which pages they came from
for code in ["0102.21.00", "0103.10.00", "0501.00.00", "8501.10.00", "8517.13.00"]:
    if code in by_code:
        print(f"\n=== {code} ({len(by_code[code])} entries) ===")
        for r in by_code[code]:
            print(f"  page {r['page']:3d} | unit={r.get('unit')} | saarc={r.get('saarc')} other={r.get('other')} | vat={r.get('vat')} | "
                  f"eff_s={r.get('eff_saarc')} eff_o={r.get('eff_other')}")

# Check page-distribution of duplicates: do they cluster?
page_first = defaultdict(int)  # first occurrence pages
page_dupe = defaultdict(int)   # duplicate occurrence pages
for code, rows in by_code.items():
    rows_sorted = sorted(rows, key=lambda r: r["page"])
    page_first[rows_sorted[0]["page"]] += 1
    for r in rows_sorted[1:]:
        page_dupe[r["page"]] += 1

# Where do duplicates live?
print(f"\nDuplicate occurrences by page (top 20):")
for p, c in sorted(page_dupe.items(), key=lambda x: -x[1])[:20]:
    print(f"  page {p}: {c} duplicate codes")

# Range of pages where duplicates appear
if page_dupe:
    print(f"\nDuplicate pages range: {min(page_dupe)} to {max(page_dupe)}")
