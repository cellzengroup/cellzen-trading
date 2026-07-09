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
  };
}

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
export async function loadItems() {
  const res = await authFetch("/inventory/warehouse/items", { ...STAFF, cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || `Failed to load items (HTTP ${res.status})`);
  return (json.data || []).map(unwrapItem);
}

// Put away a shipment: link tracking -> shelf, mint a WH code. Throws with the
// server message on a duplicate (409) so the caller can surface a warning.
export async function putAwayItem(rackId, trackingNumber) {
  const res = await authFetch("/inventory/warehouse/items", {
    ...STAFF,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rackId, trackingNumber }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) {
    const err = new Error(json.message || "Failed to store item");
    err.status = res.status;
    throw err;
  }
  return unwrapItem(json.data);
}

export async function shipItem(id) {
  const res = await authFetch(`/inventory/warehouse/items/${encodeURIComponent(id)}/ship`, {
    ...STAFF,
    method: "POST",
  });
  const json = await readJson(res);
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to mark shipped");
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
