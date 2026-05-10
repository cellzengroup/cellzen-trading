"""Inspect remaining cleanup targets:
   1) which codes have specificDutyNpr captured
   2) the 30 unusual-VAT rows (real reduced VAT or parser bugs?)
"""
import json

DATA = json.load(open(r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\hs_tariff_extracted.json", encoding="utf-8"))

# 1) Specific duties
sd = [r for r in DATA if r.get("specificDutyNpr")]
print(f"Codes with specificDutyNpr captured: {len(sd)}")
for r in sd[:20]:
    print(f"  {r['hs8']:12s}  page {r['page']:3d}  saarc={r.get('saarc')} other={r.get('other')}  specific={r['specificDutyNpr']}")

# 2) Unusual VAT
unusual = [r for r in DATA if r.get("vat") not in (None, 0, 0.0, 13, 13.0)]
print(f"\n\nRows with non-{{None,0,13}} VAT ({len(unusual)} rows):")
for r in unusual[:30]:
    print(f"  page {r['page']:3d}  {r['hs8']:12s}  saarc={r.get('saarc')} other={r.get('other')} vat={r.get('vat')} eff_o={r.get('eff_other')}")
