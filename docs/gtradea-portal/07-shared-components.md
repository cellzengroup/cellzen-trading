# Shared Components

Pieces used across multiple panels rather than owned by one tab: the camera
scanner, barcode rendering, label printing, the header/navigation chrome,
and the auth gate. Documented once here instead of repeated in every panel
doc.

## Authentication gate

`WarehouseApp` is not wrapped by a route-level guard — it guards itself,
because `/warehouse-gtradea` is a standalone route outside the `/staff*`
tree where the app's global auth redirect normally applies.

- **Render-time redirect:** at the very end of the component (after every
  hook, to satisfy the Rules of Hooks), if `localStorage.staff_token` is
  missing it returns `<Navigate to="/staff-login?next=/warehouse-gtradea" replace />`
  **during render**, not inside an effect — this is deliberate, so a
  logged-out visitor is sent to login before the warehouse UI ever flashes
  on screen.
- **Session expiry:** listens for a global `auth:expired` window event (fired
  elsewhere in the app when a token is rejected) and redirects the same way.
- **Identity:** `staffUser` is read once from `sessionStorage.staff_user`
  (name shown in the header avatar); `handleLogout` clears both
  `staff_token` and `staff_user` and navigates to `/staff-login`.
- **API calls** all go through `authFetch` with `{ tokenKind: "staff" }`
  explicitly set (see `warehouseApi.js`) — needed because this standalone
  route isn't covered by `authFetch`'s normal path-based token detection.
- **Server side:** every route requires `authenticate` + a role check
  (`staff`, `admin`, `superadmin`, or `accountType === 'Admin'`) —
  `requireStaffOrAdmin`, duplicated identically in both
  `warehouse.js` and `supplierOrders.js`.

## Header & navigation chrome

- **Cellzen / GtradeA switch** — a two-button segmented control in the
  header that simply navigates between `/warehouse` and `/warehouse-gtradea`
  (two mounts of the same component with a different `mode` prop and React
  `key`, so switching fully remounts rather than trying to reuse state
  across modes).
- **Tabs** — desktop shows a segmented control (`TABS.map(...)`); mobile uses
  a hamburger that opens a full-screen slide-in menu (`menuOpen`), rendered
  via `createPortal` so it isn't clipped by any ancestor's stacking context.
  Body scroll is locked (`document.body.style.overflow = "hidden"`) while
  the mobile menu is open.
- **Refresh button** — calls `loadData()`, which re-fetches both racks and
  items in parallel (`Promise.all`) and spins while `loading` is true.
- **Instant-paint cache** — the last-loaded item list is mirrored into
  `localStorage` per mode (`wh_items_cache_gtradea` / `_cellzen`) so
  re-opening the app paints the previous list immediately, then reconciles
  once the network `loadData()` call resolves. Best-effort: a quota error or
  private-mode browser just falls back to an empty initial list.

## Barcode rendering — `Barcode.jsx`

A thin wrapper around `bwip-js`'s `toCanvas`, rendering a Code-128 barcode
(with the human-readable text beneath it) directly onto a `<canvas>`. Used
inline wherever an item/shelf's "physical label" card is shown (`detailCard`
in Ship/Dispatched, the shelf cards in Racks). Re-renders whenever `text`
changes; silently no-ops on invalid input.

## Camera scanner — `WarehouseScanner.jsx`

A continuous rear-camera barcode/QR scanner built on `@zxing/browser`.

- **Formats accepted:** QR, Code-128, Code-39, EAN-13/8, UPC-A/E, ITF,
  Codabar, Data Matrix — restricted on purpose so zxing has fewer formats to
  try per frame (faster, fewer false reads).
- **`continuous` prop:** Store scans keep the camera running for the next
  box; every other tab's scan (`continuous={false}`) stops the camera after
  one decode.
- **Debounce:** an identical decoded string within `debounceMs` (default
  2500ms) is ignored — otherwise a code sitting in frame for a second would
  fire the same "item stored" flow repeatedly.
- **Callback refs:** `onDecode`/`onError` are read through refs
  (`onDecodeRef`, `onErrorRef`) updated on every render, because the zxing
  decode callback is captured once when scanning starts — without the ref
  indirection, a stale closure would keep calling whatever handler was
  active when the camera opened, not the current tab's handler.
- **Cleanup discipline:** `stop()` releases the `MediaStream` tracks
  explicitly (`releaseTracks`), and if the component unmounts *during* the
  async camera-permission/init window, the effect detects that
  (`mountedRef`) and stops the now-live stream immediately — otherwise the
  camera light could stay on with nothing referencing it, recoverable only
  by a page reload.

