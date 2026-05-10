"""Look at words near top and bottom of pages to identify page headers/footers."""
import fitz

PDF = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\frontend\public\Customs_Tarrif_2083.pdf"
doc = fitz.open(PDF)

OUT = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\y_extremes.txt"
lines = []

for p_idx in [30, 50, 100, 200, 478, 600]:
    page = doc[p_idx]
    words = page.get_text("words")
    page_h = page.rect.height
    lines.append(f"\n=== page {p_idx + 1} (height = {page_h:.1f}) ===")
    # Top of page (y < 60)
    top = sorted([(w[1], w[0], w[4]) for w in words if w[1] < 60])
    lines.append(f"  TOP (y < 60): {top[:10]}")
    # Bottom of page (y > page_h - 80)
    bot = sorted([(w[1], w[0], w[4]) for w in words if w[1] > page_h - 80])
    lines.append(f"  BOTTOM (y > {page_h - 80:.0f}): {bot[:10]}")

open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print(open(OUT, encoding="utf-8").read())
