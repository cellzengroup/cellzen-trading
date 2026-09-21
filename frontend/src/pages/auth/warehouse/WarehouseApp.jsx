import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { createPortal } from "react-dom";
import WarehouseScanner from "./WarehouseScanner";
import Barcode from "./Barcode";
import QcSourceSheet from "./QcSourceSheet";
import {
  loadRacks,
  createRack,
  deleteRack,
  loadItems,
  putAwayItem,
  shipItem,
  updateItemShipmentMode,
  updateItemShipmentModeWithOrders,
  deleteItem,
  exportItemsCsv,
  loadSupplierOrders,
  updateSupplierShipMode,
  updateSupplierKg,
  updateParcelKg,
  syncSupplierOrders,
  exportSupplierOrdersXlsx,
  exportSupplierOrdersPdf,
  exportBillingReportXlsx,
  goodsCode,
  productCodes,
  parcelLineIds,
  itemIds,
  resolveItem,
} from "../../../utils/warehouseApi";
import { downloadItemLabel, downloadRackLabel, printItemLabel } from "../../../utils/warehouseLabels";
import { readPackingListIds } from "../../../utils/packingListImport";
import {
  QC_MAX_IMAGES, useQcImages, addQcImage, retryQcImage, removeQcImage, refreshQcImages, qcCountFor,
  seedQcImages, prefetchQcImages, qcHasPhoto,
} from "../../../utils/qcImages";

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
// a search matches. Every id the box answers to (itemIds — the goods id printed
// on it, the other products in the same parcel, the box id, the PR id and the
// internal CZN code), plus the 1688 order #, the tracking number and the shelf.
// A product id read off the China Operations table has to land here whether or
// not it is the one the label happens to print.
const itemMatches = (i, f) =>
  itemIds(i).some((id) => id.includes(f)) ||
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
// Can this 1688 row be shipped straight from the 1688 panel? Only if its CN
// tracking is matched to a box that is still ON THE SHELF — "Not Yet" and
// "Pending" have no box to ship at all, and "Dispatched" already left. Deliberately
// checks `warehouseItemId` too: without the id there's nothing to POST /ship to,
// which is exactly the state a page served by an older backend build is in.
const supplierShippable = (o) =>
  !!o.warehouseItemId && o.inWarehouse && o.warehouseStatus === "in_stock";

// Every id a packing list can name this 1688 row by, uppercased for matching.
//
// The order matters as documentation, not as precedence — it is the SAME
// fallback chain the export's "Goods No." column walks (see packingRowValues in
// backend/inventory/routes/supplierOrders.js): the line's own gtradea item code
// first, then the codes the matched box carries. All of them are accepted rather
// than just the current one, so a sheet exported months ago — before item codes
// existed, when the column still held a PR id or the internal CZN number — still
// ticks its rows today.
const supplierRowIds = (o) =>
  [o.itemCode, o.jobCode, o.warehouseItemCode, o.warehousePrCode, o.warehouseCode]
    .filter(Boolean)
    .map((c) => String(c).trim().toUpperCase());
const supplierOrderId = (o) => String(o.orderNumber || "").trim().toUpperCase();

// A 1688 row rendered as the warehouse item it matched, for the ship confirm.
// Used only as a FALLBACK when the box isn't in the loaded `items` list (a
// background refresh hasn't landed yet) — the row already carries every field
// that dialog shows, so the ship still goes through with the right details
// rather than a half-empty card.
const supplierAsItem = (o) => ({
  id: o.warehouseItemId,
  code: o.warehouseCode,
  // The row's own item code first: this IS the procurement line, so it names the
  // exact item, where the box it matched only carries whichever code won for a
  // shared parcel.
  itemCode: o.itemCode || o.warehouseItemCode,
  boxCode: o.warehouseBoxCode,
  prCode: o.warehousePrCode,
  trackingNumber: o.cnTracking,
  rackId: o.warehouseRack,
  shipmentFrom: o.warehouseShipmentFrom,
  status: "in_stock",
});

// The lists say which QC photos each parcel has (ids only): hand that to the photo
// store so a parcel's popup already has its photos when it is tapped.
const seedQc = (rows, trackingOf) => {
  for (const r of rows) if (r && r.qcImageIds) seedQcImages(trackingOf(r), r.qcImageIds);
};

// The key a parcel's weight saves queue under: its CN tracking number, or — for a
// 1688 line that has none yet, which is its own parcel — the line itself.
const kgKeyOf = (tracking, id) => {
  const t = String(tracking || "").trim().toUpperCase();
  return t ? `t:${t}` : id ? `i:${id}` : "";
};

// A box the server has just described, with any weight typed on screen that has
// not finished saving laid over it: the reply predates that save, so its own kg is
// the old one, and taking it would wipe the field the user just filled.
const withPendingKg = (item, pending) => {
  const key = kgKeyOf(item?.trackingNumber);
  return key && pending.has(key) ? { ...item, kg: pending.get(key) } : item;
};

// What a put-away of `code` will most likely store, worked out from the 1688
// orders already loaded in the page — so the "Item stored" sheet can show the
// product the instant a code is read instead of after the server round trip.
// Mirrors the server's picks in POST /items (backend/inventory/routes/warehouse.js):
// the code as a CN tracking number first, then as a goods id; the parcel's lines
// ordered by item code with blanks last; the box's id and mode from that first
// line; one product per distinct item, quantities summed. The server's reply
// replaces all of it the moment it lands, so a stale list can only make the
// preview briefly wrong, never the stored box.
function previewPutAway(orders, code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c || !orders?.length) return null;
  const byTracking = (t) => orders.filter((o) => (o.cnTracking || "").toUpperCase() === t);
  let lines = byTracking(c);
  if (!lines.length) {
    const byGoods = orders.find((o) => o.cnTracking && (o.itemCode || "").toUpperCase() === c);
    if (byGoods) lines = byTracking(byGoods.cnTracking.toUpperCase());
  }
  if (!lines.length) return null;
  // The server's order exactly (parcelLines): item code with blanks last, then
  // order number, then id — so two lines sharing an item code preview the same
  // order # the box will really get.
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  lines = [...lines].sort((a, b) => {
    if (a.itemCode && b.itemCode) {
      const byCode = cmp(a.itemCode, b.itemCode);
      if (byCode) return byCode;
    } else if (a.itemCode || b.itemCode) {
      return a.itemCode ? -1 : 1;
    }
    return cmp(a.orderNumber || "", b.orderNumber || "") || cmp(String(a.id), String(b.id));
  });
  const products = [];
  for (const o of lines) {
    const qty = Number.isFinite(o.quantity) ? o.quantity : null;
    const same = products.find((p) => p.itemCode === o.itemCode && p.name === o.productName && p.image === o.productImage);
    if (same) {
      if (qty !== null) same.quantity = (same.quantity || 0) + qty;
    } else {
      products.push({ itemCode: o.itemCode, name: o.productName, image: o.productImage, quantity: qty });
    }
  }
  const first = lines[0];
  return {
    trackingNumber: first.cnTracking.toUpperCase(),
    itemCode: first.itemCode || "",
    orderNumber: first.orderNumber,
    productName: first.productName,
    // The parcel's weight, when it has been weighed — every line carries it.
    kg: lines.find((o) => o.kg != null)?.kg ?? null,
    products,
    // The parcel travels as one box: By Land if ANY line has to, as put-away
    // decides it — not just the first line's mode.
    shipmentFrom: lines.some((o) => o.shipMode === "land") ? "By Land" : "By Air",
  };
}

// The 1688 panel's two dropdowns — "Sort by" and, to its right, "Mode". Both are
// FILTERS and they STACK: Received + By Air leaves exactly the received orders that
// still have to fly, which is the whole reason the pair exists. Narrowing rather
// than re-ordering also keeps rows still — nothing shuffles position under the
// viewer mid-poll, a row only enters or leaves the set it belongs to, and whatever
// is left stays in the server's newest-first order.
//
// Shared convention: the option with NO `match` is that dropdown's "everything"
// choice. Both the filter and the counts read an option through `supplierMatcher`,
// so a label can never advertise a count the filter then disagrees with.
const SUPPLIER_SORTS = [
  { value: "date", label: "Date" }, // no `match`: every state
  { value: "received", label: "Received", match: (o) => supplierState(o) === "received" },
  { value: "dispatched", label: "Dispatched", match: (o) => supplierState(o) === "dispatched" },
  { value: "not_updated", label: "Not Yet", match: (o) => supplierState(o) === "not_updated" },
  { value: "not_received", label: "Pending", match: (o) => supplierState(o) === "not_received" },
];

// Mirrors the server's EXPORT_MODES (backend/inventory/routes/supplierOrders.js):
// land is the explicit value and air is everything else, so the two counts always
// add up — a row with no mode recorded still lands in exactly one of them.
const SUPPLIER_MODES = [
  { value: "all", label: "All modes" }, // no `match`: both
  { value: "land", label: "By Land", match: (o) => o.shipMode === "land" },
  { value: "air", label: "By Air", match: (o) => o.shipMode !== "land" },
];

// One look for both dropdowns — they sit side by side, so any drift between them
// would read as an accident.
const FILTER_LABEL = "text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/45";
const FILTER_SELECT =
  "rounded-full bg-white py-2.5 pl-3 pr-7 text-xs font-semibold text-[#2D2D2D]/70 ring-1 ring-[#E6E2DB] transition-all focus:outline-none focus:ring-2 focus:ring-[#412460]/30";

const MATCH_ALL = () => true;
// Any option — including a stored value that no longer exists — as a predicate. An
// unknown value resolves to "everything" rather than silently emptying the table.
const supplierMatcher = (options, value) =>
  options.find((o) => o.value === value)?.match || MATCH_ALL;

// The three slices the packing-list export offers. `match` mirrors the server's
// EXPORT_SCOPES in backend/inventory/routes/supplierOrders.js — it exists only
// so the panel can show how many rows each choice will produce BEFORE the user
// waits on a download; the server re-applies the real filter either way.
const EXPORT_SCOPES = [
  {
    value: "all",
    label: "Export All",
    hint: "Every 1688 order, whatever its warehouse state.",
    match: () => true,
  },
  {
    value: "received",
    label: "Received Only",
    hint: "Goods on the shelf right now — the list you can actually pack.",
    match: (o) => o.inWarehouse && o.warehouseStatus === "in_stock",
  },
  {
    value: "not_arrived",
    label: "Not Arrived Yet",
    hint: "Ordered but never scanned in — the chase list. Dispatched goods aren't here; they did arrive.",
    match: (o) => !o.inWarehouse,
  },
];

// The carriers offered in the Ship dialog's logistics dropdown. Suggestions,
// not a whitelist — SearchSelect keeps `allowCustom`, and the backend still
// takes any non-empty name, so a one-off carrier can be typed straight in
// without a code change. Cellzen Trading leads: it's the in-house fleet and the
// most common answer.
const LOGISTICS_CARRIERS = ["Cellzen Trading", "RK Logistics", "FR Logistics"];

// The second cut the export offers, across whichever scope is picked: how the
// goods travel. Air and land cargo leave on separate consignments, so the list
// is usually pulled one mode at a time. `match` mirrors the server's
// EXPORT_MODES — same "anything not land is air" reading as unwrapSupplierOrder,
// so no row is missing from both lists.
const EXPORT_MODES = [
  { value: "all", label: "Air + Land", hint: "Both modes", match: () => true },
  { value: "air", label: "By Air", hint: "General cargo", match: (o) => o.shipMode !== "land" },
  { value: "land", label: "By Land", hint: "Restricted goods", match: (o) => o.shipMode === "land" },
];

// A row's gtradea order date as a UTC calendar day (YYYY-MM-DD), which is both
// what the table's Date column shows and what the server's from/to compare
// against — so a range picked here selects exactly the rows the user can see.
const orderDay = (o) => {
  if (!o.orderedAt) return "";
  const d = new Date(o.orderedAt);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

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
const IconImage = (p) => (<svg {...svgBase} {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>);
const IconKeyboard = (p) => (<svg {...svgBase} {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>);
const IconClose = (p) => (<svg {...svgBase} strokeWidth="2.2" {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>);
const IconReport = (p) => (<svg {...svgBase} {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M9 17v-4" /><path d="M12 17v-6" /><path d="M15 17v-2" /></svg>);
const IconTruck = (p) => (<svg {...svgBase} {...p}><path d="M14 17V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1" /><path d="M9 17h5" /><path d="M18 17h2a1 1 0 0 0 1-1v-3.3a1 1 0 0 0-.2-.6l-2.9-3.7A1 1 0 0 0 17 8h-3" /><circle cx="7" cy="17.5" r="2" /><circle cx="16" cy="17.5" r="2" /></svg>);
// The mirror of IconDownload — an arrow going INTO the tray. The Excel import
// and the packing-list export sit next to each other, so the two have to read as
// opposite directions of one thing rather than two unrelated glyphs.
const IconUpload = (p) => (<svg {...svgBase} {...p}><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M5 21h14" /></svg>);
const IconSheet = (p) => (<svg {...svgBase} {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>);

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

// The By Air / By Land switch in the "Item stored" sheet's Mode of shipment row
// — pill-sized, to sit on the right like the other rows' values. Two buttons
// rather than the <select> the 1688 panel uses: the keyboard-wedge listener
// ignores keystrokes while a <select> has focus, so a dropdown opened and then
// dismissed with Esc would swallow the next box's scan.
//
// Never disabled and no colour transition: a pick shows the moment it's tapped
// and the save runs behind it (see changeSavedItemMode).
function ShipModeToggle({ value, onChange }) {
  const land = value === "By Land";
  return (
    <div role="radiogroup" aria-label="Shipment mode" className="inline-flex shrink-0 gap-0.5 rounded-full bg-[#F6F4F0] p-0.5">
      {[
        { mode: "By Air", on: !land, tone: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
        { mode: "By Land", on: land, tone: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
      ].map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={o.on}
          onClick={() => onChange(o.mode)}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide active:scale-[.97] ${
            o.on ? `${o.tone} shadow-sm ring-1` : "text-[#2D2D2D]/45 hover:text-[#2D2D2D]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${o.on ? o.dot : "bg-[#2D2D2D]/25"}`} />
          {o.mode}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ QC images ------------------------------ */
// Does this device have a camera-and-finger kind of screen (a phone, a tablet)? Then
// "Upload image" offers Take photo / Choose from gallery. A desktop has no camera to
// open and no gallery: there it goes straight to the file manager. Asked when the
// button is pressed, so a window dragged between screens is judged by what it is now.
const isTouchDevice = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

// A goods number that opens the QC photos saved for it. Dotted underline and a
// small picture icon say it can be tapped; the tap never reaches the card or row
// the number sits in (those open their own detail). `tracking` lets it start
// fetching the photo files the moment a finger or the pointer is on it — before the
// tap has even landed — so they are there when the popup opens. `icon={false}`
// leaves the picture icon off (the 1688 panel shows just the number).
function GoodsNo({ code, onOpen, className = "", tracking, icon = true }) {
  if (!code) return <span className={className}>—</span>;
  if (!onOpen) return <span className={`break-all ${className}`}>{code}</span>;
  const warm = () => { if (tracking) prefetchQcImages(tracking); };
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onPointerDown={warm}
      onMouseEnter={warm}
      title="View QC images"
      className={`inline-flex max-w-full items-center gap-1.5 text-left underline decoration-[#412460]/35 decoration-dotted underline-offset-4 transition active:opacity-60 ${className}`}
    >
      <span className="break-all">{code}</span>
      {icon && <IconImage className="h-3.5 w-3.5 shrink-0 opacity-60" />}
    </button>
  );
}

// The QC photos of one parcel: up to TWO, added from the camera or the gallery,
// shrunk to 50% JPEG quality on the way (utils/qcImages.js) and saved against the
// parcel's tracking number. Three shapes:
//   - "sheet" (the "Item stored" popup): just an Upload image button on the left
//     and, once photos are added, up to two small thumbnails on the right — no box
//     around it, no heading. Tapping a thumbnail opens the popup with the photos.
//   - "viewer": the same button with the photos below it, inside the photo popup.
//     Tapping a photo enlarges it in place; nothing opens in a new tab.
//   - "gate" (the "QC Image Upload" popup shown before a label prints without any
//     photo): only the button, one photo at a time — `onAdded` is what carries on.
//
// A photo is on screen the moment it is chosen (see addQcImage): a small spinner
// while it is sent, a red "Retry" if it could not be saved. `onAdded` gets
// { key, done } straight away — it does not wait for the upload.
//
// Removing is a two-tap: the first tap on a photo's ✕ arms it ("Remove?"), the
// second removes — a mis-tap on a phone should not throw a photo away.
function QcImages({ tracking, notify, variant = "sheet", onOpen, onAdded, disabled = false, label = "Upload image" }) {
  const { images, status, error, refresh } = useQcImages(tracking);
  const [menu, setMenu] = useState(false);
  const [armed, setArmed] = useState(null);
  const [zoom, setZoom] = useState(null); // viewer: the photo enlarged in place
  const camera = useRef(null);
  const gallery = useRef(null);
  const viewer = variant === "viewer";
  const gate = variant === "gate";
  const full = images.length >= QC_MAX_IMAGES;

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  // Synchronous on purpose: each photo is added (and shown) before this returns.
  const take = (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setMenu(false);
    // As many as the box has room for; the rest are left out, and it says so.
    const room = Math.max(0, QC_MAX_IMAGES - images.length);
    if (files.length > room) notify(`Only ${QC_MAX_IMAGES} QC images per box`, "warn");
    for (const file of files.slice(0, room)) {
      let added;
      try {
        added = addQcImage(tracking, file);
      } catch (e) {
        notify(e.message || "Couldn't use that photo", "error");
        continue;
      }
      if (onAdded) onAdded(added);
      // Reported here, not left to the caller: by the time it fails the popup that
      // asked for the photo may be gone.
      added.done.catch((e) => notify(`QC photo not saved — ${e.message || "please try again"}. Open the goods number to add it again.`, "error"));
    }
  };

  const remove = async (img) => {
    if (armed !== img.key) { setArmed(img.key); return; }
    setArmed(null);
    try {
      await removeQcImage(tracking, img.key);
    } catch (e) {
      notify(e.message || "Couldn't remove the photo", "error");
    }
  };
  const retry = (img) => {
    retryQcImage(tracking, img.key).catch((e) => notify(`QC photo not saved — ${e.message || "please try again"}`, "error"));
  };

  // `small` is the thumbnail's: a ✕ pinned to its corner, which once armed turns the
  // whole thumbnail into a red "Remove?" so there is something big enough to tap.
  const removeButton = (img, small) =>
    armed === img.key ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); remove(img); }}
        aria-label="Tap again to remove this photo"
        className={
          small
            ? "absolute inset-0 flex items-center justify-center rounded-xl bg-red-600/90 text-[10px] font-bold text-white"
            : "absolute right-1.5 top-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow"
        }
      >
        Remove?
      </button>
    ) : (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); remove(img); }}
        aria-label="Remove this photo"
        className={
          small
            ? "absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#2D2D2D] text-white shadow ring-2 ring-white"
            : "absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white shadow"
        }
      >
        <IconClose className="h-3 w-3" />
      </button>
    );

  const spinner = (
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#412460]/20 border-t-[#412460]" />
  );

  return (
    <div>
      {/* Upload image on the left; on the sheet the photos (small) on the right. */}
      <div className={gate ? "flex justify-center" : "flex items-center justify-between gap-3"}>
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => {
            if (isTouchDevice()) { setMenu(true); return; }
            // Desktop: no "Take photo" step — straight to the file manager.
            setMenu(false);
            if (gallery.current) gallery.current.click();
          }}
          aria-haspopup="dialog"
          aria-expanded={menu}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#412460] font-semibold text-white transition active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[#2D2D2D]/15 disabled:text-[#2D2D2D]/40 ${
            gate ? "px-6 py-3 text-sm" : "px-3.5 py-2 text-xs"
          }`}
        >
          <IconUpload className="h-3.5 w-3.5" />
          {label}
        </button>
        {variant === "sheet" && (
          <div className="flex items-center gap-2.5">
            {images.map((img, i) => (
              <div key={img.key} className="relative h-14 w-14 shrink-0">
                <button
                  type="button"
                  onClick={() => (img.status === "failed" ? retry(img) : onOpen && onOpen(i))}
                  aria-label={img.status === "failed" ? `Retry QC image ${i + 1}` : `Open QC image ${i + 1}`}
                  className="block h-full w-full overflow-hidden rounded-xl ring-1 ring-[#ECE9E3]"
                >
                  <img src={img.url} alt={`QC image ${i + 1}`} decoding="async" className="h-full w-full object-cover" />
                </button>
                {img.status === "saving" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/50">{spinner}</span>
                )}
                {img.status === "failed" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-red-600/80 text-[10px] font-bold text-white">Retry</span>
                )}
                {removeButton(img, true)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The choice the upload button opens, as a sheet sliding up from the bottom:
          the phone's camera, or its gallery. `capture` on the first input is what
          makes it open the camera straight away. */}
      <QcSourceSheet
        open={menu && !full}
        onClose={() => setMenu(false)}
        options={[
          { label: "Take a photo", icon: <IconCamera className="h-5 w-5" />, onSelect: () => camera.current && camera.current.click() },
          { label: "Choose from gallery", icon: <IconImage className="h-5 w-5" />, onSelect: () => gallery.current && gallery.current.click() },
        ]}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
        aria-label="Take a QC photo"
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple={!gate}
        className="hidden"
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
        aria-label="Choose QC photos from the gallery"
      />

      {status === "error" && !images.length && !gate && (
        <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-100">
          {error || "Couldn't load the QC images."}{" "}
          <button type="button" onClick={refresh} className="font-semibold underline">Retry</button>
        </p>
      )}

      {/* Viewer only: the photos under the button — side by side where there is room,
          one enlarged in place when tapped. Never a new tab. */}
      {viewer && !(status === "error" && !images.length) && (
        images.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#F6F4F0] px-4 py-8 text-center text-xs text-[#2D2D2D]/45">
            {status === "ready" ? "No QC images saved for this box yet — use Upload image." : "Loading photos…"}
          </p>
        ) : (
          <div className={`mt-4 grid gap-4 ${zoom ? "" : "sm:grid-cols-2"}`}>
            {images.map((img, i) => (zoom && img.key !== zoom ? null : (
              <figure
                key={img.key}
                data-qc-index={i}
                onClick={() => setZoom(zoom === img.key ? null : img.key)}
                className={`relative min-h-[8rem] overflow-hidden rounded-2xl bg-[#EFEDE8] ring-1 ring-[#ECE9E3] ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
              >
                <img
                  src={img.url}
                  alt={`QC image ${i + 1}`}
                  decoding="async"
                  fetchPriority="high"
                  className={`w-full object-contain ${zoom ? "max-h-[72vh]" : "max-h-[60vh]"}`}
                />
                {img.status === "saving" && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 flex justify-center bg-white/70 py-1.5 text-[11px] font-semibold text-[#412460]">Saving…</span>
                )}
                {img.status === "failed" && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); retry(img); }}
                    className="absolute inset-x-0 top-0 bg-red-600/90 py-1.5 text-center text-[11px] font-bold text-white"
                  >
                    Not saved — tap to retry
                  </button>
                )}
                {removeButton(img, false)}
                <figcaption className="px-3 py-2 text-[11px] text-[#2D2D2D]/50">
                  Photo {i + 1}{img.createdByName ? ` · ${img.createdByName}` : ""} · {zoom ? "tap to shrink" : "tap to enlarge"}
                </figcaption>
              </figure>
            )))}
          </div>
        )
      )}
    </div>
  );
}

