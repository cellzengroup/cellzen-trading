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
    # Per-unit context markers used in chapters 17 (sugar), 22 (alcohol),
    # 24 (tobacco). These act as both a unit declaration AND a divisor.
    "प्र.क्वी.": "quintal",   # per quintal = per 100 kg
    "प्र.हजाय": "thousand",   # per thousand sticks (cigarettes)
    "प्र.हजार": "thousand",
    "प्र.ङ्झर.": "L",          # per litre
    "प्र.लि.": "L",
    "ङ्ञखल्री": "stick",       # per stick (cigarettes)
}

# Per-unit divisors. When a row's specific-duty rate is expressed "per X" but
# the row's own unit is in finer granularity (e.g., per quintal but unit=kg),
# we divide the rate so it can be applied directly to item.weight.
SPECIFIC_DIVISOR = {
    "quintal": 100,    # 1 quintal = 100 kg → Rs/quintal ÷ 100 = Rs/kg
    "thousand": 1000,  # 1000 sticks → Rs/1000 ÷ 1000 = Rs/stick
    "ton":      1000,  # 1 ton = 1000 kg → Rs/ton ÷ 1000 = Rs/kg
}

# When a per-unit context is detected but the row never declared a unit,
# default to this. Cigarettes use "no" (per stick) when "per thousand" is
# the rate basis.
CONTEXT_TO_FALLBACK_UNIT = {
    "thousand": "no",
    "stick":    "no",
    "quintal":  "kg",
    "ton":      "kg",
}

# Prefix-match detection of per-unit context markers. The PDF's corrupted CMap
# produces slightly different glyph variants for "प्र.क्वी." vs "प्र.हजाय" vs
# "प्र.लि." across chapters, so we use a startswith check on a few stable
# prefix patterns rather than exact-match against UNIT_MAP. Returns the
# context name if matched, else None.
def detect_per_unit_context(token):
    if not token:
        return None
    # Per-quintal: "प्र.क्वी." or "प्र.क्व..."
    if token.startswith("प्र.क्वी") or token.startswith("प्र.क्व"):
        return "quintal"
    # Per-thousand: "प्र.हजाय" or "प्र.हजार" (typical for cigarettes/cigars)
    if token.startswith("प्र.हजा") or token.startswith("प्र.हजार"):
        return "thousand"
    # Per-litre: "प्र.लि." or "प्र.ङ्झर." (alcohol; PDF uses corrupted form)
    if token.startswith("प्र.लि") or token.startswith("प्र.ङ्झर"):
        return "L"
    # Per-ton: "प्र.टन" or "प्र.म.ट" (metric ton)
    if token.startswith("प्र.टन") or token.startswith("प्र.भे.ट") or token.startswith("प्र.म.ट"):
        return "ton"
    return None

