"""Extract Nepal Customs Tariff 2082/83 from PDF into structured JSON.

Strategy: ignore the corrupted Devanagari descriptions in the PDF entirely.
Extract only the parts that are clean and unambiguous:
  - 8-digit HS codes        (Devanagari digits → ASCII)
  - 4-digit heading codes   (Devanagari digits → ASCII)
  - All duty rate numbers   (already ASCII or Devanagari digits)
  - Unit of measure         (limited Nepali vocabulary, mapped to English)
  - Footnote markers        (e.g. "5*", "210" superscripts)

Descriptions come from a separate WCO HS-2022 English dataset (next step).

Each tariff row in the PDF lays out as:
  HS_code | description | unit | SAARC% | Other% | excise | agriFee | advTax | VAT | eff_SAARC | eff_India | eff_Tibet | eff_Other

The columns sit at stable X positions (verified in inspect_words_layout.py output).
"""
import fitz
import json
import re
from collections import defaultdict
from pathlib import Path

PDF = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\frontend\public\Customs_Tarrif_2083.pdf"
OUT_JSON = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\hs_tariff_extracted.json"
OUT_DEBUG = r"e:\MyWork\Cellzen Group\CellzenTradingWebsite\cellzen-trading\scripts\hs_tariff_debug.txt"

DEVA_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

# 8-digit code: XXXX.XX.XX (digits in Devanagari or ASCII)
HS8_RE = re.compile(r"^[०-९0-9]{4}\.[०-९0-9]{2}\.[०-९0-9]{2}$")
# 4-digit heading: XX.XX
HS4_RE = re.compile(r"^[०-९0-9]{2}\.[०-९0-9]{2}$")
# Pure number token (with optional decimal, optional trailing "*" or footnote digits)
NUM_RE = re.compile(r"^[०-९0-9]+(?:\.[०-९0-9]+)?(?:\*)?$")

# Approximate column-X anchors observed in the layout. We classify each token
# into a column by finding the closest anchor (with a max distance gate).
# These are based on inspect_words_layout.py output across pages 31, 51, 101, 201.
COL_ANCHORS = {
    "heading":   60,    # 4-digit heading (e.g. "03.08")
    "hs8":       85,    # 8-digit code
    "desc":      150,   # description start (we ignore content but use position)
    "unit":      275,   # unit of measure (कि.ग्रा. etc)
    "saarc":     302,   # SAARC customs duty %
    "other":     335,   # Other countries customs duty %
    "agriFee":   367,   # Agriculture reform fee  ("5*", "9*", numeric)
    "advTax":    395,   # Advance income tax
    "excise":    365,   # Excise duty (overlaps agriFee — disambiguated below)
    "vat":       430,   # VAT
    "eff_saarc": 450,   # Effective rate — SAARC
    "eff_india": 478,   # Effective rate — India
    "eff_tibet": 506,   # Effective rate — Tibet
    "eff_other": 535,   # Effective rate — Other countries
}

# Header tokens we skip when seen on a row (Nepali column labels).
HEADER_TOKENS = {
    "शीषाक", "उऩशीषाक", "वस्तङ्टको", "ङ्जववयण", "इकाई", "भहसङ्टर", "दय",
    "अन्त्", "शङ्टल्क", "कृङ्जष", "सङ्टधाय", "अङ्झग्रभ", "आम", "कय", "भू.अ.",
    "जम्भा", "राग्ने", "साका", "भङ्टरङ्टक", "अन्म", "बायत", "ङ्झतब्फत",
}

# Unit-of-measure mapping (mostly कि.ग्रा. = kg; a few others appear).
UNIT_MAP = {
    "कि.ग्रा.": "kg", "ङ्जक.ग्रा.": "kg",
    "ली.": "L", "ङ्झर.": "L",
    "घ.भी.": "m3", "घ.मी.": "m3",
    "व.भी.": "m2", "व.मी.": "m2",
    "भी.": "m", "मी.": "m",
    "नॊ.": "no", "नॊग": "no", "थान": "no", "गोटा": "no",
    "क्मायेट": "carat", "ङ्ञक्भलं": "carat",
    "लं.टग": "ton", "टग": "ton",
}

