# Racks Panel — "Shelves"

**Tab:** `Racks` · **Component:** `WarehouseApp.jsx` (inline JSX) · **Route:** `/warehouse-gtradea`

## Purpose

Manage the physical shelf inventory — add a new shelf, print/download its
barcode label, or delete an empty one. Shelves are **shared** between
Cellzen and GtradeA modes (both sections of the warehouse are the same
building), so anything created or deleted here is visible from either mode.

## Layout

| Element | Notes |
|---|---|
| Add-shelf input + "Add Shelf" button | Free-text shelf code entry, `Enter` also submits |
| Shelf grid | One "physical label" card per shelf — code, barcode image, download/delete icon buttons |
| Empty state | Shown when there are no shelves yet, with a hint that scanning a shelf label in Store also creates one |
| Delete-shelf confirm dialog | Blocks deletion if the shelf still holds in-stock items |

## Shelf code format

Every shelf id must match `^[A-Za-z]{1,6}\d{1,4}-\d{1,4}-\d{1,6}$` (module
constant `RACK_CODE_PATTERN` / `isShelf`), e.g. `CZN01-01-0001`. This is
enforced **both client-side** (before the API call, for instant feedback)
**and server-side** (`SHELF_PATTERN` in `warehouse.js`, so the rule can't be
bypassed by calling the API directly). Anything that doesn't match this
shape is treated as a tracking number everywhere else in the app — it's the
one rule that lets a single barcode scanner serve two different meanings.

## Functions

### `handleAddRack()`
Backs the "Add Shelf" button.
1. Trims + uppercases the typed id.
2. Validates it's non-empty and matches the shelf pattern — specific toast
   for each failure.
3. Client-side dedupe check against the already-loaded `racks` list (fast
   feedback); the server enforces this too via a 409.
4. Calls `createRack(id)`; on success, unshifts it into local state and
   clears the input.

### `requestDeleteRack(id)`
Guards the delete button **before** even opening the confirmation: if
`rackCounts[id]` (in-stock item count on that shelf, derived via `useMemo`
over `items`) is greater than 0, it toasts a warning and refuses to open the
dialog at all — you must ship or move every item off a shelf before it can
be deleted.

### `confirmDeleteRack()`
The dialog's confirm button — calls `deleteRack(id)`, removes it from local
`racks` state, toasts success or the server's error message.

### `handleScanAddShelf(text)`
Reached when a code is scanned while the **Racks** tab is open
(`routeScan` → `tab === "Racks"`). Treats the scan as a **shelf label to
add**: rejects anything that doesn't match the shelf pattern
(`Not a shelf label: … — shelves look like CZN01-01-0001.`), warns (but
doesn't error) if it already exists, otherwise creates it. Closes the
camera overlay immediately after (single-shot, unlike Store's continuous
scanning).

### `downloadRackLabel(id)`
(from `warehouseLabels.js`, shared) Renders a plain Code-128 barcode for the
shelf id (no logo/icons — shelf labels are simpler than item shipment
labels) and downloads it as an image. See
[Shared components](./07-shared-components.md).

## Backend contract

`GET /api/inventory/warehouse/racks` — every rack, newest first, no
filtering (shared data).

`POST /api/inventory/warehouse/racks` — body `{ id }`; validates the shelf
pattern, 409s if it already exists.

`DELETE /api/inventory/warehouse/racks/:id` — 404 if missing; **409** if
`WarehouseItem.count({ rack_id: id, status: 'in_stock' })` is greater than
zero (`Can't delete … — it still holds N in-stock item(s)`), so a shelf can
never be deleted out from under stock that's still on it, even if a second
staff member added an item to it between the client-side check and the
server call.

## Why shelf creation is duplicated in three places

A shelf can come into existence via: (1) this panel's "Add Shelf" form, (2)
scanning an unrecognized shelf label while on the Racks tab
(`handleScanAddShelf`), or (3) **automatically** the first time a shelf code
is scanned in the Store tab (`handleStoreDecode` → `createRack`, and again
server-side via `Rack.findOrCreate` in the put-away endpoint). All three
funnel through the same `createRack()` API call and treat "already exists"
(409) as a harmless no-op — this is intentional: staff should never be
blocked from putting a box away just because they forgot to pre-register the
shelf.
