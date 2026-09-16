# Store Panel — "Put away a shipment"

**Tab:** `Store` (first tab, both modes) · **Component:** `WarehouseApp.jsx` (inline JSX, no separate file) · **Route:** `/warehouse-gtradea` (mode `gtradea`)

## Purpose

Receive a physical box into the warehouse: pick (or scan) a shelf, then scan
the box's tracking number. In GtradeA mode, the tracking number must belong
to a real gtradea order — this is the one gate that keeps the 1688 pipeline
honest, so every "received" flag downstream is trustworthy.

## Layout

| Element | Shown on | Notes |
|---|---|---|
| Active-shelf pill | header of the card | Purple "CZN01-01-0001" once a shelf is scanned; amber "No shelf yet" before that |
| "Barcode scanner ready" banner | desktop only | Reminds staff the USB hardware scanner is always listening — no camera needed |
| Manual form (Choose shelf / Shelf number / Tracking number) | desktop: inline · mobile: behind "Enter Manually" | Same form, reused in both places |
| "Just scanned" feed | both | Last 8 items scanned/stored in this browser session (mobile: cards, desktop: table) |
| Camera scan overlay | mobile (or "Scan" button anywhere) | Full-screen camera with a Scan/Enter-Manually toggle |
| "Item stored" success sheet | after any successful put-away | A check mark and the new code (no heading, no caption), the product(s) inside (photo + name, each opening the photo in a new tab), a By Air / By Land switch, shelf, order #, tracking; offers Print / Cancel (undo) / OK. Who stored it and when are left to the "Just scanned" table. |

## State (local to `WarehouseApp`)

| State | Meaning |
|---|---|
| `activeShelf` / `activeShelfRef` | The shelf currently "selected" for scanning boxes into. The ref mirrors the state so the scanner's callback (captured once) always reads the latest value even mid double-scan. |
| `feed` | Last 8 stored items this session, newest first — the "Just scanned" list. |
| `manualRackSelect`, `manualRackText`, `manualTracking` | The manual-entry form fields. |
| `savedItem` | The item just stored, driving the success sheet (auto-dismisses after 6s unless the user interacts with it). |
| `modeSaveQueue`, `modePick`, `modeSaved` (refs) | The sheet's background mode saves. The queue runs saves one at a time so the server ends on the last pick; per box id, `modePick` is the mode on screen and `modeSaved` the mode the server last confirmed (what a failed save reverts to). |

## How a scan is routed

A scanned/typed string reaches Store through one of three input paths, all
converging on the same handlers:

1. **Camera overlay** (mobile / "Scan" button) → `WarehouseScanner`'s
   `onDecode` → `routeScan(text)` → (tab === "Store") → `handleStoreDecode`.
   `WarehouseScanner` decodes with the browser's native `BarcodeDetector`
   wherever it can read QR and Code 128 (Chrome on Android), at most every
   60ms. Other browsers use zxing-js, reading every 100ms instead of
   @zxing/browser's default 500ms.