# "Exempt" markers — Nepali customs convention for "duty NIL / EXEMPTED".
# Treated as numeric 0 in the column-assignment logic. These are the words
# Nepal Customs uses in cells that would otherwise have a number rate; the
# legal effect is "no duty owed" (= 0%).
# Note: due to the PDF's corrupted font CMap, "मापी" (the dictionary spelling)
# extracts as "भापी"; we accept both. "मफी" / "भफी" appear in some chapters.
EXEMPT_MARKERS = {
    "भापी", "मापी", "भाफी", "मफी", "भफी",
    "ङ्झन्शङ्टल्क", "नि:शुल्क",  # "free of charge" variants
}


def deva_to_ascii(s: str) -> str:
    return s.translate(DEVA_DIGITS)


def to_float(token: str):
    """Parse a number token. Returns (value, has_star_marker).
    Normalizes the private-use codepoint U+F02A (used by some embedded fonts
    as the asterisk glyph) to a regular '*' before parsing.
    """
    token = token.replace("", "*")
    star = token.endswith("*")
    if star:
        token = token[:-1]
    token = deva_to_ascii(token)
    try:
        return float(token), star
    except ValueError:
        return None, star


def cluster_by_hs_code(words):
    """Group words into HS-code-bounded bands.

    Each row in the tariff PDF is anchored by an 8-digit HS code. Description
    text sometimes spans multiple visual lines, but the row's rate values
    (unit, customs duties, VAT, effective rates) all sit between this HS code's y
    and the next HS code's y. So we slice the page into vertical bands at HS
    code boundaries and pool all tokens within each band into one row.

    Returns: list of (anchor_y, [(x, token), ...]) sorted by y.
    """
    # All words sorted by (y, x)
    all_words = []
    for w in words:
        x0, y0, x1, y1, txt, *_ = w
        all_words.append((y0, x0, txt))
    all_words.sort()

    # Find y-positions of all HS8 anchors
    hs_anchors = []
    for y, x, t in all_words:
        if HS8_RE.match(t) and x < 110:  # HS code column is around x=78-95
            hs_anchors.append(y)

    if not hs_anchors:
        return []

    # Build bands: [hs_anchors[i] - small_pad, hs_anchors[i+1] - small_pad).
    # Cap the final band at FOOTER_Y so the printed page number at y≈776
    # (which sits in the SAARC duty column band, x≈293) doesn't pollute the
    # last HS code on each page. Body content ends well above this.
    FOOTER_Y = 760.0
    bands = []
    for i, y_start in enumerate(hs_anchors):
        y_end = hs_anchors[i + 1] if i + 1 < len(hs_anchors) else FOOTER_Y
        bands.append((y_start, y_end))

    # Bucket all words into bands. A word at y0 belongs to the band whose
    # [y_start, y_end) contains it. We use a small tolerance so that a word
    # printed slightly above its HS code (y0 ≈ anchor - 1pt due to font baseline)
    # still associates with this row, not the previous one.
    band_tokens = [[] for _ in bands]
    pad = 2.0
    for y, x, t in all_words:
        if y > FOOTER_Y:
            continue
        for i, (ys, ye) in enumerate(bands):
            if ys - pad <= y < ye - pad:
                band_tokens[i].append((x, t))
                break

    # Sort tokens within each band by X for predictable output
    result = []
    for (ys, _), toks in zip(bands, band_tokens):
        toks.sort(key=lambda p: p[0])
        result.append((ys, toks))
    return result


def classify_column(x: float, candidates=None):
    """Return the column name whose anchor is closest to x, or None if too far."""
    if candidates is None:
        candidates = COL_ANCHORS.items()
    best_name, best_dist = None, 999
    for name, anchor in candidates:
        d = abs(x - anchor)
        if d < best_dist:
            best_dist = d
            best_name = name
    if best_dist > 25:  # too far from any column anchor
        return None
    return best_name


