import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  lookupByCode,
  searchByDescription,
  calculateImportCost,
  unitQuantityForItem,
  requiredFieldForUnit,
  effectiveDutyMultiplier,
  isLpLitreCode,
  defaultAbvForCode,
} from "../../../../utils/hsCodeLookup";

const ORIGIN_OPTIONS = [
  { code: "IN",    label: "India (SAARC)" },
  { code: "BD",    label: "Bangladesh (SAARC)" },
  { code: "LK",    label: "Sri Lanka (SAARC)" },
  { code: "PK",    label: "Pakistan (SAARC)" },
  { code: "BT",    label: "Bhutan (SAARC)" },
  { code: "MV",    label: "Maldives (SAARC)" },
  { code: "AF",    label: "Afghanistan (SAARC)" },
  { code: "TIBET", label: "China (Tibet, land route)" },
  { code: "CN",    label: "China (other)" },
  { code: "OTHER", label: "Other countries" },
];

const fmt = (v) =>
  v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Normalize loose user input ("85171300", "8517 13 00", "8517-13-00") to the
// canonical "XXXX.XX.XX" form. Returns null if not enough digits.
const normalizeCode = (input) => {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
};

export default function HsCodeDrawer({
  open,
  item,
  itemIndex,
  itemCount,
  cifNpr,
  invoiceCurrency,
  cifInInvoiceCurrency,
  defaultOrigin,
  tariffReady = true,   // pass false from parent during initial load to prevent
                        // a stale-null cache in the row useMemo
  onChangeHs,
  onChangeOrigin,
  onChangeAbv,
  onClose,
  onPrev,
  onNext,
}) {
  // Re-evaluate the row lookup whenever the tariff bundle finishes loading.
  // Without `tariffReady` in the deps, if the drawer mounts BEFORE the lazy
  // bundle is loaded, lookupByCode returns null and useMemo would cache that
  // null forever — that's the "Code not found" bug reported in the side panel.
  const row = useMemo(() => {
    if (!item?.hsCode || !tariffReady) return null;
    return lookupByCode(item.hsCode);
  }, [item?.hsCode, tariffReady]);

  const origin = item?.dutyOrigin || defaultOrigin || "CN";

  // For specific-duty rows (Rs/unit), the multiplier is the QUANTITY in the
  // row's unit — kg → item.weight, m³ → item.cbm, no/gota/L → item.quantity.
  // Spirits codes (chapter 22 LP-litre) further scale by ABV%.
  // For ad-valorem-only rows the value passed here is unused.
  const isLpLitre = row && isLpLitreCode(row.code) && row.unit === "L";
  const abvValue = item?.alcoholAbv != null && item.alcoholAbv !== ""
    ? parseFloat(item.alcoholAbv)
    : (row ? defaultAbvForCode(row.code) : null);

  const rawMultiplier = useMemo(() => {
    if (!row || row.specificDutyNpr == null) return parseFloat(item?.quantity) || 1;
    return unitQuantityForItem(item, row.unit);
  }, [row, item]);
  const unitQty = useMemo(() => {
    if (!row || row.specificDutyNpr == null) return parseFloat(item?.quantity) || 1;
    return effectiveDutyMultiplier(item, row);
  }, [row, item]);

  // Pass item.unit so the helper can return "quantity" when invoice line is
  // already in the same unit as the HS row (KG/Litre/Unit) — no separate
  // weight/cbm field needed in that case.
  const requiredField = row?.specificDutyNpr != null
    ? requiredFieldForUnit(row.unit, item?.unit)
    : null;
  const missingMeasurement = requiredField && rawMultiplier <= 0;

  const calc = useMemo(() => {
    if (!row || !cifNpr || cifNpr <= 0) return null;
    return calculateImportCost({
      code: row.code,
      cifValue: cifNpr,
      originCountry: origin,
      quantity: unitQty,
    });
  }, [row, cifNpr, origin, unitQty]);

  if (!open) return null;

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      {/* drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E1E3EE] px-5 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#412460]/70">HS Code Detail</p>
            <h3 className="text-sm font-semibold text-[#2D2D2D]">
              Item {itemIndex + 1} of {itemCount}
              {item?.productName ? ` · ${item.productName}` : ""}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#2D2D2D]/50 transition-colors hover:bg-[#E5E1DA] hover:text-[#412460]"
            aria-label="Close drawer"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-4">
          {/* HS code field — unified searchable picker (CountrySelector pattern).
              Click the field to open; typing filters codes by description or by
              code prefix; clicking a result selects it. Click outside or ESC
              closes the dropdown. */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#2D2D2D]/70">
              HS Code
            </label>
            <HsCodePicker
              value={item?.hsCode || ""}
              row={row}
              onPick={(code) => onChangeHs(code, /* manual */ true)}
            />
            {row && (
              <p className="mt-2 text-xs text-[#2D2D2D]/70">{row.description}</p>
            )}
            {!tariffReady && item?.hsCode && (
              <p className="mt-2 text-xs text-[#2D2D2D]/50 italic">Loading tariff data…</p>
            )}
            {tariffReady && !row && item?.hsCode && (
              <p className="mt-2 text-xs text-red-600">Code not found in tariff.</p>
            )}
            {item?.hsAutoMatched && item?.hsCode && (
              <p className="mt-1 text-[11px] text-[#2D2D2D]/50 italic">
                auto-matched · {item.hsConfidence || "—"} confidence — search to override
              </p>
            )}
            {!item?.hsAutoMatched && item?.hsCode && (
              <p className="mt-1 text-[11px] text-green-700 italic">
                manually set
              </p>
            )}
          </div>

          {/* Origin */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#2D2D2D]/70">
              Origin (for this item)
            </label>
            <select
              value={origin}
              onChange={(e) => onChangeOrigin(e.target.value)}
              className="w-full rounded-lg border border-[#E1E3EE] px-3 py-2 text-sm focus:border-[#412460] focus:outline-none"
            >
              {ORIGIN_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
            {item?.dutyOrigin == null && (
              <p className="mt-1 text-[11px] text-[#2D2D2D]/50 italic">
                using invoice default ({defaultOrigin || "CN"}) — change to override
              </p>
            )}
          </div>

          {/* ABV % input — only shown for spirits codes (chapter 22 LP-litre).
              Nepal customs charges spirits per LP-litre (litre of pure alcohol),
              not per bulk litre. Without this scaling a 40% whisky shipment
              would be charged 2.5× too much specific duty. */}
          {isLpLitre && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#2D2D2D]/70">
                Alcohol strength (ABV %)
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-[#E1E3EE] bg-white px-3 py-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={item?.alcoholAbv ?? ""}
                  placeholder={String(defaultAbvForCode(row.code))}
                  onChange={(e) => onChangeAbv?.(e.target.value === "" ? null : parseFloat(e.target.value))}
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
                <span className="text-xs text-[#2D2D2D]/50">% ABV</span>
              </div>
              <p className="mt-1 text-[11px] text-[#2D2D2D]/50 italic">
                {item?.alcoholAbv == null
                  ? `using default ${defaultAbvForCode(row.code)}% — change for actual strength`
                  : "Specific duty is charged per LP-litre = bulk litres × ABV/100"}
              </p>
            </div>
          )}

          {/* CIF + breakdown */}
          <div className="rounded-lg border border-[#412460]/30 bg-[#412460]/5 p-3">
            {invoiceCurrency && invoiceCurrency !== "NPR" && cifInInvoiceCurrency != null && (
              <div className="mb-1 flex items-center justify-between text-[11px] text-[#412460]/60">
                <span>CIF in invoice currency</span>
                <span className="font-mono">{invoiceCurrency} {fmt(cifInInvoiceCurrency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-[#412460]/70">
              <span>
                CIF (NPR — basis for Nepal tariff)
                {invoiceCurrency && invoiceCurrency !== "NPR" && (
                  <span className="ml-1 text-[10px] italic">auto-converted</span>
                )}
              </span>
              <span className="font-mono font-semibold text-[#2D2D2D]">{fmt(cifNpr)}</span>
            </div>

            {!row && (
              <p className="mt-3 text-xs text-[#2D2D2D]/60">
                Pick an HS code to see the duty breakdown.
              </p>
            )}

            {row && row.dataSource === "reference" && (
              <p className="mt-3 rounded bg-yellow-100 p-2 text-[11px] text-yellow-800">
                This code is a reference-only entry — rate data is not available
                from the main tariff. The duty cannot be auto-calculated.
              </p>
            )}

            {/* Calculation-method indicator. Tells the user EXACTLY how the
                duty is being computed for this code so they don't wonder why
                a kg-unit row isn't asking for weight (it isn't, because the
                customs is ad-valorem % × CIF — the unit is informational only). */}
            {row && (
              <div className="mt-3 rounded bg-white/60 border border-[#412460]/15 p-2 text-[11px] text-[#2D2D2D]/80">
                {row.specificDutyNpr != null ? (
                  <>
                    <span className="font-semibold text-[#412460]">Calculation method:</span>{" "}
                    Mixed — ad-valorem <span className="font-mono">% × CIF</span> +
                    specific <span className="font-mono">NPR {fmt(row.specificDutyNpr)}/{row.unit}</span>
                    {" × "}row's <span className="font-semibold uppercase">{requiredField}</span>.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-[#412460]">Calculation method:</span>{" "}
                    Ad-valorem only — <span className="font-mono">% × CIF value</span>.
                    {row.unit && (
                      <>
                        {" "}Unit <span className="font-mono uppercase">{row.unit}</span> is informational;
                        weight / CBM / quantity are <em>not</em> used in the duty calculation for this code.
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Warn if this code charges a specific duty (Rs/unit) but the
                item is missing the corresponding measurement. Without it the
                specific-duty portion silently computes as 0. */}
            {missingMeasurement && (
              <p className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-800 border border-amber-200">
                <strong>⚠ Need <span className="uppercase">{requiredField}</span> to calculate the specific duty.</strong>
                {" "}This code charges <span className="font-mono">NPR {fmt(row.specificDutyNpr)}/{row.unit}</span>.
                Fill in the item's <strong>{requiredField}</strong> field to include it.
              </p>
            )}

            {calc && !calc.error && (
              <div className="mt-3 space-y-1 text-sm">
                <Row label={`Customs (${calc.breakdown.customsRate ?? 0}%)`}      value={fmt(calc.breakdown.customsDuty)} />
                {row.specificDutyNpr != null && (
                  isLpLitre ? (
                    <Row
                      label={`Specific duty (NPR ${row.specificDutyNpr}/LP-L × ${fmt(rawMultiplier)} L × ${abvValue}% = ${fmt(unitQty)} LP-L)`}
                      value={fmt(calc.breakdown.specificDutyAmount)}
                    />
                  ) : (
                    <Row
                      label={`Specific duty (NPR ${row.specificDutyNpr}/${row.unit || "unit"} × ${fmt(unitQty)} ${row.unit || ""})`}
                      value={fmt(calc.breakdown.specificDutyAmount)}
                    />
                  )
                )}
                {row.excise   != null && <Row label={`Excise (${row.excise}%)`}            value={fmt(calc.breakdown.exciseAmount)} />}
                {row.agriFee  != null && <Row label={`Agri reform fee (${row.agriFee}%)`}  value={fmt(calc.breakdown.agriFeeAmount)} />}
                {row.advTax   != null && <Row label={`Advance income tax (${row.advTax}%)`} value={fmt(calc.breakdown.advTaxAmount)} />}
                {row.vat      != null && <Row label={`VAT (${row.vat}%)`}                  value={fmt(calc.breakdown.vatAmount)} />}
                <div className="mt-2 flex justify-between border-t border-[#412460]/20 pt-2 text-[#412460]">
                  <span className="font-semibold">Total duty for this item</span>
                  <span className="font-mono font-bold">NPR {fmt((calc.totalLanded ?? 0) - cifNpr)}</span>
                </div>

                {/* Per-unit equivalent — shows the duty as Rs per kg / per L /
                    per piece so the user can compare goods on a unit basis,
                    even when the underlying calc is ad-valorem (% × CIF).
                    This is what people often want to see for plastics, steel,
                    chemicals etc. that are bought and resold by weight. */}
                {(() => {
                  const totalDuty = (calc.totalLanded ?? 0) - cifNpr;
                  const u = row.unit;
                  // Pick the natural per-unit divisor:
                  //   kg → item.weight (or quantity if invoice unit is KG)
                  //   L  → item.quantity (litres)
                  //   no → item.quantity (pieces)
                  let perUnitDivisor = 0;
                  let perUnitLabel = "";
                  if (u === "kg") {
                    perUnitDivisor = parseFloat(item?.weight) || (
                      String(item?.unit || "").toLowerCase() === "kg"
                        ? parseFloat(item?.quantity) || 0
                        : 0
                    );
                    perUnitLabel = "per kg";
                  } else if (u === "L") {
                    perUnitDivisor = parseFloat(item?.quantity) || 0;
                    perUnitLabel = "per litre";
                  } else if (u === "no") {
                    perUnitDivisor = parseFloat(item?.quantity) || 0;
                    perUnitLabel = "per piece";
                  } else if (u === "m3") {
                    perUnitDivisor = parseFloat(item?.cbm) || 0;
                    perUnitLabel = "per m³";
                  }
                  if (perUnitDivisor > 0 && totalDuty > 0) {
                    return (
                      <p className="text-[11px] text-[#412460]/80 italic">
                        Equivalent: NPR {fmt(totalDuty / perUnitDivisor)} {perUnitLabel}
                      </p>
                    );
                  }
                  return null;
                })()}

                {calc.effectiveRatePct != null && row.specificDutyNpr == null && (
                  <p className="text-[11px] italic text-[#2D2D2D]/50">
                    Effective rate: {calc.effectiveRatePct}% of CIF
                    {row.unit && ` · unit "${row.unit}" is informational, not used in calc`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* prev/next nav */}
        <div className="flex items-center justify-between gap-2 border-t border-[#E1E3EE] px-5 py-3">
          <button
            type="button"
            disabled={itemIndex <= 0}
            onClick={onPrev}
            className="rounded-lg border border-[#E1E3EE] px-3 py-2 text-xs font-semibold text-[#2D2D2D] disabled:opacity-40 hover:bg-[#E5E1DA]"
          >
            ← Previous item
          </button>
          <button
            type="button"
            disabled={itemIndex >= itemCount - 1}
            onClick={onNext}
            className="rounded-lg border border-[#E1E3EE] px-3 py-2 text-xs font-semibold text-[#2D2D2D] disabled:opacity-40 hover:bg-[#E5E1DA]"
          >
            Next item →
          </button>
        </div>
      </div>
    </>
  );
}

// CountrySelector-style typeahead picker for HS codes.
//
// Closed state: shows the current code (read-only feel) with a chevron.
// Click anywhere on the field → opens the dropdown and focuses the input.
// Typing filters all 6,315 codes live (by description OR code prefix).
// Click a result → selects, closes, calls onPick(code).
// Click outside or press ESC → closes without applying.
// Type a complete 8-digit code and press Enter → applies that code directly.
function HsCodePicker({ value, row, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus the input when the dropdown opens
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // When the value changes externally (auto-match, prev/next item), close
  // the dropdown and clear any in-progress query.
  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [value]);

  const handleOpen = () => {
    if (!open) {
      setOpen(true);
      setQuery("");
    }
  };

  const handleToggle = () => {
    setOpen((o) => {
      if (o) setQuery("");
      return !o;
    });
  };

  const handleSelect = (code) => {
    onPick(code);
    setOpen(false);
    setQuery("");
  };

  // Live results based on the query. Empty query shows nothing (the user
  // already has a value displayed in the trigger; we only suggest when they
  // start typing). If the query parses as a complete 8-digit code, we also
  // include it as the first result so Enter can apply it directly.
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return searchByDescription(q, { limit: 50 });
  }, [query]);

  const directCode = useMemo(() => {
    const norm = normalizeCode(query);
    if (!norm) return null;
    const r = lookupByCode(norm);
    return r ? { code: r.code, description: r.description } : null;
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      e.currentTarget.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (directCode) {
        handleSelect(directCode.code);
      } else if (results.length > 0) {
        handleSelect(results[0].code);
      }
    }
  };

  // Display value: when closed, show the current code (or empty).
  // When open, the input is editable and shows the live query.
  const displayValue = open ? query : value || "";
  const placeholderText = open
    ? "Type a code or description (e.g. 8517, smartphone)…"
    : (value ? "" : "Click to set HS code");

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger / search input */}
      <div
        className={`flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors cursor-text ${
          open
            ? "border-[#412460] ring-1 ring-[#412460]"
            : value
              ? "border-green-400"
              : "border-[#E1E3EE]"
        }`}
        onClick={handleOpen}
      >
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => setQuery(e.target.value)}
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          readOnly={!open}
          className={`min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold tracking-wider text-[#412460] outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-[#2D2D2D]/40 ${
            !open ? "cursor-pointer" : "cursor-text"
          }`}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          className="flex-shrink-0 p-0.5 focus:outline-none"
          tabIndex={-1}
          aria-label={open ? "Close HS code picker" : "Open HS code picker"}
        >
          <svg
            className={`h-4 w-4 text-[#2D2D2D]/40 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[#E1E3EE] bg-white shadow-lg">
          <div className="max-h-72 overflow-y-auto">
            {query.trim() === "" && (
              <p className="px-3 py-3 text-xs text-[#2D2D2D]/50">
                Start typing — search by description (e.g. <span className="font-semibold">smartphone</span>) or code (e.g. <span className="font-semibold">8517</span>).
              </p>
            )}

            {/* "Apply this code directly" hint when query is a valid full code */}
            {directCode && (
              <button
                type="button"
                onClick={() => handleSelect(directCode.code)}
                className="block w-full border-b border-[#E1E3EE] bg-[#412460]/5 px-3 py-2 text-left transition-colors hover:bg-[#412460] hover:text-white"
              >
                <span className="block font-mono text-xs font-semibold text-[#412460]">↵ Apply {directCode.code}</span>
                <span className="block truncate text-[11px] text-[#2D2D2D]/70">{directCode.description}</span>
              </button>
            )}

            {query.trim() !== "" && results.length === 0 && !directCode && (
              <p className="px-3 py-3 text-xs text-[#2D2D2D]/50">No codes match your search.</p>
            )}

            {results.map((r) => {
              const isSelected = r.code === value;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => handleSelect(r.code)}
                  className={`block w-full px-3 py-2 text-left transition-colors hover:bg-[#412460] hover:text-white ${
                    isSelected ? "bg-[#412460]/8" : ""
                  }`}
                >
                  <span className={`block font-mono text-xs font-semibold ${isSelected ? "text-[#412460]" : ""}`}>
                    {r.code}
                  </span>
                  <span className={`block truncate text-[11px] ${isSelected ? "text-[#412460]/70" : "text-[#2D2D2D]/70"}`}>
                    {r.description}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="border-t border-[#E1E3EE] bg-[#FCFBF9] px-3 py-1.5 text-[10px] text-[#2D2D2D]/40">
            Press <span className="font-mono font-semibold">↵</span> to apply, <span className="font-mono font-semibold">Esc</span> to close
          </div>
        </div>
      )}

      {/* Helper hint when row is the current selection (kept on a separate line so
          the description outside isn't redundant; only shown when there's a current value). */}
      {!open && value && row && (
        <p className="mt-1 text-[11px] text-[#2D2D2D]/40 italic">click to change</p>
      )}
    </div>
  );
}

const Row = ({ label, value }) => (
  <div className="flex justify-between">
    <span className="text-[#2D2D2D]/70">{label}</span>
    <span className="font-mono">{value}</span>
  </div>
);
