import React, { useMemo } from "react";
import {
  lookupByCode,
  calculateImportCost,
  effectiveDutyMultiplier,
} from "../../../../utils/hsCodeLookup";

const fmt = (v) =>
  v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function HsBreakdownModal({
  open,
  items,
  defaultOrigin,
  computeCifNpr,
  onClose,
  onOpenItem,
}) {
  const rows = useMemo(() => {
    if (!open || !items) return [];
    return items.map((it, idx) => {
      const row = it.hsCode ? lookupByCode(it.hsCode) : null;
      const cifNpr = computeCifNpr(it);
      const origin = it.dutyOrigin || defaultOrigin || "CN";
      // Specific-duty rows multiply Rs/unit by the QUANTITY in the row's unit
      // (kg → item.weight, m³ → item.cbm, anything else → item.quantity).
      // Spirits codes (chapter 22 LP-litre) scale further by ABV%.
      const unitQty = row && row.specificDutyNpr != null
        ? effectiveDutyMultiplier(it, row)
        : (parseFloat(it.quantity) || 1);
      const calc = row && cifNpr > 0
        ? calculateImportCost({
            code: row.code,
            cifValue: cifNpr,
            originCountry: origin,
            quantity: unitQty,
          })
        : null;
      return {
        idx,
        item: it,
        row,
        cifNpr,
        origin,
        calc,
        duty: calc && !calc.error ? (calc.totalLanded - cifNpr) : null,
      };
    });
  }, [open, items, defaultOrigin, computeCifNpr]);

  const totals = useMemo(() => {
    let cif = 0, customs = 0, excise = 0, agri = 0, advTax = 0, vat = 0, specific = 0, total = 0;
    for (const r of rows) {
      cif += r.cifNpr || 0;
      if (!r.calc || r.calc.error) continue;
      const b = r.calc.breakdown;
      customs  += b.customsDuty       || 0;
      excise   += b.exciseAmount      || 0;
      agri     += b.agriFeeAmount     || 0;
      advTax   += b.advTaxAmount      || 0;
      vat      += b.vatAmount         || 0;
      specific += b.specificDutyAmount || 0;
      total    += r.duty              || 0;
    }
    return { cif, customs, excise, agri, advTax, vat, specific, total };
  }, [rows]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[95vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E1E3EE] px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#412460]/70">Customs Duty Breakdown</p>
            <h3 className="text-lg font-semibold text-[#2D2D2D]">Per-item HS Calculation</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#2D2D2D]/50 transition-colors hover:bg-[#E5E1DA] hover:text-[#412460]"
            aria-label="Close"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(85vh-9rem)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#F4F2EF] text-[10px] uppercase tracking-wider text-[#2D2D2D]/70">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">HS Code</th>
                <th className="px-3 py-2 text-right">CIF (NPR)</th>
                <th className="px-3 py-2 text-right">Customs</th>
                <th className="px-3 py-2 text-right">Excise</th>
                <th className="px-3 py-2 text-right">Agri</th>
                <th className="px-3 py-2 text-right">Adv. Tax</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-right">Total Duty</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#2D2D2D]/50">No items.</td></tr>
              )}
              {rows.map((r) => {
                const b = r.calc?.breakdown;
                const noRow = !r.row;
                const isRef = r.row?.dataSource === "reference";
                return (
                  <tr key={r.idx} className="border-b border-[#E1E3EE] hover:bg-[#FCFBF9]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[#2D2D2D]">{r.item.productName || <span className="italic text-[#2D2D2D]/40">(unnamed)</span>}</div>
                      <div className="text-[10px] text-[#2D2D2D]/50">qty {r.item.quantity || 0} × {r.item.unit}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.row?.code ?? <span className="text-[#2D2D2D]/40 italic">—</span>}
                      {isRef && <span className="ml-1 text-[10px] text-yellow-700">(ref-only)</span>}
                      {noRow && r.item.hsCode && <span className="ml-1 text-[10px] text-red-600">(invalid)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(r.cifNpr)}</td>
                    <td className="px-3 py-2 text-right font-mono">{b ? fmt(b.customsDuty) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{b ? fmt(b.exciseAmount) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{b ? fmt(b.agriFeeAmount) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{b ? fmt(b.advTaxAmount) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{b ? fmt(b.vatAmount) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-[#412460]">
                      {r.duty != null ? fmt(r.duty) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => { onOpenItem(r.idx); onClose(); }}
                        className="text-[11px] font-semibold text-[#412460] hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-[#412460]/5 text-[#412460]">
              <tr className="border-t-2 border-[#412460]/30 font-semibold">
                <td colSpan={2} className="px-3 py-3 text-right">Totals (NPR):</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(totals.cif)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(totals.customs + totals.specific)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(totals.excise)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(totals.agri)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(totals.advTax)}</td>
                <td className="px-3 py-3 text-right font-mono">{fmt(totals.vat)}</td>
                <td className="px-3 py-3 text-right font-mono text-base">{fmt(totals.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="border-t border-[#E1E3EE] px-6 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#5a3680]"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