// The saved QC photos of a box in a POPUP — what opens when its goods number (or a
// 1688 card / order number) is tapped. It opens at once: its photos are already in
// the store (seeded from the list that showed the number), and the files were
// fetched when the finger touched down. Uploading and removing work here too, so a
// photo can be added later, not only while the "Item stored" sheet is up.
function QcViewer({ target, onClose, notify }) {
  useEffect(() => { prefetchQcImages(target.tracking); refreshQcImages(target.tracking); }, [target.tracking]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Land on the photo that was tapped, once the photos are on screen.
  const body = useRef(null);
  const { images } = useQcImages(target.tracking);
  useEffect(() => {
    if (!target.index || !body.current) return;
    const el = body.current.querySelector(`[data-qc-index="${target.index}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [target.index, images.length]);
  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`QC images for ${target.goodsNo}`}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[#F6F4F0] text-[#2D2D2D] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/45">QC images</p>
            <p className="break-all text-lg font-black tracking-tight text-[#412460]">{target.goodsNo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2D2D2D]/8 text-[#2D2D2D] transition hover:bg-[#2D2D2D]/15"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <div ref={body} className="flex-1 overflow-y-auto px-5 pb-6">
          <QcImages tracking={target.tracking} notify={notify} variant="viewer" />
        </div>
      </div>
    </div>,
    document.body
  );
}

// "QC Image Upload" — what comes up when a label is about to print (or the sheet be
// closed) and the box has no QC photo yet. One button: Upload an image. The photo is
// MANDATORY — there is no way past this except a photo: a photo added here is what
// carries the action on (the label prints straight away, the photo is sent behind
// it), and the ✕ only backs out of the action altogether (nothing prints, nothing
// closes). Every path that would let a GtradeA box through without a photo — Print,
// Choose copies, OK, tapping outside the sheet, its auto-close — comes through here.
function QcGate({ target, onClose, onUploaded, notify }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="QC image upload"
        className="relative w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-2xl sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#2D2D2D]/8 text-[#2D2D2D] transition hover:bg-[#2D2D2D]/15"
        >
          <IconClose className="h-4 w-4" />
        </button>
        <p className="pr-10 text-base font-bold">QC Image Upload</p>
        <p className="mt-1 pr-10 text-xs text-[#2D2D2D]/55">
          {target.goodsNo ? `${target.goodsNo} has no QC photo yet.` : "This box has no QC photo yet."}{" "}
          A QC photo is required.{" "}
          {target.kind === "copies" ? "Upload one, then choose the copies." : "Upload one and the label prints."}
        </p>
        <div className="mt-6">
          <QcImages tracking={target.tracking} notify={notify} variant="gate" label="Upload an image" onAdded={onUploaded} />
        </div>
      </div>
    </div>,
    document.body
  );
}

// A product photo URL that is safe to put in an href. The photo comes from
// gtradea, not from us, so only a real http(s) address becomes a link — a
// `javascript:` value would otherwise run on click. Protocol-relative URLs
// (//cbu01.alicdn.com/…) are pinned to https so the new tab doesn't depend on
// the page's own scheme.
const productPhotoUrl = (url) => {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.startsWith("//") ? `https:${s}` : s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
};

// The products inside a box that was just put away — photo + name for each, so
// whoever is at the shelf can check the goods in hand against the order.
//
// On a DESKTOP, clicking the photo or the name opens the photo on its own in a new
// tab, and hovering the name shows the whole description in a tooltip.
//
// On a PHONE (a touch screen: no hover, and the name used to send you off to the
// photo) the card works the other way round: tapping the PHOTO still opens it, but
// tapping anywhere else on the card — the name, the ids, the empty space — shows or
// hides the product's description under it. The description is the product's full
// 1688 title, which the card clamps to two lines. The chevron on the right is the
// hint that the card can be tapped, and only touch screens show it.
//
// The <img> and both links carry no-referrer: the photos are hotlinked off
// alicdn, which 403s a Referer from our domain (see SupplierOrdersTable). For
// the links it's rel="noreferrer" that strips it from the new tab's request.
function StoredProducts({ products }) {
  const [broken, setBroken] = useState(() => new Set());
  // Phones only: the products whose description is showing (see above).
  const [openDesc, setOpenDesc] = useState(() => new Set());
  const toggleDesc = (idx) =>
    setOpenDesc((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  if (!products.length) return null;
  const single = products.length === 1;
  return (
    <div className="mt-5">
      <p className={LABEL}>{single ? "Product" : `Products · ${products.length}`}</p>
      <ul className="mt-2 space-y-2">
        {products.map((p, idx) => {
          const href = productPhotoUrl(p.image);
          const size = single ? "h-20 w-20" : "h-14 w-14";
          const photo = href && !broken.has(href) ? (
            <img
              src={href}
              alt={p.name || "Product photo"}
              referrerPolicy="no-referrer"
              onError={() => setBroken((prev) => (prev.has(href) ? prev : new Set(prev).add(href)))}
              className={`${size} rounded-xl bg-white object-cover ring-1 ring-[#ECE9E3]`}
            />
          ) : (
            <span className={`${size} flex items-center justify-center rounded-xl bg-white text-[#2D2D2D]/25 ring-1 ring-[#ECE9E3]`}>
              <IconBox className="h-6 w-6" />
            </span>
          );
          const descOpen = openDesc.has(idx);
          return (
            <li
              key={`${p.itemCode}|${idx}`}
              // Phones: a tap on the card toggles the description — except a tap on
              // the photo, which opens it. (The name's own link is stopped from
              // navigating below, so its tap lands here too.) Desktops do nothing here.
              onClick={(e) => {
                if (!isTouchDevice() || e.target.closest("[data-product-photo]")) return;
                toggleDesc(idx);
              }}
              aria-expanded={descOpen}
              className="rounded-2xl bg-[#F6F4F0] p-2.5 pointer-coarse:cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {href ? (
                  <a
                    href={href}
                    data-product-photo
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    title="Open the photo in a new tab"
                    className="shrink-0 rounded-xl transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#412460]/40"
                  >
                    {photo}
                  </a>
                ) : (
                  <span className="shrink-0">{photo}</span>
                )}
                <div className="min-w-0 flex-1">
                  {/* Two lines at rest — 1688 titles run long. Hovering the name (or
                      tabbing to it) opens a tooltip box with the whole description.
                      Below the name, not above: above, the sheet's scroll box would
                      clip a long title on the first product. Capped at the name
                      column's width so it can't push the sheet sideways on a phone,
                      and pointer-events-none so it never sits on top of a click. */}
                  <div className="group/pname relative">
                    {href ? (
                      <a
                        href={href}
                        // Phones: the name shows the description instead of going to the photo.
                        onClick={(e) => { if (isTouchDevice()) e.preventDefault(); }}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        className="line-clamp-2 break-words text-sm font-semibold text-[#2D2D2D] underline-offset-2 transition-colors hover:text-[#412460] hover:underline"
                      >
                        {p.name || "Open photo"}
                      </a>
                    ) : (
                      <p className="line-clamp-2 break-words text-sm font-semibold text-[#2D2D2D]">{p.name || "—"}</p>
                    )}
                    {p.name && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-max max-w-full break-words rounded-xl bg-[#2D2D2D] px-3 py-2 text-xs font-medium leading-snug text-white shadow-lg group-focus-within/pname:block group-hover/pname:block"
                      >
                        {p.name}
                      </span>
                    )}
                  </div>
                  {/* Under the name, both on the left: the product id, then how many
                      of it the parcel holds. */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="font-semibold text-[#412460]/80">{p.itemCode || "—"}</span>
                    <span className="text-[#2D2D2D]/50">
                      Qty <span className="font-semibold text-[#2D2D2D]/80">{p.quantity ?? "—"}</span>
                    </span>
                  </div>
                </div>
                {/* Touch screens only: the hint that the card opens its description. */}
                <IconChevron className={`hidden h-4 w-4 shrink-0 text-[#2D2D2D]/30 transition-transform pointer-coarse:block ${descOpen ? "rotate-90" : ""}`} />
              </div>
              {descOpen && (
                <div className="mt-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-[#ECE9E3]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/40">Description</p>
                  <p className="mt-1 break-words text-xs leading-snug text-[#2D2D2D]/80">{p.name || "No description for this product."}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The Mode cell in the 1688 panel: how this order has to travel, pre-filled
// from the product description by the backend's dangerous-goods classifier
// (backend/inventory/services/shipmentMode.js) and editable here.
//
// It is a real <select> rather than a badge because the classifier is not
// infallible — it reads a machine-translated marketing title, and the one
// person who can see the actual goods is the staff member looking at this row.
// The auto answer is a starting point they can always overrule.
//
// `title` carries the classifier's reasoning ("Restricted for air freight —
// Lithium battery (\"power bank\")") so hovering explains WHY a row defaulted to
// By Land, rather than leaving staff to guess whether to trust it.
function ShipModeSelect({ order, onChange, busy }) {
  const land = order.shipMode === "land";
  const manual = !!order.shipModeOverride;
  const tone = land
    ? "bg-amber-50 text-amber-700 ring-amber-200 focus:ring-amber-400/40"
    : "bg-sky-50 text-sky-700 ring-sky-200 focus:ring-sky-400/40";
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={order.shipMode}
        disabled={busy}
        onChange={(e) => onChange(order.id, e.target.value)}
        title={order.shipModeReason || undefined}
        aria-label={`Shipment mode for ${order.orderNumber || order.cnTracking || "this order"}`}
        className={`rounded-full py-1 pl-2.5 pr-6 text-[10px] font-semibold uppercase tracking-wide ring-1 transition-all focus:outline-none focus:ring-2 disabled:opacity-50 ${tone}`}
      >
        <option value="air">By Air</option>
        <option value="land">By Land</option>
      </select>
      {/* Nothing is drawn for a row the classifier decided on its own — the
          dropdown already states the mode, and labelling every untouched row
          just adds noise to a table staff scan by eye. The undo only appears
          once someone has actually overridden, which is the only case where
          there is something to undo. */}
      {manual && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange(order.id, null)}
          title={`${order.shipModeReason || ""}\n\nClick to undo this manual choice and let the mode be detected from the product again.`}
          aria-label="Undo manual shipment mode"
          className="text-xs leading-none text-[#412460]/45 transition-colors hover:text-[#412460] disabled:opacity-50"
        >
          ↺
        </button>
      )}
    </div>
  );
}

// What the weight field will hold: digits and one decimal point, nothing else —
// letters and symbols are dropped as they are typed or pasted. A comma becomes a
// point (a phone's decimal keypad gives one in many locales), and only three
// decimals are kept, because that is all the column stores.
const cleanKg = (text) => {
  let t = String(text).replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const dot = t.indexOf(".");
  if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "").slice(0, 3);
  return t.slice(0, 10);
};

// The weight field — in the 1688 table's KG column and on the "Item stored" sheet.
// It is the weight of the PARCEL (one CN tracking number, however many 1688 lines
// travel in it); gtradea publishes none, so it is an input rather than a readout,
// typed in by whoever put the box on the scale.
//
// Saved when the field loses focus or Enter is pressed; Escape puts the old figure
// back. `onCommit(text, prevKg)` says whether the text was usable — false makes
// the field restore the stored figure instead of showing a value that never saved.
//
// The sheet passes a few extras, because a field there is easy to leave without a
// blur (a phone keyboard that never blurs on a button tap, the next scan replacing
// the sheet under it):
//   flushOnUnmount — save what is typed when the field goes away.
//   handleRef      — { read, discard } for the sheet's buttons: read() saves what
//                    is typed and returns { ok, kg } — Print puts THAT on the
//                    label; discard() stops the unmount save (Cancel) and returns
//                    the figure the parcel held before this field first changed
//                    it, or null if it never did.
function KgInput({ kg, label, onCommit, handleRef = null, flushOnUnmount = false, disabled = false, large = false }) {
  const stored = kg == null ? "" : String(kg);
  const [draft, setDraft] = useState(stored);
  const [editing, setEditing] = useState(false);
  // The commit below is also run from the handle and on unmount, where the render
  // closure is long gone — so it works from refs only.
  const draftRef = useRef(stored);
  const sentRef = useRef(stored);      // the text the parcel is known to hold / was last handed to onCommit
  const baselineRef = useRef(null);    // what it held before this field first changed it
  const dropRef = useRef(false);
  const cancelled = useRef(false);
  const latest = useRef({});
  latest.current = { kg, onCommit, disabled };
  const show = (text) => { draftRef.current = text; setDraft(text); };
  // Follow the stored value while nobody is typing — a poll, or the server's
  // rounded reply after a save — but never overwrite a half-typed number.
  useEffect(() => {
    if (editing) return;
    sentRef.current = stored;
    draftRef.current = stored;
    setDraft(stored);
  }, [stored, editing]);
  const commit = () => {
    const text = draftRef.current.trim();
    if (text === sentRef.current) return true;
    const before = sentRef.current;
    const { kg: prev, onCommit: save } = latest.current;
    if (save(text, prev) === false) { show(before); return false; }
    if (baselineRef.current === null) baselineRef.current = before;
    sentRef.current = text;
    return true;
  };
  useEffect(() => {
    if (!handleRef) return undefined;
    const handle = {
      read: () => {
        // Not usable (see `disabled`): no figure of its own, so the caller keeps the box's.
        if (latest.current.disabled) return { ok: true };
        if (!commit()) return { ok: false };
        const text = draftRef.current.trim();
        return { ok: true, kg: text === "" ? null : Number(text) };
      },
      discard: () => { dropRef.current = true; return baselineRef.current; },
    };
    handleRef.current = handle;
    return () => { if (handleRef.current === handle) handleRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleRef]);
  useEffect(() => () => { if (flushOnUnmount && !dropRef.current) commit(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      placeholder={disabled ? "…" : "—"}
      onFocus={() => setEditing(true)}
      onChange={(e) => show(cleanKg(e.target.value))}
      onBlur={() => {
        setEditing(false);
        // Escape blurs the field to leave it, and that blur would otherwise save
        // the very text being thrown away.
        if (cancelled.current) { cancelled.current = false; show(sentRef.current); return; }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
      }}
      aria-label={label}
      className={`${large ? "w-20 py-2 text-sm" : "w-14 py-1 text-xs"} rounded-lg bg-white px-2 text-right font-semibold tabular-nums text-[#2D2D2D]/80 ring-1 ring-[#E6E2DB] transition placeholder:font-normal placeholder:text-[#2D2D2D]/25 focus:outline-none focus:ring-2 focus:ring-[#412460]/40 disabled:opacity-50`}
    />
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
  // Page shell. GtradeA carries far wider tables than Cellzen — its 1688 grid is
  // 940px and its items grid 900px, against 520-560px on the Cellzen side — so
  // this section runs one width step wider and a little tighter top and bottom.
  // Keyed off the mode rather than raised for both, so the Cellzen page keeps
  // the proportions it was laid out for.
  const PAGE_MAX_W = isGtradea ? "max-w-7xl" : "max-w-5xl";
  const HEADER_PAD = isGtradea ? "pb-2 pt-2" : "pb-3 pt-4";
  const TABS_PAD = isGtradea ? "mt-2 pb-2" : "mt-4 pb-4";
  const MAIN_PAD = isGtradea ? "pb-28 pt-1 md:pb-6" : "pb-28 pt-1 md:pb-16";
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
  // The sheet's By Air / By Land picks never wait on the network: the switch
  // flips at once and the save runs behind it. Every BOX has its own queue in
  // `modeQueues` (queue key -> tail promise; see queueKeyOf). Its saves run one
  // after another, so the server always ends on the LAST pick, and printing and
  // Cancel for that box wait on its tail — only its, so one box's slow put-away
  // never holds up another box's label. Per box id, `modePick` is the mode on
  // screen and `modeSaved` the one the server last confirmed — what a failed save
  // reverts to. `modeFailures` holds, per queue key, why the latest save was
  // refused, so a print that waited on it doesn't go out with the old mode.
  const modeQueues = useRef(new Map());
  // The weight field on the sheet, for its buttons (see KgInput's handleRef).
  const sheetKgHandle = useRef(null);
  // QC photos added while a sheet was showing, by tracking number -> their ids, so
  // Cancel can take back what the cancelled scan added. And the photo viewer, which
  // opens from any goods number: { tracking, goodsNo, index } or null.
  const sheetQcAdded = useRef(new Map());
  const [qcViewer, setQcViewer] = useState(null);
  // The "QC Image Upload" popup shown before a label prints without any photo:
  // { kind: "print" | "copies" | "ok", tracking, goodsNo } or null.
  const [qcGate, setQcGate] = useState(null);
  const modePick = useRef(new Map());
  const modeSaved = useRef(new Map());
  const modeFailures = useRef(new Map());
  // Per box id: the mode it was put away with; whether a sheet save has since
  // written to its 1688 lines; and `linesBefore`, what those lines held before
  // that first save — what Cancel restores.
  const modeAtPutAway = useRef(new Map());
  // A scan opens the sheet at once, before the server has stored anything, as a
  // PENDING sheet (id "pending-N"). Per pending id, `pendingBoxes` holds the
  // put-away's promise (the stored box, or null if the server refused the scan)
  // and `pendingAdopted` the stored box once it has landed. `pendingIdOf` maps a
  // stored box back to the pending id it started as, which stays its queue key.
  const pendingBoxes = useRef(new Map());
  const pendingAdopted = useRef(new Map());
  const pendingIdOf = useRef(new Map());
  // Per pending id, the sheet it pushed aside ({ item, touched }), and the pending
  // ids the server refused. A refused scan puts back what it displaced — skipping
  // along this chain past any sheet that was itself a refused scan, so two bad
  // codes in a row can't resurrect a "Storing item" sheet that will never finish.
  const pendingDisplaced = useRef(new Map());
  const pendingRefused = useRef(new Set());
  const pendingSeq = useRef(0);
  // Scans the page could not preview from its 1688 list: their popup is held shut
  // until the server has confirmed the box and named its product (see storeTracking).
  // pending id -> the scan's sequence number. And how many of them are in flight, for
  // the "Checking product…" note that stands in for the popup meanwhile.
  const pendingHidden = useRef(new Map());
  const [checkingScans, setCheckingScans] = useState(0);
  // Codes whose put-away is still on the wire, so a double read isn't sent twice.
  const inFlightTrackings = useRef(new Set());
  // Which sheet is on screen (its id, and the item itself) and whether anyone has
  // touched it: a pending sheet starts its auto-dismiss only once its box is
  // stored, and only if it is still the one showing and nobody has touched it. A
  // scan the server refuses puts back the sheet it displaced, which is what the
  // item is kept for. Set synchronously by showSaved and adoptStored; the effect
  // catches every other open and close.
  const sheetTouched = useRef(false);
  const sheetIdRef = useRef(null);
  const sheetItemRef = useRef(null);
  useEffect(() => {
    sheetIdRef.current = savedItem ? savedItem.id : null;
    sheetItemRef.current = savedItem;
  }, [savedItem]);
  useEffect(() => {
    const current = String(savedItem?.trackingNumber || "").trim().toUpperCase();
    for (const key of [...sheetQcAdded.current.keys()]) if (key !== current) sheetQcAdded.current.delete(key);
  }, [savedItem?.trackingNumber]);
  const savedTimer = useRef(null);
  const armSavedTimer = useCallback((id) => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(
      () => setSavedItem((prev) => {
        if (!prev || prev.id !== id) return prev;
        // On a phone or tablet a GtradeA box needs its QC photo: a sheet that has none
        // does not close itself. At a desktop the photo is optional, so it does.
        return isGtradea && isTouchDevice() && !qcHasPhoto(prev.trackingNumber) ? prev : null;
      }),
      6000
    );
  }, [isGtradea]);
  const showSaved = useCallback((item) => {
    if (!item.pending) {
      modeAtPutAway.current.set(item.id, {
        mode: item.shipmentFrom === "By Land" ? "By Land" : "By Air",
        linesTouched: false,
      });
    }
    sheetTouched.current = false;
    sheetIdRef.current = item.id;
    sheetItemRef.current = item;
    setSavedItem(item);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (!item.pending) armSavedTimer(item.id);
  }, [armSavedTimer]);
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
      seedQc(it, (x) => x.trackingNumber);
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
  // this section paints immediately (then reconciles via loadData). Written when
  // the browser is idle rather than in the frame after every change: it
  // stringifies the whole list — thousands of rows, megabytes — synchronously,
  // which on a phone stalled the camera and the "Item stored" sheet right after
  // each put-away. Rapid changes collapse into one write; a tab closed inside that
  // window misses only the last one, and loadData reconciles on the next open.
  useEffect(() => {
    const write = () => writeItemsCache(mode, items);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(write, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(write, 1500);
    return () => clearTimeout(timer);
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

  // Resolve a scanned/typed code to an item. The label's barcode carries the
  // gtradea product id, so that is what a fresh scan brings in; the OTHER products
  // of a multi-product parcel resolve to the same box, which is what lets a
  // product id read off the China Operations table find the thing it is packed in.
  // Older stickers keep working too — the box id and the PR id are matched as
  // well. The rule itself lives in warehouseApi (resolveItem) so the scanner, the
  // search box and anything else asking "which box is this?" can't drift apart.
  const findItem = useCallback((codeOrTracking) => resolveItem(items, codeOrTracking), [items]);

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
  // The Shelf number field of the manual form. It is the SAME shelf the camera /
  // barcode scanner puts boxes on, not a second one: scanning a shelf label fills
  // this field, and a valid shelf typed or picked here becomes the shelf a scan
  // uses (see setShelf). Whichever was set last wins, and it stays until the next
  // change — so a shelf entered by hand no longer sends the camera back to "scan a
  // shelf label first", and a scanned one is already in the form.
  const [manualRackText, setManualRackText] = useState("");
  const [manualTracking, setManualTracking] = useState("");

  // Make `id` (or nothing) the shelf boxes are put away on. Only the ref is read
  // by the scanner callback, so it is written here rather than waiting on the
  // effect above — a box scanned in the same tick as the shelf must see it.
  const setShelf = useCallback((id) => {
    const shelf = String(id || "").trim().toUpperCase();
    activeShelfRef.current = shelf;
    setActiveShelf(shelf);
    setManualRackText(shelf);
  }, []);
  // Typing into the Shelf number field. Only a complete, well-formed shelf counts
  // as the active one; a half-typed code clears it rather than leaving the scanner
  // putting boxes on the shelf that was there before the edit started.
  const editShelfText = useCallback((value) => {
    setManualRackText(value);
    const shelf = value.trim().toUpperCase();
    const valid = isShelf(shelf) ? shelf : "";
    activeShelfRef.current = valid;
    setActiveShelf(valid);
  }, []);

  // Put a box away on `rackId`. `scanned` is whatever came off the scanner or the
  // manual form: normally the courier's TRACKING number, which is what the server
  // keys put-away on — but a printed label carries the GOODS id, and those get
  // held under the scanner too (a box coming back to another shelf, a second scan
  // of one just stored). So resolve the code against the boxes already known
  // before sending it: otherwise a goods id reaches the server as if it were a
  // tracking number and comes back "this tracking number doesn't exist in the
  // orders", which says nothing about what actually happened.
  // The 1688 orders, readable from the scan path. storeTracking is declared long
  // before the 1688 section's state, so it reads them through this ref (kept in
  // step down there) to preview a put-away — see previewPutAway.
  const supplierOrdersRef = useRef([]);

  // The server's answer to a pending sheet's put-away. The box joins the lists,
  // and the sheet — if it still shows that scan — becomes the stored box, keeping
  // a mode already picked while it was pending (its queued save sends it under
  // the real id). Runs inside the put-away promise, before anything awaiting the
  // box sees it, so the picks it carries over are the latest there will be.
  const adoptStored = useCallback((pendingId, item) => {
    const serverMode = item.shipmentFrom === "By Land" ? "By Land" : "By Air";
    modeAtPutAway.current.set(item.id, { mode: serverMode, linesTouched: false });
    modeSaved.current.set(item.id, serverMode);
    const pick = modePick.current.get(pendingId);
    if (pick) modePick.current.set(item.id, pick);
    pendingAdopted.current.set(pendingId, item);
    pendingIdOf.current.set(item.id, pendingId);
    seedQc([item], (x) => x.trackingNumber);
    const shown = withPendingKg(pick ? { ...item, shipmentFrom: pick } : item, kgPendingRef.current);
    setItems((prev) => [shown, ...prev]);
    setFeed((prev) => [shown, ...prev].slice(0, 8));
    upsertRack({ id: item.rackId, note: "", createdAt: item.createdAt });
    setSavedItem((prev) => (prev && prev.id === pendingId ? shown : prev));
    if (sheetIdRef.current === pendingId) {
      sheetIdRef.current = item.id;
      if (!sheetTouched.current) armSavedTimer(item.id);
    }
    // A scan whose popup was held shut (no product to show yet) opens NOW, with its
    // product in it. Unless another scan has come since: that one's popup stays, and
    // this box is simply reported as stored.
    if (pendingHidden.current.has(pendingId)) {
      const seq = pendingHidden.current.get(pendingId);
      pendingHidden.current.delete(pendingId);
      if (seq === pendingSeq.current) showSaved(shown);
      else showToast(`${goodsCode(item)} stored on ${item.rackId}`, "ok");
    }
  }, [upsertRack, armSavedTimer, showSaved, showToast]);

  const storeTracking = useCallback(
    async (rackId, scanned) => {
      const known = findItem(scanned);
      if (known && known.status === "in_stock") {
        // Says WHERE it is rather than just refusing — that is the whole question
        // a second scan is asking.
        showToast(`${goodsCode(known)} is already stored on ${known.rackId}`, "warn");
        return;
      }
      // A shipped box being put away again (a return, a mis-dispatch) is a real
      // put-away: send the TRACKING number it is stored under, not the goods id
      // that was scanned.
      const tracking = String(known?.trackingNumber || scanned).trim().toUpperCase();
      // The same code read again while its put-away is still on the wire: the
      // sheet already shows it, and a second POST would only come back 409.
      if (inFlightTrackings.current.has(tracking)) return;
      inFlightTrackings.current.add(tracking);
      // The sheet opens NOW, from what the page already knows. The server's reply
      // fills in the rest (adoptStored) or closes it with the reason. The sheet it
      // pushes aside is remembered: a code the server refuses — a second barcode on
      // the same parcel, a product EAN — must not take away the box that was being
      // checked and labelled.
      //
      // But only when there IS a product to show. A GtradeA scan the page's 1688 list
      // does not know (the list is still loading, or the order synced a moment ago)
      // has none, and a popup that opens with no product in it reads as "there is no
      // product" — then fills in a second later. So that popup is held shut: a small
      // "Checking product…" note stands in for it while the server confirms the box
      // and names what is in it, and only THEN does the popup open (adoptStored). If
      // the server says the box does not exist, the reason shows and no empty popup
      // ever appeared.
      const pendingId = `pending-${++pendingSeq.current}`;
      const preview = isGtradea ? previewPutAway(supplierOrdersRef.current, tracking) : null;
      const held = isGtradea && !preview;
      if (held) {
        pendingHidden.current.set(pendingId, pendingSeq.current);
        setCheckingScans((n) => n + 1);
      } else {
        pendingDisplaced.current.set(pendingId, { item: sheetItemRef.current, touched: sheetTouched.current });
        showSaved({
          id: pendingId,
          pending: true,
          status: "in_stock",
          rackId,
          trackingNumber: tracking,
          shipmentFrom: "By Air",
          products: [],
          ...preview,
        });
      }
      const stored = putAwayItem(rackId, tracking, mode).then((item) => {
        adoptStored(pendingId, item);
        return item;
      });
      pendingBoxes.current.set(pendingId, stored.catch(() => null));
      try {
        await stored;
      } catch (e) {
        pendingRefused.current.add(pendingId);
        if (sheetIdRef.current === pendingId) {
          // Put back what this scan displaced, walking back along the chain: a
          // sheet whose own put-away landed comes back as its stored box; one that
          // was itself a refused scan is skipped for what IT displaced; one still on
          // the wire comes back pending. Nothing usable left: the sheet closes. The
          // auto-dismiss is re-armed only for a stored, untouched sheet.
          let entry = pendingDisplaced.current.get(pendingId);
          let back = null;
          let touched = false;
          const visited = new Set();
          while (entry?.item && !visited.has(entry.item.id)) {
            visited.add(entry.item.id);
            const candidate = entry.item;
            const adopted = candidate.pending ? pendingAdopted.current.get(candidate.id) : null;
            if (adopted || !candidate.pending || !pendingRefused.current.has(candidate.id)) {
              back = adopted || candidate;
              touched = entry.touched;
              break;
            }
            entry = pendingDisplaced.current.get(candidate.id);
          }
          const picked = back ? modePick.current.get(back.id) : null;
          if (back && picked) back = { ...back, shipmentFrom: picked };
          sheetIdRef.current = back ? back.id : null;
          sheetItemRef.current = back;
          sheetTouched.current = touched;
          setSavedItem((prev) => (prev && prev.id === pendingId ? back : prev));
          if (back && !back.pending && !touched) armSavedTimer(back.id);
        }
        showToast(e.message || "Failed to store item", e.status === 409 ? "warn" : "error");
      } finally {
        inFlightTrackings.current.delete(tracking);
        if (held) {
          pendingHidden.current.delete(pendingId);
          setCheckingScans((n) => Math.max(0, n - 1));
        }
      }
    },
    [mode, isGtradea, showToast, showSaved, findItem, adoptStored, armSavedTimer]
  );

  const handleStoreDecode = useCallback(
    async (text) => {
      const t = String(text || "").trim();
      if (!t) return;
      if (isShelf(t)) {
        const id = t.toUpperCase();
        setShelf(id);
        showToast(`Shelf set: ${id}`, "ok");
        // Nothing waits on the shelf existing server-side: POST /items creates it
        // on the first box put away there anyway. Only a shelf this page has never
        // seen is sent at all, in the background, so a re-scanned shelf costs no
        // request and doesn't compete for a DB connection with the next put-away.
        if (!racks.some((r) => r.id === id)) {
          createRack(id)
            .then((created) => { if (created) upsertRack(created); })
            .catch(() => { /* best-effort — the put-away creates it regardless */ });
        }
        return;
      }
      if (!activeShelfRef.current) {
        showToast(`Scan a shelf label first, e.g. ${shelfExample}`, "error");
        return;
      }
      await storeTracking(activeShelfRef.current, t);
    },
    [showToast, storeTracking, upsertRack, shelfExample, racks, setShelf]
  );

  const handleManualSave = async () => {
    const rackId = manualRackText.trim().toUpperCase();
    const tracking = manualTracking.trim();
    if (!rackId) return showToast("Enter or choose a shelf first.", "error");
    if (!isShelf(rackId)) return showToast(`Shelf must look like ${shelfExample} (letters-digits-digits).`, "error");
    if (!tracking) return showToast("Enter a tracking number or a goods ID.", "error");
    await storeTracking(rackId, tracking);
    setManualTracking("");
  };

  // The manual put-away form — reused on desktop (inline) and mobile (overlay).
  const manualForm = (
    <div className="grid gap-4">
      <div>
        <label className={LABEL}>Choose existing shelf</label>
        <select
          // Follows the Shelf number field below, so a scanned shelf shows here
          // too — blank when the code isn't (yet) one of the known shelves.
          value={racks.some((r) => r.id === activeShelf) ? activeShelf : ""}
          onChange={(e) => {
            // Fills the Shelf number field with the chosen shelf so it's visible
            // (and editable) instead of left blank.
            if (e.target.value) setShelf(e.target.value);
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
          onChange={(e) => editShelfText(e.target.value)}
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
  const [shipConfirmFromSupplier, setShipConfirmFromSupplier] = useState(false); // opened from the 1688 panel's "Proceed to Shipment"?
  // How many GOODS the 1688 panel had selected, which is NOT the number of
  // things being shipped: several 1688 lines routinely share one CN tracking and
  // therefore one physical parcel, and requestSupplierShip collapses those to a
  // single /ship (a second call on the same box comes back 409). Kept so the
  // confirm can reconcile the two numbers — without it the dialog followed
  // "25 goods selected" with "Mark 23 items as shipped?" and read like a bug.
  const [shipConfirmGoods, setShipConfirmGoods] = useState(0);
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
    setShipConfirmFromSupplier(false);
    setShipConfirmGoods(0);
    setShipConfirmItems(list);
  }, []);
  const requestBatchShip = () => {
    // Only ship what's both selected AND currently visible, so a selection left
    // over from a previous search filter can never ship a hidden row.
    const list = filteredShip.filter((i) => shipSel.has(i.id));
    if (!list.length) return showToast("Select items to ship first", "warn");
    setShipLogistics("");
    setShipConfirmIsBatch(true);
    setShipConfirmFromSupplier(false);
    setShipConfirmGoods(0);
    setShipConfirmItems(list);
  };
  const confirmShip = async () => {
    const list = shipConfirmItems;
    if (!list || !list.length || batchBusy) return;
    const logistics = shipLogistics.trim();
    if (!logistics) return showToast("Enter the name of the logistics.", "error");
    const wasBatch = shipConfirmIsBatch;
    const wasSupplier = shipConfirmFromSupplier;
    setShipConfirmItems(null);
    setBatchBusy(true);
    try {
      const failed = await handleShipMany(list, logistics);
      // Leave select mode only when this was a batch AND everything shipped — a
      // single-row ship never exits batch mode, and a partial failure keeps the
      // failed (still-selected) items visible for a retry.
      if (wasBatch && !failed) exitShipBatch();
      if (wasSupplier) {
        if (!failed) exitSupplierShip();
        // Re-read the 1688 list so every row that shared a shipped box flips to
        // "🚚 Dispatched" now, rather than at the next 20s poll. Authoritative
        // (the server recomputes the join) instead of patching pills locally,
        // and it also covers the partial-failure case honestly.
        loadSupplier();
      }
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
      setShipConfirmFromSupplier(false);
      setShipConfirmGoods(0);
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
          // The feed row's own print button pre-fills its mode from this row.
          setFeed((prev) => prev.map((i) => (i.id === updated.id ? { ...i, shipmentFrom: updated.shipmentFrom } : i)));
          // Should the "Item stored" sheet be showing this box, its switch has to
          // show what was just saved here, and its next save has to measure
          // against this rather than the mode it saw before.
          modePick.current.set(updated.id, updated.shipmentFrom);
          modeSaved.current.set(updated.id, updated.shipmentFrom);
          setSavedItem((prev) => (prev && prev.id === updated.id ? { ...prev, shipmentFrom: updated.shipmentFrom } : prev));
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
    if (!item) return;
    // Opened from the "Item stored" sheet — decided when the dialog opened, since
    // a scan may have put another box on the sheet by now: a mode picked here goes
    // through the sheet's own save, so the box and its 1688 lines move together
    // exactly as with the sheet's switch. It prints only once every save has
    // settled and the server holds that mode; a failed save prints nothing — its
    // toast already says why.
    if (item.fromSheet) {
      queueModeSave(item, shipMode);
      await settleModeSaves(item);
      if (savedModeOf(item) !== shipMode) return;
      await doPrintLabel({ ...item, shipmentFrom: shipMode }, copies, shipMode);
      return;
    }
    await doPrintLabel(item, copies, shipMode);
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
              {item.itemCode || item.prCode ? "Product ID" : "Item"}
            </div>
            <div className="mt-0.5 text-2xl font-black tracking-tight">
              {isGtradea ? <GoodsNo code={goodsCode(item)} onOpen={() => openQc(item)} tracking={item.trackingNumber} /> : <span className="break-all">{goodsCode(item)}</span>}
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              {/* This box's own id. Not printed on the label and not known to
                  gtradea — kept on screen because it is the one id that names
                  exactly one parcel (a product id can repeat across the boxes of
                  an order), and because the labels printed while it WAS on the
                  barcode are still on the shelves and still scan to here. */}
              {item.boxCode ? (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Box ID</dt>
                  <dd className="min-w-0 break-all font-semibold text-[#412460]">{item.boxCode}</dd>
                </div>
              ) : null}
              {/* Every product in the parcel, when it holds more than one — the
                  same list the label prints. */}
              {item.itemCodes && item.itemCodes.length > 1 ? (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Inside</dt>
                  <dd className="min-w-0 break-all font-semibold">{item.itemCodes.join(", ")}</dd>
                </div>
              ) : null}
              {/* The parcel's weight, once it has been on the scale — the figure the
                  label prints beside "HANDLE WITH CARE". */}
              {item.kg > 0 ? (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 font-semibold text-[#2D2D2D]/45">Weight</dt>
                  <dd className="min-w-0 font-semibold">{item.kg} KG</dd>
                </div>
              ) : null}
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
  // Open the saved QC photos of a 1688 order's parcel (from its card, goods number or
  // order number). Keyed by CN tracking number, so every line of the parcel shows the same photos.
  const openQc1688 = (o) => {
    if (!o.cnTracking) { showToast("This order has no CN tracking number yet, so it has no QC photos", "warn"); return; }
    prefetchQcImages(o.cnTracking);
    setQcViewer({ tracking: o.cnTracking, goodsNo: o.itemCode || o.jobCode || o.orderNumber || "", index: 0 });
  };
  // Open the saved QC photos of a box (from its goods number).
  const openQc = (item, index = 0) => {
    const tracking = item?.trackingNumber;
    if (!tracking) { showToast("This box has no tracking number to look photos up by", "warn"); return; }
    setQcViewer({ tracking, goodsNo: goodsCode(item), index });
  };
  // A photo added while the sheet is up belongs to that scan (see sheetQcAdded). Noted
  // by the photo's KEY: it is on screen before the server has given it an id.
  const noteSheetQc = (tracking, added) => {
    const key = String(tracking || "").trim().toUpperCase();
    sheetQcAdded.current.set(key, [...(sheetQcAdded.current.get(key) || []), added.key]);
  };
  // Whether the sheet's tracking number is one to save things against: a scan still
  // being stored with no 1688 line to preview may be a goods id, not a tracking
  // number — only the server's reply says which. The weight and the QC photos wait.
  const trackingReady = !!savedItem && !(savedItem.pending && !savedItem.orderNumber);
  const keepSavedSheet = () => {
    sheetTouched.current = true;
    if (savedTimer.current) clearTimeout(savedTimer.current);
  };
  // The box behind a sheet: the sheet's own item once stored. A sheet opened the
  // instant a code was read is still waiting on its put-away, so this is that
  // promise instead — the stored box, or null if the server refused the scan.
  const sheetBox = (sheet) => (sheet?.pending ? pendingBoxes.current.get(sheet.id) : sheet);
  // The key a box's mode saves queue under: the pending id it started as, kept
  // after its put-away lands, so saves made before and after share one queue.
  const queueKeyOf = (box) => (box.pending ? box.id : pendingIdOf.current.get(box.id) || box.id);
  // Resolves once no mode save is left on THIS box's queue — saves queued while
  // waiting included — so printing and Cancel act on what the server holds, never
  // on a pick still on its way (and perhaps about to be refused).
  const settleModeSaves = async (box) => {
    const key = queueKeyOf(box);
    let tail;
    do {
      tail = modeQueues.current.get(key);
      await tail;
    } while (tail !== modeQueues.current.get(key));
  };
  // The mode the server holds for a box once saves have settled: the last
  // confirmed sheet save if there was one, otherwise the box's own.
  // Resolves once no weight save is left on this parcel's queue (see kgQueuesRef).
  const settleKgSaves = async (key) => {
    let tail;
    do {
      tail = kgQueuesRef.current.get(key);
      await tail;
    } while (tail !== kgQueuesRef.current.get(key));
  };
  // What is in the sheet's weight field — saved first, so what the label prints is
  // what the 1688 table will show. null when the sheet has no such field (Cellzen
  // boxes), or it is not usable yet (a scan still being stored with no 1688 line to
  // preview): the box's own weight prints then. { ok: false } for text that is not
  // a weight, which has already been reported.
  const readSheetKg = () => sheetKgHandle.current?.read() ?? null;
  const savedModeOf = (box) =>
    modeSaved.current.get(box.id) || (box.shipmentFrom === "By Land" ? "By Land" : "By Air");
  // Boxes (by queue key) whose print is waiting — on the put-away, a mode save or
  // the printer. The ref is the guard: repeat taps meanwhile are ignored instead of
  // each queueing another label. The state only drives the button's waiting look.
  const printWaitRef = useRef(new Set());
  const [printWaiting, setPrintWaiting] = useState(() => new Set());
  const markPrintWaiting = (key, waiting) => {
    if (waiting) printWaitRef.current.add(key);
    else printWaitRef.current.delete(key);
    setPrintWaiting(new Set(printWaitRef.current));
  };
  // Runs `fn(box, mode)` for the sheet's box once the box exists and its mode
  // saves have settled — one run per box at a time. If a save made while this
  // waited was refused, nothing runs: acting on the old mode would silently
  // contradict the last tap, so the reason stays on screen instead.
  const whenSheetBoxSettled = async (sheet, fn) => {
    const key = queueKeyOf(sheet);
    if (printWaitRef.current.has(key)) return;
    markPrintWaiting(key, true);
    modeFailures.current.delete(key);
    kgFailuresRef.current.delete(kgKeyOf(sheet.trackingNumber));
    try {
      // The label needs the ids only the server mints, so a pending sheet waits
      // for its box, and a refused scan does nothing.
      const box = await sheetBox(sheet);
      if (!box) return;
      await settleModeSaves(box);
      // ... and the weight typed on the sheet, which the label prints.
      const kgKey = kgKeyOf(box.trackingNumber);
      await settleKgSaves(kgKey);
      const failed = modeFailures.current.get(key);
      if (failed) {
        showToast(`${goodsCode(box)}: not printed — the mode change wasn't saved (${failed})`, "error");
        return;
      }
      const kgFailed = kgFailuresRef.current.get(kgKey);
      if (kgFailed) {
        showToast(`${goodsCode(box)}: not printed — the weight wasn't saved (${kgFailed})`, "error");
        return;
      }
      await fn(box, savedModeOf(box));
    } finally {
      markPrintWaiting(key, false);
    }
  };
  // Straight to the printer, one copy, no dialog — this is the scan → print path
  // staff run all day at the shelf, and the item already carries everything the
  // label needs (item code, order #, tracking) from the put-away response.
  // Returns whether the print was started: false when there is nothing to print or
  // the weight typed on the sheet isn't one (already reported), so the caller knows
  // the sheet still has something to fix and must stay up.
  const printSavedItemNow = () => {
    keepSavedSheet();
    if (!savedItem) return false;
    const w = readSheetKg();
    if (w && !w.ok) return false;
    whenSheetBoxSettled(savedItem, (box, mode) =>
      doPrintLabel({ ...box, shipmentFrom: mode, ...(w && w.kg !== undefined ? { kg: w.kg } : null) }, 1, mode)
    );
    return true;
  };
  // The "more than one package" case still goes through the copies + mode dialog.
  // `fromSheet` rides on the dialog's target: whether a mode picked there is this
  // box's sheet decision is settled NOW, not when Print is pressed — by then a
  // scan may have put another box on the sheet.
  const printSavedItem = () => {
    keepSavedSheet();
    if (!savedItem) return;
    const w = readSheetKg();
    if (w && !w.ok) return;
    whenSheetBoxSettled(savedItem, (box, mode) =>
      handlePrintLabel({ ...box, shipmentFrom: mode, fromSheet: true, ...(w && w.kg !== undefined ? { kg: w.kg } : null) })
    );
  };
  // The sheet's By Air / By Land switch.
  const changeSavedItemMode = (nextMode) => {
    keepSavedSheet();
    if (savedItem) queueModeSave(savedItem, nextMode);
  };
  // A By Air / By Land decision for a box on the sheet, or in the copies dialog
  // opened from it. The sheet, the feed and the list change in the same frame;
  // the save follows on that box's own queue together with its 1688 lines, so the
  // Mode column and packing lists follow, not just this box's label.
  const queueModeSave = (sheet, nextMode) => {
    // A pending sheet's put-away may have landed in the same frame as this tap,
    // before the sheet re-rendered as the stored box: key the pick by the real
    // id then, or adoptStored has already carried over the picks it will ever see.
    const adopted = sheet.pending ? pendingAdopted.current.get(sheet.id) : null;
    const box = adopted || sheet;
    const key = box.id;
    const shown = modePick.current.get(key) || (box.shipmentFrom === "By Land" ? "By Land" : "By Air");
    if (nextMode === shown) return;
    // A stored box's first pick records what the server holds; a pending box
    // gets that from its put-away reply instead (adoptStored).
    if (!(sheet.pending && !adopted) && !modeSaved.current.has(key)) modeSaved.current.set(key, shown);
    const paint = (id, mode) => {
      modePick.current.set(id, mode);
      const apply = (i) => (i.id === id ? { ...i, shipmentFrom: mode } : i);
      setItems((prev) => prev.map(apply));
      setFeed((prev) => prev.map(apply));
      setSavedItem((prev) => (prev && prev.id === id ? { ...prev, shipmentFrom: mode } : prev));
    };
    paint(key, nextMode);
    const queueKey = queueKeyOf(sheet);
    const job = (modeQueues.current.get(queueKey) || Promise.resolve()).then(async () => {
      // A pending box has no id to save against until its put-away lands, and a
      // scan the server refused has nothing to save at all.
      const stored = await sheetBox(sheet);
      if (!stored) return;
      const id = stored.id;
      // Skipped when a newer pick for this box is queued behind it, or when the
      // taps have come back round to what the server already holds — either way
      // the round trip would change nothing.
      if (modePick.current.get(id) !== nextMode || modeSaved.current.get(id) === nextMode) return;
      // Back to the mode the box was put away with, after a save had changed its
      // lines: put them back exactly rather than re-deriving them from the pick.
      // On a mixed parcel the two differ, and re-deriving would leave a staff
      // override on a line nobody meant to touch — a lithium line marked air.
      const putAway = modeAtPutAway.current.get(id);
      const restoring = Boolean(putAway?.linesTouched && nextMode === putAway.mode);
      try {
        const { item: updated, previousLineOverrides, keptLand } = await updateItemShipmentModeWithOrders(
          id,
          nextMode,
          restoring ? { restoreLineOverrides: putAway.linesBefore } : undefined
        );
        modeSaved.current.set(id, updated.shipmentFrom);
        modeFailures.current.delete(queueKey);
        if (putAway) {
          if (restoring) {
            putAway.linesTouched = false; // the lines are as they were at put-away
          } else if (!putAway.linesTouched) {
            // What the lines held before this sheet's first change — what a restore
            // or Cancel puts back. Later saves only moved them further from it.
            putAway.linesBefore = previousLineOverrides;
            putAway.linesTouched = true;
          }
        }
        if (keptLand.length) {
          showToast(
            `${keptLand.map((l) => l.item_code || l.product_name).join(", ")} kept By Land — restricted for air freight`,
            "warn"
          );
        }
        if (modePick.current.get(id) !== nextMode) return; // superseded while in flight
        // The reply's product lookup is best-effort server-side; an empty one must
        // not wipe the photos the put-away already brought.
        const merged = withPendingKg(
          updated.products.length ? updated : { ...updated, products: stored.products },
          kgPendingRef.current
        );
        setItems((prev) => prev.map((i) => (i.id === id ? merged : i)));
        setFeed((prev) => prev.map((i) => (i.id === id ? merged : i)));
        setSavedItem((prev) => (prev && prev.id === id ? merged : prev));
      } catch (e) {
        // A newer pick is queued and will be sent; only the latest one reverts.
        if (modePick.current.get(id) !== nextMode) return;
        modeFailures.current.set(queueKey, e.message || "save failed");
        paint(id, modeSaved.current.get(id));
        // Named, because by now the sheet may be showing a different box.
        showToast(`${goodsCode(stored)}: ${e.message || "Failed to update shipment mode"}`, "error");
      }
    });
    modeQueues.current.set(queueKey, job);
    // Forget a finished queue — unless more was queued behind it meanwhile.
    job.then(() => { if (modeQueues.current.get(queueKey) === job) modeQueues.current.delete(queueKey); });
  };
  // ---- the QC photo gate. Print label, "Choose copies" and OK all ask the same
  // question first: has this box a QC photo yet? If not, the "QC Image Upload" popup
  // comes up instead, and a photo uploaded there sends the label to the printer
  // straight away (for Print label and OK, the sheet then closes too). There is no skipping it: the
  // photo is mandatory. GtradeA only: a Cellzen box has none. And only on a phone or
  // tablet, where the camera is in hand at the shelf: at a desktop the photo is optional,
  // so none of these actions asks for it (the Upload image button is still on the sheet).
  const runSheetAction = (kind, uploaded) => {
    // Print label: once the label is on its way the sheet has done its job, so it
    // closes and staff are back on the scan panel for the next box — they don't stay
    // on the product popup. It stays only if nothing was printed (a bad weight).
    if (kind === "print") {
      if (printSavedItemNow()) setSavedItem(null);
    } else if (kind === "copies") printSavedItem();
    else {
      if (uploaded) printSavedItemNow(); // OK, but a photo was just added: print it, then close
      keepSavedSheet();
      setSavedItem(null);
    }
  };
  // Async callbacks (the upload finishing) must run the LATEST version of the above,
  // not the one from the render they were made in.
  const runSheetActionRef = useRef(runSheetAction);
  runSheetActionRef.current = runSheetAction;
  const sheetIs = (tracking) =>
    String(sheetItemRef.current?.trackingNumber || "").toUpperCase() === String(tracking || "").toUpperCase();
  const gateThen = async (kind) => {
    keepSavedSheet();
    const sheet = savedItem;
    if (!sheet) return;
    if (isGtradea && trackingReady && isTouchDevice()) {
      const have = await qcCountFor(sheet.trackingNumber);
      // A scan may have replaced the sheet while the photos were read: that press was for the old one.
      if (!sheetIs(sheet.trackingNumber)) return;
      if (have === 0) {
        setQcGate({ kind, tracking: sheet.trackingNumber, goodsNo: goodsCode(sheet) });
        return;
      }
    }
    runSheetActionRef.current(kind, false);
  };
  const finishQcGate = (gate, saved) => {
    setQcGate(null);
    if (!sheetIs(gate.tracking)) {
      showToast(`Photo saved for ${gate.goodsNo} — that box is no longer on screen, so nothing was printed`, "warn");
      return;
    }
    noteSheetQc(gate.tracking, saved);
    runSheetActionRef.current(gate.kind, true); // straight away — the photo is still being sent behind it
  };

  const undoSavedItem = async () => {
    const sheet = savedItem;
    keepSavedSheet();
    // The weight typed on this sheet is part of what is being cancelled: stop the
    // field saving on its way out, and note what the parcel held before it touched
    // it (null if it never did) so it can be put back once the box is gone.
    const kgBefore = sheetKgHandle.current?.discard() ?? null;
    // ... and so are the QC photos it added: they describe a scan that is being undone.
    const qcKey = String(sheet?.trackingNumber || "").trim().toUpperCase();
    const qcAdded = sheetQcAdded.current.get(qcKey) || [];
    sheetQcAdded.current.delete(qcKey);
    setSavedItem(null);
    if (!sheet) return;
    // Cancelled while still pending: the box is removed once it exists — closing
    // the sheet alone would leave it stored. A refused scan has nothing to remove.
    const item = await sheetBox(sheet);
    if (!item) return;
    // Every mode save for this box lands first; sent after the delete it would
    // only fail with "Item not found".
    await settleModeSaves(item);
    // Lines this sheet changed go back to exactly what they held before its first
    // save, in the same transaction as the delete: a cancelled scan must leave no
    // staff override on the order. No single mode could do that — one parcel's
    // lines can differ (a lithium line beside a phone case) — so the snapshot goes.
    const putAway = modeAtPutAway.current.get(item.id);
    try {
      await deleteItem(item.id, { restoreLineOverrides: putAway?.linesTouched ? putAway.linesBefore : undefined });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setFeed((prev) => prev.filter((i) => i.id !== item.id));
      showToast(`${goodsCode(item)} removed`, "ok");
      if (kgBefore !== null) saveKg({ tracking: item.trackingNumber, prev: item.kg }, kgBefore);
      for (const id of qcAdded) removeQcImage(item.trackingNumber, id).catch(() => { /* best effort */ });
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
  const [supplierSort, setSupplierSort] = useState("date"); // date | received | dispatched | not_updated | not_received
  // Named …Filter because `setSupplierMode` below is already taken by the writer
  // that changes ONE row's shipment mode. This one writes nothing to the server —
  // it only narrows what the table shows.
  const [supplierModeFilter, setSupplierModeFilter] = useState("all"); // all | land | air
  const [supplierSync, setSupplierSync] = useState(null); // last server sync status
  const [supplierSyncing, setSupplierSyncing] = useState(false);
  const supplierReqId = useRef(0);          // guards against out-of-order responses
  const supplierLoadedOnce = useRef(false); // full-screen spinner only on first load
  const manualSyncRef = useRef(false);      // toast a sync's outcome only when the user clicked it
  const lastKickRef = useRef(0);            // collapses rapid tab-switch bursts into one pull

  // "Proceed to Shipment" — batch dispatch straight from this panel, so goods
  // can be shipped against the 1688 order they belong to without first hunting
  // the matching CZN box down in the Ship tab. Same two-step shape as Ship's
  // "Batch Ship": the rows get a checkbox, then "Ship selected" opens the SAME
  // logistics confirm and the rows land in Dispatched.
  //
  // The button itself opens a chooser first, because there are two genuinely
  // different ways a shipment gets picked here:
  //   Manual         tick the rows — what this always did.
  //   Excel import    hand back the packing list that was exported for this
  //                   shipment and let its Goods No. / Order ID columns do the
  //                   ticking. A pallet is routinely 80+ lines, and ticking
  //                   those off a printed sheet by eye is where the mis-ships
  //                   came from.
  // Both land in the same place: `supplierShipMode` on, rows in `supplierSel`.
  const [supplierShipMode, setSupplierShipMode] = useState(false);
  const [supplierSel, setSupplierSel] = useState(() => new Set());
  const [shipStartOpen, setShipStartOpen] = useState(false); // the how-do-you-want-to-pick chooser
  const [importBusy, setImportBusy] = useState(false);       // a sheet is being parsed
  const [importSummary, setImportSummary] = useState(null);  // what the last sheet matched
  const importFileRef = useRef(null);
  const exitSupplierShip = () => { setSupplierShipMode(false); setSupplierSel(new Set()); setImportSummary(null); };
  const clearSupplierSel = () => setSupplierSel(new Set());
  const toggleSupplierSel = useCallback((id) => setSupplierSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const toggleAllSupplier = useCallback((rows, checked) => setSupplierSel((prev) => { const n = new Set(prev); rows.forEach((r) => (checked ? n.add(r.id) : n.delete(r.id))); return n; }), []);

  // Manual pick — what "Proceed to Shipment" always did, now behind the chooser.
  const startManualShip = () => {
    setImportSummary(null);
    setSupplierSel(new Set());
    setSupplierShipMode(true);
    setShipStartOpen(false);
  };

  // Excel pick — read the packing list's ids and tick the rows they name.
  //
  // Matched against the FULL order list rather than the visible one: a sheet
  // names the goods it was packed from, and whether the panel happens to be
  // filtered to "Received / By Air" at the time has nothing to do with it. The
  // ship itself can only act on rows that are both selected AND visible (see
  // requestSupplierShip), so any filter still standing would quietly drop part
  // of the batch — the import clears them instead, and says so in the summary.
  //
  // Nothing here refuses: ids that name a row already dispatched, a row still in
  // transit, or nothing at all are counted and reported. Staff need to know an
  // 80-line sheet ticked 78 rows and WHICH two it couldn't, which a thrown error
  // would tell them nothing about.
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so re-picking the SAME file fires change again
    if (!file) return;
    setImportBusy(true);
    try {
      const { goods, orderFallbacks } = await readPackingListIds(file);
      const goodsSet = new Set(goods);
      // Order numbers are matched ONLY for sheet lines that carried no Goods No.
      // (see orderFallbacks in packingListImport.js). Matching every order number
      // ticked goods the packing list never listed — one line of an order put its
      // whole order in the shipment — which is both wrong and impossible to read
      // off a count.
      const fallbackOrders = new Set(orderFallbacks);
      const named = (o) =>
        supplierRowIds(o).some((c) => goodsSet.has(c)) ||
        (!!supplierOrderId(o) && fallbackOrders.has(supplierOrderId(o)));

      const hit = supplierOrders.filter(named);
      const ready = hit.filter(supplierShippable);
      // Everything the sheet named that can't go out — already dispatched, or no
      // box on the shelf. One number, because the split between those two doesn't
      // change what anyone does next: they're all rows you can't tick.
      const skipped = hit.length - ready.length;

      const wasFiltered = !!supplierSearch.trim() || supplierSort !== "date" || supplierModeFilter !== "all";
      if (wasFiltered) {
        setSupplierSearch("");
        setSupplierSort("date");
        setSupplierModeFilter("all");
      }

      setSupplierSel(new Set(ready.map((o) => o.id)));
      setImportSummary({
        fileName: file.name,
        // What the sheet ASKS for: one entry per printed line — its Goods No.,
        // or its order number for a line that had none. Shown next to the count
        // actually selected so the two can be read against each other at a
        // glance; they match unless something on the sheet can't ship.
        inExcel: goodsSet.size + fallbackOrders.size,
        selected: ready.length,
        skipped,
      });
      setSupplierShipMode(true);
      setShipStartOpen(false);
      showToast(
        ready.length ? `${ready.length} goods selected` : "Nothing in that sheet is on the shelf right now",
        ready.length ? "ok" : "warn"
      );
    } catch (err) {
      showToast(err.message || "Could not read that file", "error");
    } finally {
      setImportBusy(false);
    }
  };

  // Esc closes the chooser — but not mid-parse, where the file is already being
  // read and the dialog is the only thing reporting on it.
  useEffect(() => {
    if (!shipStartOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !importBusy) setShipStartOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shipStartOpen, importBusy]);

  // Mode edits that haven't come back from the server yet, id -> chosen mode.
  // This tab re-polls every 20s, so without it a poll landing mid-PATCH paints
  // the row's OLD mode over the staff member's pick and then flips it again a
  // moment later — the dropdown visibly jumps under their cursor.
  const modeSavingRef = useRef(new Map());
  const [modeBusy, setModeBusy] = useState(() => new Set());

  // Weight (KG) saves, keyed by parcel (see kgKeyOf) — the 1688 table and the
  // "Item stored" sheet write the same figure, so they share ONE queue per parcel:
  //   kgPendingRef  - the weight being saved (null = clearing it). Same reason as
  //                   the modes above: a poll must not paint the old weight back
  //                   over the one just typed.
  //   kgSavedRef    - the last weight the server confirmed, which a refused save
  //                   puts back.
  //   kgQueuesRef   - the tail of the parcel's saves; they run one after another,
  //                   so the server always ends on the LAST edit, and a print waits
  //                   on it.
  //   kgFailuresRef - why the latest save was refused, so a print that waited on
  //                   it does not go out with a weight that never saved.
  const kgPendingRef = useRef(new Map());
  const kgSavedRef = useRef(new Map());
  const kgQueuesRef = useRef(new Map());
  const kgFailuresRef = useRef(new Map());

  const applyPendingModes = useCallback((rows) => {
    const pending = modeSavingRef.current;
    const pendingKg = kgPendingRef.current;
    if (!pending.size && !pendingKg.size) return rows;
    return rows.map((r) => {
      let out = r;
      if (pending.has(r.id)) {
        const mode = pending.get(r.id);
        // A null pending value is "clearing the override" — the auto answer is
        // the server's to compute, so leave the row alone until the reply lands.
        if (mode) out = { ...out, shipMode: mode, shipModeOverride: mode, shipModeSource: "staff" };
      }
      const kgKey = kgKeyOf(r.cnTracking, r.id);
      if (pendingKg.has(kgKey)) out = { ...out, kg: pendingKg.get(kgKey) };
      return out;
    });
  }, []);

  const loadSupplier = useCallback(async () => {
    const reqId = ++supplierReqId.current;
    if (!supplierLoadedOnce.current) setSupplierLoading(true);
    try {
      const { rows, lastSync } = await loadSupplierOrders();
      if (reqId !== supplierReqId.current) return; // a newer request superseded this one
      setSupplierOrders(applyPendingModes(rows));
      seedQc(rows, (o) => o.cnTracking);
      setSupplierSync(lastSync);
      supplierLoadedOnce.current = true;
    } catch (e) {
      if (reqId === supplierReqId.current) showToast(e.message || "Failed to load 1688 orders", "error");
    } finally {
      if (reqId === supplierReqId.current) setSupplierLoading(false);
    }
  }, [showToast, applyPendingModes]);

  // Keep the scan path's view of the 1688 orders current (see supplierOrdersRef).
  useEffect(() => { supplierOrdersRef.current = supplierOrders; }, [supplierOrders]);

  // The Store tab previews a put-away from the 1688 orders the instant a code is
  // read, so it needs the list even when the 1688 tab has never been opened.
  // Pulled quietly when the tab opens and every 2 minutes after: a failure costs
  // only the preview (the server still answers the scan), so nothing is toasted.
  useEffect(() => {
    if (!isGtradea || tab !== "Store") return undefined;
    if (!localStorage.getItem("staff_token")) return undefined;
    let cancelled = false;
    const pull = () =>
      loadSupplierOrders()
        .then(({ rows }) => { if (!cancelled) { setSupplierOrders(applyPendingModes(rows)); seedQc(rows, (o) => o.cnTracking); } })
        .catch(() => { /* preview only */ });
    pull();
    const timer = setInterval(pull, 120000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isGtradea, tab, applyPendingModes]);

  // Staff correction of one row's shipment mode. `mode` is "air" | "land", or
  // null to drop the correction and hand the row back to the classifier.
  // Optimistic, because the dropdown has to feel instant on a warehouse tablet;
  // the server's answer overwrites the guess as soon as it lands, and a failure
  // reloads rather than leaving a wrong mode on screen.
  const setSupplierMode = useCallback(async (id, mode) => {
    const next = mode || null;
    modeSavingRef.current.set(id, next);
    setModeBusy((prev) => new Set(prev).add(id));
    if (next) {
      setSupplierOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, shipMode: next, shipModeOverride: next, shipModeSource: "staff" } : o))
      );
    }
    try {
      const patch = await updateSupplierShipMode(id, next);
      setSupplierOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
      // The server also retags any box already on the shelf for this tracking
      // number, so the Ship tab and the label it prints now disagree with the
      // items list this page is holding. Pull it again rather than leave staff
      // looking at a stale mode on the row they just corrected.
      if (patch.warehouseItemsUpdated > 0) loadData();
    } catch (e) {
      showToast(e.message || "Failed to update shipment mode", "error");
      modeSavingRef.current.delete(id);
      loadSupplier(); // resync the row to whatever the server actually holds
    } finally {
      modeSavingRef.current.delete(id);
      setModeBusy((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }, [showToast, loadSupplier, loadData]);

  // Put a weight on everything on screen that shows this parcel: the boxes (lists,
  // feed, the open sheet) and every 1688 line that travels in it.
  const paintKg = useCallback((tracking, id, kg) => {
    const t = String(tracking || "").trim().toUpperCase();
    const onBox = (i) => (t && String(i.trackingNumber || "").toUpperCase() === t ? { ...i, kg } : i);
    setItems((prev) => prev.map(onBox));
    setFeed((prev) => prev.map(onBox));
    setSavedItem((prev) => (prev ? onBox(prev) : prev));
    setSupplierOrders((prev) =>
      prev.map((o) => ((t ? String(o.cnTracking || "").toUpperCase() === t : o.id === id) ? { ...o, kg } : o))
    );
  }, []);

  // Save the weight of a PARCEL. `target` is { tracking, id, prev }: the CN tracking
  // number (the sheet has only that), the 1688 line's id for a line that has none
  // yet, and the weight on screen before this edit. `text` is what was typed: blank
  // clears it, anything else must be a non-negative number. Returns false for text
  // that isn't (after saying why), so the field can put the old figure back;
  // otherwise true, with the save carried on in the background — optimistic like
  // the mode switch, and put back by the server's refusal.
  const saveKg = useCallback(({ tracking, id, prev }, text) => {
    const t = String(text ?? "").trim();
    const kg = t === "" ? null : Number(t);
    if (kg !== null && (!Number.isFinite(kg) || kg < 0)) {
      showToast("KG must be a number, like 1.45", "error");
      return false;
    }
    const key = kgKeyOf(tracking, id);
    if (!key) return false;
    // A run of edits falls back to what the page held before the first of them.
    if (!kgQueuesRef.current.has(key)) kgSavedRef.current.set(key, prev ?? null);
    kgPendingRef.current.set(key, kg);
    kgFailuresRef.current.delete(key);
    paintKg(tracking, id, kg);
    const job = (kgQueuesRef.current.get(key) || Promise.resolve()).then(async () => {
      // A newer edit is queued behind this one; it will send the final figure.
      if (kgPendingRef.current.get(key) !== kg) return;
      try {
        const saved = await (tracking ? updateParcelKg(tracking, kg) : updateSupplierKg(id, kg));
        kgSavedRef.current.set(key, saved);
        if (kgPendingRef.current.get(key) === kg) {
          kgPendingRef.current.delete(key);
          paintKg(tracking, id, saved); // the server's own (rounded) figure
        }
      } catch (e) {
        if (kgPendingRef.current.get(key) !== kg) return; // a newer edit supersedes the failure
        kgPendingRef.current.delete(key);
        kgFailuresRef.current.set(key, e.message || "save failed");
        paintKg(tracking, id, kgSavedRef.current.get(key) ?? null);
        showToast(`KG not saved — ${e.message || "please try again"}`, "error");
      }
    });
    kgQueuesRef.current.set(key, job);
    // Forget a finished queue — unless more was queued behind it meanwhile.
    job.then(() => { if (kgQueuesRef.current.get(key) === job) kgQueuesRef.current.delete(key); });
    return true;
  }, [showToast, paintKg]);

  // A row of the 1688 table: the weight goes to the row's whole parcel.
  const setSupplierKg = useCallback(
    (order, text) => saveKg({ tracking: order.cnTracking, id: order.id, prev: order.kg }, text),
    [saveKg]
  );

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
  // packing list always matches what's on screen rather than every order ever
  // synced — narrowed further by the scope + optional date range the user picks
  // in the export panel.
  // Which format is currently downloading ("xlsx" | "pdf" | ""), not a plain
  // boolean: both buttons live in the same footer, and only the one that was
  // actually clicked should be the one reporting progress.
  const [exportingFormat, setExportingFormat] = useState("");
  const supplierExporting = !!exportingFormat;
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("received");
  const [exportShipMode, setExportShipMode] = useState("all"); // all | air | land
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportImages, setExportImages] = useState(true);

  // An inverted range would silently export nothing, so it's caught here rather
  // than being sent to the server as a valid-looking query.
  const exportRangeInvalid = !!exportFrom && !!exportTo && exportFrom > exportTo;

  // Esc closes the panel — but not mid-export, where the download is already in
  // flight and the button is the only thing still reporting on it.
  useEffect(() => {
    if (!exportOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !supplierExporting) setExportOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen, supplierExporting]);

  // Same rows, same filters, same server code — the format only picks which
  // file the server writes them into.
  const handleExportSupplier = async (format) => {
    if (exportRangeInvalid || supplierExporting) return;
    setExportingFormat(format);
    try {
      const download = format === "pdf" ? exportSupplierOrdersPdf : exportSupplierOrdersXlsx;
      await download(supplierSearch, {
        scope: exportScope,
        mode: exportShipMode,
        from: exportFrom,
        to: exportTo,
        images: exportImages,
      });
      setExportOpen(false);
    } catch (e) {
      showToast(e.message || "Export failed", "error");
    } finally {
      setExportingFormat("");
    }
  };

  // ---- Billing report: same sheet as GtradeA_Billing_Templates.xlsx, either
  // all time or bounded by an order-date range.
  const [reportOpen, setReportOpen] = useState(false);
  const [reportRunning, setReportRunning] = useState(false);
  const [reportRange, setReportRange] = useState("all"); // all | range
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const reportRangeInvalid = reportRange === "range" && !!reportFrom && !!reportTo && reportFrom > reportTo;
  // "Between these dates" with neither date filled is just the all-time report
  // under a different name — say so rather than silently downloading everything.
  const reportRangeEmpty = reportRange === "range" && !reportFrom && !reportTo;

  useEffect(() => {
    if (!reportOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !reportRunning) setReportOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportOpen, reportRunning]);

  const handleDownloadReport = async () => {
    if (reportRangeInvalid || reportRangeEmpty) return;
    setReportRunning(true);
    try {
      await exportBillingReportXlsx(supplierSearch, {
        from: reportRange === "range" ? reportFrom : "",
        to: reportRange === "range" ? reportTo : "",
      });
      setReportOpen(false);
    } catch (e) {
      showToast(e.message || "Report failed", "error");
    } finally {
      setReportRunning(false);
    }
  };

  // The search box on its own, before either dropdown narrows it. Kept separate
  // because the export dialog counts against THIS list: the export posts
  // `supplierSearch` plus its own scope/mode/date choices to the server and knows
  // nothing of the panel's two dropdowns, so bounding its preview by them as well
  // would promise counts the download never produces.
  const searchedSupplier = useMemo(() => {
    const f = supplierSearch.trim().toLowerCase();
    if (!f) return supplierOrders;
    return supplierOrders.filter(
      (o) =>
        (o.orderNumber || "").toLowerCase().includes(f) ||
        (o.cnTracking || "").toLowerCase().includes(f) ||
        (o.productName || "").toLowerCase().includes(f) ||
        (o.itemCode || "").toLowerCase().includes(f) ||
        (o.jobCode || "").toLowerCase().includes(f)
    );
  }, [supplierOrders, supplierSearch]);

  // What the table shows: the search, narrowed by BOTH dropdowns at once. Row order
  // is left exactly as the server sent it (newest first) — the pair narrows the set
  // rather than reshuffling it, so no row ever changes place under the viewer.
  const filteredSupplier = useMemo(() => {
    const byState = supplierMatcher(SUPPLIER_SORTS, supplierSort);
    const byMode = supplierMatcher(SUPPLIER_MODES, supplierModeFilter);
    if (byState === MATCH_ALL && byMode === MATCH_ALL) return searchedSupplier;
    return searchedSupplier.filter((o) => byState(o) && byMode(o));
  }, [searchedSupplier, supplierSort, supplierModeFilter]);

  // The (n) on every option: how many rows you would be left with if you picked it,
  // each side counted with the OTHER dropdown held where the user left it — the same
  // rule the export dialog's two selectors follow. So "By Air (12)" under Received
  // means twelve RECEIVED orders fly, which is exactly the question being asked of
  // it. Counting either side unfiltered would advertise rows the pair filters away.
  const supplierCounts = useMemo(() => {
    const tally = (options, other) =>
      Object.fromEntries(
        options.map((x) => [
          x.value,
          searchedSupplier.filter((o) => (x.match || MATCH_ALL)(o) && other(o)).length,
        ])
      );
    return {
      sort: tally(SUPPLIER_SORTS, supplierMatcher(SUPPLIER_MODES, supplierModeFilter)),
      mode: tally(SUPPLIER_MODES, supplierMatcher(SUPPLIER_SORTS, supplierSort)),
    };
  }, [searchedSupplier, supplierSort, supplierModeFilter]);

  // The rows "Proceed to Shipment" can actually act on: VISIBLE (so the search
  // filter bounds it, exactly like Ship's batch) AND still on the shelf. Both
  // the select-all tick, the "n selected" counter and the ship itself read this
  // one list, so they can never disagree about what a click will send.
  const supplierShipRows = useMemo(
    () => filteredSupplier.filter(supplierShippable),
    [filteredSupplier]
  );
  const supplierSelCount = useMemo(
    () => supplierShipRows.filter((o) => supplierSel.has(o.id)).length,
    [supplierShipRows, supplierSel]
  );

  // While picking a shipment the table splits in two: what's going out at the
  // top, everything still on the shelf underneath. A ticked row MOVES up rather
  // than being listed in both — one row, one checkbox, so there's never a
  // question of which copy is the real one, and the top table is a literal
  // manifest of the batch about to ship. That matters most straight after an
  // Excel import, where the top table IS the packing list.
  const supplierSelectedRows = useMemo(
    () => filteredSupplier.filter((o) => supplierSel.has(o.id)),
    [filteredSupplier, supplierSel]
  );
  const supplierRestRows = useMemo(
    () => filteredSupplier.filter((o) => !supplierSel.has(o.id)),
    [filteredSupplier, supplierSel]
  );
  // Each table's own tickable subset, so its header select-all toggles that
  // table and not the whole panel.
  const supplierSelectedShippable = useMemo(
    () => supplierShipRows.filter((o) => supplierSel.has(o.id)),
    [supplierShipRows, supplierSel]
  );
  const supplierRestShippable = useMemo(
    () => supplierShipRows.filter((o) => !supplierSel.has(o.id)),
    [supplierShipRows, supplierSel]
  );

  // Hand the selected 1688 rows to the shared ship confirm as the warehouse
  // boxes they matched.
  const requestSupplierShip = () => {
    const orders = supplierShipRows.filter((o) => supplierSel.has(o.id));
    if (!orders.length) return showToast("Select received orders to ship first", "warn");
    // Several 1688 line items routinely share ONE CN tracking — and therefore
    // one physical box. Ship that box once: a second /ship on the same id comes
    // back 409 and would be counted as a failure for a shipment that worked.
    const seen = new Set();
    const list = [];
    for (const o of orders) {
      if (seen.has(o.warehouseItemId)) continue;
      seen.add(o.warehouseItemId);
      list.push(items.find((i) => i.id === o.warehouseItemId) || supplierAsItem(o));
    }
    setShipLogistics("");
    setShipConfirmIsBatch(false);
    setShipConfirmFromSupplier(true);
    setShipConfirmGoods(orders.length);
    setShipConfirmItems(list);
  };

  // How many rows each scope and each shipment mode would export under the
  // current search + date range, shown live next to the choices so nobody waits
  // out a slow export only to open an empty sheet. Counted off the rows already
  // loaded here; the file itself is still built server-side from the same
  // filters.
  //
  // The two sets are counted with the OTHER control held where the user left it,
  // so each number answers the question actually being asked of it: "how many if
  // I switch to this scope (keeping By Air)", and "how many go by air (within
  // Received Only)". Counting either one unfiltered would advertise rows the
  // export then drops.
  const exportCounts = useMemo(() => {
    const inRange = (o) => {
      if (!exportFrom && !exportTo) return true;
      const day = orderDay(o);
      if (!day) return false; // no order date can't be placed in a window
      if (exportFrom && day < exportFrom) return false;
      if (exportTo && day > exportTo) return false;
      return true;
    };
    const rows = searchedSupplier.filter(inRange);
    const pickedMode = EXPORT_MODES.find((m) => m.value === exportShipMode) || EXPORT_MODES[0];
    const pickedScope = EXPORT_SCOPES.find((s) => s.value === exportScope) || EXPORT_SCOPES[0];
    return {
      scope: Object.fromEntries(
        EXPORT_SCOPES.map((s) => [s.value, rows.filter((o) => s.match(o) && pickedMode.match(o)).length])
      ),
      mode: Object.fromEntries(
        EXPORT_MODES.map((m) => [m.value, rows.filter((o) => m.match(o) && pickedScope.match(o)).length])
      ),
    };
  }, [searchedSupplier, exportFrom, exportTo, exportScope, exportShipMode]);

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
        <div className={`mx-auto ${PAGE_MAX_W} px-4 ${HEADER_PAD} sm:px-6 md:pb-0`}>
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
          <div className={`${TABS_PAD} hidden overflow-x-auto md:block [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
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

      <main className={`mx-auto ${PAGE_MAX_W} space-y-5 px-4 ${MAIN_PAD} sm:px-6`}>
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
                            {/* The goods number leads the card on a GtradeA box; tapping it opens the box's QC photos. */}
                            {isGtradea && goodsCode(it) && (
                              <div className="mb-1.5 text-sm font-bold text-[#412460]">
                                <GoodsNo code={goodsCode(it)} onOpen={() => openQc(it)} tracking={it.trackingNumber} />
                              </div>
                            )}
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
                onOpenQc={openQc}
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
                onOpenQc={openQc}
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
                {/* Two dropdowns, Mode to the right of Sort by. They narrow the
                    table together — see SUPPLIER_SORTS / SUPPLIER_MODES above. */}
                <label className="flex items-center gap-2">
                  <span className={FILTER_LABEL}>Sort by</span>
                  <select
                    value={supplierSort}
                    onChange={(e) => setSupplierSort(e.target.value)}
                    aria-label="Filter 1688 orders by warehouse state"
                    className={FILTER_SELECT}
                  >
                    {SUPPLIER_SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {`${s.label} (${supplierCounts.sort[s.value] ?? 0})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className={FILTER_LABEL}>Mode</span>
                  <select
                    value={supplierModeFilter}
                    onChange={(e) => setSupplierModeFilter(e.target.value)}
                    aria-label="Filter 1688 orders by shipment mode"
                    className={FILTER_SELECT}
                  >
                    {SUPPLIER_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {`${m.label} (${supplierCounts.mode[m.value] ?? 0})`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <SearchInput
                value={supplierSearch}
                onChange={setSupplierSearch}
                placeholder="Search order #, CN tracking, or product…"
              />
              {/* Export and the billing report are paperwork you fetch BEFORE a
                  shipment is picked, and both open a modal of their own. Once
                  the panel is in shipment mode they'd be two more things to read
                  past — and two ways to lose a half-built selection to a dialog
                  — so the toolbar drops to shipment actions only. */}
              {!supplierShipMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => setExportOpen(true)}
                    disabled={supplierExporting}
                    className={BTN_GHOST}
                  >
                    <IconDownload className={`h-3.5 w-3.5 ${supplierExporting ? "animate-pulse" : ""}`} />
                    {supplierExporting ? "Exporting…" : "Export"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(true)}
                    disabled={reportRunning}
                    className={BTN_GHOST}
                  >
                    <IconReport className={`h-3.5 w-3.5 ${reportRunning ? "animate-pulse" : ""}`} />
                    {reportRunning ? "Preparing…" : "Download Report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShipStartOpen(true)}
                    disabled={batchBusy}
                    className={BTN_PRIMARY}
                  >
                    <IconTruck className="h-3.5 w-3.5" /> Proceed to Shipment
                  </button>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#412460]/10 px-3 py-2 text-xs font-bold text-[#412460]">
                    <IconCheck className="h-3.5 w-3.5" /> {supplierSelCount} selected
                  </span>
                  <button
                    type="button"
                    onClick={requestSupplierShip}
                    disabled={supplierSelCount === 0 || batchBusy}
                    className={BTN_PRIMARY}
                  >
                    <IconTruck className="h-3.5 w-3.5" /> {batchBusy ? "Shipping…" : "Ship selected"}
                  </button>
                  {/* Re-import without leaving the mode — the first sheet picked
                      is often the wrong revision. A sheet REPLACES the selection
                      rather than adding to it, so what's ticked is always
                      exactly what the banner below says it is. */}
                  <button
                    type="button"
                    title="Replaces the current selection with the goods named in the sheet"
                    onClick={() => importFileRef.current?.click()}
                    disabled={importBusy || batchBusy}
                    className={BTN_GHOST}
                  >
                    <IconUpload className={`h-3.5 w-3.5 ${importBusy ? "animate-pulse" : ""}`} />
                    {importBusy ? "Reading…" : "Import Excel"}
                  </button>
                  <button type="button" onClick={exitSupplierShip} disabled={batchBusy} className={BTN_GHOST}>
                    Cancel
                  </button>
                </>
              )}
            </div>

            {/* One number: how many goods the sheet just selected. Everything
                else about the import (rows read, ids parsed, why a row missed)
                was noise at a glance — the count is the only thing anyone acts
                on, and the table below already shows exactly which rows. The
                one exception is goods on the sheet that CAN'T ship, which is
                said in plain words because silently dropping a line off a
                packing list is how a shipment goes out short. */}
            {supplierShipMode && importSummary && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[#412460]/[0.04] p-4 ring-1 ring-[#412460]/12">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#412460] ring-1 ring-[#412460]/15">
                  <IconSheet className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {/* Two numbers, side by side and labelled, because the only
                      question being asked of this banner is "did it pick up
                      everything on my sheet?" — which is a comparison, not a
                      single figure. Equal is the good case and reads as such;
                      a short count turns amber and the line below says why. */}
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="flex items-baseline gap-2">
                      <span className={LABEL}>In Excel</span>
                      <span className="text-sm font-bold text-[#2D2D2D]">{importSummary.inExcel}</span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className={LABEL}>Selected goods</span>
                      <span
                        className={`text-sm font-bold ${
                          importSummary.selected === importSummary.inExcel ? "text-[#412460]" : "text-[#B99353]"
                        }`}
                      >
                        {importSummary.selected}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-[#2D2D2D]/55">
                    {importSummary.fileName}
                    {importSummary.skipped > 0 && (
                      <span className="text-[#B99353]">
                        {" "}· {importSummary.skipped} on this sheet can&rsquo;t ship yet
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportSummary(null)}
                  aria-label="Dismiss import summary"
                  className="shrink-0 rounded-full p-1.5 text-[#2D2D2D]/35 transition-colors hover:bg-white hover:text-[#412460]"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Shipment mode reads top-down: the manifest first, then the shelf
                it's being built from. Outside it the panel is one flat table, as
                it always was. */}
            {supplierShipMode ? (
              <div className="space-y-7">
                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <SectionTitle>Selected shipments ({supplierSelCount})</SectionTitle>
                    {supplierSelCount > 0 && (
                      <button type="button" onClick={clearSupplierSel} disabled={batchBusy} className={BTN_GHOST}>
                        Clear selection
                      </button>
                    )}
                  </div>
                  {supplierSelectedRows.length > 0 ? (
                    <SupplierOrdersTable
                      rows={supplierSelectedRows}
                      selectable
                      selected={supplierSel}
                      shippableRows={supplierSelectedShippable}
                      onToggleSelect={toggleSupplierSel}
                      onToggleAll={(checked) => toggleAllSupplier(supplierSelectedShippable, checked)}
                      onSetMode={setSupplierMode}
                      onSetKg={setSupplierKg}
                      onOpenQc={openQc1688}
                      modeBusy={modeBusy}
                    />
                  ) : (
                    <div className="rounded-2xl bg-[#F6F4F0] px-4 py-8 text-center">
                      <p className="text-xs text-[#2D2D2D]/50">
                        Nothing selected yet — tick the goods below, or
                      </p>
                      <button
                        type="button"
                        onClick={() => importFileRef.current?.click()}
                        disabled={importBusy}
                        className={`${BTN_GHOST} mt-3`}
                      >
                        <IconUpload className={`h-3.5 w-3.5 ${importBusy ? "animate-pulse" : ""}`} />
                        {importBusy ? "Reading…" : "Import a packing list"}
                      </button>
                    </div>
                  )}
                </section>
                <section>
                  <div className="mb-3">
                    <SectionTitle>All goods ({supplierRestRows.length})</SectionTitle>
                  </div>
                  <SupplierOrdersTable
                    rows={supplierRestRows}
                    loading={supplierLoading}
                    filtered={!!supplierSearch.trim() || supplierSort !== "date" || supplierModeFilter !== "all"}
                    empty={supplierSelectedRows.length > 0 ? "Every order here is already in the shipment above." : ""}
                    selectable
                    selected={supplierSel}
                    shippableRows={supplierRestShippable}
                    onToggleSelect={toggleSupplierSel}
                    onToggleAll={(checked) => toggleAllSupplier(supplierRestShippable, checked)}
                    onSetMode={setSupplierMode}
                    onSetKg={setSupplierKg}
                      onOpenQc={openQc1688}
                    modeBusy={modeBusy}
                  />
                </section>
              </div>
            ) : (
              <SupplierOrdersTable
                rows={filteredSupplier}
                loading={supplierLoading}
                filtered={!!supplierSearch.trim() || supplierSort !== "date" || supplierModeFilter !== "all"}
                selected={supplierSel}
                shippableRows={supplierShipRows}
                onToggleSelect={toggleSupplierSel}
                onToggleAll={(checked) => toggleAllSupplier(supplierShipRows, checked)}
                onSetMode={setSupplierMode}
                onSetKg={setSupplierKg}
                      onOpenQc={openQc1688}
                modeBusy={modeBusy}
              />
            )}

            {/* The file picker both import buttons and the chooser drive. Kept
                mounted (not inside the chooser) so re-importing from the toolbar
                doesn't have to reopen a dialog to reach it. */}
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFile}
              className="hidden"
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

      {/* How this shipment gets picked. Two ways in, asked once, up front —
          rather than a mode that silently starts empty and an import button
          buried in a toolbar nobody reads on a warehouse tablet. */}
      {shipStartOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm"
          onClick={() => { if (!importBusy) setShipStartOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose how to pick this shipment"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
          >
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#412460]/10 text-[#412460]">
              <IconTruck className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">Proceed to shipment</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              How do you want to pick the goods going out?
            </p>

            <div className="mt-5 space-y-3">
              {/* Excel leads: it's the one that saves the work, and it's what a
                  packer already has in hand after exporting the packing list. */}
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={importBusy}
                className="flex w-full items-start gap-3 rounded-2xl bg-[#F6F4F0] p-4 text-left ring-1 ring-transparent transition-all hover:bg-white hover:ring-[#412460]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#412460] text-white">
                  <IconSheet className={`h-4 w-4 ${importBusy ? "animate-pulse" : ""}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#2D2D2D]">
                    {importBusy ? "Reading the sheet…" : "Import through Excel"}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#2D2D2D]/55">
                    Pick the packing list you exported. Every <strong className="font-semibold">Goods No.</strong> and{" "}
                    <strong className="font-semibold">Order ID</strong> in it is ticked here automatically.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={startManualShip}
                disabled={importBusy}
                className="flex w-full items-start gap-3 rounded-2xl bg-[#F6F4F0] p-4 text-left ring-1 ring-transparent transition-all hover:bg-white hover:ring-[#412460]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#412460] ring-1 ring-[#E6E2DB]">
                  <IconKeyboard className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#2D2D2D]">Manual shipment</span>
                  <span className="mt-0.5 block text-xs text-[#2D2D2D]/55">
                    Tick the received orders yourself, straight from the table.
                  </span>
                </span>
              </button>
            </div>

            <p className="mt-4 text-[11px] text-[#2D2D2D]/40">
              Either way, only 📦 Received goods can be selected — and you confirm the
              logistics carrier before anything ships.
            </p>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShipStartOpen(false)}
                disabled={importBusy}
                className={BTN_GHOST}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GtradeA billing report — all time, or bounded by order date */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm"
          onClick={() => { if (!reportRunning) setReportOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Download billing report"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
          >
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#267488]/10 text-[#267488]">
              <IconReport className="h-5 w-5" />
            </span>
            <h3 className="text-base font-bold">Billing report</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              Date, Product ID, Order ID, product, quantity and price for every 1688 line item
              {supplierSearch.trim() ? <> matching &ldquo;{supplierSearch.trim()}&rdquo;</> : null}. Each
              line keeps its own Product ID; lines belonging to one order share a single Order ID
              and price cell.
            </p>

            <div className="mt-5 space-y-2">
              {[
                { value: "all", label: "All time", hint: "Every 1688 order on record." },
                { value: "range", label: "Between these dates", hint: "Bounds the gtradea order date, both ends included." },
              ].map((opt) => {
                const active = reportRange === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer gap-3 rounded-2xl p-3.5 ring-1 transition-all ${
                      active
                        ? "bg-[#267488]/[0.07] ring-[#267488]/40"
                        : "bg-[#F6F4F0] ring-transparent hover:ring-[#E6E2DB]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-range"
                      value={opt.value}
                      checked={active}
                      onChange={() => setReportRange(opt.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#267488]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#2D2D2D]">{opt.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[#2D2D2D]/55">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {reportRange === "range" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] text-[#2D2D2D]/45">From</span>
                  <input
                    type="date"
                    value={reportFrom}
                    max={reportTo || undefined}
                    onChange={(e) => setReportFrom(e.target.value)}
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-[#2D2D2D]/45">To</span>
                  <input
                    type="date"
                    value={reportTo}
                    min={reportFrom || undefined}
                    onChange={(e) => setReportTo(e.target.value)}
                    className={FIELD}
                  />
                </label>
              </div>
            )}

            {reportRangeInvalid ? (
              <p className="mt-3 text-[11px] font-semibold text-red-600">
                &ldquo;From&rdquo; is after &ldquo;To&rdquo; — no order can fall in that range.
              </p>
            ) : reportRangeEmpty ? (
              <p className="mt-3 text-[11px] font-semibold text-[#B99353]">
                Pick at least one date, or switch back to All time.
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                disabled={reportRunning}
                className={BTN_GHOST}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={reportRunning || reportRangeInvalid || reportRangeEmpty}
                className={BTN_PRIMARY}
              >
                <IconDownload className={`h-3.5 w-3.5 ${reportRunning ? "animate-pulse" : ""}`} />
                {reportRunning ? "Preparing…" : "Download"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1688 packing-list export — pick the slice, optionally bound by order date */}
      {exportOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2D2D2D]/50 p-4 backdrop-blur-sm"
          onClick={() => { if (!supplierExporting) setExportOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Export 1688 orders"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            {/* Only the CHOICES scroll — the action row below is pinned. There
                are five controls here now, which is past one phone screen, and a
                Cancel/Export row that scrolls out of reach is the one part of a
                dialog that always has to be within reach. min-h-0 because a flex
                child won't shrink below its content otherwise, and the panel
                would grow past 90vh instead of scrolling inside it. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#412460]/10 text-[#412460]">
                <IconDownload className="h-5 w-5" />
              </span>
              <h3 className="text-base font-bold">What do you want to export?</h3>
              <p className="mt-1 text-xs text-[#2D2D2D]/55">
                Builds the styled packing list from the orders{" "}
                {supplierSearch.trim() ? <>matching &ldquo;{supplierSearch.trim()}&rdquo;</> : "on this tab"} — as an
                Excel sheet to work in, or a PDF to print and send.
              </p>

              <div className="mt-5 space-y-2">
                {EXPORT_SCOPES.map((s) => {
                  const active = exportScope === s.value;
                  return (
                    <label
                      key={s.value}
                      className={`flex cursor-pointer gap-3 rounded-2xl p-3.5 ring-1 transition-all ${
                        active
                          ? "bg-[#412460]/[0.06] ring-[#412460]/40"
                          : "bg-[#F6F4F0] ring-transparent hover:ring-[#E6E2DB]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="export-scope"
                        value={s.value}
                        checked={active}
                        onChange={() => setExportScope(s.value)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#412460]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-[#2D2D2D]">
                            {s.label}
                            {s.value === "received" && (
                              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#412460]/60">
                                Default
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-[#412460]">
                            {exportCounts.scope[s.value]}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[#2D2D2D]/55">{s.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Shipment mode — the cut that decides which forwarder the sheet
                  goes to, so it sits directly under the scope rather than with
                  the formatting options at the bottom. */}
              <div className="mt-5">
                <span className={LABEL}>Shipment mode</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {EXPORT_MODES.map((m) => {
                    const active = exportShipMode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setExportShipMode(m.value)}
                        aria-pressed={active}
                        className={`rounded-2xl px-3 py-2.5 text-left ring-1 transition-all ${
                          active
                            ? "bg-[#412460]/[0.06] ring-[#412460]/40"
                            : "bg-[#F6F4F0] ring-transparent hover:ring-[#E6E2DB]"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-1">
                          <span className="text-xs font-semibold text-[#2D2D2D]">{m.label}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-[#412460]">
                            {exportCounts.mode[m.value]}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-[#2D2D2D]/50">{m.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-[#2D2D2D]/45">
                  Uses each order&apos;s Mode column — the staff correction where there is one, otherwise the
                  auto-detected answer.
                </p>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <span className={LABEL}>By date — optional</span>
                  {(exportFrom || exportTo) && (
                    <button
                      type="button"
                      onClick={() => { setExportFrom(""); setExportTo(""); }}
                      className="text-[11px] font-semibold text-[#412460]/70 transition-colors hover:text-[#412460]"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-[#2D2D2D]/45">From</span>
                    <input
                      type="date"
                      value={exportFrom}
                      max={exportTo || undefined}
                      onChange={(e) => setExportFrom(e.target.value)}
                      className={FIELD}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-[#2D2D2D]/45">To</span>
                    <input
                      type="date"
                      value={exportTo}
                      min={exportFrom || undefined}
                      onChange={(e) => setExportTo(e.target.value)}
                      className={FIELD}
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-[11px] text-[#2D2D2D]/45">
                  Bounds the 1688 order date, both ends included. Leave blank for every date.
                </p>
              </div>

              <div className="mt-5">
                <span className={LABEL}>Product photos</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { on: true, label: "With images", hint: "Photo in every row" },
                    { on: false, label: "Without images", hint: "Faster, much smaller file" },
                  ].map((opt) => (
                    <button
                      key={String(opt.on)}
                      type="button"
                      onClick={() => setExportImages(opt.on)}
                      aria-pressed={exportImages === opt.on}
                      className={`rounded-2xl px-3 py-2.5 text-left ring-1 transition-all ${
                        exportImages === opt.on
                          ? "bg-[#412460]/[0.06] ring-[#412460]/40"
                          : "bg-[#F6F4F0] ring-transparent hover:ring-[#E6E2DB]"
                      }`}
                    >
                      <span className="block text-xs font-semibold text-[#2D2D2D]">{opt.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-[#2D2D2D]/50">{opt.hint}</span>
                    </button>
                  ))}
                </div>
                {!exportImages && (
                  <p className="mt-1.5 text-[11px] text-[#2D2D2D]/45">
                    The Product Image column is left out entirely, so there&apos;s no empty gap in the sheet.
                  </p>
                )}
              </div>
            </div>

            {/* Pinned action row. The warning travels WITH the buttons rather
                than staying up in the scroll body, so the reason an export is
                blocked (or will come out empty) is on screen at the moment it's
                clicked. Excel leads — it's the working copy staff fill the
                Ctn. No / KG / CBM columns into. The PDF is the same list frozen
                for printing and emailing, so it sits beside it rather than under
                a menu. */}
            <div className="shrink-0 border-t border-[#E6E2DB] bg-white px-6 py-4">
              {exportRangeInvalid ? (
                <p className="mb-3 text-[11px] font-semibold text-red-600">
                  &ldquo;From&rdquo; is after &ldquo;To&rdquo; — no order can fall in that range.
                </p>
              ) : exportCounts.scope[exportScope] === 0 ? (
                // Not a hard block: the sheet is built server-side from the full
                // order table, and these counts only see what this tab has loaded.
                <p className="mb-3 text-[11px] font-semibold text-[#B99353]">
                  No loaded orders match this choice — the sheet may come out empty.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExportOpen(false)}
                  disabled={supplierExporting}
                  className={`${BTN_GHOST} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSupplier("pdf")}
                  disabled={supplierExporting || exportRangeInvalid}
                  className={`${BTN_GHOST} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <IconDownload className={`h-3.5 w-3.5 ${exportingFormat === "pdf" ? "animate-pulse" : ""}`} />
                  {exportingFormat === "pdf" ? "Exporting…" : "Export as PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSupplier("xlsx")}
                  disabled={supplierExporting || exportRangeInvalid}
                  className={BTN_PRIMARY}
                >
                  <IconDownload className={`h-3.5 w-3.5 ${exportingFormat === "xlsx" ? "animate-pulse" : ""}`} />
                  {exportingFormat === "xlsx" ? "Exporting…" : "Export as Excel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div className="mb-4 flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#412460]/10 text-[#412460]">
                <IconCheck className="h-5 w-5" />
              </span>
              {/* Print WITHOUT shipping, from the corner the eye lands on before
                  it reaches the confirm buttons. Scanning a box on the Ship tab
                  lands here, and the box is often under the scanner for a
                  replacement label — a sticker torn, smudged or never printed —
                  rather than because it is going out. Before this the only way to
                  the printer was to cancel and hunt the box down in the list.

                  Prints on the spot: one copy, the shipment mode already recorded
                  on the box, and the dialog closes immediately so the scanner is
                  free for the next box. No copies prompt — put-away prints the
                  same way (printSavedItemNow), and a prompt in the middle of a
                  scan-after-scan run is a keystroke nobody has a hand free for.
                  The row's own print button still opens the full prompt when a
                  different count or mode is actually wanted.

                  Not awaited on purpose: the print goes to the bridge or the
                  queue and reports itself by toast, and the popup must not sit
                  open waiting for a printer.

                  One box only — a batch confirm has no single label to print,
                  and the row actions already print a group. */}
              {shipConfirmItems.length === 1 && (
                <button
                  type="button"
                  title="Print this box's label — nothing is shipped"
                  onClick={() => {
                    const it = shipConfirmItems[0];
                    setShipConfirmItems(null);
                    doPrintLabel(it, 1, it.shipmentFrom === "By Land" ? "By Land" : "By Air");
                  }}
                  className={BTN_GHOST}
                >
                  <IconPrinter className="h-3.5 w-3.5" /> Print Label
                </button>
              )}
            </div>
            {/* Goods vs parcels. The 1688 panel selects GOODS, but a ship acts on
                the PARCEL they arrived in, and several 1688 lines routinely share
                one CN tracking. Saying only the parcel count read as if rows had
                been dropped between the panel and this dialog, so whenever the two
                differ both numbers are named and the gap is explained. */}
            <h3 className="text-base font-bold">
              {shipConfirmGoods > shipConfirmItems.length
                ? `Ship ${shipConfirmGoods} goods in ${shipConfirmItems.length} parcels?`
                : shipConfirmItems.length > 1
                  ? `Mark ${shipConfirmItems.length} items as shipped?`
                  : "Mark this item as shipped?"}
            </h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              {shipConfirmGoods > shipConfirmItems.length ? (
                <>All {shipConfirmGoods} selected goods are dispatched — goods sharing a CN tracking are one parcel, so they ship together.</>
              ) : shipConfirmItems.length > 1 ? (
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
              {shipConfirmGoods > shipConfirmItems.length
                ? "One line per parcel, named by the goods id on its label. Each ships via the mode set when that label was printed."
                : shipConfirmItems.length > 1
                  ? "Each ships via the mode set when its label was printed."
                  : "Set when the label was printed — reprint the label to change it."}
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
                    options={LOGISTICS_CARRIERS}
                    placeholder="Search or type, e.g. Cellzen Trading"
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
                {shipConfirmGoods > shipConfirmItems.length
                  ? `Ship ${shipConfirmGoods} goods`
                  : shipConfirmItems.length > 1
                    ? `Ship ${shipConfirmItems.length} items`
                    : "Mark as Shipped"}
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

      {/* toast — above every overlay (the "Item stored" sheet is z-140, the
          copies dialog z-150), or a failure reported while one is open is never
          seen. While the sheet is open it moves to the TOP: at the bottom it sat
          on the sheet's Print label button on a phone, and a tap meant for the
          toast went through it and printed a second label. pointer-events-none
          so it never swallows a tap either way. */}
      {toast && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[160] flex -translate-x-1/2 items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-lg shadow-black/15 ${
            savedItem ? "top-6" : "bottom-24 md:bottom-6"
          } ${
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
          onClick={() => gateThen("ok")}
        >
          <div
            role="dialog"
            aria-modal="true"
            // No visible heading any more, so the dialog carries its name here.
            aria-label={savedItem.pending ? "Storing item" : "Item stored"}
            aria-busy={savedItem.pending ? "true" : undefined}
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={keepSavedSheet}
            onTouchStart={keepSavedSheet}
            onFocusCapture={keepSavedSheet}
          >
            {/* The id that's about to be printed, biggest thing on the sheet —
                staff confirm it against the gtradea China Operations row at a
                glance — with the tick on its right: a spinner while the server is
                still storing the box, the check mark once it has. On a GtradeA box
                the id is a link to the QC photos saved for it. While pending it's
                the 1688 preview's id, or a placeholder until the server mints one. */}
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-xl font-black tracking-tight text-[#412460]">
                {goodsCode(savedItem) ? (
                  isGtradea && trackingReady
                    ? <GoodsNo code={goodsCode(savedItem)} onOpen={() => openQc(savedItem)} tracking={savedItem.trackingNumber} />
                    : <span className="break-all">{goodsCode(savedItem)}</span>
                ) : (
                  savedItem.pending ? <span className="inline-block h-7 w-40 animate-pulse rounded-lg bg-[#F1EFEA] align-middle" /> : null
                )}
              </p>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
                {savedItem.pending ? (
                  <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-emerald-600/25 border-t-emerald-600" />
                ) : (
                  <IconCheck className="h-6 w-6" />
                )}
              </span>
            </div>
            {/* A GtradeA box the loaded 1688 list doesn't know yet: a placeholder
                card until the server says what's inside. Cellzen boxes carry no
                product at all, so they get none. */}
            {savedItem.pending && isGtradea && !savedItem.products?.length && !savedItem.productName && (
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#F6F4F0] p-2.5" aria-hidden="true">
                <span className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-white" />
                <div className="flex-1 space-y-2">
                  <span className="block h-3.5 w-4/5 animate-pulse rounded bg-white" />
                  <span className="block h-3.5 w-3/5 animate-pulse rounded bg-white" />
                  <span className="block h-3 w-2/5 animate-pulse rounded bg-white" />
                </div>
              </div>
            )}
            {/* What's in the box, so the goods in hand can be checked against the
                order. A reply that couldn't list the parcel still names the
                product the box was stored with. Keyed by tracking number, not id:
                a pending sheet turning into the stored box keeps its photos
                instead of remounting them, while the next box starts fresh. */}
            <StoredProducts
              key={savedItem.trackingNumber || savedItem.id}
              products={
                savedItem.products?.length
                  ? savedItem.products
                  : savedItem.productName
                    ? [{ itemCode: savedItem.itemCode, name: savedItem.productName, image: "", quantity: null }]
                    : []
              }
            />
            {/* QC Image: up to two photos of the goods, from the camera or the
                gallery. Off while a scan is still being stored with no 1688 line
                to preview (the tracking number is not known to be one yet). */}
            {isGtradea && (
              <div className="mt-4">
                <QcImages
                  key={savedItem.trackingNumber || savedItem.id}
                  tracking={savedItem.trackingNumber}
                  notify={showToast}
                  disabled={!trackingReady}
                  onOpen={(i) => openQc(savedItem, i)}
                  onAdded={(saved) => noteSheetQc(savedItem.trackingNumber, saved)}
                />
              </div>
            )}
            <dl className="mt-5 divide-y divide-[#F1EFEA] text-sm">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-[#2D2D2D]/50">Shelf</dt>
                <dd className="font-semibold">{savedItem.rackId || "—"}</dd>
              </div>
              {/* py-2, not py-3: the switch is taller than a line of text, and
                  this keeps the row the same height as its neighbours. */}
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="shrink-0 text-[#2D2D2D]/50">Mode of shipment</dt>
                <dd>
                  <ShipModeToggle value={savedItem.shipmentFrom} onChange={changeSavedItemMode} />
                </dd>
              </div>
              {/* The parcel's weight, when it has been on the scale: typed here it
                  is saved to the box's 1688 lines (the KG column of the 1688 table)
                  and printed on the label beside "HANDLE WITH CARE". Keyed by
                  tracking number so a scan that replaces the sheet starts a fresh
                  field — after saving what was typed. Off while a scan is still
                  being stored with no 1688 line to preview: only the server knows
                  what the tracking number really is by then. */}
              {isGtradea && (
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="shrink-0 text-[#2D2D2D]/50">Weight</dt>
                  <dd>
                    <KgInput
                      key={savedItem.trackingNumber || savedItem.id}
                      kg={savedItem.kg ?? null}
                      label={`KG for ${savedItem.trackingNumber || "this box"}`}
                      disabled={!trackingReady}
                      large
                      flushOnUnmount
                      handleRef={sheetKgHandle}
                      onCommit={(text, prev) => saveKg({ tracking: savedItem.trackingNumber, prev }, text)}
                    />
                  </dd>
                </div>
              )}
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
              {/* Who stored it and when live in the "Just scanned" table; the
                  sheet keeps only what's needed to check and label the box. */}
            </dl>
            <div className="mt-6 space-y-2.5">
              {/* The wait shows on the button itself: a tap on a sheet still being
                  stored, or one waiting on a mode save, prints once — repeat taps
                  meanwhile are ignored rather than queued as extra labels. */}
              <button
                type="button"
                onClick={() => gateThen("print")}
                disabled={printWaiting.has(queueKeyOf(savedItem))}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#412460] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#B99353] active:scale-[.98] disabled:cursor-wait disabled:opacity-70"
              >
                {printWaiting.has(queueKeyOf(savedItem)) ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {savedItem.pending ? "Printing once stored…" : "Printing…"}
                  </>
                ) : (
                  <>
                    <IconPrinter className="h-4 w-4" /> Print label
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => gateThen("copies")}
                disabled={printWaiting.has(queueKeyOf(savedItem))}
                className="w-full text-center text-xs font-semibold text-[#2D2D2D]/45 underline decoration-[#2D2D2D]/20 underline-offset-2 transition hover:text-[#412460] disabled:cursor-wait disabled:opacity-50"
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
                  onClick={() => gateThen("ok")}
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

      {/* A scan being confirmed with the server, whose popup is held until it has a
          product to show (see storeTracking). Above the "Item stored" sheet and the
          camera, never in the way of a tap. */}
      {checkingScans > 0 && createPortal(
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-36 z-[145] flex justify-center px-4 md:bottom-16">
          <div className="flex items-center gap-2.5 rounded-full bg-[#2D2D2D] px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Checking product…
          </div>
        </div>,
        document.body
      )}

      {/* The saved QC photos of a box — opens from any goods number. Above the
          "Item stored" sheet (z-140), so it can be opened from there too. */}
      {qcViewer && <QcViewer target={qcViewer} onClose={() => setQcViewer(null)} notify={showToast} />}

      {/* "QC Image Upload" — before a label prints (or the sheet closes) on a box with
          no QC photo. Above the sheet (z-140), below the photo viewer (z-160). */}
      {qcGate && (
        <QcGate
          target={qcGate}
          notify={showToast}
          onClose={() => setQcGate(null)}
          onUploaded={(saved) => finishQcGate(qcGate, saved)}
        />
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
function GtradeaItemsTable({ onOpenQc, rows, onView, emptyAll = false, emptyText, onShip, onDelete, onPrint, onPrintGroup, onDownload, selectable = false, selected, onToggleSelect, onToggleAll, onToggleRows }) {
  // One row per 1688 ORDER NUMBER, expanding to one row per PRODUCT in it.
  //
  // An order is what staff work from — gtradea publishes it, the supplier ships
  // against it, and it is what the ship confirm and the paperwork are keyed to.
  // Its products are what they have to check off: an order carrying 15 of them
  // needs ONE row that says so and opens to the 15, not 15 top-level rows (or,
  // worse, one row naming a single product as if it were the whole order).
  //
  // Grouping used to key on the internal `code` + the box's displayed goods id,
  // which is a finer cut than an order — `code` is minted per order, so pairing
  // it with the id split one order into a row per product. Ordering by
  // order_number merges those back under the order they belong to, and the
  // expansion below is what keeps every product individually visible.
  //
  // Boxes with no order number (a cellzen box, or a gtradea one gtradea hasn't
  // published an order for) keep the old key, so they still group the way they
  // did instead of all collapsing under one blank heading.
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Order preserved: rows arrive pre-sorted newest first, and Map keeps
  // first-seen key order, so each group surfaces at its most recent member's
  // position.
  //
  // Two lists per group, and they are NOT the same length:
  //   boxes — the physical packages. What ship/print/select act on.
  //   units — one per PRODUCT. A parcel can hold several (a supplier bagging two
  //           products under one CN tracking), which is exactly the case that
  //           showed a single product id for a box holding two.
  // A unit is `lead` when it is the first of its box: the actions and the
  // checkbox are drawn on that one only, because shipping "a product" that
  // shares a package with another would ship both — the box is the unit that
  // moves, so it must not be offered twice.
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of rows || []) {
      const key = it.orderNumber || `${it.code || it.id}::${goodsCode(it) || it.id}`;
      if (!map.has(key)) map.set(key, { key, boxes: [], units: [] });
      const g = map.get(key);
      g.boxes.push(it);
      // One unit per product in this parcel, DUPLICATES INCLUDED — two lines
      // booked against the same product id are two things in the bag, and each
      // gets its own row reading that id.
      const list = parcelLineIds(it);
      list.forEach((productId, i) => {
        g.units.push({
          id: `${it.id}::${i}`,
          item: it,
          productId,
          lead: i === 0,
          // Marked on EVERY row of a shared package, not just the followers:
          // the mark names the package's MAIN code — the id its barcode carries
          // and the one it is filed under — so a product with its own id
          // (GTI-100250) still reads "GTI-100247 (Same)" and staff know which
          // box on the shelf to go to. A mark on the second row alone would read
          // as a footnote to the first instead of a property of the parcel.
          shared: list.length > 1,
        });
      });
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
        {groups.map(({ key, boxes, units }) => {
          const head = boxes[0];
          // Products, not packages — same rule as the desktop table.
          const count = units.length;
          const isGroup = count > 1;
          const isOpen = isGroup && expanded.has(key);
          const modes = new Set(boxes.map((g) => g.shipmentFrom || "By Air"));
          // The count lives in its own column now, so this names the products
          // instead of repeating it: the first id, and how many more are behind
          // the dropdown.
          const codes = [...new Set(units.map((u) => u.productId).filter(Boolean))];
          const codeLabel = codes.length ? (codes.length === 1 ? codes[0] : `${codes[0]} +${codes.length - 1}`) : "";
          const trackings = new Set(boxes.map((b) => b.trackingNumber).filter(Boolean));
          const trackingLabel = trackings.size === 1 ? [...trackings][0] : (trackings.size ? `${trackings.size} trackings` : "");
          return (
            <li key={key} className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_16px_-8px_rgba(45,45,45,0.16)] ring-1 ring-[#ECE9E3]">
              <div
                onClick={() => (isGroup ? toggleExpand(key) : onView(head))}
                className="cursor-pointer p-4 transition active:scale-[.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  {selectable && (
                    <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      {isGroup ? (
                        <SelectAllCheck rows={boxes} selected={selected} onToggleAll={(checked) => onToggleRows(boxes, checked)} />
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
                    <dt className="text-[#2D2D2D]/45">Product ID</dt>
                    <dd className={`font-semibold ${codes.length > 1 ? "text-[#2D2D2D]/45" : "text-[#412460]"}`}>
                      {/* One product: its id opens the box's QC photos. Several: each has its own card below. */}
                      {codes.length === 1 && onOpenQc ? <GoodsNo code={codeLabel} onOpen={() => onOpenQc(head)} tracking={head.trackingNumber} /> : (codeLabel || "—")}
                    </dd>
                  </div>
                  {isGroup ? (
                    <>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#2D2D2D]/45">Products</dt>
                        <dd className="flex items-center gap-1 font-semibold text-[#412460]">
                          {count} products
                          <IconChevron className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#2D2D2D]/45">CN Tracking</dt>
                        <dd className="min-w-0 break-all text-right font-medium">{trackingLabel || "—"}</dd>
                      </div>
                    </>
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
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPrintGroup(boxes); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#2D2D2D]/65 ring-1 ring-[#ECE9E3] transition active:scale-95">
                        <IconPrinter className="h-3.5 w-3.5" /> Print {boxes.length}
                      </button>
                    )}
                    {onShip && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onShip(boxes); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#B99353] active:scale-95">
                        <IconCheck className="h-3.5 w-3.5" /> Ship all {boxes.length}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isGroup && isOpen && (
                <div className="divide-y divide-[#F1EFEA] border-t border-[#F1EFEA] bg-[#FAFAF8]">
                  {units.map(({ id, item: it, productId, lead, shared }) => (
                    <div key={id} onClick={() => onView(it)} className="cursor-pointer p-3 pl-6">
                      <div className="flex items-start justify-between gap-3">
                        {selectable && (
                          <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                            {lead && <RowCheck checked={!!selected?.has(it.id)} onChange={() => onToggleSelect(it.id)} label={`Select ${productId} ${it.trackingNumber}`} />}
                          </span>
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                          {/* This PRODUCT's own id, leading the card — a parcel
                              holding two of them gets a card each. */}
                          <div className="font-bold text-[#412460]">
                            <GoodsNo code={productId} onOpen={onOpenQc ? () => onOpenQc(it) : undefined} tracking={it.trackingNumber} />
                          </div>
                          <div className="mt-1 break-all font-medium text-[#2D2D2D]/80">{it.trackingNumber || "—"}</div>
                          <div className="mt-1 text-[#2D2D2D]/45">
                            Shelf <span className="font-semibold text-[#412460]">{it.rackId || "—"}</span>
                            {shared && <span className="ml-2 text-[#B99353]">{goodsCode(it) || "—"} (Same)</span>}
                          </div>
                        </div>
                        <ShipmentBadge mode={it.shipmentFrom} />
                      </div>
                      {lead && (onShip || onPrint || onDownload || onDelete) && (
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
              <th>Order #</th>
              <th>Shelf</th>
              <th>Product ID</th>
              <th>Products</th>
              <th>Tracking</th>
              <th>Shipment</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-[#F1EFEA]">
            {groups.map(({ key, boxes, units }) => {
              const head = boxes[0];
              // The dropdown counts PRODUCTS, not packages: an order's 15 lines
              // are what staff tick off, and two of them can share one package.
              const count = units.length;
              const isGroup = count > 1;
              const isOpen = isGroup && expanded.has(key);
              const shelves = new Set(boxes.map((g) => g.rackId || "—"));
              const shelfLabel = shelves.size === 1 ? [...shelves][0] : `${shelves.size} shelves`;
              const modes = new Set(boxes.map((g) => g.shipmentFrom || "By Air"));
              // One order usually travels under ONE tracking number, and that is
              // the number staff read off the parcel — so it stays on the summary
              // row instead of collapsing to a dash the moment the order carries
              // more than one product.
              const trackings = new Set(boxes.map((b) => b.trackingNumber).filter(Boolean));
              const trackingLabel = trackings.size === 1 ? [...trackings][0] : (trackings.size ? `${trackings.size} trackings` : "");
              // A group is one 1688 ORDER, and its packages can be different
              // PRODUCTS — each box resolves its own Product ID from its own CN
              // tracking. So the summary row must not print one box's id as if it
              // covered the order: it says "n products" and each package carries
              // its own, the same way Shelf collapses to "n shelves" and Shipment
              // to "Mixed". (The old PR id could safely be shown here because one
              // procurement request covered every package.)
              // Named, not counted — the Products column beside it carries the
              // count, so repeating it here said the same thing twice and named
              // nothing.
              const codes = [...new Set(units.map((u) => u.productId).filter(Boolean))];
              const codeLabel = codes.length ? (codes.length === 1 ? codes[0] : `${codes[0]} +${codes.length - 1}`) : "";

              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => (isGroup ? toggleExpand(key) : onView(head))}
                    className="cursor-pointer transition-colors hover:bg-[#FAF9F6] [&>td]:px-3 [&>td]:py-3"
                  >
                    {selectable && (
                      <td className="w-8" onClick={(e) => e.stopPropagation()}>
                        {isGroup ? (
                          <SelectAllCheck rows={boxes} selected={selected} onToggleAll={(checked) => onToggleRows(boxes, checked)} />
                        ) : (
                          <RowCheck checked={!!selected?.has(head.id)} onChange={() => onToggleSelect(head.id)} label={`Select ${goodsCode(head)}`} />
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap font-semibold text-[#2D2D2D]/80">{head.orderNumber || "—"}</td>
                    <td><span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-medium text-[#2D2D2D]/70">{shelfLabel}</span></td>
                    <td className={`whitespace-nowrap font-bold ${codes.length > 1 ? "text-[#2D2D2D]/45" : "text-[#412460]"}`}>{codeLabel || "—"}</td>
                    <td>
                      {isGroup ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(key); }}
                          className="inline-flex items-center gap-1 rounded-full bg-[#412460]/10 px-2.5 py-1 text-xs font-bold text-[#412460] transition hover:bg-[#412460]/15"
                        >
                          {count} products
                          <IconChevron className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                      ) : (
                        <span className="text-xs text-[#2D2D2D]/35">1</span>
                      )}
                    </td>
                    <td className="max-w-[170px] truncate text-[#2D2D2D]/80" title={trackingLabel || undefined}>
                      {trackingLabel || "—"}
                    </td>
                    <td>
                      {isGroup
                        ? (modes.size === 1 ? <ShipmentBadge mode={head.shipmentFrom} /> : <span className="text-[11px] font-semibold text-[#B99353]">Mixed</span>)
                        : <ShipmentBadge mode={head.shipmentFrom} />}
                    </td>
                    <td className="text-center">
                      {isGroup ? groupActionButtons(boxes) : actionButtons(head)}
                    </td>
                  </tr>
                  {isGroup && isOpen && units.map(({ id, item: it, productId, lead, shared }) => (
                    <tr key={id} onClick={() => onView(it)} className="cursor-pointer bg-[#FAFAF8] transition-colors hover:bg-[#F4F2EE] [&>td]:px-3 [&>td]:py-2.5">
                      {/* Only the LEAD product of a package carries the checkbox
                          and the actions. The others sit in the same box, and a
                          second Ship button would offer to ship it twice. */}
                      {selectable && (
                        <td className="w-8" onClick={(e) => e.stopPropagation()}>
                          {lead && <RowCheck checked={!!selected?.has(it.id)} onChange={() => onToggleSelect(it.id)} label={`Select ${productId} ${it.trackingNumber}`} />}
                        </td>
                      )}
                      <td className="pl-6 text-xs text-[#2D2D2D]/30">↳</td>
                      <td>{lead
                        ? <span className="rounded-md bg-[#F4F2EE] px-2 py-0.5 text-xs font-medium text-[#2D2D2D]/70">{it.rackId || "—"}</span>
                        : <span className="text-xs text-[#2D2D2D]/30">—</span>}</td>
                      {/* This PRODUCT's own id — the whole reason the group
                          expands. A parcel holding two products now shows both,
                          one line each, instead of only the id the box was filed
                          under. */}
                      <td className="whitespace-nowrap font-bold text-[#412460]">{productId || "—"}</td>
                      <td className="whitespace-nowrap text-xs text-[#2D2D2D]/45">{shared ? `${goodsCode(it) || "—"} (Same)` : "—"}</td>
                      <td className="max-w-[170px] truncate text-[#2D2D2D]/80" title={it.trackingNumber}>{it.trackingNumber || "—"}</td>
                      <td><ShipmentBadge mode={it.shipmentFrom} /></td>
                      <td className="text-center">{lead ? actionButtons(it) : <span className="text-xs text-[#2D2D2D]/25">↑</span>}</td>
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
//   has tracking, scanned in         -> "Received" (bold purple; the Product ID
//                                       has its own column, so it isn't repeated
//                                       here)
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

// The 1688 orders table (desktop) / card list (mobile). Read-only apart from the
// ship checkbox `selectable` turns on ("Proceed to Shipment").
//
// `shippableRows` is the subset that may be ticked — passed in rather than
// recomputed here so the header's select-all, the toolbar's "n selected" counter
// and the ship action are all driven by the exact same list.
// `empty` overrides the no-rows message. Shipment mode splits these rows across
// two of these tables, and the "All goods" one empties for a reason neither
// default covers: everything visible is already in the shipment above it.
function SupplierOrdersTable({ rows, loading, filtered = false, empty = "", selectable = false, selected, shippableRows, onToggleSelect, onToggleAll, onSetMode, onSetKg, onOpenQc, modeBusy }) {
  // Track images that failed to load and hide them via STATE, not by mutating the
  // DOM node — an imperative style change would persist across re-renders and could
  // permanently hide a later-valid image for the same row key.
  //
  // Both <img>s below MUST keep referrerPolicy="no-referrer". Product photos are
  // hotlinked straight off cbu01.alicdn.com, which 403s any request carrying a
  // Referer that isn't a 1688/alibaba domain — and the browser default
  // (strict-origin-when-cross-origin) sends https://www.cellzengroup.com/. Without
  // the attribute EVERY photo 403s, lands in brokenImgs and silently vanishes; it
  // only looked like "new orders have no photo" because alicdn serves
  // max-age=31536000, so already-seen URLs still came from the browser's disk cache
  // while freshly-synced rows hit the network and got blocked.
  const [brokenImgs, setBrokenImgs] = useState(() => new Set());
  const markImgBroken = (url) =>
    setBrokenImgs((prev) => (!url || prev.has(url) ? prev : new Set(prev).add(url)));
  const canShowImg = (url) => url && !brokenImgs.has(url);

  // A row is tickable only if the parent listed it as shippable. Rendered as a
  // DISABLED checkbox rather than a blank cell for the rest, so the column stays
  // aligned and hovering explains why a row can't be picked.
  const shippable = useMemo(
    () => new Set((shippableRows || []).map((o) => o.id)),
    [shippableRows]
  );
  const shipCheck = (o) =>
    shippable.has(o.id) ? (
      <RowCheck
        checked={!!selected?.has(o.id)}
        onChange={() => onToggleSelect(o.id)}
        label={`Select order ${o.orderNumber || o.cnTracking || o.id} for shipment`}
      />
    ) : (
      <input
        type="checkbox"
        disabled
        checked={false}
        readOnly
        aria-label="Not shippable — no goods on the shelf for this order"
        title="Only 📦 Received orders can be shipped — this one has no box on the shelf."
        className="h-4 w-4 shrink-0 cursor-not-allowed rounded opacity-25"
      />
    );

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
        {/* Now that the search and the two dropdowns can each empty the table on
            their own, "nothing has synced yet" would be a flat lie — and would send
            staff hunting a sync problem that isn't there. */}
        {empty ? (
          empty
        ) : filtered ? (
          "No 1688 orders match the current search and filters."
        ) : (
          <>No 1688 orders yet. They appear here automatically once gtradea has procurement data — or tap &quot;Sync now&quot;.</>
        )}
      </EmptyState>
    );
  }
  return (
    <>
      {/* Mobile: cards */}
      <ul className="space-y-2.5 md:hidden">
        {rows.map((o) => (
          <li
            key={o.id}
            onClick={(e) => {
              // The card opens the QC photos — but not when the tap was on one of its own controls.
              if (e.target.closest("input, select, button, a, label")) return;
              onOpenQc(o);
            }}
            onTouchStart={() => { if (o.cnTracking) prefetchQcImages(o.cnTracking); }}
            className="cursor-pointer rounded-2xl bg-white p-4 ring-1 ring-[#ECE9E3] transition active:scale-[.99]"
          >
            <div className="flex items-start justify-between gap-3">
              {selectable && <span className="pt-0.5">{shipCheck(o)}</span>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2D2D2D]/40">
                  {fmtDay(o.orderedAt)}
                  {(o.itemCode || o.jobCode) && (
                    <span className="rounded bg-[#412460]/8 px-1.5 py-0.5 tracking-normal text-[#412460]">
                      <GoodsNo code={o.itemCode || o.jobCode} onOpen={() => onOpenQc(o)} tracking={o.cnTracking} icon={false} />
                    </span>
                  )}
                </div>
                <div className="mt-0.5 break-all text-sm font-bold text-[#412460]">{o.orderNumber || "—"}</div>
                <p className="mt-1 break-words text-xs text-[#2D2D2D]/70">{o.productName || "—"}</p>
              </div>
              {canShowImg(o.productImage) ? (
                <img
                  src={o.productImage}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
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
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#2D2D2D]/45">Mode</dt>
                <dd>
                  <ShipModeSelect order={o} onChange={onSetMode} busy={modeBusy?.has(o.id)} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#2D2D2D]/45">KG</dt>
                <dd>
                  <KgInput kg={o.kg} label={`KG for ${o.orderNumber || o.cnTracking || "this order"}`} onCommit={(text) => onSetKg(o, text)} />
                </dd>
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
        <table className="w-full min-w-[1160px] text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.12em] text-[#2D2D2D]/40 [&>th]:px-3 [&>th]:pb-3 [&>th]:font-semibold">
              {selectable && (
                <th className="w-8">
                  <SelectAllCheck rows={shippableRows} selected={selected} onToggleAll={onToggleAll} />
                </th>
              )}
              <th>Date</th>
              <th>Product ID</th>
              <th>Order #</th>
              <th>Product</th>
              {/* Sits next to Product because that's what it's derived from —
                  staff read the description and the mode as one thing. */}
              <th>Mode</th>
              {/* Typed in by staff as the goods are weighed — gtradea has no weight. */}
              <th>KG</th>
              <th className="text-center">Qty</th>
              <th>CN Tracking</th>
              <th>Warehouse</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-[#F1EFEA]">
            {rows.map((o) => (
              <tr key={o.id} className="transition-colors hover:bg-[#FAF9F6] [&>td]:px-3 [&>td]:py-3">
                {selectable && <td className="w-8">{shipCheck(o)}</td>}
                <td className="whitespace-nowrap text-xs text-[#2D2D2D]/55">{fmtDay(o.orderedAt)}</td>
                <td className="whitespace-nowrap font-bold text-[#412460]">
                  <GoodsNo code={o.itemCode || o.jobCode} onOpen={() => onOpenQc(o)} tracking={o.cnTracking} icon={false} />
                </td>
                <td className="whitespace-nowrap font-bold text-[#412460]">
                  <GoodsNo code={o.orderNumber} onOpen={() => onOpenQc(o)} tracking={o.cnTracking} icon={false} />
                </td>
                <td className="max-w-[300px]">
                  <div className="flex items-center gap-2">
                    {canShowImg(o.productImage) ? (
                      <img
                        src={o.productImage}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => markImgBroken(o.productImage)}
                        className="h-8 w-8 shrink-0 rounded object-cover ring-1 ring-[#ECE9E3]"
                      />
                    ) : null}
                    <span className="truncate text-xs text-[#2D2D2D]/80">{o.productName || "—"}</span>
                  </div>
                </td>
                <td><ShipModeSelect order={o} onChange={onSetMode} busy={modeBusy?.has(o.id)} /></td>
                <td><KgInput kg={o.kg} label={`KG for ${o.orderNumber || o.cnTracking || "this order"}`} onCommit={(text) => onSetKg(o, text)} /></td>
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