def parse_row(toks):
    """Parse one visual row of (x, token) pairs into a structured record.

    Returns dict with whatever fields we found, or None if the row has no HS code
    and isn't useful.
    """
    rec = {"hs8": None, "raw": []}
    numeric_tokens = []  # (x, value, has_star)
    rupee_marker_x = []  # x positions of "रु." (Rs) tokens — these mark a
                         # following number as a SPECIFIC duty (Rs/unit), not
                         # an ad-valorem %. Used in chapters 17 (sugar),
                         # 22 (alcohol), 24 (tobacco), 27 (petroleum).
    unit_x = None        # X-position of the unit token. Rate columns start
                         # ~25pt to its right; tokens before it are
                         # description-embedded numbers (e.g., "5000 kg"
                         # capacity specs in chapter 84 machinery).

    for x, t in toks:
        rec["raw"].append((round(x, 1), t))
        if HS8_RE.match(t):
            rec["hs8"] = deva_to_ascii(t)
        elif t in UNIT_MAP:
            rec["unit"] = UNIT_MAP[t]
            # Track the rightmost unit position; some rows have multiple
            # unit-like tokens (e.g., "गोटा/कि.ग्रा.") and the rightmost is
            # the actual unit-column anchor.
            if unit_x is None or x > unit_x:
                unit_x = x
        elif t in ("रु.", "रू.", "रुपैयाँ", "Rs.", "Rs"):
            rupee_marker_x.append(x)
        elif t in EXEMPT_MARKERS:
            # "Exempt / NIL" customs duty cell — numerically zero.
            # The legal effect is "no duty owed", which is 0% for calculation
            # purposes. Distinguishes from a truly blank cell which we leave
            # as null (= "data not in PDF" rather than "explicitly 0").
            numeric_tokens.append((x, 0.0, False))
        elif NUM_RE.match(t):
            v, star = to_float(t)
            if v is not None:
                numeric_tokens.append((x, v, star))

    # Heading derived from HS8 code (e.g. "0103.91.00" → "01.03")
    if rec["hs8"]:
        rec["heading"] = rec["hs8"][:2] + "." + rec["hs8"][2:4]

    # Assign numeric tokens to columns using RELATIVE position rather than fixed
    # anchors, because column X-positions shift slightly across chapters:
    #   - The rightmost 4 numeric tokens are always the 4 effective-rate columns
    #     (eff_saarc, eff_india, eff_tibet, eff_other) — densely packed at x ≥ 440.
    #   - The token immediately before them, if at x ∈ [410, 445], is VAT.
    #   - Tokens at x ∈ [355, 410] are the agri/excise/advTax middle cluster
    #     (assigned in left-to-right order: agriFee usually, then advTax).
    #   - Tokens at x < 355 are the customs duty pair (leftmost = SAARC,
    #     next = Other).
    #   - Tokens at x < 290 are noise (footnote markers, leakage from headers).
    nums = sorted(numeric_tokens, key=lambda t: t[0])
    # Determine the dynamic left boundary for rate columns. The rate columns
    # start ~25pt to the right of the unit token; everything before is
    # description (including embedded numeric specs like "5000 kg" in
    # chapter 84 machinery, "165 mm" cylinder diameters, etc.).
    if unit_x is not None:
        rate_x_min = unit_x + 22
    else:
        # No unit detected — use a conservative fixed boundary
        rate_x_min = 265
    nums = [(x, v, s) for (x, v, s) in nums if x >= rate_x_min]

    # Strip out specific-duty values (Rs/unit) marked by a preceding "रु." token.
    # Any number within ~22pt to the right of a rupee marker is a specific duty,
    # NOT an ad-valorem rate. Track them but don't assign to ad-valorem columns.
    if rupee_marker_x:
        specific_duties = []
        cleaned = []
        for x, v, s in nums:
            if any(0 <= x - rmx <= 22 for rmx in rupee_marker_x):
                specific_duties.append({"x": round(x, 1), "value": v})
            else:
                cleaned.append((x, v, s))
        if specific_duties:
            rec["specificDutyNpr"] = specific_duties
        nums = cleaned

    # Detect the effective-rate cluster: the 4 rightmost numerics that are
    # tightly packed (each within ~35pt of the next), with the rightmost at
    # x ≥ 525 (the eff_other column anchor). This walks leftward instead of
    # using a fixed x≥440 filter, so it works for chapter 17 sugars where
    # eff_saarc shifts to x≈433, as well as chapter 3 where it's at x≈446.
    eff = []
    if nums and nums[-1][0] >= 525:
        eff = [nums[-1]]
        for tok in reversed(nums[:-1]):
            # 40pt threshold accommodates chapter 74 (copper) which has
            # the widest column gaps observed (37pt between eff_tibet and
            # eff_other). Most chapters have 28-32pt gaps.
            if eff[-1][0] - tok[0] <= 40:
                eff.append(tok)
                if len(eff) == 4:
                    break
            else:
                break
        eff.reverse()

    if len(eff) == 4:
        rec["eff_saarc"] = eff[0][1]
        rec["eff_india"] = eff[1][1]
        rec["eff_tibet"] = eff[2][1]
        rec["eff_other"] = eff[3][1]
        nums = [n for n in nums if n not in eff]

    # VAT: must be value 0 or 13 (Nepal's only VAT rates) and sit in the
    # VAT x-band [395, 445]. Value-based detection is robust against:
    #   - Chapter 7-8 fresh produce: advTax=10 sits at x≈406 (would be
    #     mis-captured by a position-only filter)
    #   - Chapter 74 copper: VAT shifts to x≈402 (would be missed by
    #     a position-only filter expecting x≥410)
    # Effective-rate values like 46.9 / 19.78 that occasionally land in
    # this x-band are also rejected by the strict {0, 13} value filter.
    vat_candidates = [(x, v, s) for (x, v, s) in nums if 395 <= x <= 445 and v in (0, 0.0, 13, 13.0)]
    if vat_candidates:
        vat_tok = vat_candidates[-1]
        rec["vat"] = vat_tok[1]
        nums = [n for n in nums if n != vat_tok]

    # AdvTax: token at x ∈ [395, 420) AFTER VAT was removed. This is the
    # advance income tax column in chapters where it's populated (chapter 7
    # vegetables, 8 fruits — typical values 1, 5, 10).
    adv_candidates = [(x, v, s) for (x, v, s) in nums if 395 <= x < 420]
    if adv_candidates:
        adv_tok = adv_candidates[0]
        rec["advTax"] = adv_tok[1]
        nums = [n for n in nums if n != adv_tok]

    # AgriFee: token at x ∈ [355, 395). Often starred ("5*", "9*") to
    # indicate concession when imported from India / Tibet land routes.
    agri_candidates = [(x, v, s) for (x, v, s) in nums if 355 <= x < 395]
    if agri_candidates:
        agri_tok = agri_candidates[0]
        rec["agriFee"] = agri_tok[1]
        if agri_tok[2]:
            rec["agriFeeFootnote"] = True
        nums = [n for n in nums if n != agri_tok]

    # Customs duties: remaining tokens at x < 355
    duty = [(x, v, s) for (x, v, s) in nums if x < 355]
    if len(duty) >= 1:
        rec["saarc"] = duty[0][1]
    if len(duty) >= 2:
        rec["other"] = duty[1][1]

    if rec["hs8"]:
        return rec
    return None


