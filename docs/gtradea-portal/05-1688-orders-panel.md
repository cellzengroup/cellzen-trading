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

Three money columns, left to right as the sum they are. In the **sheet** only
the first holds a number; the two after it are live Excel formulas over the
cells to their left, each carrying the computed figure as its cached result so
the file reads correctly before Excel has recalculated anything:

| Column | Sheet cell |
|---|---|
| Unit Price in ¥ | the stored net unit price (gtradea's "Net unit ¥") — a plain number |
| Unit Price in $ | `=<Unit ¥># / 6.7` |
| Amount in $ | `=<Unit $># * <Quantity#>` |
| **Total** row | `=SUM(...)` down the Amount column |

**The amount is billed in dollars only.** The yuan amount column that used to
sit beside it said the same figure twice: the unit price is already there in
yuan for anyone checking the conversion, and the line and the total now read in
one currency — the one the invoice is settled in. The per-line yuan amount is
still computed (`packingRowValues.paid`); it is what the dollar total is worked
out from, it just has no column of its own.

**The total is summed in yuan and converted once**, not summed down the dollar
column (`packingTotalUsd`): each line's dollar figure is an unrounded division,
and adding a column of those accumulates a fraction of a cent per line. The
yuan side is exact money, so rounding it to the cent first and converting that
is the figure the invoice can be settled against. The `SUM` in the cell is what
lets Excel re-total after an edit; the cached result is the exact one.

The rate is `RMB_PER_USD`, one constant in the route, so correcting it is one
find-and-replace in the sheet and one line in the code.

**Amount is now per LINE, not per order.** It used to be `paid_amount` — a
1688-ORDER total repeated on every line of the order, which could not be divided
into a per-piece price and overstated any single line of a multi-line order.
Two consequences: the amount cells are **no longer merged** down a shipment
(only the order number still is — see `packingShipmentGroups`), and the total is
added up rather than being one figure counted once per shipment.

**Dollars are cached UNROUNDED** (`usdExact`, not a rounded helper). Excel
recomputes `=M7/6.7` at full precision the moment it recalculates, so a rounded
cache would make the cell change value between opening the file and touching it,
and a unit price rounded before being multiplied by a quantity compounds that
cent into the total. The number format still shows two decimals.

**An unpriced line gets blank cells, not formulas.** `=N7*I7` over a blank unit
price shows $0.00, which states the goods were free rather than that nobody has
priced them. The same nullish-before-coercion guard as everywhere else on this
path — `Number(null)` is `0`, and `0` is finite.

**KG** carries whatever staff typed into the KG column of this panel, and is left
**empty** where nobody has weighed the line. gtradea publishes no weight, so a 0
there would read as "weighed, and it came to nothing".

The **PDF** prints the same three figures as text (no formulas), taken from the
same `packingRowValues`, so a printout held against the sheet shows identical
numbers.

## The Product Name column

gtradea gives us no product name. What `supplier_orders.product_name` holds is
the full 1688 listing **title** — keyword-stuffed, machine-translated marketing
text ("Export Quality Commercial-Grade Small Blender for Milk Tea, Home Use,
Shop Stalls, Multifunctional Juice and Soy Milk Maker"). That whole string is
right for the **Product Description** column beside it. The **Product Name**
column has to be a short name a customs broker can read, and deriving one is
the job of `backend/inventory/services/productNames.js`.

Resolution order per row — first usable answer wins:

| # | Source | Notes |
|---|---|---|
| 1 | `product_name_cache`, `source='manual'` | A human's correction. Never overwritten, never re-asked. |
| 2 | `product_name_cache`, `source='llm'` | Resolved on an earlier run. Makes a repeat export instant, free and **identical**. |
| 3 | Groq, batched ~20 titles per call | Written back to the table. |
| 4 | `deriveShortProductName` in the route | Offline heuristic, no network. |

### How short the name should be

**Two words is the target.** One or three where two will not do; four is a
failure unless the goods genuinely have a four-word name. Across the current
254-title catalogue that lands at 1.99 words average, 198 of them exactly two.

The rule that gets there is: **drop the qualifier, keep the type.**

| Drop | Keep |
|---|---|
| Material — "Ceramic Table Lamp" → **Table Lamp** | The noun that defines the product type — "Water Cup" not "Cup", "Dust Bag" not "Bag" |
| Decoration — "Dustproof Filter Paper Box" → **Filter Paper Box** | Anything that changes what the goods ARE — Electric, Rechargeable, Insulated, Folding |
| Redundancy — "Laptop Inner Bag" → **Laptop Bag** | Material where the bare noun means nothing — **Silicone Mold** stays, "Mold" is not a product |
| Brand, platform, colour, size, count, model code, year, season, audience | |

**Short is the goal; vague never was.** Pushing for two words produced 30
one-word names, and several were as useless as the mangled plurals they
replaced — a pet tracker came out as "Locator", a die-cast model as "Car", a
backrest pillow as "Headboard Cushion". So every name is now held up to
`validateName()` before it is allowed near the sheet:

| Check | Rejects | Why |
|---|---|---|
| **Not vague alone** | "Locator", "Car", "Battery", "Cushion", "Ball", "Jacket" | A bare category noun declares nothing. `VAGUE_ALONE` |
| **Grounded in the title** | "Water Bottle" for a listing that says *water cup* | Stops the model renaming goods to a near-synonym — the original complaint |
| **Ends on a noun** | "Anti-Lost", "Non-Slip" | compromise POS-tags the last word; a modifier is not a name |
| **No mistranslation tail** | "Battery Suit", "Tea Set" | 1688 renders 套装 as "suit"; an Xbox battery kit read as clothing |
| **At most 4 words** | | |

A rejection does **not** go straight to the heuristic. The failures go back to
the model in a **repair pass** — one small extra call carrying the rejected
name and the exact reason, which is far more use to it than another round of
general prompt wording. Only if repair also fails does the row fall back, and
then only for a *hard* failure; a *soft* one (wording the title does not use,
like "Mold" where the listing spells it "Mould") is kept, because a slightly-off
real name still beats the heuristic.

This is enforced twice, on purpose. The prompt asks for it, and then
`tightenName()` strips leading material and decorative words deterministically,
so a verbose answer from the model still lands short. The tightener only strips
when two or more words survive, or when the single survivor is not on its
`GENERIC_HEAD` list — which is what stops "Inner Bag" collapsing to "Bag" while
"Small Blender" still collapses to "Blender". **It runs on model output only**:
a name pinned with `--set` is printed exactly as the person typed it.

**The name is cached because a packing list is a declaration.** Re-deriving it
per export meant the same goods could go out under two different names on two
prints of the same consignment — and it put a ~20s LLM round trip on the
critical path of every download. The table (`product_name_cache`, keyed by a
sha256 of the normalised title) makes the second export of anything a lookup.

**No model name is hard-coded.** `PREFERRED_MODELS` is a list, checked against
`GET /v1/models` at first use, and a model that 404s mid-run is struck off and
the chunk retried on the next candidate. This is not hypothetical tidiness:
Groq retired `llama-3.3-70b-versatile`, every chunk came back
`model_not_found`, and the export quietly fell through to the heuristic —
shipping packing lists that read "Milk teas" for a blender, "And sizeses" for a
miniskirt, "Pack suitables" for vacuum dust bags and "Be storeds" for a laptop
bag. Nothing errored; the sheet was just wrong.

**A failed resolution is loud.** Whatever the reason — no key, dead model, rate
limit, timeout — the rows fall back to the heuristic *and* a `console.error`
names the count and the cause, because whoever is about to email that sheet to
a forwarder needs to know which cells are guesses.

**Rate limits are waited out, within a budget.** This key is on Groq's
on-demand tier (8000 tokens/minute) and a chunk costs ~3200, so a full
catalogue run will hit 429s. A live export may only spend
`PACKING_LLM_RETRY_BUDGET_MS` (20s) waiting before it gives the remaining rows
to the heuristic; the refresh script below passes `patient: true` and waits
properly. Warm the cache with the script, and the export never pays it.

### Working with the names

```bash
node backend/scripts/refresh-product-names.js             # resolve + cache anything new
node backend/scripts/refresh-product-names.js --list      # read every cached name
node backend/scripts/refresh-product-names.js --offline   # what the fallback would say
node backend/scripts/refresh-product-names.js --dry-run   # resolve, print, write nothing
node backend/scripts/refresh-product-names.js --force     # re-resolve after a prompt/model change
node backend/scripts/refresh-product-names.js --set "<title substring>" "<name>"
```

**`--set` is the fix for a name a model keeps getting wrong.** It pins the name
as `source='manual'`, which no model can overwrite — not even `--force`. Reach
for it before editing the prompt: it is one row, it is certain, and it cannot
regress the other 252 names.

The table is created on server start (`server.js`, same pattern as
`warehouse_qc_images`) and by
`backend/migrations/add_product_name_cache_table.js` for a manual run.

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
