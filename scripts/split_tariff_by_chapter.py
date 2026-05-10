"""Split the monolithic hsTariff.json into per-chapter JSON files for lazy
loading, plus a slim search index that gets bundled with the UI.

Output:
  frontend/src/data/chapters/chapter-XX.json    (96 files, ~5-15 KB raw each)
      Full record per HS code in that chapter — lazy-loaded by the lookup
      helper via Vite's import.meta.glob.
  frontend/src/data/hsSearchIndex.json
      Compact array of [code, description] pairs for ALL codes.
      Used for fast in-memory description search and code-prefix matching.
      Loaded once when the HS panel opens.

Why this layout: keeps the bundled portion under 100 KB gzipped, so the
panel opens instantly. Full duty data loads on demand per chapter (one ~10 KB
gzipped fetch per code-detail click), and is cached in memory after that.
"""
import json
import shutil
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / "frontend" / "src" / "data" / "hsTariff.json"
OUT_CHAPTERS = ROOT / "frontend" / "src" / "data" / "chapters"
OUT_SEARCH   = ROOT / "frontend" / "src" / "data" / "hsSearchIndex.json"
OUT_META     = ROOT / "frontend" / "src" / "data" / "hsTariff.meta.json"

records = json.loads(SRC.read_text(encoding="utf-8"))
print(f"Loaded {len(records):,} HS records from {SRC.name}")

# Wipe and recreate the chapters directory so stale files don't linger
if OUT_CHAPTERS.exists():
    shutil.rmtree(OUT_CHAPTERS)
OUT_CHAPTERS.mkdir(parents=True)

# 1) Per-chapter files, indexed by 8-digit code → record (drop redundant
#    chapter field; can be derived from the code).
by_chapter = defaultdict(dict)
for r in records:
    chapter = r["chapter"]
    code = r["code"]
    record = {k: v for k, v in r.items() if k not in ("chapter",)}
    by_chapter[chapter][code] = record

total_chapter_bytes = 0
for chapter, codes in sorted(by_chapter.items()):
    path = OUT_CHAPTERS / f"chapter-{chapter}.json"
    text = json.dumps(codes, separators=(",", ":"), ensure_ascii=False)
    path.write_text(text, encoding="utf-8")
    total_chapter_bytes += len(text.encode("utf-8"))
print(f"Wrote {len(by_chapter)} chapter files to {OUT_CHAPTERS.relative_to(ROOT)}")
print(f"  total chapter bytes: {total_chapter_bytes:,} "
      f"(avg {total_chapter_bytes // len(by_chapter):,} per file)")

# 2) Search index — array of [code, description] pairs. Array of pairs is
#    ~30% smaller than array of objects with named keys.
search_index = [[r["code"], r["description"]] for r in records]
text = json.dumps(search_index, separators=(",", ":"), ensure_ascii=False)
OUT_SEARCH.write_text(text, encoding="utf-8")
print(f"Wrote {OUT_SEARCH.relative_to(ROOT)} "
      f"({OUT_SEARCH.stat().st_size:,} bytes, {len(search_index):,} entries)")

# 3) Refresh metadata to reflect new layout
meta = {}
if OUT_META.exists():
    meta = json.loads(OUT_META.read_text(encoding="utf-8"))
meta["totalEntries"] = len(records)
meta["layout"] = {
    "searchIndex": "hsSearchIndex.json — bundled, [[code, description], ...]",
    "chapters":    "chapters/chapter-{01..97}.json — lazy-loaded per chapter",
    "loadingStrategy": (
        "1) Open panel: bundle chunk includes hsSearchIndex.json (~60 KB gzipped); "
        "user can search instantly. "
        "2) Click a code: dynamic import of chapters/chapter-{XX}.json (~3 KB gzipped); "
        "subsequent codes in same chapter use the in-memory cache. "
        "3) Calculation: pure-JS arithmetic on a single object — sub-millisecond."
    ),
}
meta["lastSplit"] = "see git log for split timestamp"
OUT_META.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Updated {OUT_META.name}")

print("\nDone. Old hsTariff.json can now be deleted from src/data/.")
