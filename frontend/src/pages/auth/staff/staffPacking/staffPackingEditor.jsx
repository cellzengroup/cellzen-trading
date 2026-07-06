import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import StaffPageShell from "../StaffPageShell";
import BarcodeScanner from "../../../../inventory/components/BarcodeScanner.jsx";
import {
  getPackingList,
  nextPackingNumber,
  savePackingList,
  lookupProductByBarcode,
  getInvoiceItems,
} from "../../../../utils/packingApi.js";
import { generatePackingListPDF, generatePackingListExcel } from "../../../../utils/generatePackingList.js";

const uid = () => `c${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Parse a single size string like "50x60x70" (also accepts × or *) → [L,W,H].
const parseDims = (size) => String(size || "").split(/[x×*]/i).map((s) => parseFloat(s.trim()));

// CBM = (L × W × H in cm) ÷ 1,000,000  → cubic metres, from the size string.
const computeCbmFromSize = (size) => {
  const [L, W, H] = parseDims(size);
  if (L > 0 && W > 0 && H > 0) return ((L * W * H) / 1_000_000).toFixed(4);
  return "";
};

const newCarton = (defaultMarka = "") => ({
  id: uid(), marka: defaultMarka, weightKg: "", size: "", cbm: "", items: [],
});

const FIELD = "w-full rounded-xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none";
const LABEL = "block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/55";

export default function StaffPackingEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const editNumber = new URLSearchParams(location.search).get("number");
  const scanInputRef = useRef(null);
  const draggedRef = useRef(null); // product card currently being dragged

  // Product pool loaded from a PI/invoice (drag these into cartons).
  const [pool, setPool] = useState([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolSearch, setPoolSearch] = useState("");
  const [dropCartonId, setDropCartonId] = useState(null);

  const [packing, setPacking] = useState({
    packingNumber: "", reference: "", customerName: "", marka: "", status: "Draft", cartons: [],
  });
  const [activeCartonId, setActiveCartonId] = useState(null);
  const [scanCode, setScanCode] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (editNumber) {
          const p = await getPackingList(editNumber);
          if (!cancelled && p) {
            const cartons = (p.cartons || []).map((c) => {
              const base = { ...newCarton(), ...c, id: c.id || uid() };
              // Backfill the single size string for cartons saved with old L/W/H.
              if (!base.size && (c.length || c.width || c.height)) {
                base.size = [c.length, c.width, c.height].filter((v) => v !== undefined && v !== "").join("x");
                if (!base.cbm) base.cbm = computeCbmFromSize(base.size);
              }
              return base;
            });
            setPacking({ ...p, cartons });
            setActiveCartonId(cartons[0]?.id || null);
          }
        } else {
          const number = await nextPackingNumber();
          const first = newCarton();
          if (!cancelled) {
            setPacking((cur) => ({ ...cur, packingNumber: number, cartons: [first] }));
            setActiveCartonId(first.id);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Unable to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editNumber]);

  const setField = (field, value) => setPacking((cur) => ({ ...cur, [field]: value }));

  // Changing the Default MARKA cascades to cartons that have no MARKA yet (or
  // that still carry the previous default) — so Carton 1 auto-fills from it.
  const setDefaultMarka = (value) => {
    setPacking((cur) => {
      const prev = cur.marka || "";
      return {
        ...cur,
        marka: value,
        cartons: cur.cartons.map((c) => (!c.marka || c.marka === prev ? { ...c, marka: value } : c)),
      };
    });
  };

  const updateCarton = (id, patch) => {
    setPacking((cur) => ({
      ...cur,
      cartons: cur.cartons.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        // Recompute CBM whenever the size string changes.
        if ("size" in patch) {
          next.cbm = computeCbmFromSize(next.size);
        }
        return next;
      }),
    }));
  };

  const addCarton = () => {
    const c = newCarton(packing.marka);
    setPacking((cur) => ({ ...cur, cartons: [...cur.cartons, c] }));
    setActiveCartonId(c.id);
  };

  const removeCarton = (id) => {
    setPacking((cur) => {
      const cartons = cur.cartons.filter((c) => c.id !== id);
      if (activeCartonId === id) setActiveCartonId(cartons[0]?.id || null);
      return { ...cur, cartons };
    });
  };

  const addItem = (cartonId, item) => {
    setPacking((cur) => ({
      ...cur,
      cartons: cur.cartons.map((c) => {
        if (c.id !== cartonId) return c;
        // Same barcode already in this carton → just bump the quantity.
        if (item.barcode) {
          const idx = c.items.findIndex((it) => it.barcode && it.barcode === item.barcode);
          if (idx >= 0) {
            const items = c.items.slice();
            items[idx] = { ...items[idx], quantity: (Number(items[idx].quantity) || 0) + (Number(item.quantity) || 1) };
            return { ...c, items };
          }
        }
        return { ...c, items: [...c.items, item] };
      }),
    }));
  };

  const updateItem = (cartonId, idx, patch) => {
    setPacking((cur) => ({
      ...cur,
      cartons: cur.cartons.map((c) => {
        if (c.id !== cartonId) return c;
        const items = c.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
        return { ...c, items };
      }),
    }));
  };

  const removeItem = (cartonId, idx) => {
    setPacking((cur) => ({
      ...cur,
      cartons: cur.cartons.map((c) => (c.id === cartonId ? { ...c, items: c.items.filter((_, i) => i !== idx) } : c)),
    }));
  };

  // Ensure there is an active carton; create one if the list is empty.
  const ensureActiveCarton = useCallback(() => {
    if (activeCartonId && packing.cartons.some((c) => c.id === activeCartonId)) return activeCartonId;
    if (packing.cartons[0]) { setActiveCartonId(packing.cartons[0].id); return packing.cartons[0].id; }
    const c = newCarton(packing.marka);
    setPacking((cur) => ({ ...cur, cartons: [...cur.cartons, c] }));
    setActiveCartonId(c.id);
    return c.id;
  }, [activeCartonId, packing.cartons, packing.marka]);

  const handleScan = useCallback(async (raw) => {
    const code = String(raw || "").trim();
    if (!code) return;
    setError("");
    const cartonId = ensureActiveCarton();
    try {
      const product = await lookupProductByBarcode(code);
      addItem(cartonId, { productName: product?.name || "", productImage: product?.image_url || "", barcode: code, quantity: 1 });
      setInfo(product ? `Added: ${product.name}` : `No product matched "${code}" — type its name.`);
    } catch {
      addItem(cartonId, { productName: "", productImage: "", barcode: code, quantity: 1 });
      setInfo(`Added barcode "${code}" — type its name.`);
    }
    setScanCode("");
    scanInputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureActiveCarton]);

  const onScanKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(scanCode);
    }
  };

  // Pull the PI/invoice products (by the Reference number) into the pool.
  const loadFromPI = async () => {
    const number = String(packing.reference || "").trim();
    if (!number) { setError("Enter the PI / invoice number in Reference first."); return; }
    setPoolLoading(true);
    setError("");
    setInfo("");
    try {
      const items = await getInvoiceItems(number);
      setPool(items);
      setInfo(items.length ? `Loaded ${items.length} product(s) from ${number}. Drag them into cartons.` : `No products found on ${number}.`);
    } catch (e) {
      setError(e.message || "Could not load products from that PI.");
      setPool([]);
    } finally {
      setPoolLoading(false);
    }
  };

  // Drop a dragged pool product into a carton.
  const handleDrop = (e, cartonId) => {
    e.preventDefault();
    setDropCartonId(null);
    let item = draggedRef.current;
    if (!item) {
      try { item = JSON.parse(e.dataTransfer.getData("application/json") || "null"); } catch { item = null; }
    }
    draggedRef.current = null;
    if (!item) return;
    addItem(cartonId, {
      productName: item.productName || "",
      productImage: item.productImage || "",
      barcode: item.barcode || "",
      quantity: Number(item.quantity) || 1,
    });
  };

  const addPoolItemToActive = (item) => {
    const cartonId = ensureActiveCarton();
    addItem(cartonId, {
      productName: item.productName || "",
      productImage: item.productImage || "",
      barcode: item.barcode || "",
      quantity: Number(item.quantity) || 1,
    });
  };

  const totals = useMemo(() => {
    let qty = 0, weight = 0, cbm = 0;
    for (const c of packing.cartons) {
      weight += Number(c.weightKg) || 0;
      cbm += Number(c.cbm) || 0;
      for (const it of c.items) qty += Number(it.quantity) || 0;
    }
    return {
      cartons: packing.cartons.length,
      qty,
      weight: Math.round(weight * 1000) / 1000,
      cbm: Math.round(cbm * 10000) / 10000,
    };
  }, [packing.cartons]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const saved = await savePackingList(packing);
      setInfo(`Saved ${saved.packingNumber}.`);
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <StaffPageShell activePage="Packing List" title="Packing List" eyebrow="Loading...">
        <div className="rounded-[2rem] bg-white p-10 text-center text-[#2D2D2D]/55">Loading...</div>
      </StaffPageShell>
    );
  }

  return (
    <StaffPageShell activePage="Packing List" title="Packing List" eyebrow={packing.packingNumber}>
      <div className="space-y-4">
        {/* Header / meta */}
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#412460]">{packing.packingNumber}</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate("/staff-packing")}
                className="rounded-full border border-[#E1E3EE] bg-[#E5E1DA] px-4 py-2 text-xs font-semibold text-[#2D2D2D] transition-colors hover:bg-[#2D2D2D] hover:text-white">Back</button>
              <button type="button" onClick={() => generatePackingListExcel(packing)}
                className="rounded-full border border-[#412460] px-4 py-2 text-xs font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white">Export Excel</button>
              <button type="button" onClick={() => generatePackingListPDF(packing)}
                className="rounded-full border border-[#412460] px-4 py-2 text-xs font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white">Export PDF</button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-full bg-[#412460] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>

          {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          {info && <div className="mt-4 rounded-2xl border border-[#B99353]/40 bg-[#F6F1EA] p-3 text-xs text-[#412460]">{info}</div>}

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label><span className={LABEL}>Reference / PI No</span>
              <div className="mt-1 flex gap-2">
                <input className={FIELD} value={packing.reference} onChange={(e) => setField("reference", e.target.value)} placeholder="e.g. CZN-05-0001" />
                <button type="button" onClick={loadFromPI} disabled={poolLoading}
                  className="shrink-0 rounded-xl bg-[#412460] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60">
                  {poolLoading ? "Loading…" : "Load PI"}</button>
              </div></label>
            <label><span className={LABEL}>Customer</span>
              <input className={`mt-1 ${FIELD}`} value={packing.customerName} onChange={(e) => setField("customerName", e.target.value)} /></label>
            <label><span className={LABEL}>Default MARKA</span>
              <input className={`mt-1 ${FIELD}`} value={packing.marka} onChange={(e) => setDefaultMarka(e.target.value)} placeholder="Shipping mark" /></label>
          </div>
        </div>

        {/* Scan bar */}
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <span className={LABEL}>Scan barcode (USB scanner or type), then Enter</span>
              <div className="mt-1 flex gap-2">
                <input
                  ref={scanInputRef}
                  autoFocus
                  className={FIELD}
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  onKeyDown={onScanKeyDown}
                  placeholder="Scan or type a product barcode…"
                />
                <button type="button" onClick={() => handleScan(scanCode)}
                  className="shrink-0 rounded-xl bg-[#412460] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]">Add</button>
                <button type="button" onClick={() => setShowCamera((v) => !v)}
                  aria-label={showCamera ? "Close camera" : "Scan with camera"}
                  title={showCamera ? "Close camera" : "Scan with camera"}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#412460] transition-colors ${showCamera ? "bg-[#412460] text-white" : "text-[#412460] hover:bg-[#412460] hover:text-white"}`}>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-[11px] text-[#2D2D2D]/45">
                Scans go into the <span className="font-semibold text-[#412460]">active carton</span> (highlighted below).
              </p>
            </div>
          </div>
          {showCamera && (
            <div className="mt-4">
              <BarcodeScanner onScan={(code) => handleScan(code)} onError={(m) => setError(m)} />
            </div>
          )}
        </div>

        {/* Product pool loaded from the PI — drag a card into a carton */}
        {pool.length > 0 && (
          <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#412460]">PI Products <span className="text-xs font-normal text-[#2D2D2D]/40">({pool.length})</span></h3>
                <p className="text-xs text-[#2D2D2D]/45">Drag a product into a carton, or tap ＋ to add it to the active carton.</p>
              </div>
              <button type="button" onClick={() => { setPool([]); setPoolSearch(""); }} className="text-xs font-semibold text-[#B99353] hover:text-[#412460]">Clear</button>
            </div>

            {/* Search the loaded PI products by name */}
            <div className="relative mt-4">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2D2D2D]/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
              </svg>
              <input
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
                placeholder="Search products by name…"
                className="w-full rounded-xl border border-[#E1E3EE] bg-white py-2 pl-9 pr-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
              />
            </div>

            {(() => {
              const q = poolSearch.trim().toLowerCase();
              const filtered = q ? pool.filter((p) => (p.productName || "").toLowerCase().includes(q)) : pool;
              if (filtered.length === 0) {
                return <p className="mt-4 text-sm text-[#2D2D2D]/45">No products match “{poolSearch}”.</p>;
              }
              return (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p, i) => (
                <div
                  key={`${p.productName}-${i}`}
                  draggable
                  onDragStart={(e) => { draggedRef.current = p; e.dataTransfer.effectAllowed = "copy"; try { e.dataTransfer.setData("application/json", JSON.stringify(p)); } catch { /* ignore */ } }}
                  onDragEnd={() => { draggedRef.current = null; }}
                  className="group flex cursor-grab items-center gap-3 rounded-2xl border border-[#E1E3EE] bg-[#F7F6F2] p-3 active:cursor-grabbing"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
                    {p.productImage
                      ? <img src={p.productImage} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full w-full items-center justify-center text-[10px] text-[#2D2D2D]/30">No img</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#2D2D2D]" title={p.productName}>{p.productName || "—"}</p>
                    <p className="text-[10px] text-[#2D2D2D]/45">Qty: {p.quantity}</p>
                  </div>
                  <button type="button" onClick={() => addPoolItemToActive(p)}
                    className="shrink-0 rounded-full bg-[#412460] px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-[#B99353]" title="Add to active carton">＋</button>
                </div>
              ))}
            </div>
              );
            })()}
          </div>
        )}

        {/* Cartons */}
        {packing.cartons.map((c, idx) => {
          const active = c.id === activeCartonId;
          const isDropTarget = dropCartonId === c.id;
          return (
            <div
              key={c.id}
              onDragOver={(e) => { e.preventDefault(); if (dropCartonId !== c.id) setDropCartonId(c.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropCartonId(null); }}
              onDrop={(e) => handleDrop(e, c.id)}
              className={`rounded-[2rem] border bg-white p-6 transition-colors ${isDropTarget ? "border-[#B99353] shadow-[0_0_0_2px_rgba(185,147,83,0.4)]" : active ? "border-[#412460] shadow-[0_0_0_2px_rgba(65,36,96,0.15)]" : "border-[#E1E3EE]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#412460] text-sm font-bold text-white">{idx + 1}</span>
                  <h3 className="text-base font-semibold text-[#412460]">Carton {idx + 1}</h3>
                  {active
                    ? <span className="rounded-full bg-[#412460]/10 px-3 py-1 text-[10px] font-semibold text-[#412460]">Active</span>
                    : <button type="button" onClick={() => setActiveCartonId(c.id)} className="rounded-full border border-[#E1E3EE] px-3 py-1 text-[10px] font-semibold text-[#2D2D2D]/55 hover:border-[#412460] hover:text-[#412460]">Set active</button>}
                </div>
                <button type="button" onClick={() => removeCarton(c.id)} className="text-xs font-semibold text-[#B99353] hover:text-[#412460]">Remove carton</button>
              </div>

              {/* Carton-level packed values */}
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <label><span className={LABEL}>MARKA</span>
                  <input className={`mt-1 ${FIELD}`} value={c.marka} onChange={(e) => updateCarton(c.id, { marka: e.target.value })} /></label>
                <label><span className={LABEL}>Weight (kg)</span>
                  <input type="number" min="0" step="0.01" className={`mt-1 ${FIELD}`} value={c.weightKg} onChange={(e) => updateCarton(c.id, { weightKg: e.target.value })} /></label>
                <label><span className={LABEL}>Size (cm) — e.g. 50x60x70</span>
                  <input type="text" className={`mt-1 ${FIELD}`} value={c.size} onChange={(e) => updateCarton(c.id, { size: e.target.value })} placeholder="50x60x70" /></label>
                <label><span className={LABEL}>CBM (auto, editable)</span>
                  <input type="number" min="0" step="0.0001" className={`mt-1 ${FIELD}`} value={c.cbm} onChange={(e) => updateCarton(c.id, { cbm: e.target.value })} placeholder="auto from size" /></label>
              </div>

              {/* Products in this carton */}
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className={LABEL}>Products in this carton</span>
                  <button type="button" onClick={() => addItem(c.id, { productName: "", productImage: "", barcode: "", quantity: 1 })}
                    className="rounded-full border border-[#412460] px-3 py-1 text-[11px] font-semibold text-[#412460] hover:bg-[#412460] hover:text-white">+ Add product</button>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-[0.14em] text-[#2D2D2D]/40">
                      <tr><th className="py-2 w-14">Image</th><th className="py-2">Product Name</th><th className="py-2 w-28">Qty / Carton</th><th className="py-2 w-32">Barcode</th><th className="py-2 w-10"></th></tr>
                    </thead>
                    <tbody>
                      {c.items.length === 0 ? (
                        <tr><td colSpan={5} className="py-4 text-center text-xs text-[#2D2D2D]/45">No products yet — scan, drag from the PI pool, or add.</td></tr>
                      ) : c.items.map((it, i) => (
                        <tr key={i} className="border-t border-[#EAE8E5]">
                          <td className="py-2 pr-2">
                            <div className="h-10 w-10 overflow-hidden rounded-lg bg-[#F7F6F2]">
                              {it.productImage
                                ? <img src={it.productImage} alt="" className="h-full w-full object-cover" />
                                : <div className="flex h-full w-full items-center justify-center text-[9px] text-[#2D2D2D]/30">—</div>}
                            </div>
                          </td>
                          <td className="py-2 pr-2"><input className={FIELD} value={it.productName} onChange={(e) => updateItem(c.id, i, { productName: e.target.value })} /></td>
                          <td className="py-2 pr-2"><input type="number" min="0" className={FIELD} value={it.quantity} onChange={(e) => updateItem(c.id, i, { quantity: e.target.value })} /></td>
                          <td className="py-2 pr-2 text-xs text-[#2D2D2D]/45">{it.barcode || "—"}</td>
                          <td className="py-2"><button type="button" onClick={() => removeItem(c.id, i)} className="text-xs font-semibold text-[#B99353] hover:text-[#412460]">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}

        <button type="button" onClick={addCarton}
          className="w-full rounded-[2rem] border-2 border-dashed border-[#412460]/30 py-4 text-sm font-semibold text-[#412460] transition-colors hover:border-[#412460] hover:bg-[#412460]/5">
          + Add another carton
        </button>

        {/* Totals */}
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Total Cartons", value: totals.cartons },
            { label: "Total Quantity", value: totals.qty },
            { label: "Total Weight (kg)", value: totals.weight },
            { label: "Total CBM", value: totals.cbm },
          ].map((t) => (
            <div key={t.label} className="rounded-[2rem] bg-[#E5E1DA] p-5">
              <p className="text-xs font-medium text-[#2D2D2D]/55">{t.label}</p>
              <p className="mt-1 text-2xl font-bold text-[#2D2D2D]">{t.value}</p>
            </div>
          ))}
        </div>
      </div>
    </StaffPageShell>
  );
}