## The scan router — `routeScan(text)`

One camera / one hardware scanner feeds every tab through this single
dispatcher (in `WarehouseApp`), which sends the decoded text to whichever
handler matches the **currently open tab**:

| Tab | Handler | Behavior |
|---|---|---|
| Store | `handleStoreDecode` | Shelf → sets active shelf; tracking → stores it under that shelf |
| Racks | `handleScanAddShelf` | Treats the code as a shelf to add; closes the camera afterward |
| Ship | `handleShipScan` | Locates the item and pops the ship-confirmation |
| 1688 Orders | — | Sets the search box to the scanned text (finds the matching order) |
| (Dispatched / default) | `doLookup` | Locates and opens the item's detail |

### Two independent scan inputs, one router

- **Mobile / manual trigger:** the camera overlay (`scanOpen`), a
  full-screen portal with a Scan/Enter-Manually toggle on the Store tab.
- **Desktop:** a **hardware USB barcode scanner** is always listening via a
  global `keydown` effect. It buffers keystrokes and treats a fast burst
  (gap < 45ms between characters) ending in `Enter` as a scan, ignoring
  Ctrl/Meta/Alt-modified keys and anything typed while a form field is
  focused — this is what lets a physical scanner "just work" without a
  dedicated button, while normal typing in the manual form still works
  untouched.

## Label rendering & printing — `warehouseLabels.js`

Shipment (item) labels are rendered **once** onto an offscreen canvas at
exact printer resolution (480×640 dots = 60×80mm at ~203dpi/8 dots-per-mm):
CELLZEN logo, a Code-128 barcode, Shelf/Tracking lines, a handling-icon row,
and a footer. That single rendered image is the source of truth for both
outputs:
- **Download** → the canvas exported as a PNG.
- **Print** → the canvas packed into a 1-bit monochrome bitmap and sent to
  the on-site **Deli 720C** thermal printer as a native TSPL `BITMAP`
  command — printing 1:1 with the source dots keeps the barcode reliably
  scannable (no browser print-dialog scaling involved).

Shelf/rack labels are simpler by design: just a native Code-128 barcode, no
logo or icons.

### Print delivery — three-tier fallback (`printItemLabel`)

1. **Local bridge** — `POST http://127.0.0.1:9110/print` (the on-site
   **print-bridge** service, a separate tool from the gtradea-bridge,
   binding to loopback so the browser's HTTPS page is allowed to call it).
   If the device running the browser *is* the warehouse PC, the label
   prints immediately.
2. **Cloud queue** — if the bridge isn't reachable (e.g. printing from a
   phone), `enqueuePrintJob()` posts the same bitmap to
   `POST /warehouse/print-jobs`; the on-site agent polls
   `GET /warehouse/print-jobs/pending` (claiming jobs atomically with
   `FOR UPDATE SKIP LOCKED` so two agents can never grab the same job, and
   re-claiming anything stuck in `printing` for over 2 minutes in case an
   agent crashed mid-print) and prints it identically, seconds later.
3. **Browser print** — last resort if both the bridge and the queue fail:
   opens a hidden iframe sized to the label and calls `window.print()` on
   the rendered PNG.

The return value's `full` flag distinguishes "printed the complete design"
from "canvas rendering failed and we fell back to a bare barcode" — callers
surface that distinction to the user rather than reporting a silent partial
success as a full one.

### Print agent authentication

The on-site print agent (like the gtradea bridge) is not a logged-in staff
user — it authenticates with a shared secret, `PRINT_AGENT_TOKEN`, compared
with `crypto.timingSafeEqual` to avoid a timing side-channel. Same pattern,
same file family as `GTRADEA_BRIDGE_TOKEN` (see
[Sync engine & bridge](./06-sync-engine-and-bridge.md)).

## Shared confirmation & feedback UI

- **Toast** (`showToast(msg, type)`) — bottom-center, auto-dismisses after
  2.8s; `type` is `ok` (purple) / `warn` (amber) / `error` (red).
- **Success sheet** (`savedItem`) — shown after a Store put-away; the only
  overlay with an auto-dismiss timer (6s), which is cancelled the instant
  the user touches it (`onMouseEnter`/`onTouchStart` → `keepSavedSheet`) so
  it can never disappear mid-interaction.
- **Confirmation modals** — shelf delete, single-item delete, batch delete,
  mark-as-shipped, and print-copy-count all follow the same shape: a
  `null`-or-payload piece of state opens the modal, Cancel clears it back to
  `null`, and the confirm action performs the call then clears it. None of
  these auto-dismiss — a destructive or state-changing action always
  requires an explicit tap.
