# 1688 Orders Panel — "1688 orders & CN tracking"

**Tab:** `1688 Orders` (GtradeA mode only — does not exist in Cellzen mode) · **Component:** `WarehouseApp.jsx` (renders `SupplierOrdersTable`) · **Route:** `/warehouse-gtradea`

## Purpose

A **read-only** live mirror of gtradea's procurement data, annotated with
whether each line item has physically arrived at the warehouse. This is the
panel staff check to answer "has this order shown up yet?" without ever
opening gtradea.com itself.

## Layout

| Element | Notes |
|---|---|
| Sync status | "Synced 2:41 PM" (grey) normally, or "⚠ Sync failing: …" (amber) if the last pull errored — never shows a reassuring "Synced" label when the last attempt actually failed |
| "Sync now" button | Manually triggers an immediate pull; spins while a sync (yours or anyone else's) is in flight |
| "Sort by" dropdown | Date (default, no-op) / Received / Not Updated / Not Received |
| Search box | Filters by order #, CN tracking, product name, or job code |
| `SupplierOrdersTable` | Date, order #, product (+ photo), quantity, CN tracking, warehouse-status pill |

## State

| State | Meaning |
|---|---|
| `supplierOrders` | The loaded rows |
| `supplierSearch`, `supplierSort` | Filter text and sort mode |
| `supplierSync` | The last-sync status object the server returns alongside every list/status response (`{ at, ok, error, syncing, … }`) |
| `supplierSyncing` | Local flag covering just the gap between clicking "Sync now" and the first status reply — the source of truth after that is the server's `syncing` flag |
| `supplierLoadedOnce` (ref) | Only shows the full-page spinner on the very first load; a background refresh never blanks the table |
| `manualSyncRef` (ref) | Marks that the *next* sync completion should produce a toast — only user-clicked syncs are announced; the automatic background ones stay silent |
| `lastKickRef` (ref) | Timestamp guard collapsing rapid tab-switches into a single sync kick |

## The order status pill — three states, one rule

`supplierState(order)` is the single source of truth (shared by both the
pill and the "Sort by" control, so they can never disagree):

```
no CN tracking on gtradea  → "not_updated"  (⏳ Not Updated)
has tracking, not scanned  → "not_received" (Not received)
has tracking, scanned in   → "received"     (📦 Received · CZNxxxxx)
```

**"Not Updated" is deliberately distinct from "Not received."** An order
with no tracking number yet can never match a warehouse item — showing it as
"Not received" would wrongly imply the goods are late, when really gtradea
simply hasn't recorded a tracking number for that item yet.

## Functions

### `loadSupplier()`
Fetches `GET /supplier-orders` (optionally with `?search=`, though the UI
currently always fetches the full list and filters client-side) and stores
`rows` + `lastSync`. Guards against **out-of-order responses** with a
monotonic `supplierReqId` — if a newer call has started by the time an older
one resolves, the stale result is discarded so a slow response can never
overwrite fresher data.

### Auto-load + poll effect
Runs only while `isGtradea && tab === "1688 Orders"` and the user is
authenticated:
- Calls `loadSupplier()` immediately on open.
- Polls every **2 seconds** while a sync is in flight (so the table and the
  "Sync now" button track a live pull), or every **20 seconds** at idle.

### Auto-kick effect
A second, independent effect that **actively requests a fresh pull** rather
than just re-reading the cache:
- Fires `syncSupplierOrders()` the instant the tab opens (covers "I just
  edited something on gtradea, let me check").
- Then every **60 seconds** while the tab stays open.
- Guarded by `lastKickRef` so switching tabs back and forth (which
  remounts/re-runs effects) can't fire more than one kick per 10 seconds —
  this was a real bug: without the guard, every tab switch queued a
  redundant `/sync` call and flooded the console with 409/429 responses.
- A `409` (already syncing) or `429` (just synced) reply is **expected and
  silent** — only a genuine failure (5xx, 503-not-configured, network error)
  is logged to the console; the header's "⚠ Sync failing" already covers
  surfacing it in the UI.

### Sync-completion effect
Watches `supplierSync.syncing` for a `true → false` transition (the only
honest way to know a sync finished, since the POST returns immediately).
When it fires **and** `manualSyncRef.current` is set (i.e. the user clicked
"Sync now"), it toasts the outcome — success with an item count, or the
server's error message — then clears the flag. Automatic background syncs
never toast; toasting every 60-second auto-sync would be relentless noise.

### `handleSyncNow()`
The "Sync now" button handler.
1. Marks `manualSyncRef` so the completion effect will announce this one.
2. Calls `syncSupplierOrders(true)` — the `force=1` query param that lets a
   user-initiated click bypass the server's failure backoff (see the sync
   engine doc).
3. If the server replies `started: false` (a sync was already running, or
   one just finished), clears the pending-announcement flag and toasts that
   immediately instead — otherwise the *next* unrelated background sync's
   completion would incorrectly be announced as this click's result.
4. Reloads the list either way to pick up the fresh `syncing: true` state.

### `filteredSupplier` (`useMemo`)
Applies the search filter, then sorting:
- **`"date"` (default) is a deliberate no-op** — the server already returns
  newest-order-first, so leaving it alone means a row never jumps position
  in the table just because its *status* changed under the viewer's eyes
  mid-poll.
- Any other sort choice stably floats matching rows (by `supplierState`) to
  the top, preserving date order within each group.

## Backend contract

`GET /api/inventory/supplier-orders` — every `supplier_orders` row
(optionally `?search=`), newest-order first (`ordered_at DESC NULLS LAST`),
each annotated with a computed `warehouse` object by joining
`china_tracking_no` against `warehouse_items.tracking_number` (in-stock
match preferred over a shipped one for the same tracking number). Response
also carries `lastSync` (the same status object `GET /status` returns), so
the panel doesn't need a second round-trip just to show the header label.

`POST /api/inventory/supplier-orders/sync?force=1` — kicks a fresh pull
without waiting for it (`202`); see
[Sync engine & bridge](./06-sync-engine-and-bridge.md) for the full
mechanics of what happens next.

`GET /api/inventory/supplier-orders/status` — just the last-sync object, used
for the idle 20s poll instead of re-fetching every row.

## Why this panel polls so aggressively (and why that's safe)

Every open browser tab independently kicks a sync every 60 seconds, on top
of the server's own 90-second background loop. This looks like it could
hammer gtradea's account, but the server-side `runSync()` **coalesces**:
only one sync ever runs at a time, and a request that arrives while one is
already running (or finished in the last 3 seconds) is answered with
`started: false` instead of actually starting another pull — so N browsers
open at once still result in at most one gtradea request per interval, not
N.
