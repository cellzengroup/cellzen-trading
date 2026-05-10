"""Sample Nepali Customs Tariff PDF — write UTF-8 to file to bypass console encoding issues."""
import fitz
import io

PDF = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\frontend\public\Customs_Tarrif_2083.pdf"
OUT = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\sample_output.txt"

doc = fitz.open(PDF)
buf = io.StringIO()
buf.write(f"Total pages: {doc.page_count}\n")

sample_pages = [0, 1, 2, 5, 10, 30, 50, 100, 200, 400, 600, 688]
for p in sample_pages:
    if p >= doc.page_count:
        continue
    buf.write(f"\n{'='*80}\n=== PAGE {p+1} ===\n{'='*80}\n")
    text = doc[p].get_text()
    buf.write(text[:3000])
    buf.write(f"\n[page total chars: {len(text)}]\n")

# Also list fonts on a few pages — confirms whether Preeti/legacy encoding is in use
buf.write("\n\n=== FONTS USED (page 10, 50, 100) ===\n")
for p in [10, 50, 100]:
    if p < doc.page_count:
        fonts = doc[p].get_fonts()
        buf.write(f"\nPage {p+1} fonts:\n")
        for f in fonts:
            buf.write(f"  {f}\n")

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(buf.getvalue())

print(f"Wrote sample to {OUT}")
