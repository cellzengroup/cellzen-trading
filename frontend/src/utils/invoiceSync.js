// Invoice persistence — talks to the backend so admins on different devices
// see the same invoices, with localStorage as a transparent offline cache.

import { resilientFetch } from "./apiBase";

const LS_KEY = "invoice_drafts";
const MIGRATED_KEY = "invoice_drafts_migrated_v1";

const authHeaders = () => {
  const token = localStorage.getItem("inv_token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function readLocalDrafts() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function writeLocalDrafts(drafts) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(drafts));
  } catch {
    // ignore quota/storage errors
  }
}

// Convert a backend Invoice row into the shape the frontend pages expect
function unwrapServerInvoice(row) {
  const data = row.invoice_data || {};
  return {
    ...data,
    id: data.id || `srv-${row.id}`,
    invoiceNumber: row.invoice_number,
    status: data.status || row.status || "Generated",
    customerName: data.customerName || row.customer_name,
    customerEmail: data.customerEmail || row.customer_email,
    invoiceDate: data.invoiceDate || row.invoice_date,
    currency: data.currency || row.currency,
    _serverUpdatedAt: row.updatedAt,
  };
}

// Pull all invoices the admin should see. Falls back to localStorage if the
// network fails so the page never goes blank. `cache: 'no-store'` defeats any
// stale browser cache so a freshly-saved invoice always shows up immediately.
export async function loadInvoices() {
  try {
    const res = await resilientFetch("/inventory/invoices", {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.success) throw new Error(json?.message || "Failed to load");
    const remote = (json.data || []).map(unwrapServerInvoice);

    // One-time migration: push any local-only drafts up to the backend, then
    // mirror the backend list back to localStorage as the source of truth.
    if (!localStorage.getItem(MIGRATED_KEY)) {
      const local = readLocalDrafts();
      const remoteNumbers = new Set(remote.map((r) => r.invoiceNumber));
      const orphans = local.filter(
        (d) => d.invoiceNumber && !remoteNumbers.has(d.invoiceNumber)
      );
      for (const o of orphans) {
        try { await saveInvoice(o); } catch { /* keep going */ }
      }
      localStorage.setItem(MIGRATED_KEY, "1");
      // Re-fetch so we include just-uploaded orphans
      if (orphans.length > 0) {
        try {
          const res2 = await resilientFetch("/inventory/invoices", {
            headers: authHeaders(),
            cache: "no-store",
          });
          if (res2.ok) {
            const json2 = await res2.json();
            if (json2?.success) {
              const merged = (json2.data || []).map(unwrapServerInvoice);
              writeLocalDrafts(merged);
              return { source: "remote", invoices: merged };
            }
          }
        } catch { /* fall through */ }
      }
    }

    writeLocalDrafts(remote);
    return { source: "remote", invoices: remote };
  } catch (err) {
    return { source: "local", invoices: readLocalDrafts(), error: err?.message };
  }
}

// Upsert an invoice on the backend AND in the local cache. Returns the saved
// row. Throws if both backend and local cache fail.
export async function saveInvoice(invoice) {
  if (!invoice?.invoiceNumber) throw new Error("Invoice number is required");

  // Always update local cache first so the UI feels instant + works offline
  const drafts = readLocalDrafts();
  const idx = drafts.findIndex((d) => d.invoiceNumber === invoice.invoiceNumber);
  if (idx >= 0) drafts[idx] = { ...drafts[idx], ...invoice };
  else drafts.push({ id: invoice.id || `draft-${Date.now()}`, ...invoice });
  writeLocalDrafts(drafts);

  // Push to backend
  try {
    const res = await resilientFetch("/inventory/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ invoice }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.success) throw new Error(json?.message || "Server rejected save");
    return json.data;
  } catch (err) {
    // Local save still went through; surface the error so callers can retry/sync later
    err.localSaved = true;
    throw err;
  }
}

export async function deleteInvoice(invoiceNumber) {
  if (!invoiceNumber) return;
  // Local first
  const drafts = readLocalDrafts().filter((d) => d.invoiceNumber !== invoiceNumber);
  writeLocalDrafts(drafts);
  // Then backend
  try {
    const res = await resilientFetch(`/inventory/invoices/${encodeURIComponent(invoiceNumber)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // Local delete already done; user can retry sync later
    err.localDeleted = true;
    throw err;
  }
}
