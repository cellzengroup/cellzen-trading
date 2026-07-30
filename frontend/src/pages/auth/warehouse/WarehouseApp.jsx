import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { createPortal } from "react-dom";
import WarehouseScanner from "./WarehouseScanner";
import Barcode from "./Barcode";
import {
  loadRacks,
  createRack,
  deleteRack,
  loadItems,
  putAwayItem,
  shipItem,
  updateItemShipmentMode,
  deleteItem,
  exportItemsCsv,
  loadSupplierOrders,
  syncSupplierOrders,
  exportSupplierOrdersXlsx,
  goodsCode,
} from "../../../utils/warehouseApi";
import { downloadItemLabel, downloadRackLabel, printItemLabel } from "../../../utils/warehouseLabels";

// A scanned code is a SHELF label when it matches a location-code shape:
// letters - digits - digits, where the letters may carry a leading number of
// their own. That's GT-01-0001 in the GtradeA section and CZN01-01-0001 in the
// older Cellzen one — one pattern covers both, so shelves already on the wall
// keep scanning. Everything else is a tracking number.
// Must stay in step with SHELF_PATTERN in backend/inventory/routes/warehouse.js.
const RACK_CODE_PATTERN = /^[A-Za-z]{1,6}\d{0,4}-\d{1,4}-\d{1,6}$/;
const isShelf = (text) => RACK_CODE_PATTERN.test(String(text || "").trim());

// Does an item match the free-text search `f` (already lowercased)? One predicate
// for the Dashboard / Ship / Dispatched lists so they can never disagree on what
// a search matches. The gtradea PR id and 1688 order # are in here alongside the
// internal CZN code — those are what the GtradeA panel shows and what's printed
// on the box, so they're what staff type.
const itemMatches = (i, f) =>
  (i.prCode || "").toLowerCase().includes(f) ||
  (i.code || "").toLowerCase().includes(f) ||
  (i.orderNumber || "").toLowerCase().includes(f) ||
  (i.trackingNumber || "").toLowerCase().includes(f) ||
  (i.rackId || "").toLowerCase().includes(f);

const CELLZEN_TABS = ["Store", "Ship", "Racks", "Dashboard", "Dispatched"];
const GTRADEA_TABS = ["Store", "Ship", "Racks", "Dispatched", "1688 Orders"];

// ---- shared Tailwind tokens (match the staff-portal design system) ----
const SURFACE =
  "rounded-3xl bg-white ring-1 ring-[#ECE9E3] shadow-[0_2px_16px_-8px_rgba(45,45,45,0.16)]";
