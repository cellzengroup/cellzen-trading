// Packing List API — talks to /inventory/packing. Uses authFetch, which is
// path-aware: on /staff* pages it sends the staff token (so the backend scopes
// the list to that staff member); on /admin* pages it sends the admin token.

import { authFetch } from "./apiBase";

// Convert a backend packing_lists row into the shape the editor/list expect.
export function unwrapPacking(row) {
  if (!row) return null;
  const data = row.data || {};
  return {
    packingNumber: row.packing_number,
    reference: row.reference || "",
    customerName: row.customer_name || "",
    marka: row.marka || "",
    status: row.status || "Draft",
    totalCartons: row.total_cartons,
    totalWeight: row.total_weight,
    totalCbm: row.total_cbm,
    createdByName: row.created_by_name || null,
    cartons: Array.isArray(data.cartons) ? data.cartons : [],
    updatedAt: row.updatedAt,
  };
}

export async function loadPackingLists() {
  const res = await authFetch("/inventory/packing", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || `Failed to load (HTTP ${res.status})`);
  return (json.data || []).map(unwrapPacking);
}

export async function getPackingList(number) {
  const res = await authFetch(`/inventory/packing/${encodeURIComponent(number)}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "Packing list not found");
  return unwrapPacking(json.data);
}

export async function nextPackingNumber() {
  const res = await authFetch("/inventory/packing/next-number", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "Failed to get number");
  return json.data.packingNumber;
}

export async function savePackingList(packing) {
  const res = await authFetch("/inventory/packing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packing }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "Save failed");
  return unwrapPacking(json.data);
}

export async function deletePackingList(number) {
  const res = await authFetch(`/inventory/packing/${encodeURIComponent(number)}`, { method: "DELETE" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "Delete failed");
  return true;
}

// Load the line-items of a PI/invoice (by its number) so they can be dragged
// into cartons. Returns [{ productName, productImage, quantity }].
export async function getInvoiceItems(number) {
  // Uses the items-only endpoint so staff can load products from ANY company PI
  // (not just ones they created) — the server returns name/image/quantity only.
  const res = await authFetch(`/inventory/invoices/${encodeURIComponent(String(number).trim())}/items`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "PI / invoice not found");
  return (json.data || [])
    .map((it) => ({
      productName: it.productName || "",
      productImage: it.productImage || "",
      quantity: Number(it.quantity) || 1,
    }))
    .filter((it) => it.productName || it.productImage);
}

// Exact barcode → product lookup for the scanner. Returns null if not found.
export async function lookupProductByBarcode(code) {
  const res = await authFetch(`/inventory/products/by-barcode/${encodeURIComponent(code)}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) return null;
  return json.data;
}
