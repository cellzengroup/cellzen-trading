"""Word-level layout inspection: prove we can parse the table by (x, y) positions
   instead of flat text. We pick a known data page and dump rows as positioned tokens.
"""
import fitz
from collections import defaultdict

PDF = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\frontend\public\Customs_Tarrif_2083.pdf"
OUT = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\words_layout.txt"

doc = fitz.open(PDF)
lines = []

# Inspect a few representative tariff data pages.
for page_idx in [30, 50, 100, 200]:
    page = doc[page_idx]
    words = page.get_text("words")  # (x0, y0, x1, y1, "word", block, line, word_idx)

    # Group words by their visual row (cluster by y0 within ~2pt tolerance)
    rows = defaultdict(list)
    for w in words:
        x0, y0, x1, y1, txt, *_ = w
        # Round y0 down to nearest 4pt — table rows are ~12pt apart
        bucket = round(y0 / 4) * 4
        rows[bucket].append((x0, txt))

    lines.append(f"\n{'='*100}")
    lines.append(f"=== PAGE {page_idx + 1} (sorted rows of (x, text) tokens) ===")
    lines.append(f"{'='*100}")
    for y in sorted(rows.keys()):
        toks = sorted(rows[y], key=lambda t: t[0])
        # Print as: y | x:text | x:text | ...
        line = f"y={y:6.1f} | " + " | ".join(f"{int(x):4d}:{t}" for x, t in toks)
        lines.append(line)

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))

print(f"Wrote layout dump to {OUT}")
