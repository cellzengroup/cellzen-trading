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
| `GtradeaItemsTable` | CZN code, shelf, linked 1688 order #, CN tracking, shipment mode, and row actions (print / download / ship) |
| Ship-confirm dialog | Modal that finalizes one or many ships |
| Print-quantity dialog | Modal asking how many label copies to print (and, per item, its shipment mode) |

## State

| State | Meaning |
|---|---|
| `shipSearch`, `shipSelectedId` | Search text and the currently open item's id |
| `shipConfirmItems`, `shipConfirmIsBatch` | Item(s) awaiting the ship confirmation modal, and whether it was opened via the batch button (controls whether exiting batch mode happens after) |
| `shipLogistics` | Carrier name — the only field still collected at ship time, for **both** Cellzen and GtradeA |
| `shipBatchMode`, `shipSel` | Whether row checkboxes are showing, and the selected id set |
| `batchBusy` | True while a batch ship request is in flight (disables the buttons) |

Shipment mode ("By Air" \| "By Land") is **not** collected here — see
[Shipment mode](#shipment-mode-by-air--by-land) below.

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
Opens the ship-confirmation modal for exactly one item (resets `shipLogistics`
first — shared code between Cellzen and GtradeA mode).

### `requestBatchShip()`
Opens the confirmation for every **currently visible AND selected** row —
deliberately intersecting the selection with the active search filter, so an
item selected before a search narrowed the list can never be shipped
"invisibly" behind that filter. Toasts a warning if nothing qualifies.

### `confirmShip()`
The modal's confirm button.
- Requires `shipLogistics` non-empty for **every** ship — Cellzen and GtradeA
  alike — otherwise toasts and stops.
- Calls `handleShipMany([...items], logistics)`.
- On a **batch** confirm where everything succeeded, exits batch mode; a
  partial failure leaves the failed (still-selected) rows selected so the
  user can retry just those.

### `handleShipMany(list, logisticsName)`
Runs `shipItem(id, logisticsName)` over the list with a concurrency cap of 6
(`mapPool`), so a huge batch can't fire hundreds of simultaneous requests
and starve the DB connection pool for other staff. Each item ships with its
own already-recorded shipment mode (see below) — nothing mode-related is
passed in here.
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

## Shipment mode (By Air / By Land)

Shipment mode is **not** chosen in this panel. It's set on the item itself —
`item.shipmentFrom`, backed by the `shipment_from` column — and flows through
the system like this:

1. **Created** — every item defaults to `"By Air"` the moment it's put away
   (model-level default on `WarehouseItem.shipment_from`).
2. **Printed** — the print-quantity dialog's "Shipment mode" dropdown
   (`printShipMode` in `WarehouseApp.jsx`) shows the item's current mode and
   lets staff change it. Confirming the dialog calls
   `updateItemShipmentMode(item.id, mode)` (`POST /items/:id/shipment-mode`)
   **before** printing, so the label's "SHIPMENT: BY AIR/LAND" banner always
   matches what's now on record.
3. **Shipped** — `POST /items/:id/ship` ignores whatever the client sends for
   shipment mode entirely and copies `item.shipment_from` (falling back to
   `"By Air"` if somehow unset) into the shipped record. This is enforced
   server-side specifically so an item printed "By Land" can never ship as
   "By Air" (or vice versa) due to a stale client value.
4. **Displayed** — the Shipment column (`ShipmentBadge`, replacing the old
   in-stock/shipped Status pill) shows this same value everywhere the item
   appears — Dashboard, Ship, Dispatched.

The Ship-confirm dialog shows each item's mode read-only (a `ShipmentBadge`)
so staff can see what's about to ship, but can't edit it there — to change a
mode, reprint the label with a different selection.

## Backend contract

`POST /api/inventory/warehouse/items/:id/shipment-mode`
(see [`backend/inventory/routes/warehouse.js`](../../backend/inventory/routes/warehouse.js))
- Body: `{ shipmentMode: "By Air" | "By Land" }` — 400 on any other value.
- Updates `shipment_from` on the item. Callable any time, shipped or not.

`POST /api/inventory/warehouse/items/:id/ship`
(see [`backend/inventory/routes/warehouse.js`](../../backend/inventory/routes/warehouse.js))
- 404 if the id isn't a valid UUID or doesn't exist.
- 409 if already shipped.
- Requires `logisticsName` for **every** item, regardless of `item.source` —
  a 400 if blank.
- Shipment mode is NOT read from the request body — see
  [Shipment mode](#shipment-mode-by-air--by-land) above.
- On success: sets `status: 'shipped'`, `shipped_at: now()`, and stamps the
  acting user's id/name for the audit trail.
