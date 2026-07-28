# Ship Panel — "Locate or ship"

**Tab:** `Ship` · **Component:** `WarehouseApp.jsx` (renders `GtradeaItemsTable` in gtradea mode) · **Route:** `/warehouse-gtradea`

## Purpose

Find an in-stock item (by scanning, searching, or the "Just scanned" flow)
and mark it shipped — either one at a time or as a batch. Only items with
`status === "in_stock"` appear here; the moment an item ships it disappears
from this list and reappears in **Dispatched**.

## Layout

| Element | Notes |
|---|---|
| Search box | Filters by code, tracking number, or shelf; `Enter` also tries an exact lookup (`doLookup`) so a full tracking/code scan jumps straight to the item |
| Batch Ship toggle | Reveals row checkboxes + a "Ship selected" / "Cancel" pair; replaces the plain search bar's trailing controls |
| Item detail card | Shown above the table when an item is selected — full details + barcode + "Mark as Shipped" / "Download Label" buttons |
| `GtradeaItemsTable` | CZN code, shelf, linked 1688 order #, CN tracking, status, and row actions (print / download / ship) |
| Ship-confirm dialog | Modal that finalizes one or many ships |
| Print-quantity dialog | Modal asking how many label copies to print |

## State

| State | Meaning |
|---|---|
| `shipSearch`, `shipSelectedId` | Search text and the currently open item's id |
| `shipConfirmItems`, `shipConfirmIsBatch` | Item(s) awaiting the ship confirmation modal, and whether it was opened via the batch button (controls whether exiting batch mode happens after) |
| `shipLogistics`, `shipFrom` | Carrier name / land-or-sea — **collected in Cellzen mode only**; GtradeA ships with a single tap |
| `shipBatchMode`, `shipSel` | Whether row checkboxes are showing, and the selected id set |
| `batchBusy` | True while a batch ship request is in flight (disables the buttons) |

## Functions

### `openDetail(item)`
Selects an item and routes to the correct tab for its status: `Ship` for
`in_stock`, `Dispatched` for `shipped`. Used whenever another panel (Store's
feed, a search hit, a scan) needs to "jump to" an item regardless of where
it currently lives.

### `doLookup(text)`
Backs the search box's `Enter` key. Looks up an exact match via `findItem`
(matches on `code` or `trackingNumber`, case-insensitive); if found, opens
its detail (routing to Ship or Dispatched as above); if not, just sets the
search filter text and toasts `No item matches "…"`.

### `handleShipScan(text)`
The Ship-tab camera/hardware-scanner handler (reached via `routeScan` when
`tab === "Ship"`).
- No match → filters the list by the scanned text and toasts a warning.
- Match, already shipped → jumps to Dispatched and toasts a warning (can't
  re-ship).
- Match, in stock → opens the **single-item ship confirmation** directly
  (skips an extra tap versus tapping the row's ship button).

### `requestShip(item)`
Opens the ship-confirmation modal for exactly one item (resets the
logistics/from fields first — GtradeA doesn't use them, but the fields are
shared code with Cellzen mode).

### `requestBatchShip()`
Opens the confirmation for every **currently visible AND selected** row —
deliberately intersecting the selection with the active search filter, so an
item selected before a search narrowed the list can never be shipped
"invisibly" behind that filter. Toasts a warning if nothing qualifies.

### `confirmShip()`
The modal's confirm button.
- **GtradeA:** skips the logistics/land-sea validation entirely (single tap
  is by design for 1688 goods).
- **Cellzen only:** requires both fields non-empty, otherwise toasts and
  stops.
- Calls `handleShipMany([...items], logistics, from)`.
- On a **batch** confirm where everything succeeded, exits batch mode; a
  partial failure leaves the failed (still-selected) rows selected so the
  user can retry just those.

### `handleShipMany(list, logisticsName, shipmentFrom)`
Runs `shipItem(id, …)` over the list with a concurrency cap of 6
(`mapPool`), so a huge batch can't fire hundreds of simultaneous requests
and starve the DB connection pool for other staff.
- Successes are merged back into the global `items` list by id and cleared
  out of the selection set; `shipSelectedId` is cleared (the item just left
  Ship).
- Reports one consolidated toast: all-succeeded / partial / all-failed.
- Returns the failure count so the caller can decide whether to exit batch
  mode.

### Selection helpers
`toggleShipSel`, `toggleAllShip`, `exitShipBatch`, and the derived
`shipSelCount` (selected count **within the currently filtered/visible
rows only** — see `requestBatchShip` above for why this matters).

## Backend contract

`POST /api/inventory/warehouse/items/:id/ship`
(see [`backend/inventory/routes/warehouse.js`](../../backend/inventory/routes/warehouse.js))

- 404 if the id isn't a valid UUID or doesn't exist.
- 409 if already shipped.
- **`item.source !== 'gtradea'`** → requires `logisticsName` +
  `shipmentFrom` (Cellzen rule). GtradeA items skip this check entirely —
  the fields are simply stored as `null`.
- On success: sets `status: 'shipped'`, `shipped_at: now()`, and stamps the
  acting user's id/name for the audit trail.

## Why GtradeA skips the logistics form

The confirm dialog conditionally renders the "Name of the logistics" /
"Shipment from" fields with `{!isGtradea && (...)}`. 1688 goods ship through
a different, already-tracked logistics chain (gtradea itself records the
outbound leg), so re-collecting a carrier name here would be redundant data
entry — GtradeA shipping is deliberately a single confirmation tap.
