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
| "Sort by" dropdown | Warehouse state: Date (default, everything) / Received / Dispatched / Not Yet / Pending |
| "Mode" dropdown | Sits to the right of "Sort by". Shipment mode: All modes (default) / By Land / By Air |
| | **Both are filters and they stack** — Received + By Air leaves exactly the received orders that still have to fly. Every option carries an `(n)`: how many rows you'd be left with if you picked it, counted with the *other* dropdown held where you left it |
| Search box | Filters by order #, CN tracking, product name, item code, or job code |
| `SupplierOrdersTable` | Date, **Product ID** (gtradea's per-item `GTI-…` code, stored as `item_code`), order #, product (+ photo), quantity, CN tracking, warehouse-status pill |
| Product photo **and** description | Both are buttons, not plain content — tapping either opens the **product popup** (below). On a phone that is also why tapping them does *not* open the card's QC photos: the card's tap handler skips anything inside a `button`. |

## The product popup (`ProductViewer`)

Tapping a line's product photo **or its description** opens the photo large, with
everything the line is known by beside it:

The **order number** heads it — that is what a line is chased by outside the
warehouse (gtradea, the supplier, the customer). The Product ID names this one
line, so it sits with the rest of the line's own detail in the table instead.

| Left | Right |
|---|---|
| The photo, `object-contain` on white, linked to the full-size file | Description (the full 1688 title), then a table: Product ID · Qty · **Unit Price** (with its goods + freight working under it) · **Total Price** |

`object-contain`, not `cover`: this *is* the enlargement, so the whole product
has to be in frame — cropping here would hide exactly the packaging detail
someone opened the photo to check. The photo is also a link: it opens the
original file in its own tab, which is the only way to get closer on a phone,
since the page is pinned at `user-scalable=no`. Stacks vertically on a phone,
where side-by-side would leave both halves too narrow to read.

Everything it shows is already on the row the table rendered, so it opens with no
round trip and works exactly as well as the row behind it does.

### Getting out of it

Five ways, and **all of them are instant** — the popup unmounts on the press,
with no exit animation to sit through:

| Way out | Notes |
|---|---|
| ✕ | 44 px, top right — a finger-sized target, not the 40 px it was |
| The backdrop | Only when the press *started* there. A press that began inside the sheet and ended outside (selecting the description, or a swipe that overshoots) leaves it open, which is what `downOnBackdrop` guards |
| **Swipe the header down** (phone) | Drag the grab handle or the order-number bar: the sheet follows the finger, and past ~110 px — or on a quick flick — it goes. A shorter pull springs back |
| Escape | |
| — | Whichever way it went, focus returns to the photo or description button that opened it |

The sheet animates **in** (`whSheetUp` on a phone, `whPopIn` centred on a
desktop, both in `index.css`) and never out. A dialog that plays 200 ms of exit
before it disappears reads as a dead tap on a warehouse phone, and that
complaint is what this replaced.

While it is open the page behind is frozen (`body.overflow = hidden`, with the
desktop scrollbar's width kept as padding so nothing jogs sideways) — flicking
the backdrop used to scroll the table underneath, so closing the popup dropped
you somewhere else in the list than where you opened it.

### Why it used to close a second or two late

**It was never the popup.** `SupplierOrdersTable` was not memoised, so *any*
state change in `WarehouseApp` — including "the product popup just closed" —
re-rendered every 1688 row on screen, each with a photo, a mode `<select>` and a
KG `<input>`. Measured in throttled Chromium on the phone viewport with 200
rows, a tap took **1.8–4.0 s** to take the popup off screen; the tap had
registered instantly and the work behind it was the wait.

The table is now `memo()`'d and every prop it is handed is stable — the rows are
`useMemo`'d, and `openProduct`, `openQc1688` and the three `onToggleAll`
handlers are `useCallback`'d rather than written as arrows in the JSX. The same
measurement now reads **~150–200 ms**, with **zero** table re-renders during a
close; at 400 rows on a 6×-throttled CPU it is ~350 ms, and what is left is the
browser's own repaint of the page the overlay came off, not React.

**If you add a prop to `SupplierOrdersTable`, keep it stable** (a `useMemo`
value, a `useCallback`, or a primitive). An inline arrow or a fresh object
literal silently undoes all of this, and nothing fails loudly when it does — the
panel just goes slow again.

### The ids copy

Tapping the **order number** or the **Product ID** copies it, and the label above
says `· COPIED` for 1.4 s. Both are on their way into gtradea, a courier's site
or a chat far more often than they are read aloud. `navigator.clipboard` needs a
secure context, so there is a `<textarea>` + `execCommand` fallback for any
tablet reaching this over plain http.

### Where the prices come from

**Unit Price is gtradea's own "Net unit ¥"** — the column its China Operations
panel prices every procurement line at — and **Total Price is that × quantity**:

```
net unit = unit_price_cny + frt_per_unit_cny      (per piece, 4 dp)
total    = net unit x quantity                    (money, 2 dp)
```

Both halves are synced straight off the procurement item into
`supplier_orders.unit_price_cny` / `.frt_per_unit_cny`, and the two derived
figures are computed **server-side** (`net_unit_price`, `total_price`) so the
popup can never quote a total that disagrees with a downloaded report.

**Four decimals upstream, two on screen.** gtradea prices the freight share to
four (¥0.3500), so the net unit is carried at four decimals all the way through
the database and the route, and `total_price` is worked out from that
*unrounded* figure. The popup then shows both as plain money, to two. Worked
through on a real line — PR-2230's `GTI-101733`, qty 10:

| Unit ¥ | Frt/unit ¥ | Net unit ¥ | × qty | Total |
|---|---|---|---|---|
| 3.50 | 0.3500 | 3.8500 → shown **¥3.85** | 10 | **¥38.50** |

which is exactly that line's `paid_cny` on gtradea. Rounding the unit *before*
multiplying is what this ordering avoids: a line at ¥0.41 + ¥1.1667 freight is
¥1.5767 a piece, which reads as ¥1.58 but totals ¥4.73 over three — not the
¥4.74 the rounded figure would give. The popup shows the two figures on their
own, with no arithmetic written out between them.

**Not divided out of `paid_amount`.** That column is a 1688-**order**-level
total that can cover several procurement lines, so dividing it by one line's
quantity would overstate that line whenever an order bundles more than one.
`unit_price_cny` / `frt_per_unit_cny` are per **item**, which is the only pair
that stays right in that case.

**A line gtradea has not priced yet shows —, never ¥0.00.** "No price recorded"
and "free" are different answers. The chain that keeps them apart runs the whole
way down: `money()` in the sync rejects `null`/`''` before coercing (`Number('')`
is `0`); `netUnitOut()` returns null when there is no unit price (a freight share
on its own is not a unit cost); and `fmtCny()` in the popup rejects nullish input
*before* `Number.isFinite`, which would otherwise pass `Number(null) === 0`
straight through. A *priced* line with no freight recorded is a real ¥0 share,
though, so that half falls back to 0 rather than voiding the answer — and the
popup then drops the "goods + freight" working line rather than printing
"¥18.0000 + ¥0.0000 freight".

## State

| State | Meaning |
|---|---|
| `supplierOrders` | The loaded rows |
| `supplierSearch`, `supplierSort`, `supplierModeFilter` | Filter text, warehouse-state filter, shipment-mode filter. `supplierModeFilter` is named that way because `setSupplierMode` is already the writer that changes *one row's* shipment mode on the server — this one writes nothing |
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

### `searchedSupplier` (`useMemo`)
The search box applied on its own, before either dropdown. Kept as its own
list because **the export dialog counts against this one** — the export posts
`supplierSearch` plus its own scope/mode/date choices to the server and knows
nothing of the panel's two dropdowns, so bounding its preview by them too
would promise counts the download never produces.

### `filteredSupplier` (`useMemo`)
`searchedSupplier` narrowed by **both** dropdowns at once — an intersection,
not two competing sorts. Row order is left exactly as the server sent it
(newest-order-first): the pair narrows the set rather than reshuffling it, so
a row never jumps position in the table just because its *status* changed
under the viewer's eyes mid-poll — it only enters or leaves the set it
belongs to.

Both dropdowns share one convention: **an option with no `match` is that
dropdown's "everything" choice** (`Date`, `All modes`). `supplierMatcher()`
turns any option — or a stored value that no longer exists — into a
predicate, resolving the unknown case to "everything" rather than silently
emptying the table.

- Warehouse-state choices match on `supplierState`.
- Shipment-mode choices match on `shipMode`: land is the explicit value, air
  is everything else. That mirrors the server's `EXPORT_MODES`, so the two
  always sum to the row count and a row with no mode recorded still lands in
  exactly one of them.

### `supplierCounts` (`useMemo`)
The `(n)` on every option in both dropdowns: how many rows you'd be left with
if you picked it. Each side is counted with the **other** dropdown held where
the user left it — the same rule the export dialog's two selectors already
follow. So "By Air (12)" under a Received selection means twelve *received*
orders fly, which is exactly the question being asked of it; counting either
side unfiltered would advertise rows the pair then filters away.

Two invariants fall out of this and are covered by the checks: the two modes
always partition the current state selection (`land + air = all modes`), and
the four states always partition the current mode selection.

## The downloaded packing list (`/export.xlsx`, `/export.pdf`)

Four money columns, left to right as the sum they are. In the **sheet** only the
first holds a number; the other three are live Excel formulas over the cells to
their left, each carrying the computed figure as its cached result so the file
reads correctly before Excel has recalculated anything:

| Column | Sheet cell |
|---|---|
| Unit Price in ¥ | the stored net unit price (gtradea's "Net unit ¥") — a plain number
| Unit Price in $ | `=<Unit ¥># / 6.7` |
| Amount in ¥ | `=<Unit ¥># * <Quantity#>` |
| Amount in $ | `=<Unit $># * <Quantity#>` |
| **Total** row | `=SUM(...)` down the two Amount columns |

The rate is `RMB_PER_USD`, one constant in the route, so correcting it is one
find-and-replace in the sheet and one line in the code.

**Amount is now per LINE, not per order.** It used to be `paid_amount` — a
1688-ORDER total repeated on every line of the order, which could not be divided
into a per-piece price and overstated any single line of a multi-line order.
Two consequences: the amount cells are **no longer merged** down a shipment
(only the order number still is — see `packingShipmentGroups`), and the total is a
plain `SUM` rather than one figure counted once per shipment.

**Dollars are cached UNROUNDED** (`usdExact`, not a rounded helper). Excel
recomputes `=M7/6.7` at full precision the moment it recalculates, so a rounded
cache would make the cell change value between opening the file and touching it,
and a unit price rounded before being multiplied by a quantity compounds that
cent into the total. The number format still shows two decimals.

**An unpriced line gets blank cells, not formulas.** `=M7*I7` over a blank unit
price shows ¥0.00, which states the goods were free rather than that nobody has
priced them. The same nullish-before-coercion guard as everywhere else on this
path — `Number(null)` is `0`, and `0` is finite.

**KG** carries whatever staff typed into the KG column of this panel, and is left
**empty** where nobody has weighed the line. gtradea publishes no weight, so a 0
there would read as "weighed, and it came to nothing".

The **PDF** prints the same four figures as text (no formulas), taken from the
same `packingRowValues`, so a printout held against the sheet shows identical
numbers.

## Backend contract

`GET /api/inventory/supplier-orders` — every `supplier_orders` row
(optionally `?search=`), newest-order first (`ordered_at DESC NULLS LAST`),
each annotated with a computed `warehouse` object by joining
`china_tracking_no` against `warehouse_items.tracking_number` (in-stock
match preferred over a shipped one for the same tracking number). Response
also carries `lastSync` (the same status object `GET /status` returns), so
the panel doesn't need a second round-trip just to show the header label.

Every row also carries `unit_price_cny`, `frt_per_unit_cny` and the two figures
derived from them, `net_unit_price` and `total_price` — all four null on a line
gtradea has not priced. See the product popup above.

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