def main():
    doc = fitz.open(PDF)
    print(f"Opened PDF: {doc.page_count} pages")

    # The main import tariff (standard column layout: SAARC/Other duties,
    # excise, agri, advTax, VAT, 4 effective rates) ends around page 580.
    # Pages 581+ are appendices (excise schedule, exemption listings, export
    # tariff, etc.) with different layouts that, if parsed naively, produce
    # nonsense rate values (e.g., page-685 row "SAARC=607%"). We extract
    # from these pages too — so that codes only listed in appendices are
    # still searchable — but during dedup we strongly prefer main-tariff
    # records and tag appendix-only entries as `dataSource: 'reference'`.
    MAIN_TARIFF_END_PAGE = 580

    all_rows = []
    debug_lines = []
    pages_processed = 0
    pages_with_data = 0

    for page_idx in range(doc.page_count):
        page = doc[page_idx]
        words = page.get_text("words")
        if not words:
            continue
        bands = cluster_by_hs_code(words)
        page_records = []
        for y, toks in bands:
            rec = parse_row(toks)
            if rec and rec.get("hs8"):
                rec["page"] = page_idx + 1
                page_records.append(rec)
        if page_records:
            pages_with_data += 1
            all_rows.extend(page_records)
        pages_processed += 1
        if (page_idx + 1) % 50 == 0:
            print(f"  ...page {page_idx + 1}: total HS codes so far = {len(all_rows)}")

    print(f"\nProcessed {pages_processed} pages, {pages_with_data} had tariff data")
    print(f"Total HS code rows extracted (raw, with duplicates): {len(all_rows)}")

    # Deduplicate: most HS codes appear once in the main import tariff (pages 13-580)
    # and again in appendix/exemption listings (pages 596+) where the appendix
    # layout has no rate columns. Keep the row with the most populated rate fields
    # for each HS code. Ties broken by earliest page (main tariff over appendix).
    rate_fields = ["unit", "saarc", "other", "vat", "agriFee",
                   "eff_saarc", "eff_india", "eff_tibet", "eff_other"]

    def completeness(r):
        return sum(1 for f in rate_fields if r.get(f) is not None)

    def is_main(r):
        return r["page"] <= MAIN_TARIFF_END_PAGE

    by_code = {}
    for r in all_rows:
        code = r["hs8"]
        prior = by_code.get(code)
        if prior is None:
            by_code[code] = r
            continue
        # Main-tariff records always beat appendix records, regardless of
        # apparent completeness — appendix entries can produce false-positive
        # rate values from non-tariff column layouts.
        if is_main(r) and not is_main(prior):
            by_code[code] = r
            continue
        if is_main(prior) and not is_main(r):
            continue
        # Same source category: pick the more complete record; tie-break
        # by earliest page (which is canonically the main tariff for that code).
        c_new, c_old = completeness(r), completeness(prior)
        if c_new > c_old or (c_new == c_old and r["page"] < prior["page"]):
            by_code[code] = r

    # Tag each kept record with its data source so the frontend can warn
    # users that appendix-only entries lack rate data.
    for code, r in by_code.items():
        r["dataSource"] = "main" if is_main(r) else "reference"
        # For reference-only entries, scrub potentially-bogus rate values
        # since the appendix layout doesn't match our column model.
        if r["dataSource"] == "reference":
            for f in rate_fields:
                r.pop(f, None)

    deduped = list(by_code.values())
    deduped.sort(key=lambda r: r["hs8"])
    print(f"After deduplication (best record per code): {len(deduped)} unique codes")

    # Group by chapter (first 2 digits of code)
    by_chapter = defaultdict(list)
    for r in deduped:
        chapter = r["hs8"][:2]
        by_chapter[chapter].append(r)
    print(f"Chapters represented: {sorted(by_chapter.keys())}")
    print(f"  (count per chapter, first 10): "
          f"{[(c, len(by_chapter[c])) for c in sorted(by_chapter.keys())[:10]]}")

    all_rows = deduped

    # Strip the `raw` debug field before writing primary JSON
    primary = []
    for r in all_rows:
        clean = {k: v for k, v in r.items() if k != "raw"}
        primary.append(clean)

    Path(OUT_JSON).write_text(json.dumps(primary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {OUT_JSON} ({Path(OUT_JSON).stat().st_size:,} bytes)")

    # Debug dump: first 100 rows with raw token lists
    debug_lines.append(f"# Total rows: {len(all_rows)}\n")
    for r in all_rows[:100]:
        debug_lines.append(f"page {r['page']:3d} | hs8={r['hs8']} | "
                           f"heading={r.get('heading')} | unit={r.get('unit')} | "
                           f"saarc={r.get('saarc')} other={r.get('other')} | "
                           f"vat={r.get('vat')} | "
                           f"eff_s={r.get('eff_saarc')} eff_i={r.get('eff_india')} "
                           f"eff_t={r.get('eff_tibet')} eff_o={r.get('eff_other')}")
        debug_lines.append(f"    raw: {r['raw']}")
    Path(OUT_DEBUG).write_text("\n".join(debug_lines), encoding="utf-8")
    print(f"Wrote debug dump (first 100 rows) to {OUT_DEBUG}")


if __name__ == "__main__":
    main()