# Match a "रु.X" or "रू.X" rupee token where the number is JOINED to the
# marker (most common form in chapters 22, 24). Captures the numeric part
# (including Devanagari digits, optional ".N" decimals, optional trailing
# Nepali punctuation "।-" or "/N" fractional notation).
#
# Examples that match:
#   रु.130          → "130"
#   रु.4५।-         → "4५"
#   रू.११०००        → "११०००"
#   रु.0/60         → "0/60"   (handled separately as "0.60" decimal)
#   रु.२०४२         → "२०४२"
RUPEE_JOINED_RE = re.compile(r"^र[ुू]\.([०-९0-9]+(?:[/.][०-९0-9]+)?)(?:।-?|।)?$")

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
    numeric_tokens = []      # (x, value, has_star) — generic ad-valorem candidates
    rupee_marker_x = []      # x positions of standalone "रु." tokens (split form)
    joined_rupee_values = [] # (x, value) — pre-extracted from "रु.X" joined tokens
    per_unit_context = None  # "quintal" / "thousand" / "L" / "stick" if any
                             # context marker found in the row
    unit_x = None            # rightmost unit-token x (rate columns start ~22pt right)

    for x, t in toks:
        rec["raw"].append((round(x, 1), t))
        if HS8_RE.match(t):
            rec["hs8"] = deva_to_ascii(t)
            continue
        # Joined rupee token: "रु.130" / "रु.११०००" / "रु.4५।-" / "रु.0/60"
        m = RUPEE_JOINED_RE.match(t)
        if m:
            raw_val = deva_to_ascii(m.group(1))
            try:
                if "/" in raw_val:
                    # PDF uses "0/60" notation for sub-rupee values like Rs 0.60
                    a, b = raw_val.split("/", 1)
                    if a == "0":
                        val = float("0." + b)
                    else:
                        bf = float(b)
                        val = float(a) / bf if bf > 0 else float(a)
                else:
                    val = float(raw_val)
                joined_rupee_values.append((x, val))
            except ValueError:
                pass
            continue
        # Per-unit context (prefix match — handles corrupted CMap variants)
        ctx = detect_per_unit_context(t)
        if ctx:
            per_unit_context = ctx
            continue
        if t in UNIT_MAP:
            mapped = UNIT_MAP[t]
            # Some UNIT_MAP entries are per-unit context markers; treat them
            # the same way (track context, don't set as primary unit).
            if mapped in SPECIFIC_DIVISOR or mapped == "stick":
                per_unit_context = mapped
            else:
                rec["unit"] = mapped
                if unit_x is None or x > unit_x:
                    unit_x = x
            continue
        if t in ("रु.", "रू.", "रुपैयाँ", "Rs.", "Rs"):
            rupee_marker_x.append(x)
            continue
        if t in EXEMPT_MARKERS:
            # "Exempt / NIL" customs duty cell — numerically zero.
            numeric_tokens.append((x, 0.0, False))
            continue
        if NUM_RE.match(t):
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

    # Specific-duty (Rs/unit) extraction.
    #
    # Two source forms:
    #   A) SPLIT  : "रु." marker followed by a number token within ~22pt
    #               (chapter 17 sugars use this; rupee_marker_x captures these).
    #   B) JOINED : "रु.130" or "रु.११०००" or "रु.0/60" all in one token
    #               (chapters 22 alcohol, 24 tobacco use this; we already
    #                pre-extracted these in joined_rupee_values).
    #
    # We collect all values from both forms, then convert to a single
    # CANONICAL per-row scalar:
    #   - If a per-unit context marker was detected (per quintal, per
    #     thousand sticks), divide the rate so it lines up with the row's
    #     own unit (kg or each).
    #   - When multiple values are present (e.g., cigarettes have separate
    #     SAARC and Other specific rates), we pick the FIRST value at the
    #     leftmost x in the customs-duty band (x < 360). When the SAARC and
    #     Other rates differ, the runtime calc uses this value for both;
    #     this is a known limitation worth refining later.
    specific_values = []  # (x, value)
    if rupee_marker_x:
        cleaned = []
        for x, v, sstar in nums:
            if any(0 <= x - rmx <= 22 for rmx in rupee_marker_x):
                specific_values.append((x, v))
            else:
                cleaned.append((x, v, sstar))
        nums = cleaned
    for x, v in joined_rupee_values:
        specific_values.append((x, v))

    if specific_values:
        # Sort by x, then take the leftmost as the canonical per-row rate.
        # In cigarette rows the SAARC/Other rate (leftmost rupee token) is
        # what we want; extra agri/excise rates are kept in the multi-value
        # array for inspection but not used as the canonical rate.
        specific_values.sort(key=lambda p: p[0])
        canonical = specific_values[0][1]

        # Apply per-unit context divisor (per-quintal /100, per-thousand /1000,
        # per-ton /1000) so the stored rate is in the row's natural unit.
        divisor = SPECIFIC_DIVISOR.get(per_unit_context, 1)
        if divisor > 1:
            canonical = canonical / divisor

        # When per-unit context implies a specific item granularity (per
        # thousand → sticks/no; per quintal → kg) but the row never declared
        # an explicit unit, fall back so the runtime calc has SOMETHING to
        # multiply by. Otherwise the duty would silently be 0.
        if per_unit_context and not rec.get("unit"):
            fallback = CONTEXT_TO_FALLBACK_UNIT.get(per_unit_context)
            if fallback:
                rec["unit"] = fallback

        rec["specificDutyNpr"] = round(canonical, 4)
        # Preserve the raw multi-value array for inspection / debugging.
        rec["specificDutyAll"] = [{"x": round(x, 1), "value": v} for x, v in specific_values]
        if per_unit_context:
            rec["specificDutyContext"] = per_unit_context
        # When the row's customs-duty columns ARE specific (cigarettes),
        # the values that LOOK like SAARC% / Other% are actually the same
        # specific rate. Suppress them so the runtime doesn't double-count.
        # Heuristic: if any specific value is in the customs-duty band
        # (x < 360) AND the row has unit "no" or per-unit-context "thousand"/"stick",
        # treat the customs columns as duplicates of the specific rate.
        if (per_unit_context in ("thousand", "stick")) or rec.get("unit") in ("no",):
            # Filter out numeric tokens that are duplicates of specific values
            # in the customs-duty x-band.
            specific_xs = [x for x, _ in specific_values if x < 360]
            if specific_xs:
                nums = [(x, v, s) for (x, v, s) in nums
                        if not any(abs(x - sx) <= 5 for sx in specific_xs)]

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
