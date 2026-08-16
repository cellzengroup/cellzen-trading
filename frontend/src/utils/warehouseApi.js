// Warehouse (Scan & Locate) API — talks to /inventory/warehouse.
//
// This runs as a STANDALONE route (/warehouse), not under /staff*, so authFetch's
// path-based token detection won't kick in. We therefore pass tokenKind:"staff"
// explicitly on every call so the backend always sees the warehouse worker's
// staff identity (used for the audit trail). Data itself is shared across all
// staff — the backend never scopes reads by user.

import { authFetch } from "./apiBase";

const STAFF = { tokenKind: "staff" };

// ---------- shape converters (snake_case row -> camelCase view model) ----------
export function unwrapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    trackingNumber: row.tracking_number || "",
    rackId: row.rack_id || "",
    status: row.status || "in_stock",
    createdByName: row.created_by_name || null,
    createdAt: row.createdAt,
    shippedAt: row.shipped_at || null,
    shippedByName: row.shipped_by_name || null,
    logisticsName: row.logistics_name || "",
    shipmentFrom: row.shipment_from || "By Air", // shipment mode; always one of "By Air" | "By Land"
    source: row.source || "cellzen",
    orderNumber: row.order_number || "",
    productName: row.product_name || "",
    prCode: row.pr_code || "", // gtradea PR id (PR-1029) — see goodsCode() below
  };
}

// The id staff actually see for an item: the gtradea PR id when there is one,
// otherwise the internal CZN goods number. This is what the label prints, what
// its barcode encodes, and what the GtradeA panel / detail cards show — so a box
// on the shelf carries the same id as the PR row on gtradea.
//
// A FUNCTION rather than a field on unwrapItem: items also come back from the
// localStorage instant-paint cache, and a cache written by an older build has no
// prCode at all — falling back through `code` here keeps those rows rendering.
export const goodsCode = (item) => item?.prCode || item?.code || "";

export function unwrapRack(row) {
  if (!row) return null;
  return { id: row.id, note: row.note || "", createdAt: row.createdAt };
}

async function readJson(res) {
  const json = await res.json().catch(() => ({}));
  return json;
}

// ---------------------------------------------------------------- racks
export async function loadRacks() {
  const res = await authFetch("/inventory/warehouse/racks", { ...STAFF, cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || `Failed to load shelves (HTTP ${res.status})`);
  return (json.data || []).map(unwrapRack);
}

// Create a shelf. Returns the rack, or null if it already existed (409) — the
// continuous scanner relies on this being tolerant so re-scanning a shelf is a
// no-op rather than an error.
export async function createRack(id, note) {
  const res = await authFetch("/inventory/warehouse/racks", {
    ...STAFF,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, note: note || null }),
  });
  const json = await readJson(res);
  if (res.status === 409) return null; // already exists — fine
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to create shelf");
  return unwrapRack(json.data);
}

