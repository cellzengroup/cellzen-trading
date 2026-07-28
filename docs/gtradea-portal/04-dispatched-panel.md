# Dispatched Panel — shipped-item history

**Tab:** `Dispatched` · **Component:** `WarehouseApp.jsx` (renders `GtradeaItemsTable`) · **Route:** `/warehouse-gtradea`

## Purpose

A permanent (until explicitly deleted) log of every item that has been
marked shipped — the mirror image of Ship: same table component, same
search/select mechanics, filtered to `status === "shipped"` instead of
`in_stock`, sorted newest-shipped-first.

## Layout

| Element | Notes |
|---|---|
| Search box | Filters by code, tracking, or shelf |
| Batch Delete toggle | Reveals row checkboxes + "Delete selected" / "Cancel" (styled red — destructive) |
| Item detail card | Same shared `detailCard`, but only renders the Shipped/Logistics/Ship-via rows when `status === "shipped"` — no "Mark as Shipped" button here (it's already shipped) |
| `GtradeaItemsTable` | Adds a per-row delete (trash) action versus Ship's per-row ship action |
| Single-delete confirm dialog | "Delete CZNxxxxx?" |
| Batch-delete confirm dialog | Lists every record about to be removed |

## State

| State | Meaning |
|---|---|
| `dispatchSearch` | Search filter text |
| `dispatchBatchMode`, `dispatchSel` | Batch-select mode toggle and the selected id set |
| `itemDeleteTarget` | The single item awaiting the delete confirmation |
| `batchDeleteItems` | The list awaiting batch-delete confirmation |

## Functions

### `filteredDispatched` (`useMemo`)
Filters `items` to `status === "shipped"`, sorts by `shippedAt` (falling
back to `createdAt`) descending, then applies the search text against code /
tracking / rack. Recomputed only when `items` or `dispatchSearch` change.

### `confirmDeleteItem()`
Backs the single-row delete confirmation. Calls `deleteItem(id)`, removes it
from `items`, clears `shipSelectedId` if it was the open detail item, toasts
the result. **This permanently removes the record** — there's no "un-ship";
deleting is the only way to clear a dispatched entry (used mainly to clean
up test/mistaken data).

### `requestBatchDelete()`
Intersects the **currently visible** rows with the current selection
(`filteredDispatched.filter(i => dispatchSel.has(i.id))`) — same rationale
as Ship's batch actions: a selection made before narrowing the search can
never delete a now-hidden row. Warns if nothing qualifies.

### `confirmBatchDelete()`
Runs `deleteItem` over the list with concurrency 6 (`mapPool`). Removes
every **succeeded** id from `items` and from the selection set in one pass;
reports a consolidated toast (all/partial/none). On full success, exits
batch mode; on partial failure, leaves the failed rows selected so the user
can retry just those without re-selecting everything.

### Selection helpers
`toggleDispatchSel`, `toggleAllDispatch`, `exitDispatchBatch`, and
`dispatchSelCount` — same pattern as the Ship panel, scoped to the dispatched
list.

## Backend contract

`DELETE /api/inventory/warehouse/items/:id`
(see [`backend/inventory/routes/warehouse.js`](../../backend/inventory/routes/warehouse.js))
— 404 on a bad/unknown UUID, otherwise a hard delete. No soft-delete/undo on
the server side; the client's confirmation dialogs are the only safety net.

## What makes this "GtradeA" rather than generic

The rendered table is `GtradeaItemsTable`, not the plain `ItemsTable` used
in Cellzen mode — it adds an **Order #** and **CN Tracking** column (pulled
from the item's denormalized `order_number`/`product_name`, captured back
when it was put away in the Store panel) so a shipped record still shows
which 1688 order it fulfilled, without needing to cross-reference the 1688
Orders tab.
