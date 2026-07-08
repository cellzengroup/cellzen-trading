import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  deleteItem,
  exportItemsCsv,
} from "../../../utils/warehouseApi";
import { downloadItemLabel, downloadRackLabel, printItemLabel } from "../../../utils/warehouseLabels";

// A scanned code is a SHELF label when it matches a location-code shape like
// CZN01-01-0001 (letters+digits - digits - digits). Everything else is a
// tracking number. (Spec regex.)
const RACK_CODE_PATTERN = /^[A-Za-z]{1,6}\d{1,4}-\d{1,4}-\d{1,6}$/;
const isShelf = (text) => RACK_CODE_PATTERN.test(String(text || "").trim());

const TABS = ["Store", "Ship", "Racks", "Dashboard", "Dispatched"];

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
function StatusBadge({ status }) {
  const shipped = status === "shipped";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
        shipped ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${shipped ? "bg-red-500" : "bg-emerald-500"}`} />
      {shipped ? "Shipped" : "In Stock"}
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

export default function WarehouseApp() {
  const navigate = useNavigate();

  const [racks, setRacks] = useState([]);
  const [items, setItems] = useState([]);
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
    savedTimer.current = setTimeout(() => setSavedItem(null), 3500);
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
      const [r, it] = await Promise.all([loadRacks(), loadItems()]);
      setRacks(r);
      setItems(it);
    } catch (e) {
      setError(e.message || "Failed to load warehouse data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data once when authed. Logged-out visitors are handled by the
  // synchronous redirect guard below (before the RENDER return), so the
  // warehouse panel never flashes before the login page.
  useEffect(() => {
    if (localStorage.getItem("staff_token")) loadData();
  }, [loadData]);

  // Standalone /warehouse isn't covered by the global auth:expired redirect, so
  // handle it here.
  useEffect(() => {
    const onExpired = () => navigate("/staff-login?next=/warehouse", { replace: true });
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [navigate]);

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

  const findItem = useCallback(
    (codeOrTracking) => {
      const c = String(codeOrTracking || "").trim().toLowerCase();
      if (!c) return null;
      return (
        items.find(
          (i) => i.code.toLowerCase() === c || (i.trackingNumber || "").toLowerCase() === c
        ) || null
      );
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
        const item = await putAwayItem(rackId, String(tracking).trim().toUpperCase());
        setItems((prev) => [item, ...prev]);
        setFeed((prev) => [item, ...prev].slice(0, 8));
        upsertRack({ id: item.rackId, note: "", createdAt: item.createdAt });
        showSaved(item);
      } catch (e) {
        showToast(e.message || "Failed to store item", e.status === 409 ? "warn" : "error");
      }
    },
    [showToast, upsertRack, showSaved]
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
        showToast("Scan a shelf label first, e.g. CZN01-01-0001", "error");
        return;
      }
      await storeTracking(activeShelfRef.current, t);
    },
    [showToast, storeTracking, upsertRack]
  );

  const handleManualSave = async () => {
    const rackId = (manualRackText.trim() || manualRackSelect).trim().toUpperCase();
    const tracking = manualTracking.trim();
    if (!rackId) return showToast("Enter or choose a shelf first.", "error");
    if (!isShelf(rackId)) return showToast("Shelf must look like CZN01-01-0001 (letters-digits-digits).", "error");
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
            if (e.target.value) setManualRackText("");
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
          placeholder="e.g. CZN01-01-0001"
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

  const handleShip = async (item) => {
    try {
      const updated = await shipItem(item.id);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setShipSelectedId(null); // it leaves Ship and appears in Dispatched
      showToast(`${updated.code} marked shipped`, "ok");
    } catch (e) {
      showToast(e.message || "Failed to mark shipped", "error");
    }
  };

  // Print / download a label for an item (Store, Ship, Dispatched rows).
  const handlePrintLabel = async (item) => {
    try {
      const how = await printItemLabel(item);
      if (how === "queued") showToast("Sent to the warehouse printer ✓", "ok");
    } catch (e) {
      showToast(e.message || "Print failed", "error");
    }
  };
  const handleDownloadLabel = (item) =>
    downloadItemLabel(item).catch((e) => showToast(e.message || "Download failed", "error"));

  // Item detail card — shared by the Ship (in-stock) and Dispatched (shipped) tabs.
  const detailCard = (item) => (
    <div className="mb-5">
      <div className={LABEL_CARD}>
        <div className="-mx-5 -mt-5 mb-4 h-3 opacity-55" style={BARCODE_STRIP} />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#2D2D2D]/45">Item</div>
            <div className="mt-0.5 truncate text-2xl font-black tracking-tight">{item.code}</div>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Shelf</dt>
                <dd className="font-semibold">{item.rackId || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Tracking</dt>
                <dd className="min-w-0 break-all font-semibold">{item.trackingNumber}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Stored</dt>
                <dd>{fmtDate(item.createdAt)}{item.createdByName ? ` · ${item.createdByName}` : ""}</dd>
              </div>
              {item.status === "shipped" && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Shipped</dt>
                  <dd>{fmtDate(item.shippedAt)}{item.shippedByName ? ` · ${item.shippedByName}` : ""}</dd>
                </div>
              )}
            </dl>
            <div className="mt-3">
              <StatusBadge status={item.status} />
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-white p-2.5 shadow-sm">
            <Barcode text={item.code} className="w-56 sm:w-80" />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.status === "in_stock" && (
          <button type="button" onClick={() => handleShip(item)} className={BTN_PRIMARY}>
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

  // ==================================================== SHARED CAMERA
  const openScanner = useCallback(() => setScanOpen(true), []);

  // In the Racks tab a scanned code is treated as a shelf label to add.
  const handleScanAddShelf = useCallback(
    async (text) => {
      const t = String(text || "").trim().toUpperCase();
      if (!t) return;
      if (!isShelf(t)) {
        showToast(`Not a shelf label: ${t} — shelves look like CZN01-01-0001.`, "error");
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
    [racks, showToast, upsertRack]
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
      } else {
        // Ship + Dashboard → locate the item
        doLookup(text);
        setScanOpen(false);
      }
    },
    [tab, handleStoreDecode, handleScanAddShelf, doLookup]
  );

  const scanHint = {
    Store: "Scan a shelf, then scan boxes",
    Ship: "Scan any code to locate it",
    Racks: "Scan a shelf label to add it",
    Dashboard: "Scan any code to find it",
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

  const handleAddRack = async () => {
    const id = newRackName.trim().toUpperCase();
    if (!id) return;
    if (!isShelf(id)) return showToast("Shelf must look like CZN01-01-0001 (letters-digits-digits).", "error");
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
      showToast(`${item.code} deleted`, "ok");
    } catch (e) {
      showToast(e.message || "Unable to delete item", "error");
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
    return rows.filter(
      (i) =>
        i.code.toLowerCase().includes(f) ||
        (i.trackingNumber || "").toLowerCase().includes(f) ||
        (i.rackId || "").toLowerCase().includes(f)
    );
  }, [items, dashSearch]);

  const filteredShip = useMemo(() => {
    const f = shipSearch.trim().toLowerCase();
    const rows = items
      .filter((i) => i.status === "in_stock")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!f) return rows;
    return rows.filter(
      (i) =>
        i.code.toLowerCase().includes(f) ||
        (i.trackingNumber || "").toLowerCase().includes(f) ||
        (i.rackId || "").toLowerCase().includes(f)
    );
  }, [items, shipSearch]);

  const [dispatchSearch, setDispatchSearch] = useState("");
  const filteredDispatched = useMemo(() => {
    const f = dispatchSearch.trim().toLowerCase();
    const rows = items
      .filter((i) => i.status === "shipped")
      .sort((a, b) => new Date(b.shippedAt || b.createdAt) - new Date(a.shippedAt || a.createdAt));
    if (!f) return rows;
    return rows.filter(
      (i) =>
        i.code.toLowerCase().includes(f) ||
        (i.trackingNumber || "").toLowerCase().includes(f) ||
        (i.rackId || "").toLowerCase().includes(f)
    );
  }, [items, dispatchSearch]);

  // Synchronous auth gate: redirect DURING render (not in an effect) so a
  // logged-out visitor goes straight to the login without the warehouse panel
  // flashing first. Placed after all hooks to respect the Rules of Hooks.
  if (typeof window !== "undefined" && !localStorage.getItem("staff_token")) {
    return <Navigate to="/staff-login?next=/warehouse" replace />;
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
                <h1 className="text-base font-bold leading-tight text-[#2D2D2D]">Warehouse</h1>
                <p className="text-[11px] text-[#2D2D2D]/45">Scan &amp; locate · shared for all staff</p>
              </div>
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
        {tab === "Dashboard" && (
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
                  Scan a shelf, then scan boxes — they'll appear here.
                </p>
              ) : (
                <div className="-mx-1 overflow-x-auto">
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
              <SearchInput
                value={shipSearch}
                onChange={(v) => { setShipSearch(v); setShipSelectedId(null); }}
                onEnter={doLookup}
                placeholder="Search code, tracking, or shelf"
              />
            </div>

            {shipSelected?.status === "in_stock" && detailCard(shipSelected)}

            <ItemsTable
              rows={filteredShip}
              onView={openDetail}
              onPrint={handlePrintLabel}
              onDownload={handleDownloadLabel}
              emptyAll={items.every((i) => i.status !== "in_stock")}
              emptyText="Nothing in stock to ship — put items away in the Store tab."
            />
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
                  placeholder="Shelf ID, e.g. CZN01-01-0001"
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#2D2D2D]/45">Shelf</div>
                        <div className="mt-0.5 truncate text-lg font-black tracking-tight">{r.id}</div>
                      </div>
                      <div className="shrink-0 rounded-lg bg-white p-2 shadow-sm">
                        <Barcode text={r.id} className="w-44 sm:w-56" />
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
            <div className="mb-4">
              <SearchInput
                value={dispatchSearch}
                onChange={(v) => { setDispatchSearch(v); setShipSelectedId(null); }}
                placeholder="Search dispatched by code, tracking, or shelf…"
              />
            </div>
            {shipSelected?.status === "shipped" && detailCard(shipSelected)}
            <ItemsTable
              rows={filteredDispatched}
              withDate
              onView={openDetail}
              onPrint={handlePrintLabel}
              onDownload={handleDownloadLabel}
              onDelete={(it) => setItemDeleteTarget(it)}
              emptyAll={items.every((i) => i.status !== "shipped")}
              emptyText="Nothing dispatched yet — mark items shipped from the Ship tab."
            />
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
            <h3 className="text-base font-bold">Delete {itemDeleteTarget.code}?</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              Removes this dispatched record ({itemDeleteTarget.trackingNumber}). This can't be undone.
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

      {/* rack delete confirm */}
      {rackDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <IconTrash className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">Delete shelf {rackDeleteTarget}?</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">This can't be undone.</p>
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
                  <p className="mt-1 text-center text-xs text-white/45">Then scan each box's tracking barcode</p>
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
          >
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
              <IconCheck className="h-7 w-7" />
            </span>
            <h3 className="text-center text-lg font-bold">Item stored</h3>
            <p className="mt-1 text-center text-xs font-semibold text-[#412460]">{savedItem.code}</p>
            <dl className="mt-5 divide-y divide-[#F1EFEA] text-sm">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[#2D2D2D]/50">Shelf</dt>
                <dd className="font-semibold">{savedItem.rackId || "—"}</dd>
              </div>
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
            <button
              type="button"
              onClick={() => setSavedItem(null)}
              className="mt-6 w-full rounded-full bg-[#412460] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#B99353] active:scale-[.98]"
            >
              OK
            </button>
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
function ItemsTable({ rows, onView, withDate = false, emptyAll = false, emptyText, onDelete, onPrint, onDownload }) {
  if (!rows || rows.length === 0) {
    return (
      <EmptyState>
        {emptyAll ? (emptyText || "Nothing stored yet — scan an item in the Store tab.") : "No items match that search."}
      </EmptyState>
    );
  }
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.12em] text-[#2D2D2D]/40 [&>th]:px-3 [&>th]:pb-3 [&>th]:font-semibold">
            <th>Code</th>
            <th>Tracking</th>
            <th>Shelf</th>
            <th>Status</th>
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
              <td className="font-bold text-[#412460]">{it.code}</td>
              <td className="max-w-[220px] truncate text-[#2D2D2D]/80">{it.trackingNumber}</td>
              <td>
                <span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-medium text-[#2D2D2D]/70">
                  {it.rackId}
                </span>
              </td>
              <td>
                <StatusBadge status={it.status} />
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
                  {!onPrint && !onDownload && !onDelete && (
                    <IconChevron className="h-4 w-4 text-[#2D2D2D]/25" />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
