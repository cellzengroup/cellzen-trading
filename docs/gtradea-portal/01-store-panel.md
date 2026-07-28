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
| "Item stored" success sheet | after any successful put-away | Shows the new code, shelf, tracking, who/when; offers Print / Cancel (undo) / OK |

## State (local to `WarehouseApp`)

| State | Meaning |
|---|---|
| `activeShelf` / `activeShelfRef` | The shelf currently "selected" for scanning boxes into. The ref mirrors the state so the scanner's callback (captured once) always reads the latest value even mid double-scan. |
| `feed` | Last 8 stored items this session, newest first — the "Just scanned" list. |
| `manualRackSelect`, `manualRackText`, `manualTracking` | The manual-entry form fields. |
| `savedItem` | The item just stored, driving the success sheet (auto-dismisses after 6s unless the user interacts with it). |

## How a scan is routed

A scanned/typed string reaches Store through one of three input paths, all
converging on the same handlers:

1. **Camera overlay** (mobile / "Scan" button) → `WarehouseScanner`'s
   `onDecode` → `routeScan(text)` → (tab === "Store") → `handleStoreDecode`.
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
The single put-away call shared by scan and manual entry.
1. `PUT`s via `putAwayItem(rackId, tracking.trim().toUpperCase(), mode)` —
   `mode` is `"gtradea"` here, so the backend applies the 1688 validation.
2. On success: prepends the new item to `items` and to `feed` (capped at 8),
   upserts the rack into local `racks` state (covers the auto-created-shelf
   case), and opens the success sheet (`showSaved`).
3. On failure: toasts the server's message. A **409** (duplicate — already
   in stock) is shown as a *warning*, not an error, since it's a common,
   non-destructive mistake (re-scanning the same box twice).

### `handleManualSave()`
Backs the manual form's Save button.
1. Resolves the shelf as `manualRackText` (free-typed) OR
   `manualRackSelect` (dropdown), trimmed + uppercased.
2. Validates: shelf present, shelf matches `isShelf`, tracking present —
   each failure shows a specific toast and returns early.
3. Calls `storeTracking`, then clears the tracking field only (shelf stays,
   since the next box is usually going to the same shelf).

### Success-sheet actions
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
   Dispatched panels can show them without a join).
4. Auto-creates the rack if it doesn't exist yet (`Rack.findOrCreate`).
5. Rejects with `409` if that tracking number is already `in_stock`
   somewhere (checked at the app level; a partial unique DB index on
   `(tracking_number) WHERE status='in_stock'` is the atomic backstop for a
   simultaneous double-scan from two devices).
6. Mints the next sequential code (`CZN00001`, `CZN00002`, …) by scanning
   existing codes for the highest number, and retries up to 6 times on a
   collision (two staff storing an item in the same instant).
7. Inserts the row with `status: 'in_stock'`, stamped with the acting user's
   id/name.

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