const CARD = `${SURFACE} p-5 sm:p-6`;
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-[#412460] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#B99353] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-[#2D2D2D]/70 ring-1 ring-[#E6E2DB] transition-all hover:text-[#412460] hover:ring-[#412460]/40 active:scale-[.98]";
const FIELD =
  "w-full rounded-2xl bg-[#F6F4F0] px-4 py-2.5 text-sm text-[#2D2D2D] ring-1 ring-transparent transition-all placeholder:text-[#2D2D2D]/35 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#412460]/30";
const LABEL = "block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/50";
const LABEL_CARD =
  "relative overflow-hidden rounded-2xl bg-[#E9E4D8] p-5 text-[#2D2D2D] ring-1 ring-[#D9D0BC]";

// Instant-paint cache: remember the last item list per section (Cellzen / GtradeA)
// so re-opening the app paints rows immediately while the network refresh runs in
// the background. Keyed by mode so the two sections never bleed together. Best
// effort — quota / private-mode / bad JSON all fall back to an empty list.
const itemsCacheKey = (mode) => `wh_items_cache_${mode === "gtradea" ? "gtradea" : "cellzen"}`;
function readItemsCache(mode) {
  try {
    const arr = JSON.parse(localStorage.getItem(itemsCacheKey(mode)) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeItemsCache(mode, items) {
  try {
    localStorage.setItem(itemsCacheKey(mode), JSON.stringify(items || []));
  } catch {
    /* storage full / unavailable — instant-paint is best-effort */
  }
}

// Run an async op over a list with a small concurrency cap, so a big batch (a
// select-all over thousands of rows) can't fire that many simultaneous requests
// and exhaust the DB pool / starve other staff. Returns Promise.allSettled-shaped
// results in input order.
async function mapPool(list, limit, fn) {
  const results = new Array(list.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const idx = next++;
      try {
        results[idx] = { status: "fulfilled", value: await fn(list[idx], idx) };
      } catch (e) {
        results[idx] = { status: "rejected", reason: e };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

// A custom (non-native) searchable dropdown: type to filter, click to pick,
// click outside to close. `allowCustom` keeps a typed value that isn't in the
// list (used for the logistics name). Module-level so its identity is stable
// and the input never loses focus mid-keystroke.
function SearchSelect({ value, onChange, options, placeholder, allowCustom = true }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(null); // null → show `value`; string → filtering
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setTyped(null); }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const shown = typed !== null ? typed : (value || "");
  const q = (typed || "").trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const pick = (opt) => { onChange(opt); setTyped(null); setOpen(false); };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={shown}
        onChange={(e) => { setTyped(e.target.value); setOpen(true); if (allowCustom) onChange(e.target.value); }}
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        placeholder={placeholder}
        autoComplete="off"
        className={`${FIELD} pr-9`}
      />
      <svg
        className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2D2D2D]/40 transition-transform ${open ? "rotate-180" : ""}`}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      {open && (
        <ul className="absolute z-20 mt-1.5 max-h-56 w-full overflow-auto rounded-2xl border border-[#E3DEEA] bg-white py-1.5 shadow-xl">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#F6F4F0] ${
                  value === opt ? "font-semibold text-[#412460]" : "text-[#2D2D2D]"
                }`}
              >
                {opt}
                {value === opt && (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-[#2D2D2D]/40">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}

// A faint barcode strip that reads as a "physical shipping label" edge.
const BARCODE_STRIP = {
  backgroundImage:
    "repeating-linear-gradient(90deg,#2D2D2D 0 2px,transparent 2px 4px,#2D2D2D 4px 5px,transparent 5px 9px,#2D2D2D 9px 11px,transparent 11px 16px)",
};

const fmtDate = (ts) => {
  if (!ts) return "-";
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
};

// The single source of truth for a 1688 line item's state — used by both the pill
// and the "Sort by" control so they can never disagree.
//   no CN tracking on gtradea         -> not_updated
//   has tracking, not scanned in      -> not_received
//   has tracking, scanned in, in stock -> received
//   has tracking, scanned in, shipped -> dispatched
const supplierState = (o) => {
  if (!o.cnTracking) return "not_updated";
  if (!o.inWarehouse) return "not_received";
  return o.warehouseStatus === "shipped" ? "dispatched" : "received";
};
const SUPPLIER_SORTS = [
  { value: "date", label: "Date" },
  { value: "received", label: "Received" },
  { value: "dispatched", label: "Dispatched" },
  { value: "not_updated", label: "Not Yet" },
  { value: "not_received", label: "Pending" },
];

// Every date in the 1688 panel: short and numeric, e.g. 7/30/2026. Field order
// follows the viewer's own locale, so it reads the way their machine writes dates.
//
// `utc` is the one thing the two callers below disagree on, and it matters. A 1688
// ORDER date is a calendar day, not an instant: gtradea stamps both the order
// number (ORD-YYYYMMDD-xxxxxx) and the job timestamp in UTC, so rendering it
// locally shifts the day for any order placed late in the UTC day — printing
// "7/15/2026" right beside "ORD-20260714-553812", which reads as a bug. Our own
// shipped_at IS a real instant, so that one reads in the viewer's zone.
const fmtNumericDay = (ts, utc) => {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });
};
const fmtDay = (ts) => fmtNumericDay(ts, true);       // 1688 order date
const fmtShipDay = (ts) => fmtNumericDay(ts, false);  // our own shipped_at

/* ---------------------------------- icons --------------------------------- */
const svgBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
const IconBox = (p) => (<svg {...svgBase} {...p}><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>);
const IconRefresh = (p) => (<svg {...svgBase} {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>);
const IconChevron = (p) => (<svg {...svgBase} {...p}><path d="M9 6l6 6-6 6" /></svg>);
const IconCheck = (p) => (<svg {...svgBase} {...p}><path d="M20 6 9 17l-5-5" /></svg>);
const IconDownload = (p) => (<svg {...svgBase} {...p}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>);
const IconPrinter = (p) => (<svg {...svgBase} {...p}><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>);
const IconTrash = (p) => (<svg {...svgBase} {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></svg>);
const IconPlus = (p) => (<svg {...svgBase} {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>);
const IconSearch = (p) => (<svg {...svgBase} strokeWidth="2" {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
const IconCamera = (p) => (<svg {...svgBase} {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>);
const IconKeyboard = (p) => (<svg {...svgBase} {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>);
const IconClose = (p) => (<svg {...svgBase} strokeWidth="2.2" {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>);

/* ------------------------------ small pieces ------------------------------ */
// Replaces the old in-stock/shipped Status pill — shipped vs. in-stock is
// already obvious from which tab (Ship vs. Dispatched) an item is in, so this
// column instead surfaces the one thing that isn't: how it ships.
function ShipmentBadge({ mode }) {
  const air = mode !== "By Land";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
        air ? "bg-sky-50 text-sky-600" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${air ? "bg-sky-500" : "bg-amber-500"}`} />
      {air ? "By Air" : "By Land"}
    </span>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-[#2D2D2D]">
      <span className="h-4 w-1 rounded-full bg-[#B99353]" />
      {children}
    </h2>
  );
}

function SearchInput({ value, onChange, placeholder, onEnter }) {
  return (
    <div className="relative flex-1">
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2D2D2D]/35" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(value); }}
        placeholder={placeholder}
        className={`${FIELD} pl-10`}
      />
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6F4F0] text-[#2D2D2D]/30">
        <IconBox className="h-6 w-6" />
      </span>
      <p className="max-w-xs text-sm text-[#2D2D2D]/45">{children}</p>
    </div>
  );
}

// Row + header checkboxes for batch selection (Ship / Dispatched). stopPropagation
// on the box keeps a tap from also opening the row's detail view.
function RowCheck({ checked, onChange, label }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 shrink-0 cursor-pointer rounded accent-[#412460]"
    />
  );
}

// Header "select all" — checked when every visible row is selected, indeterminate
// when only some are. Toggles the whole visible page.
function SelectAllCheck({ rows, selected, onToggleAll }) {
  const ref = useRef(null);
  const total = rows ? rows.length : 0;
  const sel = rows ? rows.filter((r) => selected?.has(r.id)).length : 0;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = sel > 0 && sel < total;
  }, [sel, total]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={total > 0 && sel === total}
      onChange={(e) => onToggleAll(e.target.checked)}
      aria-label="Select all"
      className="h-4 w-4 cursor-pointer rounded accent-[#412460]"
    />
  );
}

export default function WarehouseApp({ mode = "cellzen" }) {
  const isGtradea = mode === "gtradea";
  const homePath = isGtradea ? "/warehouse-gtradea" : "/warehouse";
  const TABS = isGtradea ? GTRADEA_TABS : CELLZEN_TABS;
  // The shelf code shown in every hint/placeholder in this section. Both shapes
  // validate (see RACK_CODE_PATTERN) — this just tells staff which one to write
  // on a NEW label here.
  const shelfExample = isGtradea ? "GT-01-0001" : "CZN01-01-0001";
  const navigate = useNavigate();

  const [racks, setRacks] = useState([]);
  const [items, setItems] = useState(() => readItemsCache(mode)); // instant paint from cache
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Store");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);   // camera overlay (mobile)
  const [scanMode, setScanMode] = useState("scan");  // overlay content: scan | manual

  // toast
  const [toast, setToast] = useState(null); // { msg, type: ok|warn|error }
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Success sheet shown after a successful put-away (auto-dismisses so the
  // continuous camera flow isn't blocked; OK dismisses immediately).
  const [savedItem, setSavedItem] = useState(null);
  const savedTimer = useRef(null);
  const showSaved = useCallback((item) => {
    setSavedItem(item);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedItem(null), 6000);
  }, []);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  // Lock body scroll while the mobile menu is open (landing-page behaviour).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  const staffUser = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("staff_user") || "null");
    } catch {
      return null;
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("staff_token");
    sessionStorage.removeItem("staff_user");
    navigate("/staff-login", { replace: true });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, it] = await Promise.all([loadRacks(), loadItems(mode)]);
      setRacks(r);
      setItems(it);
    } catch (e) {
      setError(e.message || "Failed to load warehouse data");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  // Load data once when authed. Logged-out visitors are handled by the
  // synchronous redirect guard below (before the RENDER return), so the
  // warehouse panel never flashes before the login page.
  useEffect(() => {
    if (localStorage.getItem("staff_token")) loadData();
  }, [loadData]);

  // Keep the instant-paint cache in step with the live list so the next open of
  // this section paints immediately (then reconciles via loadData).
  useEffect(() => {
    writeItemsCache(mode, items);
  }, [items, mode]);

  // Standalone /warehouse isn't covered by the global auth:expired redirect, so
  // handle it here.
  useEffect(() => {
    const onExpired = () => navigate(`/staff-login?next=${homePath}`, { replace: true });
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [navigate, homePath]);

  // On a phone, jump straight into the scanner when the app opens (Store is the
  // default tab) instead of showing the put-away prompt first.
  const autoScanRef = useRef(false);
  useEffect(() => {
    if (autoScanRef.current) return;
    autoScanRef.current = true;
    if (!localStorage.getItem("staff_token")) return;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 767px)").matches) {
      setScanMode("scan");
      setScanOpen(true);
    }
  }, []);

  // ---- derived ----
  const stats = useMemo(() => {
    const inStock = items.filter((i) => i.status === "in_stock");
    return {
      total: items.length,
      inStock: inStock.length,
      shipped: items.filter((i) => i.status === "shipped").length,
      racksUsed: new Set(inStock.map((i) => i.rackId)).size,
    };
  }, [items]);

  const rackCounts = useMemo(() => {
    const m = {};
    for (const i of items) if (i.status === "in_stock") m[i.rackId] = (m[i.rackId] || 0) + 1;
    return m;
  }, [items]);

  // Resolve a scanned/typed code to an item. The PR id counts as a match because
  // that's what the printed label's barcode now encodes — scanning a box has to
  // find it. The internal CZN code still matches too, so labels printed before
  // the switch keep working.
  //
  // A PR id (like the CZN code before it) is shared by every box of one 1688
  // order, so a scan can hit several rows. An IN-STOCK one wins: otherwise
  // scanning a box that's still on the shelf could surface a sibling that already
  // shipped and answer "already shipped".
  const findItem = useCallback(
    (codeOrTracking) => {
      const c = String(codeOrTracking || "").trim().toLowerCase();
      if (!c) return null;
      const matches = items.filter(
        (i) =>
          (i.prCode || "").toLowerCase() === c ||
          (i.code || "").toLowerCase() === c ||
          (i.trackingNumber || "").toLowerCase() === c
      );
      return matches.find((i) => i.status === "in_stock") || matches[0] || null;
    },
    [items]
  );

  const upsertRack = useCallback((rack) => {
    setRacks((prev) => (prev.some((r) => r.id === rack.id) ? prev : [rack, ...prev]));
  }, []);

  // ==================================================== STORE
  const [activeShelf, setActiveShelf] = useState("");
  // Ref mirror of activeShelf so the (once-captured) scanner callback always
  // sees the latest shelf, even on a sub-render-cycle double scan.
  const activeShelfRef = useRef("");
  useEffect(() => { activeShelfRef.current = activeShelf; }, [activeShelf]);
  const [feed, setFeed] = useState([]);
  const [manualRackSelect, setManualRackSelect] = useState("");
  const [manualRackText, setManualRackText] = useState("");
  const [manualTracking, setManualTracking] = useState("");

  const storeTracking = useCallback(
    async (rackId, tracking) => {
      try {
        const item = await putAwayItem(rackId, String(tracking).trim().toUpperCase(), mode);
        setItems((prev) => [item, ...prev]);
        setFeed((prev) => [item, ...prev].slice(0, 8));
        upsertRack({ id: item.rackId, note: "", createdAt: item.createdAt });
        showSaved(item);
      } catch (e) {
        showToast(e.message || "Failed to store item", e.status === 409 ? "warn" : "error");
      }
    },
    [mode, showToast, upsertRack, showSaved]
  );

  const handleStoreDecode = useCallback(
    async (text) => {
      const t = String(text || "").trim();
      if (!t) return;
      if (isShelf(t)) {
        const id = t.toUpperCase();
        activeShelfRef.current = id;
        setActiveShelf(id);
        try {
          const created = await createRack(id);
          if (created) upsertRack(created);
        } catch {
          /* shelf create is best-effort */
        }
        showToast(`Shelf set: ${id}`, "ok");
        return;
      }
      if (!activeShelfRef.current) {
        showToast(`Scan a shelf label first, e.g. ${shelfExample}`, "error");
        return;
      }
      await storeTracking(activeShelfRef.current, t);
    },
    [showToast, storeTracking, upsertRack, shelfExample]
  );

  const handleManualSave = async () => {
    const rackId = (manualRackText.trim() || manualRackSelect).trim().toUpperCase();
    const tracking = manualTracking.trim();
    if (!rackId) return showToast("Enter or choose a shelf first.", "error");
    if (!isShelf(rackId)) return showToast(`Shelf must look like ${shelfExample} (letters-digits-digits).`, "error");
    if (!tracking) return showToast("Enter a tracking number.", "error");
    await storeTracking(rackId, tracking);
    setManualTracking("");
  };

  // The manual put-away form — reused on desktop (inline) and mobile (overlay).
  const manualForm = (
    <div className="grid gap-4">
      <div>
        <label className={LABEL}>Choose existing shelf</label>
        <select
          value={manualRackSelect}
          onChange={(e) => {
            setManualRackSelect(e.target.value);
            // Auto-fill the Shelf Number field with the chosen shelf so it's
            // visible (and editable) instead of left blank.
            if (e.target.value) setManualRackText(e.target.value);
          }}
          className={`${FIELD} mt-1.5`}
        >
          <option value="">— choose existing shelf —</option>
          {racks.map((r) => (
            <option key={r.id} value={r.id}>{r.id}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={LABEL}>Shelf number</label>
        <input
          type="text"
          value={manualRackText}
          onChange={(e) => setManualRackText(e.target.value)}
          placeholder={`e.g. ${shelfExample}`}
          className={`${FIELD} mt-1.5`}
        />
      </div>
      <div>
        <label className={LABEL}>Tracking number</label>
        <input
          type="text"
          value={manualTracking}
          onChange={(e) => setManualTracking(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleManualSave()}
          placeholder="Scan or type the tracking number"
          className={`${FIELD} mt-1.5`}
        />
      </div>
      <button type="button" onClick={handleManualSave} className={BTN_PRIMARY}>
        Save Item
      </button>
    </div>
  );

  // ==================================================== SHIP
  const [shipSearch, setShipSearch] = useState("");
  const [shipSelectedId, setShipSelectedId] = useState(null);
  const [shipConfirmItems, setShipConfirmItems] = useState(null); // items awaiting ship confirm (1 or many)
  const [shipConfirmIsBatch, setShipConfirmIsBatch] = useState(false); // was the confirm opened by the batch button?
  const [batchBusy, setBatchBusy] = useState(false); // a batch ship/delete is in flight
  const [shipLogistics, setShipLogistics] = useState(""); // required at ship time
  // No separate "shipment mode" input at ship time anymore — each item already
  // carries the mode it was printed with (item.shipmentFrom), and /ship inherits
  // that server-side, so By Air/By Land is never re-asked (or allowed to drift
  // from what the label says) here.
  // Batch selection — hidden by default; the "Batch Ship" / "Batch Delete" button
  // turns on select mode, which reveals the row checkboxes. Ship (in-stock) and
  // Dispatched (shipped) keep independent modes + selection sets.
  const [shipBatchMode, setShipBatchMode] = useState(false);
  const [dispatchBatchMode, setDispatchBatchMode] = useState(false);
  const [shipSel, setShipSel] = useState(() => new Set());
  const [dispatchSel, setDispatchSel] = useState(() => new Set());
  const exitShipBatch = () => { setShipBatchMode(false); setShipSel(new Set()); };
  const exitDispatchBatch = () => { setDispatchBatchMode(false); setDispatchSel(new Set()); };
  const toggleShipSel = useCallback((id) => setShipSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const toggleDispatchSel = useCallback((id) => setDispatchSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const toggleAllShip = useCallback((rows, checked) => setShipSel((prev) => { const n = new Set(prev); rows.forEach((r) => (checked ? n.add(r.id) : n.delete(r.id))); return n; }), []);
  const toggleAllDispatch = useCallback((rows, checked) => setDispatchSel((prev) => { const n = new Set(prev); rows.forEach((r) => (checked ? n.add(r.id) : n.delete(r.id))); return n; }), []);
  const shipSelected = useMemo(
    () => items.find((i) => i.id === shipSelectedId) || null,
    [items, shipSelectedId]
  );

  // Open an item's detail in the RIGHT tab for its status: in-stock items live
  // in Ship, shipped items in Dispatched.
  const openDetail = useCallback((item) => {
    setShipSelectedId(item.id);
    setTab(item.status === "shipped" ? "Dispatched" : "Ship");
  }, []);

  const doLookup = useCallback(
    (text) => {
      const t = String(text || "").trim();
      const item = findItem(t);
      if (item) {
        setShipSelectedId(item.id);
        setTab(item.status === "shipped" ? "Dispatched" : "Ship");
      } else {
        setShipSearch(t);
        setShipSelectedId(null);
        if (t) showToast(`No item matches "${t}"`, "warn");
      }
    },
    [findItem, showToast]
  );

  // Ship one or many items under the same logistics carrier. Each item ships
  // with its OWN recorded shipment mode (set when its label was printed) — the
  // backend inherits it automatically, so nothing shipment-mode-related is
  // passed in here. Runs concurrently and reconciles the list from whatever
  // succeeded, so one failure doesn't abort the rest of a batch.
  const handleShipMany = async (list, logisticsName) => {
    const results = await mapPool(list, 6, (it) => shipItem(it.id, logisticsName));
    const shipped = [];
    let failed = 0;
    results.forEach((r) => { if (r.status === "fulfilled") shipped.push(r.value); else failed += 1; });
    if (shipped.length) {
      const byId = new Map(shipped.map((s) => [s.id, s]));
      setItems((prev) => prev.map((i) => byId.get(i.id) || i));
      setShipSel((prev) => { const n = new Set(prev); shipped.forEach((s) => n.delete(s.id)); return n; });
      setShipSelectedId(null); // they leave Ship and appear in Dispatched
    }
    if (shipped.length && !failed) {
      showToast(shipped.length === 1 ? `${goodsCode(shipped[0])} marked shipped` : `${shipped.length} items marked shipped`, "ok");
    } else if (shipped.length && failed) {
      showToast(`${shipped.length} shipped · ${failed} failed`, "warn");
    } else {
      showToast("Failed to mark shipped", "error");
    }
    return failed;
  };

  // Ask before shipping — the tick on each Ship row, the detail-card button, a
  // Ship-tab scan, a merged group's "Ship all" button, and the "Ship selected"
  // batch button all open this confirm, so a box is never shipped by accident.
  // The confirm also collects the required logistics carrier, applied to every
  // item in the batch — Cellzen and GtradeA both require it. Accepts either one
  // item or an array (a merged group's "Ship all") — shipConfirmIsBatch stays
  // false either way since it only governs the checkbox "Batch Ship" flow below.
  const requestShip = useCallback((itemOrItems) => {
    const list = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    if (!list.length) return;
    setShipLogistics("");
    setShipConfirmIsBatch(false);
    setShipConfirmItems(list);
  }, []);
  const requestBatchShip = () => {
    // Only ship what's both selected AND currently visible, so a selection left
    // over from a previous search filter can never ship a hidden row.
    const list = filteredShip.filter((i) => shipSel.has(i.id));
    if (!list.length) return showToast("Select items to ship first", "warn");
    setShipLogistics("");
    setShipConfirmIsBatch(true);
    setShipConfirmItems(list);
  };
  const confirmShip = async () => {
    const list = shipConfirmItems;
    if (!list || !list.length || batchBusy) return;
    const logistics = shipLogistics.trim();
    if (!logistics) return showToast("Enter the name of the logistics.", "error");
    const wasBatch = shipConfirmIsBatch;
    setShipConfirmItems(null);
    setBatchBusy(true);
    try {
      const failed = await handleShipMany(list, logistics);
      // Leave select mode only when this was a batch AND everything shipped — a
      // single-row ship never exits batch mode, and a partial failure keeps the
      // failed (still-selected) items visible for a retry.
      if (wasBatch && !failed) exitShipBatch();
    } finally {
      setBatchBusy(false);
    }
  };

  // A scan on the Ship tab: locate the item, then pop the ship confirm for an
  // in-stock box (or bounce an already-shipped one over to Dispatched).
  const handleShipScan = useCallback(
    (text) => {
      const t = String(text || "").trim();
      const item = findItem(t);
      if (!item) {
        setShipSearch(t);
        setShipSelectedId(null);
        if (t) showToast(`No item matches "${t}"`, "warn");
        return;
      }
      if (item.status === "shipped") {
        setShipSelectedId(item.id);
        setTab("Dispatched");
        showToast(`${goodsCode(item)} is already shipped`, "warn");
        return;
      }
      setShipSelectedId(item.id);
      setShipConfirmIsBatch(false);
      setShipConfirmItems([item]);
    },
    [findItem, showToast]
  );

  // Print a label — ask how many copies first (default 1). Some shipments share a
  // tracking number but have several packages, so you can print e.g. 12.
  const [printQtyTarget, setPrintQtyTarget] = useState(null); // item awaiting a copy count
  const [printQty, setPrintQty] = useState("1");
  const [printShipMode, setPrintShipMode] = useState("By Air"); // "By Air" | "By Land" — mirrors item.shipmentFrom
  const doPrintLabel = async (item, copies, shipMode) => {
    try {
      // Persist the chosen mode BEFORE printing, so the label's banner and the
      // item's recorded mode (what /ship inherits later) never disagree.
      if (shipMode && shipMode !== item.shipmentFrom) {
        try {
          const updated = await updateItemShipmentMode(item.id, shipMode);
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        } catch (e) {
          showToast(e.message || "Failed to save shipment mode", "warn");
        }
      }
      const { how, full } = await printItemLabel(item, copies, shipMode);
      const n = copies > 1 ? `${copies} labels` : "label";
      if (!full) {
        showToast(`Printed ${n} as a plain barcode — the full label design failed to render`, "warn");
      } else if (how === "queued") showToast(`Sent ${n} to the warehouse printer ✓`, "ok");
      else if (how === "local") showToast(`Printing ${n} ✓`, "ok");
    } catch (e) {
      showToast(e.message || "Print failed", "error");
    }
  };
  const handlePrintLabel = (item) => {
    setPrintQty("1");
    setPrintShipMode(item.shipmentFrom === "By Land" ? "By Land" : "By Air");
    setPrintQtyTarget(item);
  };
  const confirmPrintQty = async () => {
    const item = printQtyTarget;
    const copies = Math.max(1, Math.min(parseInt(printQty, 10) || 1, 20));
    const shipMode = printShipMode;
    setPrintQtyTarget(null);
    if (item) await doPrintLabel(item, copies, shipMode);
  };
  const handleDownloadLabel = (item) =>
    downloadItemLabel(item).catch((e) => showToast(e.message || "Download failed", "error"));

  // Print one label per package in a merged group (all boxes of one 1688
  // order share a goods number) — each label keeps that box's OWN tracking
  // number and shipment mode. Always exactly 1 copy per box: the "how many
  // copies" prompt only makes sense for repeating a single label, not for a
  // batch of already-distinct boxes.
  const handlePrintGroup = async (group) => {
    if (!group?.length) return;
    let ok = 0;
    let failed = 0;
    for (const item of group) {
      try {
        await printItemLabel(item, 1, item.shipmentFrom === "By Land" ? "By Land" : "By Air");
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    if (ok && !failed) showToast(`Printed ${ok} label${ok > 1 ? "s" : ""} ✓`, "ok");
    else if (ok && failed) showToast(`${ok} printed · ${failed} failed`, "warn");
    else showToast("Print failed", "error");
  };

  // Item detail card — shared by the Ship (in-stock) and Dispatched (shipped) tabs.
  const detailCard = (item) => (
    <div className="mb-5">
      <div className={LABEL_CARD}>
        <div className="-mx-5 -mt-5 mb-4 h-3 opacity-55" style={BARCODE_STRIP} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#2D2D2D]/45">
              {item.prCode ? "PR ID" : "Item"}
            </div>
            <div className="mt-0.5 break-all text-2xl font-black tracking-tight">{goodsCode(item)}</div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Shelf</dt>
                <dd className="min-w-0 break-all font-semibold">{item.rackId || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Tracking</dt>
                <dd className="min-w-0 break-all font-semibold">{item.trackingNumber}</dd>
              </div>
              {item.orderNumber && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Order #</dt>
                  <dd className="min-w-0 break-all font-semibold">{item.orderNumber}</dd>
                </div>
              )}
              {item.productName && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Product</dt>
                  <dd className="min-w-0">{item.productName}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Stored</dt>
                <dd className="min-w-0">{fmtDate(item.createdAt)}{item.createdByName ? ` · ${item.createdByName}` : ""}</dd>
              </div>
              {item.status === "shipped" && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Shipped</dt>
                  <dd className="min-w-0">{fmtDate(item.shippedAt)}{item.shippedByName ? ` · ${item.shippedByName}` : ""}</dd>
                </div>
              )}
              {item.status === "shipped" && item.logisticsName && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Logistics</dt>
                  <dd className="min-w-0 break-all font-semibold">{item.logisticsName}</dd>
                </div>
              )}
            </dl>
            <div className="mt-3">
              <ShipmentBadge mode={item.shipmentFrom} />
            </div>
          </div>
          {/* Barcode: full-width card below the details on phones, fixed beside them on ≥sm */}
          <div className="mx-auto w-full max-w-[240px] shrink-0 rounded-lg bg-white p-3 shadow-sm sm:mx-0 sm:w-80 sm:max-w-none">
            <Barcode text={goodsCode(item)} className="w-full" />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.status === "in_stock" && (
          <button type="button" onClick={() => requestShip(item)} className={BTN_PRIMARY}>
            <IconCheck className="h-3.5 w-3.5" /> Mark as Shipped
          </button>
        )}
        <button
          type="button"
          onClick={() => downloadItemLabel(item).catch((e) => showToast(e.message || "Label download failed", "error"))}
          className={BTN_GHOST}
        >
          <IconDownload className="h-3.5 w-3.5" /> Download Label
        </button>
      </div>
    </div>
  );

  // In the Racks tab a scanned code is treated as a shelf label to add.
  const handleScanAddShelf = useCallback(
    async (text) => {
      const t = String(text || "").trim().toUpperCase();
      if (!t) return;
      if (!isShelf(t)) {
        showToast(`Not a shelf label: ${t} — shelves look like ${shelfExample}.`, "error");
        return;
      }
      if (racks.some((r) => r.id === t)) {
        showToast(`Shelf ${t} already exists`, "warn");
        return;
      }
      try {
        const created = await createRack(t);
        if (created) upsertRack(created);
        showToast(`Shelf ${t} added`, "ok");
      } catch (e) {
        showToast(e.message || "Failed to add shelf", "error");
      }
    },
    [racks, showToast, upsertRack, shelfExample]
  );

  // One camera → routes each decode to whatever tab is open. Store keeps
  // scanning (continuous); the others resolve one code and close.
  const routeScan = useCallback(
    (text) => {
      if (tab === "Store") {
        handleStoreDecode(text);
      } else if (tab === "Racks") {
        handleScanAddShelf(text);
        setScanOpen(false);
      } else if (tab === "Ship") {
        // Ship → locate the box and pop the "mark as shipped" confirm
        handleShipScan(text);
        setScanOpen(false);
      } else if (tab === "1688 Orders") {
        // 1688 Orders → filter the list by the scanned CN tracking number
        setSupplierSearch(String(text || "").trim());
        setScanOpen(false);
      } else {
        // Dashboard → locate the item
        doLookup(text);
        setScanOpen(false);
      }
    },
    [tab, handleStoreDecode, handleScanAddShelf, handleShipScan, doLookup]
  );

  const scanHint = {
    Store: "Scan a shelf, then scan boxes",
    Ship: "Scan any code to locate it",
    Racks: "Scan a shelf label to add it",
    Dashboard: "Scan any code to find it",
    "1688 Orders": "Scan a CN tracking to search",
  }[tab] || "Scan a code";

  // Manual mode in the camera overlay uses the light Cellzen theme, not black.
  const manualLight = tab === "Store" && scanMode === "manual";

  // Desktop hardware barcode scanner (USB keyboard-wedge): capture rapid
  // keystrokes ending in Enter when no field is focused and route the code to
  // the active tab automatically — no button, no camera. Human typing (slower,
  // or into a focused field) is ignored so manual entry still works.
  const routeScanRef = useRef(routeScan);
  useEffect(() => { routeScanRef.current = routeScan; }, [routeScan]);
  useEffect(() => {
    let buffer = "";
    let lastTime = 0;
    let fast = true;
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(document.activeElement)) return; // let manual typing work
      const now = Date.now();
      const gap = now - lastTime;
      lastTime = now;
      if (e.key === "Enter") {
        const code = buffer;
        const looksScanned = fast && code.length >= 3;
        buffer = "";
        fast = true;
        if (looksScanned) {
          e.preventDefault();
          routeScanRef.current(code);
        }
        return;
      }
      if (e.key.length !== 1) return; // ignore Shift/Tab/etc.
      if (buffer === "") fast = true;
      else if (gap > 45) fast = false; // human-speed gap → not a scanner burst
      buffer += e.key;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ==================================================== RACKS
  const [newRackName, setNewRackName] = useState("");
  const [rackDeleteTarget, setRackDeleteTarget] = useState(null);
  const [itemDeleteTarget, setItemDeleteTarget] = useState(null);
  const [batchDeleteItems, setBatchDeleteItems] = useState(null); // shipped records awaiting batch delete

  const handleAddRack = async () => {
    const id = newRackName.trim().toUpperCase();
    if (!id) return;
    if (!isShelf(id)) return showToast(`Shelf must look like ${shelfExample} (letters-digits-digits).`, "error");
    if (racks.some((r) => r.id === id)) return showToast("That shelf already exists.", "warn");
    try {
      const created = await createRack(id);
      if (created) upsertRack(created);
      setNewRackName("");
      showToast(`Shelf ${id} added`, "ok");
    } catch (e) {
      showToast(e.message || "Failed to add shelf", "error");
    }
  };

  const confirmDeleteRack = async () => {
    const id = rackDeleteTarget;
    setRackDeleteTarget(null);
    try {
      await deleteRack(id);
      setRacks((prev) => prev.filter((r) => r.id !== id));
      showToast(`Shelf ${id} deleted`, "ok");
    } catch (e) {
      showToast(e.message || "Unable to delete shelf", "error");
    }
  };

  const confirmDeleteItem = async () => {
    const item = itemDeleteTarget;
    setItemDeleteTarget(null);
    if (!item) return;
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (shipSelectedId === item.id) setShipSelectedId(null);
      showToast(`${goodsCode(item)} deleted`, "ok");
    } catch (e) {
      showToast(e.message || "Unable to delete item", "error");
    }
  };

  // Batch delete of dispatched records. Runs the deletes concurrently and drops
  // whatever succeeded from the list, so one failure doesn't block the rest.
  const requestBatchDelete = () => {
    // Only what's both selected AND currently visible — never a hidden row left
    // selected under a previous search filter.
    const list = filteredDispatched.filter((i) => dispatchSel.has(i.id));
    if (!list.length) return showToast("Select records to delete first", "warn");
    setBatchDeleteItems(list);
  };
  const confirmBatchDelete = async () => {
    const list = batchDeleteItems;
    setBatchDeleteItems(null);
    if (!list || !list.length || batchBusy) return;
    setBatchBusy(true);
    try {
      const results = await mapPool(list, 6, (it) => deleteItem(it.id));
      const okIds = [];
      let failed = 0;
      results.forEach((r, idx) => { if (r.status === "fulfilled") okIds.push(list[idx].id); else failed += 1; });
      if (okIds.length) {
        const okSet = new Set(okIds);
        setItems((prev) => prev.filter((i) => !okSet.has(i.id)));
        setDispatchSel((prev) => { const n = new Set(prev); okIds.forEach((id) => n.delete(id)); return n; });
        if (okSet.has(shipSelectedId)) setShipSelectedId(null);
      }
      if (okIds.length && !failed) showToast(okIds.length === 1 ? "1 record deleted" : `${okIds.length} records deleted`, "ok");
      else if (okIds.length && failed) showToast(`${okIds.length} deleted · ${failed} failed`, "warn");
      else showToast("Failed to delete", "error");
      // Keep select mode + the failed ids selected on a partial failure so they're
      // easy to retry; only leave when everything deleted.
      if (!failed) exitDispatchBatch();
    } finally {
      setBatchBusy(false);
    }
  };

  // "Item stored" sheet actions. Any interaction stops the sheet's auto-dismiss
  // so it doesn't disappear mid-tap.
  const keepSavedSheet = () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
  // Straight to the printer, one copy, no dialog — this is the scan → print path
  // staff run all day at the shelf, and the item already carries everything the
  // label needs (PR id, order #, tracking) from the put-away response.
  const printSavedItemNow = () => {
    keepSavedSheet();
    if (savedItem) doPrintLabel(savedItem, 1, savedItem.shipmentFrom === "By Land" ? "By Land" : "By Air");
  };
  // The "more than one package" case still goes through the copies + mode dialog.
  const printSavedItem = () => { keepSavedSheet(); if (savedItem) handlePrintLabel(savedItem); };
  const undoSavedItem = async () => {
    const item = savedItem;
    keepSavedSheet();
    setSavedItem(null);
    if (!item) return;
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setFeed((prev) => prev.filter((i) => i.id !== item.id));
      showToast(`${goodsCode(item)} removed`, "ok");
    } catch (e) {
      showToast(e.message || "Unable to remove item", "error");
    }
  };

  const requestDeleteRack = (id) => {
    if ((rackCounts[id] || 0) > 0) {
      showToast(`Can't delete ${id} — it still has ${rackCounts[id]} item(s) in stock.`, "warn");
      return;
    }
    setRackDeleteTarget(id);
  };

  // ---- filtered lists ----
  const [dashSearch, setDashSearch] = useState("");
  const filteredDash = useMemo(() => {
    const f = dashSearch.trim().toLowerCase();
    const rows = items.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!f) return rows;
    return rows.filter((i) => itemMatches(i, f));
  }, [items, dashSearch]);

  const filteredShip = useMemo(() => {
    const f = shipSearch.trim().toLowerCase();
    const rows = items
      .filter((i) => i.status === "in_stock")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!f) return rows;
    return rows.filter((i) => itemMatches(i, f));
  }, [items, shipSearch]);

  const [dispatchSearch, setDispatchSearch] = useState("");
  const filteredDispatched = useMemo(() => {
    const f = dispatchSearch.trim().toLowerCase();
    const rows = items
      .filter((i) => i.status === "shipped")
      .sort((a, b) => new Date(b.shippedAt || b.createdAt) - new Date(a.shippedAt || a.createdAt));
    if (!f) return rows;
    return rows.filter((i) => itemMatches(i, f));
  }, [items, dispatchSearch]);

  // Selected counts resolved against the VISIBLE (filtered) list, so the counter,
  // the select-all header, and the batch action all agree on the same "visible AND
  // selected" set — a selection hidden by the search never inflates the count or
  // gets shipped/deleted behind the user's back.
  const shipSelCount = useMemo(
    () => filteredShip.filter((i) => shipSel.has(i.id)).length,
    [filteredShip, shipSel]
  );
  const dispatchSelCount = useMemo(
    () => filteredDispatched.filter((i) => dispatchSel.has(i.id)).length,
    [filteredDispatched, dispatchSel]
  );

  // ==================================================== 1688 ORDERS (gtradea)
  // Procurement orders + CN tracking pulled from gtradea by the backend poller.
  // Read-only here; matched against warehouse items by tracking number.
  const [supplierOrders, setSupplierOrders] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierSort, setSupplierSort] = useState("date"); // date | received | not_updated | not_received
  const [supplierSync, setSupplierSync] = useState(null); // last server sync status
  const [supplierSyncing, setSupplierSyncing] = useState(false);
  const supplierReqId = useRef(0);          // guards against out-of-order responses
  const supplierLoadedOnce = useRef(false); // full-screen spinner only on first load
  const manualSyncRef = useRef(false);      // toast a sync's outcome only when the user clicked it
  const lastKickRef = useRef(0);            // collapses rapid tab-switch bursts into one pull

  const loadSupplier = useCallback(async () => {
    const reqId = ++supplierReqId.current;
    if (!supplierLoadedOnce.current) setSupplierLoading(true);
    try {
      const { rows, lastSync } = await loadSupplierOrders();
      if (reqId !== supplierReqId.current) return; // a newer request superseded this one
      setSupplierOrders(rows);
      setSupplierSync(lastSync);
      supplierLoadedOnce.current = true;
    } catch (e) {
      if (reqId === supplierReqId.current) showToast(e.message || "Failed to load 1688 orders", "error");
    } finally {
      if (reqId === supplierReqId.current) setSupplierLoading(false);
    }
  }, [showToast]);

  // The sync runs server-side and takes ~30s, so "is a sync happening" is the
  // SERVER's answer (carried on every list response), not local state. Local
  // `supplierSyncing` only covers the instant between the click and the first
  // status coming back.
  const syncInFlight = supplierSyncing || !!supplierSync?.syncing;

  // Load when the 1688 tab is open, then poll. While a sync is in flight, poll
  // fast so the button and the rows track it live; otherwise idle at 20s.
  useEffect(() => {
    if (!isGtradea || tab !== "1688 Orders") return undefined;
    if (!localStorage.getItem("staff_token")) return undefined;
    loadSupplier();
    const id = setInterval(loadSupplier, supplierSync?.syncing ? 2000 : 20000);
    return () => clearInterval(id);
  }, [isGtradea, tab, loadSupplier, supplierSync?.syncing]);

  // While the 1688 tab is open, actively PULL from gtradea rather than only
  // re-reading the local cache: kick a server-side sync the moment the tab
  // opens, then every 60s. Without this the tab shows only whatever the
  // background scheduler last fetched (minutes old), so a tracking edit made on
  // gtradea took minutes to appear here. The server throttles/coalesces these
  // (409 while a pull runs, 429 right after one), so firing from every open
  // client is safe — we swallow those "already fresh" replies. The 2s fast-poll
  // above then surfaces the updated rows live as the pull completes.
  useEffect(() => {
    if (!isGtradea || tab !== "1688 Orders") return undefined;
    if (!localStorage.getItem("staff_token")) return undefined;
    let cancelled = false;
    const kick = async () => {
      // Opening this tab fires a pull. Without this guard, flipping between tabs
      // (or any remount) fires one per switch, which is what filled the console
      // with redundant /sync calls. One pull per 10s from a given browser is
      // plenty — the 60s interval and the server-side loop cover the rest.
      const now = Date.now();
      if (now - lastKickRef.current < 10000) return;
      lastKickRef.current = now;
      try {
        await syncSupplierOrders();
        if (!cancelled) loadSupplier(); // grab syncing:true so the fast poll tracks it live
      } catch (e) {
        // 409 (already syncing) / 429 (just synced) are expected coordination
        // replies — stay silent. Anything else (5xx, 503 not-configured, network)
        // is a real problem worth seeing, so log it to the console without
        // spamming a toast every 60s. The header's "⚠ Sync failing" covers the UI.
        if (e?.status !== 409 && e?.status !== 429) {
          console.warn("[1688] auto-sync failed:", e?.message || e);
        }
      }
    };
    kick(); // immediately on open — covers the "I just edited gtradea, let me check" case
    const id = setInterval(kick, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isGtradea, tab, loadSupplier]);

  // Report the outcome when the server's sync finishes (syncing true -> false).
  // The POST returns before the work is done, so this is the only place that can
  // honestly say whether it worked.
  const prevSyncingRef = useRef(false);
  useEffect(() => {
    const now = !!supplierSync?.syncing;
    if (prevSyncingRef.current && !now && supplierSync) {
      // Only announce a sync the user actually clicked — the tab now auto-syncs
      // every minute, and toasting each of those would be relentless. The header
      // "Synced …" label + button spinner already reflect the auto-syncs.
      if (manualSyncRef.current) {
        if (supplierSync.ok) showToast(`Synced ${supplierSync.items ?? 0} item(s) from gtradea`, "ok");
        else if (supplierSync.error) showToast(supplierSync.error, "error");
        manualSyncRef.current = false;
      }
    }
    prevSyncingRef.current = now;
  }, [supplierSync, showToast]);

  // "Sync now" — asks the server to start a pull. Returns straight away (202);
  // the polling above follows it to completion.
  const handleSyncNow = async () => {
    manualSyncRef.current = true; // this one gets a completion toast; auto-syncs stay quiet
    lastKickRef.current = Date.now(); // an explicit pull also satisfies the auto-kick window
    setSupplierSyncing(true);
    try {
      const r = await syncSupplierOrders(true); // explicit click bypasses the backoff
      // The server coalesces: if a pull was already running or finished seconds
      // ago, no new one starts. Say so and clear the pending-toast flag —
      // otherwise the next background sync's completion would be announced as
      // though it were this click.
      if (r && r.started === false) {
        manualSyncRef.current = false;
        showToast(r.reason === "already-running" ? "Sync already running…" : "Already up to date", "ok");
      }
      await loadSupplier(); // picks up syncing:true so the button stays honest
    } catch (e) {
      manualSyncRef.current = false;
      showToast(e.message || "Sync failed", "error");
    } finally {
      setSupplierSyncing(false); // the server's flag takes over from here
    }
  };

  // Exports the CURRENT search filter (server re-runs the same query), so the
  // packing list always matches what's on screen rather than every order ever synced.
  const [supplierExporting, setSupplierExporting] = useState(false);
  const handleExportSupplier = async () => {
    setSupplierExporting(true);
    try {
      await exportSupplierOrdersXlsx(supplierSearch);
    } catch (e) {
      showToast(e.message || "Export failed", "error");
    } finally {
      setSupplierExporting(false);
    }
  };

  const filteredSupplier = useMemo(() => {
    const f = supplierSearch.trim().toLowerCase();
    const base = !f
      ? supplierOrders
      : supplierOrders.filter(
          (o) =>
            (o.orderNumber || "").toLowerCase().includes(f) ||
            (o.cnTracking || "").toLowerCase().includes(f) ||
            (o.productName || "").toLowerCase().includes(f) ||
            (o.jobCode || "").toLowerCase().includes(f)
        );
    // "Date" is the default and is deliberately a NO-OP: the server already returns
    // newest-order-first, so rows keep the same place every poll. A row must not
    // jump around the table just because its status changed under you.
    if (supplierSort === "date") return base;
    // Any other choice floats just that state to the top. Sort is stable, so within
    // each group the date order is preserved.
    const hit = (o) => supplierState(o) === supplierSort;
    return [...base].sort((a, b) => Number(hit(b)) - Number(hit(a)));
  }, [supplierOrders, supplierSearch, supplierSort]);

  // Synchronous auth gate: redirect DURING render (not in an effect) so a
  // logged-out visitor goes straight to the login without the warehouse panel
  // flashing first. Placed after all hooks to respect the Rules of Hooks.
  if (typeof window !== "undefined" && !localStorage.getItem("staff_token")) {
    return <Navigate to={`/staff-login?next=${homePath}`} replace />;
  }

  // ============================================================ RENDER
  return (
    <div className="min-h-screen bg-[#F6F4F0] text-[#2D2D2D]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#F6F4F0]/85 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 pb-3 pt-4 sm:px-6 md:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#412460] text-white shadow-sm">
                <IconBox className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-base font-bold leading-tight text-[#2D2D2D]">
                  {isGtradea ? "GtradeA Warehouse" : "Warehouse"}
                </h1>
                <p className="text-[11px] text-[#2D2D2D]/45">Scan &amp; locate · shared for all staff</p>
              </div>
            </div>
            {/* Cellzen / GtradeA warehouse switch (separate pages, shared shelves) */}
            <div className="inline-flex rounded-full bg-[#EAE6DF] p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => navigate("/warehouse")}
                className={`rounded-full px-3.5 py-1.5 transition-all ${!isGtradea ? "bg-white text-[#412460] shadow-sm" : "text-[#2D2D2D]/50 hover:text-[#2D2D2D]/70"}`}
              >
                Cellzen
              </button>
              <button
                type="button"
                onClick={() => navigate("/warehouse-gtradea")}
                className={`rounded-full px-3.5 py-1.5 transition-all ${isGtradea ? "bg-white text-[#412460] shadow-sm" : "text-[#2D2D2D]/50 hover:text-[#2D2D2D]/70"}`}
              >
                GtradeA
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 ring-1 ring-[#ECE9E3] md:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#412460] text-[11px] font-bold text-white">
                  {(staffUser?.name || "S").charAt(0).toUpperCase()}
                </span>
                <span className="text-xs font-semibold text-[#2D2D2D]/70">{staffUser?.name || "Staff"}</span>
              </div>
              <button
                type="button"
                onClick={loadData}
                title="Refresh"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2D2D2D]/55 ring-1 ring-[#ECE9E3] transition-all hover:text-[#412460] hover:ring-[#412460]/40 active:scale-95"
              >
                <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="hidden rounded-full bg-[#2D2D2D] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#412460] md:inline-block"
              >
                Logout
              </button>
              {/* Hamburger — mobile only (landing-page style) */}
              <button
                type="button"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-10 w-10 flex-col items-center justify-center rounded-full bg-white ring-1 ring-[#ECE9E3] transition-colors hover:bg-[#F0EDE7] md:hidden"
              >
                <span className="block h-0.5 w-5 rounded bg-[#2D2D2D]" />
                <span className="mt-1 block h-0.5 w-5 rounded bg-[#2D2D2D]" />
                <span className="mt-1 block h-0.5 w-5 rounded bg-[#2D2D2D]" />
              </button>
            </div>
          </div>

          {/* Tabs — segmented control (desktop; mobile uses the hamburger menu) */}
          <div className="mt-4 hidden overflow-x-auto pb-4 md:block [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex rounded-full bg-[#EAE6DF] p-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`whitespace-nowrap rounded-full px-5 py-2 text-xs font-semibold transition-all ${
                    tab === t
                      ? "bg-white text-[#412460] shadow-sm"
                      : "text-[#2D2D2D]/45 hover:text-[#2D2D2D]/70"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 pb-28 pt-1 sm:px-6 md:pb-16">
        {error && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700 ring-1 ring-red-100">
            {error}
          </div>
        )}
        {/* Initial load only — a background Refresh keeps the views (and any
            live camera) mounted rather than tearing them down. */}
        {loading && items.length === 0 && racks.length === 0 && (
          <div className={`${CARD} flex items-center justify-center gap-3 text-sm text-[#2D2D2D]/50`}>
            <IconRefresh className="h-4 w-4 animate-spin" /> Loading warehouse…
          </div>
        )}

        {/* ================= DASHBOARD ================= */}
        {!isGtradea && tab === "Dashboard" && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { n: stats.total, l: "Total Items", dot: "bg-[#412460]", c: "text-[#2D2D2D]" },
                { n: stats.inStock, l: "In Stock", dot: "bg-emerald-500", c: "text-emerald-600" },
                { n: stats.shipped, l: "Shipped", dot: "bg-red-500", c: "text-red-500" },
                { n: stats.racksUsed, l: "Shelves Used", dot: "bg-[#B99353]", c: "text-[#B99353]" },
              ].map((s) => (
                <div key={s.l} className={`${SURFACE} p-4`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2D2D2D]/45">
                      {s.l}
                    </span>
                  </div>
                  <div className={`mt-2 text-[28px] font-bold leading-none ${s.c}`}>{s.n}</div>
                </div>
              ))}
            </div>

            <div className={CARD}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <SearchInput
                  value={dashSearch}
                  onChange={setDashSearch}
                  placeholder="Search by code, tracking, or shelf…"
                />
                <button
                  type="button"
                  onClick={() => exportItemsCsv().catch((e) => showToast(e.message, "error"))}
                  className={BTN_GHOST}
                >
                  <IconDownload className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
              <ItemsTable rows={filteredDash} withDate onView={openDetail} onPrint={handlePrintLabel} onDownload={handleDownloadLabel} emptyAll={items.length === 0} />
            </div>
          </>
        )}

        {/* ================= STORE ================= */}
        {tab === "Store" && (
          <div className={CARD}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <SectionTitle>Put away a shipment</SectionTitle>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  activeShelf ? "bg-[#412460]/8 text-[#412460]" : "bg-[#B99353]/12 text-[#8a651f]"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${activeShelf ? "bg-[#412460]" : "bg-[#B99353]"}`} />
                {activeShelf ? activeShelf : "No shelf yet"}
              </span>
            </div>

            {/* Desktop: the USB/hardware barcode scanner is always listening. */}
            <div className="mb-5 hidden items-center gap-2.5 rounded-2xl bg-[#F6F4F0] px-4 py-3 text-xs font-medium text-[#2D2D2D]/60 md:flex">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              Barcode scanner ready — scan a shelf, then scan each box. Or fill in the form below.
            </div>

            {/* Manual form — desktop inline; mobile uses the bottom bar → Enter Manually */}
            <div className="hidden md:block">{manualForm}</div>

            {/* Just-scanned table */}
            <div className="mt-6">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/40">
                Just scanned
              </p>
              {feed.length === 0 ? (
                <p className="rounded-2xl bg-[#F6F4F0] px-4 py-5 text-center text-xs text-[#2D2D2D]/40">
                  Scan a shelf, then scan boxes — they&apos;ll appear here.
                </p>
              ) : (
                <>
                  {/* Mobile: cards */}
                  <ul className="space-y-2.5 md:hidden">
                    {feed.map((it) => (
                      <li
                        key={it.id}
                        onClick={() => openDetail(it)}
                        className="cursor-pointer rounded-2xl bg-white p-4 ring-1 ring-[#ECE9E3] transition active:scale-[.99]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="inline-block rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-semibold text-[#412460]">{it.rackId}</span>
                            <p className="mt-2 break-all text-xs font-medium text-[#2D2D2D]/80">{it.trackingNumber}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              title="Print label"
                              onClick={(e) => { e.stopPropagation(); handlePrintLabel(it); }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#2D2D2D]/55 ring-1 ring-[#ECE9E3] transition active:scale-95"
                            >
                              <IconPrinter className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Download label"
                              onClick={(e) => { e.stopPropagation(); handleDownloadLabel(it); }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#2D2D2D]/55 ring-1 ring-[#ECE9E3] transition active:scale-95"
                            >
                              <IconDownload className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#2D2D2D]/50">
                          <span>{fmtDate(it.createdAt)}</span>
                          <span>· {it.createdByName || "—"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Desktop: table */}
                  <div className="-mx-1 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-[0.12em] text-[#2D2D2D]/40 [&>th]:px-3 [&>th]:pb-3 [&>th]:font-semibold">
                          <th>Selected Rack</th>
                          <th>Tracking Number</th>
                          <th>Arrived Date</th>
                          <th>Sorted by</th>
                          <th className="text-center">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="[&>tr]:border-t [&>tr]:border-[#F1EFEA]">
                        {feed.map((it) => (
                          <tr
                            key={it.id}
                            onClick={() => openDetail(it)}
                            className="cursor-pointer transition-colors hover:bg-[#FAF9F6] [&>td]:px-3 [&>td]:py-3"
                          >
                            <td>
                              <span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-semibold text-[#412460]">{it.rackId}</span>
                            </td>
                            <td className="max-w-[200px] truncate font-medium text-[#2D2D2D]/80">{it.trackingNumber}</td>
                            <td className="whitespace-nowrap text-xs text-[#2D2D2D]/55">{fmtDate(it.createdAt)}</td>
                            <td className="whitespace-nowrap text-xs text-[#2D2D2D]/70">{it.createdByName || "—"}</td>
                            <td className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  title="Print label"
                                  onClick={(e) => { e.stopPropagation(); handlePrintLabel(it); }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/50 transition-colors hover:bg-[#F0EDE7] hover:text-[#412460]"
                                >
                                  <IconPrinter className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Download label"
                                  onClick={(e) => { e.stopPropagation(); handleDownloadLabel(it); }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/50 transition-colors hover:bg-[#F0EDE7] hover:text-[#412460]"
                                >
                                  <IconDownload className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ================= SHIP ================= */}
        {tab === "Ship" && (
          <div className={CARD}>
            <div className="mb-4">
              <SectionTitle>Locate or ship</SectionTitle>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-72">
                <SearchInput
                  value={shipSearch}
                  onChange={(v) => { setShipSearch(v); setShipSelectedId(null); }}
                  onEnter={doLookup}
                  placeholder={isGtradea ? "Search PR, order, tracking, or shelf" : "Search code, tracking, or shelf"}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {!shipBatchMode ? (
                  <button type="button" onClick={() => setShipBatchMode(true)} className={BTN_GHOST}>
                    <IconCheck className="h-3.5 w-3.5" /> Batch Ship
                  </button>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-[#412460]">{shipSelCount} selected</span>
                    <button type="button" onClick={requestBatchShip} disabled={shipSelCount === 0 || batchBusy} className={BTN_PRIMARY}>
                      <IconCheck className="h-3.5 w-3.5" /> {batchBusy ? "Shipping…" : "Ship selected"}
                    </button>
                    <button type="button" onClick={exitShipBatch} disabled={batchBusy} className={BTN_GHOST}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            {shipSelected?.status === "in_stock" && detailCard(shipSelected)}

            {isGtradea ? (
              <GtradeaItemsTable
                rows={filteredShip}
                selectable={shipBatchMode}
                selected={shipSel}
                onToggleSelect={toggleShipSel}
                onToggleAll={(checked) => toggleAllShip(filteredShip, checked)}
                onToggleRows={toggleAllShip}
                onView={openDetail}
                onShip={requestShip}
                onPrint={handlePrintLabel}
                onPrintGroup={handlePrintGroup}
                onDownload={handleDownloadLabel}
                emptyAll={items.every((i) => i.status !== "in_stock")}
                emptyText="Nothing in stock to ship — scan 1688 goods in the Store tab."
              />
            ) : (
              <ItemsTable
                rows={filteredShip}
                selectable={shipBatchMode}
                selected={shipSel}
                onToggleSelect={toggleShipSel}
                onToggleAll={(checked) => toggleAllShip(filteredShip, checked)}
                onView={openDetail}
                onShip={requestShip}
                onPrint={handlePrintLabel}
                onDownload={handleDownloadLabel}
                emptyAll={items.every((i) => i.status !== "in_stock")}
                emptyText="Nothing in stock to ship — put items away in the Store tab."
              />
            )}
          </div>
        )}

        {/* ================= RACKS ================= */}
        {tab === "Racks" && (
          <div className={CARD}>
            <div className="mb-4">
              <SectionTitle>Shelves</SectionTitle>
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative flex-1">
                <IconPlus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2D2D2D]/35" />
                <input
                  type="text"
                  value={newRackName}
                  onChange={(e) => setNewRackName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddRack()}
                  placeholder={`Shelf ID, e.g. ${shelfExample}`}
                  className={`${FIELD} pl-10`}
                />
              </div>
              <button type="button" onClick={handleAddRack} className={BTN_PRIMARY}>
                Add Shelf
              </button>
            </div>

            {racks.length === 0 ? (
              <EmptyState>No shelves yet. Add your first shelf above, or just scan one in Store.</EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {racks.map((r) => (
                  <div key={r.id} className={LABEL_CARD}>
                    <div className="-mx-5 -mt-5 mb-4 h-3 opacity-55" style={BARCODE_STRIP} />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 sm:flex-1">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#2D2D2D]/45">Shelf</div>
                        <div className="mt-0.5 break-all text-lg font-black tracking-tight">{r.id}</div>
                      </div>
                      <div className="mx-auto w-full max-w-[220px] shrink-0 rounded-lg bg-white p-2 shadow-sm sm:mx-0 sm:w-56 sm:max-w-none">
                        <Barcode text={r.id} className="w-full" />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        title="Download label"
                        onClick={() => downloadRackLabel(r.id).catch((e) => showToast(e.message || "Label download failed", "error"))}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-[#2D2D2D]/70 transition-all hover:bg-white hover:text-[#412460]"
                      >
                        <IconDownload className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete shelf"
                        onClick={() => requestDeleteRack(r.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-[#2D2D2D]/70 transition-all hover:bg-red-500 hover:text-white"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= DISPATCHED ================= */}
        {tab === "Dispatched" && (
          <div className={CARD}>
            <div className="mb-4">
              <SectionTitle>Dispatched</SectionTitle>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="w-full sm:w-72">
                <SearchInput
                  value={dispatchSearch}
                  onChange={(v) => { setDispatchSearch(v); setShipSelectedId(null); }}
                  placeholder={isGtradea ? "Search dispatched by PR, order, tracking, or shelf…" : "Search dispatched by code, tracking, or shelf…"}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {!dispatchBatchMode ? (
                  <button type="button" onClick={() => setDispatchBatchMode(true)} className={BTN_GHOST}>
                    <IconTrash className="h-3.5 w-3.5" /> Batch Delete
                  </button>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-red-600">{dispatchSelCount} selected</span>
                    <button
                      type="button"
                      onClick={requestBatchDelete}
                      disabled={dispatchSelCount === 0 || batchBusy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-red-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <IconTrash className="h-3.5 w-3.5" /> {batchBusy ? "Deleting…" : "Delete selected"}
                    </button>
                    <button type="button" onClick={exitDispatchBatch} disabled={batchBusy} className={BTN_GHOST}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
            {shipSelected?.status === "shipped" && detailCard(shipSelected)}
            {isGtradea ? (
              <GtradeaItemsTable
                rows={filteredDispatched}
                selectable={dispatchBatchMode}
                selected={dispatchSel}
                onToggleSelect={toggleDispatchSel}
                onToggleAll={(checked) => toggleAllDispatch(filteredDispatched, checked)}
                onToggleRows={toggleAllDispatch}
                onView={openDetail}
                onPrint={handlePrintLabel}
                onPrintGroup={handlePrintGroup}
                onDownload={handleDownloadLabel}
                onDelete={(it) => setItemDeleteTarget(it)}
                emptyAll={items.every((i) => i.status !== "shipped")}
                emptyText="Nothing dispatched yet — mark items shipped from the Ship tab."
              />
            ) : (
              <ItemsTable
                rows={filteredDispatched}
                withDate
                selectable={dispatchBatchMode}
                selected={dispatchSel}
                onToggleSelect={toggleDispatchSel}
                onToggleAll={(checked) => toggleAllDispatch(filteredDispatched, checked)}
                onView={openDetail}
                onPrint={handlePrintLabel}
                onDownload={handleDownloadLabel}
                onDelete={(it) => setItemDeleteTarget(it)}
                emptyAll={items.every((i) => i.status !== "shipped")}
                emptyText="Nothing dispatched yet — mark items shipped from the Ship tab."
              />
            )}
          </div>
        )}

        {/* ================= 1688 ORDERS (gtradea) ================= */}
        {isGtradea && tab === "1688 Orders" && (
          <div className={CARD}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionTitle>1688 orders &amp; CN tracking</SectionTitle>
              <div className="flex flex-wrap items-center gap-3">
                {supplierSync?.at &&
                  (supplierSync.ok === false ? (
                    // Don't reassure with "Synced …" when the last pull actually
                    // failed — show the failure (it retries automatically). Brand
                    // warning tone (#B99353), same as the "Not Updated" badge.
                    <span
                      className="hidden max-w-[24rem] truncate text-[11px] font-semibold text-[#B99353] sm:inline"
                      title={supplierSync.error || "Last sync failed — retrying automatically"}
                    >
                      ⚠ Sync failing: {supplierSync.error || "unknown error"}
                    </span>
                  ) : (
                    <span className="hidden text-[11px] text-[#2D2D2D]/45 sm:inline">
                      Synced {fmtDate(supplierSync.at)}
                    </span>
                  ))}
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncInFlight}
                  className={BTN_GHOST}
                >
                  <IconRefresh className={`h-3.5 w-3.5 ${syncInFlight ? "animate-spin" : ""}`} />
                  {syncInFlight ? "Syncing…" : "Sync now"}
                </button>
                <label className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/45">Sort by</span>
                  <select
                    value={supplierSort}
                    onChange={(e) => setSupplierSort(e.target.value)}
                    aria-label="Sort 1688 orders by"
                    className="rounded-full bg-white py-2.5 pl-3 pr-7 text-xs font-semibold text-[#2D2D2D]/70 ring-1 ring-[#E6E2DB] transition-all focus:outline-none focus:ring-2 focus:ring-[#412460]/30"
                  >
                    {SUPPLIER_SORTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <p className="mb-4 text-xs text-[#2D2D2D]/45">
              Pulled automatically from gtradea — &quot;Sync now&quot; fetches live. <span className="font-semibold text-[#412460]">📦 Received</span> means that
              CN tracking is in stock in your warehouse; <span className="font-semibold text-red-600">🚚 Dispatched</span> means it&apos;s since shipped out
              (shown with the date); <span className="font-semibold text-[#B99353]">⏳ Pending</span> means it has CN tracking but hasn&apos;t been scanned in yet;
              <span className="font-semibold"> Not Yet</span> means gtradea has no CN tracking for that item at all.
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <SearchInput
                value={supplierSearch}
                onChange={setSupplierSearch}
                placeholder="Search order #, CN tracking, or product…"
              />
              <button
                type="button"
                onClick={handleExportSupplier}
                disabled={supplierExporting}
                className={BTN_GHOST}
              >
                <IconDownload className={`h-3.5 w-3.5 ${supplierExporting ? "animate-pulse" : ""}`} />
                {supplierExporting ? "Exporting…" : "Export"}
              </button>
            </div>
            <SupplierOrdersTable rows={filteredSupplier} loading={supplierLoading} />
          </div>
        )}
      </main>

      {/* Mobile bottom action bar — Scan / Enter Manually (image-style) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E7E3DC] bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md gap-2">
          <button
            type="button"
            onClick={() => { setScanMode("scan"); setScanOpen(true); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#412460] px-4 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[.98]"
          >
            <IconCamera className="h-4 w-4" /> Scan
          </button>
          {tab === "Store" && (
            <button
              type="button"
              onClick={() => { setScanMode("manual"); setScanOpen(true); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#2D2D2D]/75 ring-1 ring-[#E6E2DB] transition active:scale-[.98]"
            >
              <IconKeyboard className="h-4 w-4" /> Enter Manually
            </button>
          )}
        </div>
      </div>

      {/* dispatched item delete confirm */}
      {itemDeleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <IconTrash className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">Delete {goodsCode(itemDeleteTarget)}?</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              Removes this dispatched record ({itemDeleteTarget.trackingNumber}). This can&apos;t be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setItemDeleteTarget(null)} className={BTN_GHOST}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteItem}
                className="rounded-full bg-red-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:scale-[.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* batch delete confirm — Dispatched "Delete selected" */}
      {batchDeleteItems && batchDeleteItems.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <IconTrash className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">Delete {batchDeleteItems.length} record{batchDeleteItems.length > 1 ? "s" : ""}?</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              Removes {batchDeleteItems.length > 1 ? "these dispatched records" : "this dispatched record"}. This can&apos;t be undone.
            </p>
            <div className="mt-4 max-h-40 overflow-y-auto rounded-2xl bg-[#F6F4F0] p-3 text-xs">
              <ul className="space-y-1.5">
                {batchDeleteItems.map((it) => (
                  <li key={it.id} className="flex justify-between gap-3">
                    <span className="shrink-0 font-semibold text-[#412460]">{goodsCode(it)}</span>
                    <span className="min-w-0 truncate text-right text-[#2D2D2D]/60">{it.trackingNumber || "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setBatchDeleteItems(null)} className={BTN_GHOST}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBatchDelete}
                className="rounded-full bg-red-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:scale-[.98]"
              >
                Delete {batchDeleteItems.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* rack delete confirm */}
      {rackDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <IconTrash className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">Delete shelf {rackDeleteTarget}?</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">This can&apos;t be undone.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setRackDeleteTarget(null)} className={BTN_GHOST}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRack}
                className="rounded-full bg-red-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:scale-[.98]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* mark-as-shipped confirm — opened by the row tick, a Ship scan, or the
          "Ship selected" batch button (one item or many). */}
      {shipConfirmItems && shipConfirmItems.length > 0 && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#412460]/10 text-[#412460]">
              <IconCheck className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">
              {shipConfirmItems.length > 1
                ? `Mark ${shipConfirmItems.length} items as shipped?`
                : "Mark this item as shipped?"}
            </h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              {shipConfirmItems.length > 1 ? (
                "These move out of stock and into Dispatched."
              ) : (
                <>This moves <span className="font-semibold text-[#412460]">{goodsCode(shipConfirmItems[0])}</span> out of stock and into Dispatched.</>
              )}
            </p>
            {shipConfirmItems.length > 1 ? (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-2xl bg-[#F6F4F0] p-3 text-xs">
                <ul className="space-y-1.5">
                  {shipConfirmItems.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-3">
                      <span className="shrink-0 font-semibold text-[#412460]">{goodsCode(it)}</span>
                      <span className="min-w-0 flex-1 truncate text-[#2D2D2D]/60">{it.trackingNumber || "—"}</span>
                      <ShipmentBadge mode={it.shipmentFrom} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <dl className="mt-4 space-y-2 rounded-2xl bg-[#F6F4F0] p-4 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-[#2D2D2D]/50">Tracking</dt>
                  <dd className="min-w-0 break-all text-right font-semibold">{shipConfirmItems[0].trackingNumber}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#2D2D2D]/50">Shelf</dt>
                  <dd className="font-semibold">{shipConfirmItems[0].rackId || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#2D2D2D]/50">Shipment mode</dt>
                  <dd><ShipmentBadge mode={shipConfirmItems[0].shipmentFrom} /></dd>
                </div>
              </dl>
            )}
            <p className="mt-2 text-[11px] text-[#2D2D2D]/40">
              {shipConfirmItems.length > 1 ? "Each ships via the mode set when its label was printed." : "Set when the label was printed — reprint the label to change it."}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className={LABEL}>
                  Name of the logistics <span className="text-red-500">*</span>
                </label>
                <div className="mt-1.5">
                  <SearchSelect
                    value={shipLogistics}
                    onChange={setShipLogistics}
                    options={["RK Logistics", "FR Logistics"]}
                    placeholder="Search or type, e.g. RK Logistics"
                    allowCustom
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShipConfirmItems(null)} className={BTN_GHOST}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmShip}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#412460] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#B99353] active:scale-[.98]"
              >
                <IconCheck className="h-3.5 w-3.5" />
                {shipConfirmItems.length > 1 ? `Ship ${shipConfirmItems.length} items` : "Mark as Shipped"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* print quantity — how many labels/packages to print (default 1) */}
      {printQtyTarget && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#412460]/10 text-[#412460]">
              <IconPrinter className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">How many labels?</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              Printing <span className="font-semibold text-[#412460]">{goodsCode(printQtyTarget)}</span> — one label per package.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPrintQty((q) => String(Math.max(1, (parseInt(q, 10) || 1) - 1)))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F6F4F0] text-xl font-bold text-[#2D2D2D]/70 transition hover:bg-[#EDEAE3] active:scale-95"
              >
                −
              </button>
              <input
                type="number"
                min="1"
                max="20"
                value={printQty}
                onChange={(e) => setPrintQty(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmPrintQty()}
                autoFocus
                onFocus={(e) => e.target.select()}
                className={`${FIELD} text-center text-lg font-bold`}
              />
              <button
                type="button"
                onClick={() => setPrintQty((q) => String(Math.min(20, (parseInt(q, 10) || 1) + 1)))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F6F4F0] text-xl font-bold text-[#2D2D2D]/70 transition hover:bg-[#EDEAE3] active:scale-95"
              >
                +
              </button>
            </div>
            <div className="mt-4">
              <label className={LABEL}>Shipment mode</label>
              <select
                value={printShipMode}
                onChange={(e) => setPrintShipMode(e.target.value)}
                className={`${FIELD} mt-1.5`}
              >
                <option value="By Air">By Air</option>
                <option value="By Land">By Land</option>
              </select>
              <p className="mt-1.5 text-[11px] text-[#2D2D2D]/40">This item ships the same way when marked shipped.</p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPrintQtyTarget(null)} className={BTN_GHOST}>
                Cancel
              </button>
              <button type="button" onClick={confirmPrintQty} className={BTN_PRIMARY}>
                <IconPrinter className="h-3.5 w-3.5" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-[130] flex -translate-x-1/2 items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-lg shadow-black/15 md:bottom-6 ${
            toast.type === "error" ? "bg-red-600" : toast.type === "warn" ? "bg-[#B99353]" : "bg-[#412460]"
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
            {toast.type === "error" ? "!" : toast.type === "warn" ? "!" : <IconCheck className="h-3 w-3" />}
          </span>
          {toast.msg}
        </div>
      )}

      {/* Camera overlay — full-screen scan screen (mobile). The bottom control
          switches between the camera and the manual form on the Store tab.
          Desktop uses the hardware barcode scanner instead of this. */}
      {scanOpen && createPortal(
        <div className={`fixed inset-0 z-[120] flex flex-col ${manualLight ? "bg-[#F6F4F0] text-[#2D2D2D]" : "bg-black text-white"}`}>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <p className="text-sm font-bold">{tab === "Store" ? "Put away" : `${tab} · Scan`}</p>
              <p className={`text-[11px] ${manualLight ? "text-[#2D2D2D]/50" : "text-white/50"}`}>{scanHint}</p>
            </div>
            <button
              type="button"
              onClick={() => setScanOpen(false)}
              aria-label="Close"
              className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                manualLight ? "bg-[#2D2D2D]/8 text-[#2D2D2D] hover:bg-[#2D2D2D]/15" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-6">
            {manualLight ? (
              <div className={`w-full max-w-sm ${CARD}`}>{manualForm}</div>
            ) : (
              <div className="w-full max-w-sm">
                <WarehouseScanner
                  autoStart
                  continuous={tab === "Store"}
                  onDecode={routeScan}
                  onError={(m) => showToast(m, "error")}
                />
                <p className="mt-5 text-center text-sm font-semibold">
                  {tab === "Store"
                    ? (activeShelf ? `Shelf: ${activeShelf}` : "Scan a shelf label first")
                    : scanHint}
                </p>
                {tab === "Store" && (
                  <p className="mt-1 text-center text-xs text-white/45">Then scan each box&apos;s tracking barcode</p>
                )}
              </div>
            )}
          </div>

          {tab === "Store" ? (
            <div className="px-6 pb-9 pt-4">
              <div className={`mx-auto flex max-w-sm rounded-full p-1 ${manualLight ? "bg-[#EAE6DF]" : "bg-white/10"}`}>
                <button
                  type="button"
                  onClick={() => setScanMode("scan")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                    scanMode === "scan" ? "bg-white text-[#412460] shadow-sm" : manualLight ? "text-[#2D2D2D]/50" : "text-white/70"
                  }`}
                >
                  <IconCamera className="h-4 w-4" /> Scan
                </button>
                <button
                  type="button"
                  onClick={() => setScanMode("manual")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                    scanMode === "manual" ? "bg-[#412460] text-white shadow-sm" : manualLight ? "text-[#2D2D2D]/50" : "text-white/70"
                  }`}
                >
                  <IconKeyboard className="h-4 w-4" /> Enter Manually
                </button>
              </div>
            </div>
          ) : (
            <div className="px-6 pb-9 pt-4">
              <button
                type="button"
                onClick={() => setScanOpen(false)}
                className="mx-auto flex w-full max-w-sm items-center justify-center rounded-full bg-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/20"
              >
                Close
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Success sheet — after a put-away, show the stored item's details + OK. */}
      {savedItem && createPortal(
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setSavedItem(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={keepSavedSheet}
            onTouchStart={keepSavedSheet}
          >
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
              <IconCheck className="h-7 w-7" />
            </span>
            <h3 className="text-center text-lg font-bold">Item stored</h3>
            {/* The id that's about to be printed, biggest thing on the sheet —
                staff confirm it against the gtradea PR row at a glance. */}
            <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/40">
              {savedItem.prCode ? "PR ID" : "Goods number"}
            </p>
            <p className="break-all text-center text-xl font-black tracking-tight text-[#412460]">{goodsCode(savedItem)}</p>
            <dl className="mt-5 divide-y divide-[#F1EFEA] text-sm">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[#2D2D2D]/50">Shelf</dt>
                <dd className="font-semibold">{savedItem.rackId || "—"}</dd>
              </div>
              {savedItem.orderNumber && (
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="shrink-0 text-[#2D2D2D]/50">Order number</dt>
                  <dd className="break-all text-right font-semibold">{savedItem.orderNumber}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="shrink-0 text-[#2D2D2D]/50">Tracking number</dt>
                <dd className="break-all text-right font-semibold">{savedItem.trackingNumber}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[#2D2D2D]/50">Created by</dt>
                <dd className="font-semibold">{savedItem.createdByName || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[#2D2D2D]/50">Date</dt>
                <dd className="font-semibold">{fmtDate(savedItem.createdAt)}</dd>
              </div>
            </dl>
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={printSavedItemNow}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#412460] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#B99353] active:scale-[.98]"
              >
                <IconPrinter className="h-4 w-4" /> Print label
              </button>
              <button
                type="button"
                onClick={printSavedItem}
                className="w-full text-center text-xs font-semibold text-[#2D2D2D]/45 underline decoration-[#2D2D2D]/20 underline-offset-2 transition hover:text-[#412460]"
              >
                More than one package? Choose copies
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={undoSavedItem}
                  className="rounded-full border border-[#E3DEEA] bg-white px-6 py-3 text-sm font-semibold text-[#2D2D2D]/70 transition hover:border-red-300 hover:text-red-600 active:scale-[.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { keepSavedSheet(); setSavedItem(null); }}
                  className="rounded-full bg-[#2D2D2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#412460] active:scale-[.98]"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mobile slide-in menu — landing-page style, rendered via portal so it
          covers the whole viewport regardless of header stacking context. */}
      {createPortal(
        <>
          <div
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
            className={`fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity duration-500 md:hidden ${
              menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Warehouse navigation"
            className={`fixed inset-0 z-[110] flex h-full w-full flex-col bg-[#412460] text-white transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
              menuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12">
                  <IconBox className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-base font-bold leading-tight">Warehouse</p>
                  <p className="text-[11px] text-white/50">Scan &amp; locate</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-1 flex-col justify-center px-8 pb-6">
              {TABS.map((t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTab(t); setMenuOpen(false); }}
                    className={`flex items-center justify-between border-b border-white/10 py-5 text-3xl font-semibold transition-colors duration-200 ${
                      active ? "text-[#B99353]" : "text-white/85 hover:text-white"
                    }`}
                  >
                    {t}
                    {active && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B99353]/70">current</span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="px-8 pb-9">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-sm font-bold">
                  {(staffUser?.name || "S").charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold">{staffUser?.name || "Staff"}</p>
                  <p className="text-[11px] text-white/45">Signed in</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex w-full items-center justify-center rounded-full bg-white/10 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white hover:text-[#412460]"
              >
                Logout
              </button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}

// Shared items table (Dashboard + Ship). `withDate` adds a Stored column.
function ItemsTable({ rows, onView, withDate = false, emptyAll = false, emptyText, onShip, onDelete, onPrint, onDownload, selectable = false, selected, onToggleSelect, onToggleAll }) {
  if (!rows || rows.length === 0) {
    return (
      <EmptyState>
        {emptyAll ? (emptyText || "Nothing stored yet — scan an item in the Store tab.") : "No items match that search."}
      </EmptyState>
    );
  }
  return (
    <>
      {/* Mobile: card list — a wide table scrolls awkwardly on a phone */}
      <ul className="space-y-2.5 md:hidden">
        {rows.map((it) => (
          <li
            key={it.id}
            onClick={() => onView(it)}
            className="cursor-pointer rounded-2xl bg-white p-4 shadow-[0_2px_16px_-8px_rgba(45,45,45,0.16)] ring-1 ring-[#ECE9E3] transition active:scale-[.99]"
          >
            <div className="flex items-start justify-between gap-3">
              {selectable && (
                <span className="pt-0.5">
                  <RowCheck checked={!!selected?.has(it.id)} onChange={() => onToggleSelect(it.id)} label={`Select ${it.code}`} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="break-all text-base font-bold leading-tight text-[#412460]">{it.code}</div>
                <p className="mt-1 break-all text-xs font-medium text-[#2D2D2D]/70">{it.trackingNumber || "—"}</p>
              </div>
              <ShipmentBadge mode={it.shipmentFrom} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2D2D2D]/40">Shelf</span>
                <span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 font-semibold text-[#412460]">{it.rackId || "—"}</span>
              </span>
              {withDate && (
                <span className="inline-flex items-center gap-1.5 text-[#2D2D2D]/55">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2D2D2D]/40">Stored</span>
                  {fmtDate(it.createdAt)}
                </span>
              )}
            </div>
            {(onShip || onPrint || onDownload || onDelete) && (
              <div className="mt-3 flex items-center gap-2 border-t border-[#F1EFEA] pt-3">
                {onPrint && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPrint(it); }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95"
                  >
                    <IconPrinter className="h-3.5 w-3.5" /> Print
                  </button>
                )}
                {onDownload && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDownload(it); }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95"
                  >
                    <IconDownload className="h-3.5 w-3.5" /> Label
                  </button>
                )}
                {onShip && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onShip(it); }}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#B99353] active:scale-95"
                  >
                    <IconCheck className="h-3.5 w-3.5" /> Ship
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(it); }}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500/80 ring-1 ring-red-100 transition active:scale-95"
                  >
                    <IconTrash className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="-mx-1 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[#2D2D2D]/40 [&>th]:px-3 [&>th]:pb-3 [&>th]:font-semibold">
              {selectable && (
                <th className="w-8">
                  <SelectAllCheck rows={rows} selected={selected} onToggleAll={onToggleAll} />
                </th>
              )}
              <th>Code</th>
              <th>Tracking</th>
              <th>Shelf</th>
              <th>Shipment</th>
              {withDate && <th>Stored</th>}
              <th className="text-center">Remarks</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-[#F1EFEA]">
            {rows.map((it) => (
              <tr
                key={it.id}
                onClick={() => onView(it)}
                className="cursor-pointer transition-colors hover:bg-[#FAF9F6] [&>td]:px-3 [&>td]:py-3"
              >
                {selectable && (
                  <td className="w-8" onClick={(e) => e.stopPropagation()}>
                    <RowCheck checked={!!selected?.has(it.id)} onChange={() => onToggleSelect(it.id)} label={`Select ${it.code}`} />
                  </td>
                )}
                <td className="font-bold text-[#412460]">{it.code}</td>
                <td className="max-w-[220px] truncate text-[#2D2D2D]/80">{it.trackingNumber}</td>
                <td>
                  <span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-medium text-[#2D2D2D]/70">
                    {it.rackId}
                  </span>
                </td>
                <td>
                  <ShipmentBadge mode={it.shipmentFrom} />
                </td>
                {withDate && <td className="whitespace-nowrap text-xs text-[#2D2D2D]/50">{fmtDate(it.createdAt)}</td>}
                <td className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {onPrint && (
                      <button
                        type="button"
                        title="Print label"
                        onClick={(e) => { e.stopPropagation(); onPrint(it); }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/50 transition-colors hover:bg-[#F0EDE7] hover:text-[#412460]"
                      >
                        <IconPrinter className="h-4 w-4" />
                      </button>
                    )}
                    {onDownload && (
                      <button
                        type="button"
                        title="Download label"
                        onClick={(e) => { e.stopPropagation(); onDownload(it); }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/50 transition-colors hover:bg-[#F0EDE7] hover:text-[#412460]"
                      >
                        <IconDownload className="h-4 w-4" />
                      </button>
                    )}
                    {onShip && (
                      <button
                        type="button"
                        title="Mark as shipped"
                        onClick={(e) => { e.stopPropagation(); onShip(it); }}
                        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#412460] text-white transition-colors hover:bg-[#B99353]"
                      >
                        <IconCheck className="h-4 w-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        title="Delete"
                        onClick={(e) => { e.stopPropagation(); onDelete(it); }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/40 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    )}
                    {!onShip && !onPrint && !onDownload && !onDelete && (
                      <IconChevron className="h-4 w-4 text-[#2D2D2D]/25" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// GtradeA shipment table — the gtradea PR id, shelf, the linked 1688 order #, CN
// tracking, product, status + Print/Download/Ship. Mirrors ItemsTable with the
// 1688 columns.
function GtradeaItemsTable({ rows, onView, emptyAll = false, emptyText, onShip, onDelete, onPrint, onPrintGroup, onDownload, selectable = false, selected, onToggleSelect, onToggleAll, onToggleRows }) {
  // Boxes that share one goods number (all boxes of the same 1688 order — see
  // generateItemCode() in backend/inventory/routes/warehouse.js) are grouped
  // under a single summary row with a "packages" count + expand toggle, rather
  // than repeating the same PR id on every row. Grouping still keys off the
  // internal `code`, not the displayed PR id: it's on every row (a box stored
  // before gtradea published its job code has no PR id yet), so it keeps the
  // boxes of one order together regardless.
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (code) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  // Order preserved: rows arrive pre-sorted newest first, and Map keeps
  // first-seen key order, so each group surfaces at its most recent member's
  // position.
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of rows || []) {
      const key = it.code || it.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.values()];
  }, [rows]);

  if (!rows || rows.length === 0) {
    return (
      <EmptyState>
        {emptyAll ? (emptyText || "No 1688 goods stored yet — scan them in the Store tab.") : "No items match that search."}
      </EmptyState>
    );
  }

  const actionButtons = (it) => (
    <div className="flex items-center justify-center gap-1">
      {onPrint && (<button type="button" title="Print label" onClick={(e) => { e.stopPropagation(); onPrint(it); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/50 transition-colors hover:bg-[#F0EDE7] hover:text-[#412460]"><IconPrinter className="h-4 w-4" /></button>)}
      {onDownload && (<button type="button" title="Download label" onClick={(e) => { e.stopPropagation(); onDownload(it); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/50 transition-colors hover:bg-[#F0EDE7] hover:text-[#412460]"><IconDownload className="h-4 w-4" /></button>)}
      {onShip && (<button type="button" title="Mark as shipped" onClick={(e) => { e.stopPropagation(); onShip(it); }} className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#412460] text-white transition-colors hover:bg-[#B99353]"><IconCheck className="h-4 w-4" /></button>)}
      {onDelete && (<button type="button" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(it); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/40 transition-colors hover:bg-red-50 hover:text-red-600"><IconTrash className="h-4 w-4" /></button>)}
      {!onShip && !onPrint && !onDownload && !onDelete && (<IconChevron className="h-4 w-4 text-[#2D2D2D]/25" />)}
    </div>
  );

  // Actions for a merged group's SUMMARY row: Print sends one label per box
  // (each keeps its own tracking number, all sharing the group's goods
  // number) and Ship marks every box in the group shipped at once. Per-box
  // actions (ship/print/download/delete just one) live in the expanded rows.
  const groupActionButtons = (group) => (
    <div className="flex items-center justify-center gap-1">
      {onPrintGroup && (<button type="button" title={`Print ${group.length} labels`} onClick={(e) => { e.stopPropagation(); onPrintGroup(group); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2D2D2D]/50 transition-colors hover:bg-[#F0EDE7] hover:text-[#412460]"><IconPrinter className="h-4 w-4" /></button>)}
      {onShip && (<button type="button" title={`Ship all ${group.length}`} onClick={(e) => { e.stopPropagation(); onShip(group); }} className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#412460] text-white transition-colors hover:bg-[#B99353]"><IconCheck className="h-4 w-4" /></button>)}
      {!onPrintGroup && !onShip && (<IconChevron className="h-4 w-4 text-[#2D2D2D]/25" />)}
    </div>
  );

  return (
    <>
      {/* Mobile: cards */}
      <ul className="space-y-2.5 md:hidden">
        {groups.map((group) => {
          const head = group[0];
          const count = group.length;
          const isGroup = count > 1;
          const isOpen = isGroup && expanded.has(head.code);
          const modes = new Set(group.map((g) => g.shipmentFrom || "By Air"));
          return (
            <li key={head.code || head.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_16px_-8px_rgba(45,45,45,0.16)] ring-1 ring-[#ECE9E3]">
              <div
                onClick={() => (isGroup ? toggleExpand(head.code) : onView(head))}
                className="cursor-pointer p-4 transition active:scale-[.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  {selectable && (
                    <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      {isGroup ? (
                        <SelectAllCheck rows={group} selected={selected} onToggleAll={(checked) => onToggleRows(group, checked)} />
                      ) : (
                        <RowCheck checked={!!selected?.has(head.id)} onChange={() => onToggleSelect(head.id)} label={`Select ${goodsCode(head)}`} />
                      )}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2D2D2D]/40">Order #</div>
                    <div className="break-all text-base font-bold leading-tight text-[#412460]">{head.orderNumber || "—"}</div>
                  </div>
                  {isGroup
                    ? (modes.size > 1 && <span className="text-[11px] font-semibold text-[#B99353]">Mixed</span>)
                    : <ShipmentBadge mode={head.shipmentFrom} />}
                </div>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#2D2D2D]/45">PR ID</dt>
                    <dd className="font-semibold text-[#412460]">{goodsCode(head)}</dd>
                  </div>
                  {isGroup ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#2D2D2D]/45">Packages</dt>
                      <dd className="flex items-center gap-1 font-semibold text-[#412460]">
                        {count} packages
                        <IconChevron className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </dd>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#2D2D2D]/45">Shelf</dt>
                        <dd><span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 font-semibold text-[#412460]">{head.rackId || "—"}</span></dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#2D2D2D]/45">CN Tracking</dt>
                        <dd className="min-w-0 break-all text-right font-medium">{head.trackingNumber || "—"}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {!isGroup && (onShip || onPrint || onDownload || onDelete) && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[#F1EFEA] pt-3">
                    {onPrint && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPrint(head); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95">
                        <IconPrinter className="h-3.5 w-3.5" /> Print
                      </button>
                    )}
                    {onDownload && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(head); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95">
                        <IconDownload className="h-3.5 w-3.5" /> Label
                      </button>
                    )}
                    {onShip && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onShip(head); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#B99353] active:scale-95">
                        <IconCheck className="h-3.5 w-3.5" /> Ship
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(head); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500/80 ring-1 ring-red-100 transition active:scale-95">
                        <IconTrash className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                )}
                {isGroup && (onPrintGroup || onShip) && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[#F1EFEA] pt-3">
                    {onPrintGroup && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPrintGroup(group); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95">
                        <IconPrinter className="h-3.5 w-3.5" /> Print {count}
                      </button>
                    )}
                    {onShip && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onShip(group); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#B99353] active:scale-95">
                        <IconCheck className="h-3.5 w-3.5" /> Ship all {count}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isGroup && isOpen && (
                <div className="divide-y divide-[#F1EFEA] border-t border-[#F1EFEA] bg-[#FAFAF8]">
                  {group.map((it) => (
                    <div key={it.id} onClick={() => onView(it)} className="cursor-pointer p-3 pl-6">
                      <div className="flex items-start justify-between gap-3">
                        {selectable && (
                          <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                            <RowCheck checked={!!selected?.has(it.id)} onChange={() => onToggleSelect(it.id)} label={`Select ${goodsCode(it)} ${it.trackingNumber}`} />
                          </span>
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="break-all font-medium text-[#2D2D2D]/80">{it.trackingNumber || "—"}</div>
                          <div className="mt-1 text-[#2D2D2D]/45">Shelf <span className="font-semibold text-[#412460]">{it.rackId || "—"}</span></div>
                        </div>
                        <ShipmentBadge mode={it.shipmentFrom} />
                      </div>
                      {(onShip || onPrint || onDownload || onDelete) && (
                        <div className="mt-2.5 flex items-center gap-2 border-t border-[#F1EFEA] pt-2.5">
                          {onPrint && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onPrint(it); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95">
                              <IconPrinter className="h-3.5 w-3.5" /> Print
                            </button>
                          )}
                          {onDownload && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(it); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95">
                              <IconDownload className="h-3.5 w-3.5" /> Label
                            </button>
                          )}
                          {onShip && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onShip(it); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#412460] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#B99353] active:scale-95">
                              <IconCheck className="h-3.5 w-3.5" /> Ship
                            </button>
                          )}
                          {onDelete && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(it); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-red-500/80 ring-1 ring-red-100 transition active:scale-95">
                              <IconTrash className="h-3.5 w-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="-mx-1 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[#2D2D2D]/40 [&>th]:px-3 [&>th]:pb-3 [&>th]:font-semibold">
              {selectable && (
                <th className="w-8">
                  <SelectAllCheck rows={rows} selected={selected} onToggleAll={onToggleAll} />
                </th>
              )}
              <th>PR ID</th>
              <th>Shelf</th>
              <th>Order #</th>
              <th>Packages</th>
              <th>Tracking</th>
              <th>Shipment</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-[#F1EFEA]">
            {groups.map((group) => {
              const head = group[0];
              const count = group.length;
              const isGroup = count > 1;
              const isOpen = isGroup && expanded.has(head.code);
              const shelves = new Set(group.map((g) => g.rackId || "—"));
              const shelfLabel = shelves.size === 1 ? [...shelves][0] : `${shelves.size} shelves`;
              const modes = new Set(group.map((g) => g.shipmentFrom || "By Air"));

              return (
                <Fragment key={head.code || head.id}>
                  <tr
                    onClick={() => (isGroup ? toggleExpand(head.code) : onView(head))}
                    className="cursor-pointer transition-colors hover:bg-[#FAF9F6] [&>td]:px-3 [&>td]:py-3"
                  >
                    {selectable && (
                      <td className="w-8" onClick={(e) => e.stopPropagation()}>
                        {isGroup ? (
                          <SelectAllCheck rows={group} selected={selected} onToggleAll={(checked) => onToggleRows(group, checked)} />
                        ) : (
                          <RowCheck checked={!!selected?.has(head.id)} onChange={() => onToggleSelect(head.id)} label={`Select ${goodsCode(head)}`} />
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap font-bold text-[#412460]">{goodsCode(head)}</td>
                    <td><span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-medium text-[#2D2D2D]/70">{shelfLabel}</span></td>
                    <td className="whitespace-nowrap font-semibold text-[#2D2D2D]/80">{head.orderNumber || "—"}</td>
                    <td>
                      {isGroup ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(head.code); }}
                          className="inline-flex items-center gap-1 rounded-full bg-[#412460]/10 px-2.5 py-1 text-xs font-bold text-[#412460] transition hover:bg-[#412460]/15"
                        >
                          {count} packages
                          <IconChevron className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                      ) : (
                        <span className="text-xs text-[#2D2D2D]/35">1</span>
                      )}
                    </td>
                    <td className="max-w-[170px] truncate text-[#2D2D2D]/80" title={isGroup ? undefined : head.trackingNumber}>
                      {isGroup ? "—" : (head.trackingNumber || "—")}
                    </td>
                    <td>
                      {isGroup
                        ? (modes.size === 1 ? <ShipmentBadge mode={head.shipmentFrom} /> : <span className="text-[11px] font-semibold text-[#B99353]">Mixed</span>)
                        : <ShipmentBadge mode={head.shipmentFrom} />}
                    </td>
                    <td className="text-center">
                      {isGroup ? groupActionButtons(group) : actionButtons(head)}
                    </td>
                  </tr>
                  {isGroup && isOpen && group.map((it) => (
                    <tr key={it.id} onClick={() => onView(it)} className="cursor-pointer bg-[#FAFAF8] transition-colors hover:bg-[#F4F2EE] [&>td]:px-3 [&>td]:py-2.5">
                      {selectable && (
                        <td className="w-8" onClick={(e) => e.stopPropagation()}>
                          <RowCheck checked={!!selected?.has(it.id)} onChange={() => onToggleSelect(it.id)} label={`Select ${goodsCode(it)} ${it.trackingNumber}`} />
                        </td>
                      )}
                      <td className="pl-6 text-xs text-[#2D2D2D]/30">↳</td>
                      <td><span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-medium text-[#2D2D2D]/70">{it.rackId || "—"}</span></td>
                      <td className="text-xs text-[#2D2D2D]/30">—</td>
                      <td className="text-xs text-[#2D2D2D]/30">—</td>
                      <td className="max-w-[170px] truncate text-[#2D2D2D]/80" title={it.trackingNumber}>{it.trackingNumber || "—"}</td>
                      <td><ShipmentBadge mode={it.shipmentFrom} /></td>
                      <td className="text-center">{actionButtons(it)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Where this 1688 line item stands, in four distinct states:
//   no CN tracking yet on gtradea    -> "Not Yet" (nothing to receive against)
//   has tracking, not scanned in     -> "Pending" (boxed — goods are on the way)
//   has tracking, scanned in         -> "Received" (bold purple; the PR ID has
//                                       its own column, so it isn't repeated here)
//   has tracking, scanned in, shipped -> "Dispatched" + the day it shipped
// "Not Yet" is deliberately the ONLY state with no box around it: an order with no
// tracking can never match a warehouse item, so it isn't waiting on the warehouse
// at all — it's the gtradea record that's incomplete. Boxing it would put it on
// the same footing as "Pending", which IS a real thing to go looking for. Once the
// matched warehouse item ships, the pill flips from Received to Dispatched (bold
// red, matching the rest of the shipped-state colour language) so the 1688 panel
// doesn't keep telling staff the goods are still sitting in stock.
function WarehousePill({ order }) {
  const state = supplierState(order);
  if (state === "not_updated") {
    return <span className="text-[11px] text-[#2D2D2D]/35">Not Yet</span>;
  }
  if (state === "not_received") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#B99353]/12 px-2.5 py-1 text-[11px] font-semibold text-[#B99353]">
        <span aria-hidden="true">⏳</span>
        Pending
      </span>
    );
  }
  if (state === "dispatched") {
    return (
      <span className="text-[11px] font-bold text-red-600">
        <span aria-hidden="true">🚚</span> Dispatched · {fmtShipDay(order.warehouseShippedAt)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#412460]/10 px-2.5 py-1 text-[11px] font-bold text-[#412460]">
      <span aria-hidden="true">📦</span>
      Received
    </span>
  );
}

// The 1688 orders table (desktop) / card list (mobile). Read-only.
function SupplierOrdersTable({ rows, loading }) {
  // Track images that failed to load and hide them via STATE, not by mutating the
  // DOM node — an imperative style change would persist across re-renders and could
  // permanently hide a later-valid image for the same row key.
  const [brokenImgs, setBrokenImgs] = useState(() => new Set());
  const markImgBroken = (url) =>
    setBrokenImgs((prev) => (!url || prev.has(url) ? prev : new Set(prev).add(url)));
  const canShowImg = (url) => url && !brokenImgs.has(url);

  if (loading && (!rows || rows.length === 0)) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#2D2D2D]/45">
        <IconRefresh className="h-4 w-4 animate-spin" /> Loading 1688 orders…
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState>
        No 1688 orders yet. They appear here automatically once gtradea has procurement data — or tap &quot;Sync now&quot;.
      </EmptyState>
    );
  }
  return (
    <>
      {/* Mobile: cards */}
      <ul className="space-y-2.5 md:hidden">
        {rows.map((o) => (
          <li key={o.id} className="rounded-2xl bg-white p-4 ring-1 ring-[#ECE9E3]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2D2D2D]/40">
                  {fmtDay(o.orderedAt)}
                  {o.jobCode && <span className="rounded bg-[#412460]/8 px-1.5 py-0.5 tracking-normal text-[#412460]">{o.jobCode}</span>}
                </div>
                <div className="mt-0.5 break-all text-sm font-bold text-[#412460]">{o.orderNumber || "—"}</div>
                <p className="mt-1 break-words text-xs text-[#2D2D2D]/70">{o.productName || "—"}</p>
              </div>
              {canShowImg(o.productImage) ? (
                <img
                  src={o.productImage}
                  alt=""
                  loading="lazy"
                  onError={() => markImgBroken(o.productImage)}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-[#ECE9E3]"
                />
              ) : null}
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[#2D2D2D]/45">CN tracking</dt>
                <dd className="min-w-0 break-all text-right font-semibold">{o.cnTracking || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#2D2D2D]/45">Qty</dt>
                <dd className="font-semibold">{o.quantity ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <WarehousePill order={o} />
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="-mx-1 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[#2D2D2D]/40 [&>th]:px-3 [&>th]:pb-3 [&>th]:font-semibold">
              <th>Date</th>
              <th>PR ID</th>
              <th>Order #</th>
              <th>Product</th>
              <th className="text-center">Qty</th>
              <th>CN Tracking</th>
              <th>Warehouse</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-[#F1EFEA]">
            {rows.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-[#FAF9F6] [&>td]:px-3 [&>td]:py-3">
                <td className="whitespace-nowrap text-xs text-[#2D2D2D]/55">{fmtDay(o.orderedAt)}</td>
                <td className="whitespace-nowrap font-bold text-[#412460]">{o.jobCode || "—"}</td>
                <td className="whitespace-nowrap font-bold text-[#412460]">{o.orderNumber || "—"}</td>
                <td className="max-w-[300px]">
                  <div className="flex items-center gap-2">
                    {canShowImg(o.productImage) ? (
                      <img
                        src={o.productImage}
                        alt=""
                        loading="lazy"
                        onError={() => markImgBroken(o.productImage)}
                        className="h-8 w-8 shrink-0 rounded object-cover ring-1 ring-[#ECE9E3]"
                      />
                    ) : null}
                    <span className="truncate text-xs text-[#2D2D2D]/80">{o.productName || "—"}</span>
                  </div>
                </td>
                <td className="text-center text-[#2D2D2D]/70">{o.quantity ?? "—"}</td>
                <td className="max-w-[190px] truncate font-semibold text-[#2D2D2D]/80" title={o.cnTracking}>{o.cnTracking || "—"}</td>
                <td><WarehousePill order={o} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