2. **USB hardware barcode scanner** (desktop) — a global `keydown` listener
   detects a burst of fast keystrokes ending in `Enter` (a real scanner types
   far faster than a human and doesn't fire while a form field is focused),
   and calls the same `routeScan(text)`.
3. **Manual form** → `handleManualSave` → directly validates and calls
   `storeTracking`.

## Functions

### `isShelf(text)` (module-level, shared)
Regex test: `^[A-Za-z]{1,6}\d{1,4}-\d{1,4}-\d{1,6}$` (e.g. `CZN01-01-0001`).
Decides whether a scanned string is a **shelf label** or a **tracking
number** — this single rule is what lets one camera/one input field serve
both purposes without a mode switch.

### `handleStoreDecode(text)`
The Store-tab decode handler, called for every camera/hardware scan while
this tab is open.
1. Trims the input; bails if empty.
2. If it **looks like a shelf** (`isShelf`): uppercases it, sets it as
   `activeShelf`, best-effort creates the rack server-side (`createRack`,
   tolerant of "already exists"), and toasts `Shelf set: …`.
3. Otherwise (**it's a tracking number**): if no shelf is active yet, toasts
   an error and stops (`"Scan a shelf label first, e.g. CZN01-01-0001"`);
   otherwise calls `storeTracking(activeShelf, text)`.

This is why the flow is always **shelf, then boxes** — a tracking scan with
no active shelf is refused client-side before it ever reaches the server.

### `storeTracking(rackId, tracking)`
The single put-away call shared by scan and manual entry. The success sheet
never waits on the network:
1. Opens a **pending** sheet at once (`id: "pending-N"`, `pending: true`) with
   the shelf and tracking number. In GtradeA it also shows the product(s),
   photo, product ID, quantity, order # and mode, previewed from the 1688
   orders already in the page (`previewPutAway`). The Store tab loads that
   list quietly when it opens and every 2 minutes. A spinner stands in for the
   check mark until the box is stored, and a code the list doesn't know shows
   placeholders.
2. Sends `putAwayItem(rackId, tracking.trim().toUpperCase(), mode)`. `mode` is
   `"gtradea"` here, so the backend applies the 1688 validation. A second read
   of a code whose put-away is still on the wire is ignored.
3. On success (`adoptStored`): prepends the item to `items` and `feed` (capped
   at 8) and upserts the rack. If the sheet still shows that scan, it swaps
   the server's item in and carries over a mode already picked on the pending
   sheet. The 6s auto-dismiss starts only now, and only if nobody has touched
   the sheet.
4. On failure: closes that pending sheet and toasts the server's message. A
   **409** (duplicate — already in stock) is a *warning*, not an error, since
   re-scanning the same box is a common, harmless mistake.

Print label, Choose copies, the mode switch and Cancel all work on a pending
sheet. Each waits for the box to exist (`sheetBox`) and does nothing if the
server refused the scan.

### `handleManualSave()`
Backs the manual form's Save button.
1. Resolves the shelf as `manualRackText` (free-typed) OR
   `manualRackSelect` (dropdown), trimmed + uppercased.
2. Validates: shelf present, shelf matches `isShelf`, tracking present —
   each failure shows a specific toast and returns early.
3. Calls `storeTracking`, then clears the tracking field only (shelf stays,
   since the next box is usually going to the same shelf).

### Success-sheet contents
- **Product(s)** (`StoredProducts`) — the photo and name of each distinct 1688
  product in the parcel, from `savedItem.products` (the put-away response
  carries it). One product shows a large photo; a parcel holding several lists
  each one. Under each name, on the left: the product ID, then the quantity
  (summed over the parcel's lines of that product; "—" when gtradea has none).
  Names are clamped to two lines; hovering one (or focusing it) shows the full
  description in a tooltip box beneath it. Clicking a photo **or** a name opens that photo
  on its own in a new tab. Both links use `rel="noopener noreferrer"` and the
  `<img>` uses `referrerPolicy="no-referrer"`, because alicdn 403s a Referer
  from our domain. Only an http(s) URL becomes a link (`productPhotoUrl`); a
  missing or broken photo shows a box placeholder. Cellzen items have no
  product, so the block is hidden.
- **Mode of shipment** (`ShipModeToggle`) — a detail row under Shelf, laid out
  like the others, with a small By Air / By Land switch as its value. Pre-set
  to the mode put-away stamped on the box (the 1688 order's effective mode).
  See `changeSavedItemMode()` below.

### Success-sheet actions
- **`changeSavedItemMode(mode)`** — never waits on the network. The sheet, the
  "Just scanned" feed and the items list change in the same frame, with no
  disabled state, and the save is queued on `modeSaveQueue` (`queueModeSave`):
  `updateItemShipmentModeWithOrders(id, mode)`, so the box's 1688 lines take the
  same mode (Mode column, BYAIR/BYLAND packing lists). The first save for a box
  also keeps what its lines held before (`linesBefore`), which Cancel restores.
  Saves run one at a time. A queued pick is skipped when a newer one replaced
  it or when it matches what the server already holds, so rapid taps don't pile
  up requests and the server ends on the last pick. A reply repaints only if
  its pick is still the latest; a failure with no newer pick queued reverts to
  the server's mode (`modeSaved`) and toasts. The switch is two buttons, not a
  `<select>`: the hardware-scanner listener ignores keystrokes while a
  `<select>` has focus, which would swallow the next box's scan.
- **Print label**, **Choose copies** and **Cancel** first wait until the queue
  has settled (`settleModeSaves`, including saves queued during the wait), then
  use the mode the server holds (`savedModeOf`). A label never prints a mode the
  server refused, and a delete never lands before a pending mode save. Normally
  the queue is already empty and the wait costs nothing.
  - A mode picked in the copies dialog opened from the sheet goes through the
    same queue (with `applyToOrders`), so the sheet, the box and its 1688 lines
    can't disagree. If that save fails, nothing prints.
  - **Cancel** after a mode change on the sheet sends `linesBefore` with the
    delete (`deleteItem(id, { restoreLineOverrides })`), so the 1688 lines go
    back to exactly what they held, in the same transaction. No single mode
    could restore them: one parcel's lines can differ (a lithium line beside a
    phone case).
  - A failed save's toast names the box and renders above the sheet.
  - Each box has its own save queue (`modeQueues`, keyed by the pending id it
    started as), so printing or cancelling one box never waits on another
    box's put-away or save.
  - **Print label** ignores repeat taps while its box is still waiting and says
    so on the button ("Printing once stored…" / "Printing…"), so impatient taps
    don't queue extra labels. If a mode change made while it waited is refused,
    nothing prints and the error stays on screen.
  - Switching back to the mode the box was put away with, after a save changed
    its lines, sends `linesBefore` as `restoreLineOverrides`, so the lines go
    back exactly to what they held.
  - By Air never overrides a line a dangerous-goods rule puts on land. The
    sheet names such lines in a warning toast (`keptLand`).
- **A refused scan puts the previous sheet back.** Any code read while a sheet
  is open opens its own pending sheet. If the server refuses it (a second
  barcode on the same parcel, say), the sheet it displaced comes back — as its
  stored box if that put-away finished meanwhile — instead of vanishing.
- **`printSavedItem()`** — keeps the sheet open (cancels its auto-dismiss)
  and calls `handlePrintLabel(savedItem)`.
- **`undoSavedItem()`** — deletes the just-created item (`deleteItem`) and
  removes it from both `items` and `feed`; used when a box was scanned by
  mistake.
- **OK** — just dismisses the sheet.

## Backend contract

`POST /api/inventory/warehouse/items` (see
[`backend/inventory/routes/warehouse.js`](../../backend/inventory/routes/warehouse.js))

Request body: `{ rackId, trackingNumber, source: "gtradea" }`

Server-side, in order:
1. Rejects if `rackId` is missing or doesn't match the shelf-code pattern.
2. Rejects if `trackingNumber` is missing.
3. **GtradeA-only gate:** looks up `SupplierOrder` by
   `china_tracking_no = trackingNumber`. No match → `422 "This tracking
   number doesn't exist in the orders"`. On match, captures `order_number`
   and `product_name` to store on the item (denormalized, so the Ship/
   Dispatched panels can show them without a join). The box's
   `shipment_from` is **By Land if any line of the parcel is land** (a staff
   override or the dangerous-goods classifier), otherwise By Air — one parcel
   travels as one box.
4. Auto-creates the rack if it doesn't exist yet, as one
   `INSERT … ON CONFLICT DO NOTHING` (`Rack.bulkCreate` with
   `ignoreDuplicates`), sent together with the id minting in step 6.
5. Rejects with `409` if that tracking number is already `in_stock`
   somewhere (checked at the app level; a partial unique DB index on
   `(tracking_number) WHERE status='in_stock'` is the atomic backstop for a
   simultaneous double-scan from two devices).
6. Mints the goods number and the box id in one query (`generateCodes`): if
   another box from the same 1688 order number is already on file, its code is
   reused; otherwise the next sequential code (`CZN-00001`, `CZN-00002`, …) is
   the highest existing number + 1. Cellzen items (no order number) always get
   a new code, and every box gets a new box id (`GTP-000001`, …).

   Every step is a round trip to the database (Railway to the Supabase pooler
   in Seoul, about 86 ms each in production), so the route pairs them up: the
   in-stock check with the parcel's 1688 lines, and the rack insert with the id
   minting. The product list is then built from the lines already read. A
   common scan is 3 round trips; it used to be about 10. The response carries a
   `Server-Timing: app;dur=…` header with the time spent on the server.
7. Inserts the row with `status: 'in_stock'`, stamped with the acting user's
   id/name.
8. Returns the row enriched with the parcel (`attachParcelSafely`). Besides
   `item_codes` / `product_ids` / `order_numbers` / `product_count`, a
   single-item response carries `products`: one
   `{ item_code, product_name, product_image, quantity }` per distinct 1688
   product under that tracking number, `quantity` summed over that product's
   lines. That is what the success sheet shows. `GET /items`
   leaves `products` off to keep its up-to-5000-row poll light.

Changing the mode from the success sheet goes through
`POST /api/inventory/warehouse/items/:id/shipment-mode` with
`applyToOrders: true` — see the Ship panel's backend contract.

## Edge cases worth knowing

- **Scanning a shelf twice** is harmless — `createRack` treats a 409
  ("already exists") as success, not an error.
- **A tracking number gtradea has never seen** is rejected with a clear
  message rather than silently accepted — this is intentional friction: it
  means every 1688 item that reaches the shelf is traceable to a real order.
- **The "Just scanned" feed is per-browser-session only** (`useState([])`,
  not persisted) — it's a convenience list for the person currently
  scanning, not a system record. The permanent record is the Dashboard/Ship/
  Dispatched views, backed by the database.
