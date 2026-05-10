"""Dump word-level layout for the pages with parsing anomalies, so we can see
the actual column structure and fix the parser."""
import fitz
from collections import defaultdict

PDF = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\frontend\public\Customs_Tarrif_2083.pdf"
OUT = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\problem_pages.txt"

doc = fitz.open(PDF)
lines = []

# Chapter 17 (sugars) — pages with unusual VAT values
# Chapter 22 (alcohol) — page 685 = 2206.00.90 anomaly
# Page 619 = 0407.90.00 anomaly  ; pages 619-640 = no-SAARC cluster
# Pages 596-617 = appendix area
for p_idx in [486, 487, 488]:  # 0-indexed for PDF pages 487, 488, 489 (smartphone area)
    page = doc[p_idx]
    words = page.get_text("words")

    # Cluster by y0 with 4pt tolerance, merge adjacent close buckets
    rows = defaultdict(list)
    for w in words:
        x0, y0, x1, y1, txt, *_ = w
        bucket = round(y0 / 4) * 4
        rows[bucket].append((x0, txt))

    lines.append(f"\n{'='*100}")
    lines.append(f"=== PAGE {p_idx + 1} ===")
    lines.append(f"{'='*100}")
    for y in sorted(rows.keys()):
        toks = sorted(rows[y], key=lambda t: t[0])
        line = f"y={y:6.1f} | " + " | ".join(f"{int(x):4d}:{t}" for x, t in toks)
        lines.append(line)

open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print(f"Wrote {OUT}  ({sum(1 for _ in open(OUT, encoding='utf-8'))} lines)")