export async function deleteRack(id) {
  const res = await authFetch(`/inventory/warehouse/racks/${encodeURIComponent(id)}`, {
    ...STAFF,
    method: "DELETE",
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to delete shelf");
  return true;
}

// ---------------------------------------------------------------- items
export async function loadItems(source) {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  const res = await authFetch(`/inventory/warehouse/items${qs}`, { ...STAFF, cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || `Failed to load items (HTTP ${res.status})`);
  return (json.data || []).map(unwrapItem);
}

// Put away a shipment: link tracking -> shelf, mint a WH code. Throws with the
// server message on a duplicate (409) so the caller can surface a warning.
export async function putAwayItem(rackId, trackingNumber, source) {
  const res = await authFetch("/inventory/warehouse/items", {
    ...STAFF,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(source ? { rackId, trackingNumber, source } : { rackId, trackingNumber }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) {
    const err = new Error(json.message || "Failed to store item");
    err.status = res.status;
    throw err;
  }
  return unwrapItem(json.data);
}

// Mark an item shipped. `logisticsName` is required; the shipment mode is NOT
// sent here — the backend carries over whatever was already recorded on the
// item (normally set via updateItemShipmentMode when the label was printed).
export async function shipItem(id, logisticsName) {
  const res = await authFetch(`/inventory/warehouse/items/${encodeURIComponent(id)}/ship`, {
    ...STAFF,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logisticsName }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to mark shipped");
  return unwrapItem(json.data);
}

// Record an item's shipment mode ("By Air" | "By Land") — called when the
// print dialog's shipment-mode dropdown is confirmed, so /ship later inherits
// the same value instead of asking again.
export async function updateItemShipmentMode(id, shipmentMode) {
  const res = await authFetch(`/inventory/warehouse/items/${encodeURIComponent(id)}/shipment-mode`, {
    ...STAFF,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shipmentMode }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to update shipment mode");
  return unwrapItem(json.data);
}

export async function deleteItem(id) {
  const res = await authFetch(`/inventory/warehouse/items/${encodeURIComponent(id)}`, {
    ...STAFF,
    method: "DELETE",
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to delete item");
  return true;
}

// ---------------------------------------------------------------- printing
// Queue a label to print on the warehouse printer. Works from ANY device
// (including phones): the on-site print agent polls this queue and prints it on
// the Deli 720C. Returns { id, status }.
//
// `bitmap` (optional) is a pre-rendered label image { data, widthBytes, height }
// — base64 packed 1-bit rows. When supplied, the agent prints it verbatim as a
// TSPL BITMAP so a phone-queued label comes out identical to the warehouse PC.
export async function enqueuePrintJob(code, kind = "item", copies = 1, bitmap = null) {
  const res = await authFetch("/inventory/warehouse/print-jobs", {
    ...STAFF,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bitmap ? { code, kind, copies, bitmap } : { code, kind, copies }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to queue print");
  return json.data; // { id, status }
}

// Download the full item list as a CSV (auth-gated GET -> blob -> anchor click).
export async function exportItemsCsv() {
  const res = await authFetch("/inventory/warehouse/items/export.csv", { ...STAFF, cache: "no-store" });
  if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `warehouse_items_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------ 1688 supplier orders (gtradea)
// Procurement orders + CN tracking that the backend poller pulls from the
// external gtradea dashboard. Read-only here — the backend does the gtradea
// login/refresh; the frontend never touches gtradea directly.
export function unwrapSupplierOrder(row) {
  if (!row) return null;
  const wh = row.warehouse || {};
  return {
    id: row.id,
    orderNumber: row.order_number || "",
    jobCode: row.job_code || "",
    cnTracking: row.china_tracking_no || "",
    npTracking: row.nepal_tracking_no || "",
    status: row.status || "",
    productName: row.product_name || "",
    productImage: row.product_image || "",
    supplierUrl: row.supplier_url || "",
    quantity: row.quantity ?? null,
    shippingMode: row.shipping_mode || "",
    // How this box has to travel, worked out from the product title by the
    // backend's dangerous-goods classifier and correctable from the Mode
    // dropdown in the 1688 panel. `shipMode` is the effective answer;
    // `shipModeAuto` is what the classifier said before any correction, and
    // `shipModeOverride` is non-empty only once a human has picked.
    shipMode: row.ship_mode === "land" ? "land" : "air",
    shipModeAuto: row.ship_mode_auto === "land" ? "land" : "air",
    shipModeOverride: row.ship_mode_override || "",
    shipModeSource: row.ship_mode_source || "", // rule | model | default | staff
    shipModeReason: row.ship_mode_reason || "",
    orderStatus: row.order_status || "",
    orderedAt: row.ordered_at || null, // when the order was placed on gtradea
    syncedAt: row.synced_at || null,
    inWarehouse: !!wh.in_warehouse,
    warehouseRack: wh.rack_id || "",
    warehouseStatus: wh.status || "",
    warehouseCode: wh.code || "",
    warehouseShippedAt: wh.shipped_at || null,
    // The matched box itself — what "Proceed to Shipment" ships from the 1688
    // panel without a detour through the Ship tab. `warehouseItemId` is the id
    // shipItem() posts to; the rest just fills the confirm dialog when the
    // items list hasn't been loaded (or hasn't caught up) yet.
    warehouseItemId: wh.id || null,
    warehousePrCode: wh.pr_code || "",
    warehouseShipmentFrom: wh.shipment_from || "By Air",
  };
}

// List all 1688 orders (+ warehouse match). Returns { rows, lastSync }.
export async function loadSupplierOrders(search = "") {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await authFetch(`/inventory/supplier-orders${qs}`, { ...STAFF, cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || `Failed to load 1688 orders (HTTP ${res.status})`);
  return { rows: (json.data || []).map(unwrapSupplierOrder), lastSync: json.lastSync || null };
}

// Correct the shipment mode on one 1688 order. `mode` is "air" | "land", or
// null to drop the correction and go back to the auto-detected answer.
//
// Returns the row's mode fields as the server now sees them — including what
// the classifier says once an override is cleared, which the caller can't work
// out on its own.
export async function updateSupplierShipMode(id, mode) {
  const res = await authFetch(`/inventory/supplier-orders/${encodeURIComponent(id)}/ship-mode`, {
    ...STAFF,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: mode || null }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || `Failed to update mode (HTTP ${res.status})`);
  const d = json.data || {};
  return {
    shipMode: d.ship_mode === "land" ? "land" : "air",
    shipModeAuto: d.ship_mode_auto === "land" ? "land" : "air",
    shipModeOverride: d.ship_mode_override || "",
    shipModeSource: d.ship_mode_source || "",
    shipModeReason: d.ship_mode_reason || "",
    // The server retags any box already on the shelf for this tracking number,
    // so the Ship confirm and the printed label follow the change too.
    warehouseShipmentFrom: d.warehouse_shipment_from || "By Air",
    warehouseItemsUpdated: d.warehouse_items_updated || 0,
  };
}

// Trigger an immediate server-side pull from gtradea. Returns the sync summary.
// `force` marks a user-clicked "Sync now": it bypasses the server's failure
// backoff. The tab's automatic 60s kick leaves it off so a persistent upstream
// block stays paused rather than being re-hit by every open browser.
export async function syncSupplierOrders(force = false) {
  const qs = force ? "?force=1" : "";
  const res = await authFetch(`/inventory/supplier-orders/sync${qs}`, { ...STAFF, method: "POST" });
  const json = await readJson(res);
  if (!res.ok || !json.success) {
    // Attach the status so callers can tell an expected coordination reply
    // (409 already-syncing / 429 just-synced) from a real failure (5xx / 503).
    const err = new Error(json.message || "Sync failed");
    err.status = res.status;
    throw err;
  }
  return json.data;
}

// Download the packing list (same search filter as the on-screen table) as a
// styled .xlsx or a printable .pdf — title band, logo, purple header row, one
// row per order with its product photo. Same auth-gated GET -> blob -> anchor
// click as exportItemsCsv.
//
// `scope` picks which slice of the orders lands in the list — "received"
// (default: only what's on the shelf right now), "all", or "not_arrived"
// (ordered but never scanned in). `mode` cuts the same rows by how they travel
// — "all" (default), "air" or "land" — so an air consignment can be handed over
// without the land rows in the sheet. `from`/`to` are optional inclusive
// YYYY-MM-DD bounds on the gtradea order date. `images` false drops the product
// photos AND the column that holds them, which is what makes a big export
// finish quickly. All of it is validated server-side; the names must stay in
// step with EXPORT_SCOPES / EXPORT_MODES in
// backend/inventory/routes/supplierOrders.js.
//
// Both formats are built from the same rows by the same server code, so the
// sheet and the page always describe the same shipment — only the medium
// differs, and so does the extension in the URL and the filename.
async function exportSupplierOrders(format, search, { scope = "received", mode = "all", from = "", to = "", images = true } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("scope", scope);
  // Omitted for the default so the URL staff see (and any bookmarked one)
  // doesn't grow a param that changes nothing.
  if (mode && mode !== "all") params.set("mode", mode);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (!images) params.set("images", "0");
  const res = await authFetch(`/inventory/supplier-orders/export.${format}?${params}`, { ...STAFF, cache: "no-store" });
  if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
  // Mirrors the server's own Content-Disposition name so a file saved from the
  // browser and one fetched directly from the API are named the same thing.
  const scopeTag = { received: "Received", all: "All", not_arrived: "NotArrived" }[scope] || "Received";
  const modeTag = { air: "_Air", land: "_Land" }[mode] || "";
  await saveResponseAs(
    res,
    `CZN_GtradeA_PackingList_${scopeTag}${modeTag}${images ? "" : "_NoImages"}_${dateStamp(from, to)}.${format}`
  );
}

export const exportSupplierOrdersXlsx = (search = "", opts) => exportSupplierOrders("xlsx", search, opts);
export const exportSupplierOrdersPdf = (search = "", opts) => exportSupplierOrders("pdf", search, opts);

// Download the GtradeA billing report as a styled .xlsx — teal title band, logo,
// orange header, one row per 1688 line item (date, PR id, order id, product,
// quantity, unit, price). `from`/`to` are optional inclusive YYYY-MM-DD bounds
// on the gtradea order date; omitting both is the all-time report.
export async function exportBillingReportXlsx(search = "", { from = "", to = "" } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await authFetch(`/inventory/supplier-orders/billing-report.xlsx${qs ? `?${qs}` : ""}`, {
    ...STAFF,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Report failed (HTTP ${res.status})`);
  const stamp = from || to ? dateStamp(from, to) : `AllTime_${todayStamp()}`;
  await saveResponseAs(res, `CZN_GtradeA_Billing_${stamp}.xlsx`);
}

const todayStamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");
// Names a download after the range it covers, falling back to the day it was
// taken. Kept in step with the same expression on the server.
const dateStamp = (from, to) =>
  from || to ? `${(from || "any").replace(/-/g, "")}_${(to || "any").replace(/-/g, "")}` : todayStamp();

// Turn an authenticated file response into a saved download. Blob + anchor
// rather than pointing the browser at the URL, because these routes need the
// staff Authorization header that a plain navigation can't carry.
async function saveResponseAs(res, filename) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
