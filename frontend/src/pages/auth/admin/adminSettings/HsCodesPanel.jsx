import React, { useEffect, useMemo, useState } from "react";
import {
  preloadTariff,
  isReady,
  lookupByCode,
  searchByDescription,
  TOTAL_CODE_COUNT,
  isLpLitreCode,
  defaultAbvForCode,
  requiredFieldForUnit,
} from "../../../../utils/hsCodeLookup";

const SAARC_COUNTRIES = ["IN", "BD", "LK", "PK", "BT", "MV", "AF"];

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

const fmtPct = (v) => (v == null ? "—" : `${v}%`);
const fmtNpr = (v) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

// Friendly label for each unit so the quantity field tells the user exactly
// what to enter (kg / L / sticks etc.).
const unitLabel = (u) => {
  if (!u) return "units";
  const m = String(u).toLowerCase();
  if (m === "kg")  return "kilograms (kg)";
  if (m === "l")   return "litres (L)";
  if (m === "m2")  return "square metres (m²)";
  if (m === "m3")  return "cubic metres (m³)";
  if (m === "ton") return "tonnes (t)";
  if (m === "no")  return "pieces (no.)";
  return String(u);
};

export default function HsCodesPanel() {
  const [ready, setReady] = useState(isReady());
  const [loadError, setLoadError] = useState(null);

  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState(null);
  const [cifValue, setCifValue] = useState("");
  const [qtyValue, setQtyValue] = useState("");
  const [abvValue, setAbvValue] = useState("");
  const [origin, setOrigin] = useState("CN");

  // Load the bundle once when the panel mounts.
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    preloadTariff()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((e) => { if (!cancelled) setLoadError(e?.message || "Failed to load tariff"); });
    return () => { cancelled = true; };
  }, [ready]);

  // Reset transient inputs when switching codes
  useEffect(() => {
    setQtyValue("");
    setAbvValue("");
  }, [selectedCode]);

  const results = useMemo(() => {
    if (!ready) return [];
    const q = query.trim();
    if (!q) return [];
    return searchByDescription(q, { limit: 50 });
  }, [ready, query]);

  const selected = useMemo(() => {
    if (!ready || !selectedCode) return null;
    return lookupByCode(selectedCode);
  }, [ready, selectedCode]);

  const isLpLitre = !!selected && isLpLitreCode(selected.code) && selected.unit === "L";
  const requiredField = selected?.specificDutyNpr != null ? requiredFieldForUnit(selected.unit) : null;

  const calc = useMemo(() => {
    if (!selected) return null;
    const cif = parseFloat(cifValue);
    if (!cif || cif <= 0) return null;

    const isSaarc = SAARC_COUNTRIES.includes(origin);
    const customsBucket = isSaarc ? "saarc" : "other";
    const effBucket =
      origin === "IN"      ? "india"
      : origin === "TIBET" ? "tibet"
      : isSaarc            ? "saarc"
      : "other";

    const customsRate = selected.customsDuty?.[customsBucket];
    const customsAmt  = customsRate != null ? (cif * customsRate) / 100 : 0;
    const exciseAmt   = selected.excise   != null ? (cif * selected.excise)   / 100 : 0;
    const agriAmt     = selected.agriFee  != null ? (cif * selected.agriFee)  / 100 : 0;
    const advAmt      = selected.advTax   != null ? (cif * selected.advTax)   / 100 : 0;

    // Specific duty: use the user-entered quantity. For LP-litre spirits
    // codes, scale by ABV% (litre-of-pure-alcohol basis).
    const qty = parseFloat(qtyValue);
    let specificAmt = 0;
    let specificNeedsQty = false;
    let lpLitreEffectiveQty = null;
    if (selected.specificDutyNpr != null) {
      if (qty && qty > 0) {
        if (isLpLitre) {
          const abv = parseFloat(abvValue);
          const effectiveAbv = Number.isFinite(abv) && abv > 0
            ? abv
            : defaultAbvForCode(selected.code);
          const scaled = qty * (effectiveAbv / 100);
          specificAmt = selected.specificDutyNpr * scaled;
          lpLitreEffectiveQty = scaled;
        } else {
          specificAmt = selected.specificDutyNpr * qty;
        }
      } else {
        specificNeedsQty = true;
      }
    }

    const vatBase = cif + customsAmt + exciseAmt + agriAmt + specificAmt;
    const vatAmt  = selected.vat != null ? (vatBase * selected.vat) / 100 : 0;
    const total   = cif + customsAmt + exciseAmt + agriAmt + specificAmt + advAmt + vatAmt;

    const effRate     = selected.effectiveRate?.[effBucket];
    const totalFromEff = effRate != null ? cif * (1 + effRate / 100) : null;

    return {
      bucket: customsBucket, effBucket,
      customsRate, customsAmt, exciseAmt, agriAmt, advAmt, vatAmt, vatBase, total,
      specificAmt, specificNeedsQty, lpLitreEffectiveQty,
      effRate, totalFromEff,
    };
  }, [selected, cifValue, origin, qtyValue, abvValue, isLpLitre]);

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load HS tariff data: {loadError}
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="rounded-xl border border-[#E1E3EE] p-6 text-center text-sm text-gray-500">
        Loading Nepal Customs Tariff ({TOTAL_CODE_COUNT.toLocaleString()} codes)…
      </div>
    );
  }

  // Effective ABV that will be used in the calc (user value or default).
  const resolvedAbv = isLpLitre
    ? (parseFloat(abvValue) > 0 ? parseFloat(abvValue) : defaultAbvForCode(selected.code))
    : null;

  // How many quantity-style inputs to show (CIF + maybe Quantity + maybe ABV + Origin)
  const inputCols = 1 /* CIF */
    + (selected?.specificDutyNpr != null ? 1 : 0)
    + (isLpLitre ? 1 : 0)
    + 1 /* Origin */;
  const gridClass =
    inputCols >= 4 ? "sm:grid-cols-4"
    : inputCols === 3 ? "sm:grid-cols-3"
    : "sm:grid-cols-2";

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-[#412460]">HS Codes Management</h3>

      <div className="rounded-xl border border-[#E1E3EE] p-4 space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-2">
            Search the Nepal Customs Tariff 2082/83 — {TOTAL_CODE_COUNT.toLocaleString()} codes with English descriptions and live duty calculation.
          </p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by HS code (e.g. 8517) or description (e.g. smartphone)"
            className="w-full p-2.5 rounded-lg border border-[#E1E3EE] focus:border-[#412460] focus:ring-1 focus:ring-[#412460] outline-none text-sm"
          />
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {query.trim() === "" && (
            <p className="text-xs text-gray-500 px-3 py-2">Start typing to search the tariff.</p>
          )}
          {query.trim() !== "" && results.length === 0 && (
            <p className="text-xs text-gray-500 px-3 py-2">No codes match your search.</p>
          )}
          {results.map((r) => {
            const isSelected = selectedCode === r.code;
            return (
              <button
                key={r.code}
                type="button"
                onClick={() => setSelectedCode(isSelected ? null : r.code)}
                className={`w-full text-left flex items-start justify-between gap-3 p-3 rounded-lg transition-colors ${
                  isSelected ? "bg-[#412460] text-white" : "bg-gray-50 hover:bg-[#E5E1DA]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-mono font-semibold block">{r.code}</span>
                  <span className={`text-xs block truncate ${isSelected ? "text-white/80" : "text-gray-600"}`}>
                    {r.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-[#412460]/30 bg-[#412460]/5 p-4 space-y-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-[#412460]/70">Selected code</span>
            <h4 className="font-mono text-lg font-bold text-[#412460]">{selected.code}</h4>
            <p className="text-sm text-[#2D2D2D] mt-1">{selected.description}</p>
            <p className="text-xs text-gray-500 mt-1">
              Heading {selected.heading} · Source PDF page {selected.page} ·
              Unit: <span className="font-semibold">{selected.unit || "—"}</span>
              {selected.dataSource === "reference" && (
                <span className="ml-2 inline-block text-[10px] px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">
                  Reference only — rate data not available
                </span>
              )}
            </p>
          </div>

          {/* Calculation method indicator — same as the invoice drawer.
              Tells the user EXACTLY how this code's duty is computed. */}
          <div className="rounded-lg bg-white border border-[#412460]/15 p-2 text-[11px] text-[#2D2D2D]/80">
            {selected.specificDutyNpr != null ? (
              <>
                <span className="font-semibold text-[#412460]">Calculation method:</span>{" "}
                Mixed — ad-valorem <span className="font-mono">% × CIF</span> +
                specific <span className="font-mono">NPR {fmtNpr(selected.specificDutyNpr)}/{isLpLitre ? "LP-L" : selected.unit}</span>
                {" × "}{requiredField}.
                {isLpLitre && <> Spirits code — duty is per <strong>LP-litre</strong> (litre of pure alcohol = bulk litres × ABV/100).</>}
              </>
            ) : (
              <>
                <span className="font-semibold text-[#412460]">Calculation method:</span>{" "}
                Ad-valorem only — <span className="font-mono">% × CIF value</span>.
                {selected.unit && (
                  <>
                    {" "}Unit <span className="font-mono uppercase">{selected.unit}</span> is informational;
                    quantity is <em>not</em> used in the duty calculation for this code.
                  </>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <RateCell label="Customs (SAARC)"   value={fmtPct(selected.customsDuty?.saarc)} />
            <RateCell label="Customs (Other)"   value={fmtPct(selected.customsDuty?.other)} />
            <RateCell label="Excise"            value={fmtPct(selected.excise)} />
            <RateCell label="Agri Reform Fee"   value={fmtPct(selected.agriFee)} />
            <RateCell label="Advance Tax"       value={fmtPct(selected.advTax)} />
            <RateCell label="VAT"               value={fmtPct(selected.vat)} />
            <RateCell label="Effective (SAARC)" value={fmtPct(selected.effectiveRate?.saarc)} />
            <RateCell label="Effective (Other)" value={fmtPct(selected.effectiveRate?.other)} />
          </div>

          <div className="border-t border-[#412460]/20 pt-4">
            <p className="text-xs uppercase tracking-wider text-[#412460]/70 mb-2">Landed-cost calculator</p>
            <div className={`grid gap-3 ${gridClass}`}>
              <div>
                <label className="text-xs text-gray-600 block mb-1">CIF value (NPR)</label>
                <input
                  type="number"
                  value={cifValue}
                  onChange={(e) => setCifValue(e.target.value)}
                  placeholder="e.g. 30000"
                  className="w-full p-2 rounded-lg border border-[#E1E3EE] text-sm"
                />
              </div>
              {selected.specificDutyNpr != null && (
                <div>
                  <label className="text-xs text-gray-600 block mb-1">
                    Quantity in {unitLabel(selected.unit)}
                    <span className="text-[#B99353] ml-1">required</span>
                  </label>
                  <input
                    type="number"
                    value={qtyValue}
                    onChange={(e) => setQtyValue(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full p-2 rounded-lg border border-[#E1E3EE] text-sm"
                  />
                </div>
              )}
              {isLpLitre && (
                <div>
                  <label className="text-xs text-gray-600 block mb-1">
                    Alcohol strength (% ABV)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={abvValue}
                    onChange={(e) => setAbvValue(e.target.value)}
                    placeholder={String(defaultAbvForCode(selected.code))}
                    className="w-full p-2 rounded-lg border border-[#E1E3EE] text-sm"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-600 block mb-1">Origin country</label>
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full p-2 rounded-lg border border-[#E1E3EE] text-sm"
                >
                  {ORIGIN_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {selected.specificDutyNpr != null && (
              <p className="mt-2 text-[11px] text-[#B99353] bg-[#B99353]/10 rounded p-2">
                This code has a <strong>specific duty of NPR {fmtNpr(selected.specificDutyNpr)} per {isLpLitre ? "LP-litre" : (selected.unit || "unit")}</strong> on top of the ad-valorem rate.
                {isLpLitre
                  ? " Enter quantity in litres AND ABV % for accurate landed-cost calculation."
                  : ` Enter quantity in ${unitLabel(selected.unit)} for accurate landed-cost calculation.`}
              </p>
            )}

            {calc && (
              <div className="mt-4 rounded-lg bg-white border border-[#E1E3EE] p-3 text-sm space-y-1">
                <Row label={`Customs duty (${calc.customsRate ?? "—"}%)`} value={fmtNpr(calc.customsAmt)} />
                {selected.specificDutyNpr != null && (
                  calc.specificNeedsQty
                    ? <Row label={`Specific duty (NPR ${selected.specificDutyNpr}/${isLpLitre ? "LP-L" : (selected.unit || "unit")})`} value={<span className="text-[#B99353]">enter qty</span>} />
                    : isLpLitre
                      ? <Row label={`Specific duty (NPR ${selected.specificDutyNpr}/LP-L × ${qtyValue} L × ${resolvedAbv}% = ${fmtNpr(calc.lpLitreEffectiveQty)} LP-L)`} value={fmtNpr(calc.specificAmt)} />
                      : <Row label={`Specific duty (NPR ${selected.specificDutyNpr}/${selected.unit || "unit"} × ${qtyValue})`} value={fmtNpr(calc.specificAmt)} />
                )}
                {selected.excise   != null && <Row label={`Excise (${selected.excise}%)`}                value={fmtNpr(calc.exciseAmt)} />}
                {selected.agriFee  != null && <Row label={`Agri reform (${selected.agriFee}%)`}          value={fmtNpr(calc.agriAmt)} />}
                {selected.advTax   != null && <Row label={`Advance income tax (${selected.advTax}%)`}    value={fmtNpr(calc.advAmt)} />}
                {selected.vat      != null && <Row label={`VAT (${selected.vat}% of ${fmtNpr(calc.vatBase)})`} value={fmtNpr(calc.vatAmt)} />}
                <div className="border-t border-[#E1E3EE] mt-2 pt-2 flex justify-between font-bold text-[#412460]">
                  <span>Total landed cost</span>
                  <span>NPR {fmtNpr(calc.total)}</span>
                </div>
                {calc.effRate != null && selected.specificDutyNpr == null && (
                  <p className="text-[11px] text-gray-500 italic mt-1">
                    Cross-check using effective rate ({calc.effRate}%): NPR {fmtNpr(calc.totalFromEff)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const RateCell = ({ label, value }) => (
  <div className="bg-white rounded-lg border border-[#E1E3EE] p-2">
    <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
    <div className="text-sm font-semibold text-[#412460]">{value}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between text-[#2D2D2D]">
    <span>{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);
