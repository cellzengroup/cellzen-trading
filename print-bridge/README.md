# Cellzen Print Bridge (Deli DL-720C)

A tiny local service that lets the website print labels **directly** to the
Deli 720C thermal printer on **60 × 80 mm** stock, no browser print dialog.

- **Shipment labels** print the full approved design (CELLZEN logo, Code-128
  barcode, Shelf / Tracking lines, handling icons, footer). The website renders
  the whole label once and sends it as an image; the bridge prints it verbatim.
- **Rack/shelf labels** stay a simple native Code-128 barcode.

The website runs in the cloud (Render) and a web page can't touch a USB printer.
So this little program runs on the **warehouse PC that has the printer plugged
in**. The site's Print button quietly POSTs here, and this bridge sends a native
TSPL job straight to the Deli 720C.

```
[Print button in browser]  --POST /print-->  [this bridge]  --RAW TSPL-->  [Deli 720C]
```

If the bridge isn't running, the website automatically falls back to the old
browser print — nothing breaks.

## One-time setup (on the warehouse PC only)

1. **Install Node.js** (LTS) from <https://nodejs.org> — next-next-finish.
2. Copy this whole `print-bridge` folder onto the warehouse PC (e.g. the Desktop).
3. Make sure the Deli 720C is installed in Windows and prints a Windows test page.
4. **Calibrate the labels once**: with 60 × 80 mm labels loaded, run the gap
   calibration (Deli utility, or hold the FEED button per the manual) so the
   printer learns where each label starts.
5. Double-click **`start-bridge.bat`**. A window opens and lists your printers and
   which one it picked. Leave this window open while staff are printing.
6. In a browser on that PC, open <http://127.0.0.1:9110/selftest> — a test label
   should print. 🎉

## Make it fully automatic — never turn it on again (recommended)

**Double-click `install-autostart.bat` once.** That's it. From then on the bridge:

- starts **automatically and invisibly** every time the PC logs in (no window, nothing to click),
- **restarts itself** if it ever stops,
- and it starts right away too, so you can print immediately.

To undo it later, double-click `uninstall-autostart.bat`.

> A website can't launch a program or read the USB by itself (browser security),
> so this little bridge has to be running — but after `install-autostart.bat` it
> just always is. Plug the printer in, log in, print. Nothing to switch on.

*(Manual alternative: `Win + R` → `shell:startup` → drop a shortcut to
`start-hidden.vbs` in that folder.)*

## Configuration — `config.json`

| Field | Meaning | Default |
|---|---|---|
| `port` | Local port the site talks to | `9110` |
| `printerName` | Exact Windows printer name. Leave `""` to auto-pick the Deli/720. | `""` |
| `dpi` | Printer resolution (203 dpi = 8 dots/mm) | `203` |
| `widthMm` / `heightMm` | Label (media) size in mm | `60` × `80` |
| `gapMm` | Gap between die-cut labels (use `0` for continuous roll) | `3` |
| `direction` | Flip to `0` if labels come out upside down | `1` |
| `density` | Darkness 0–15 (raise if bars look faint) | `10` |
| `speed` | Print speed | `4` |
| `bitmapInvert` | Set `true` only if a shipment label prints as a solid black rectangle | `false` |
| `bitmapXOffset` / `bitmapYOffset` | Nudge the whole shipment-label image right/down (+), in dots | `0` |
| `barcodeNarrow` | Rack barcode: narrow-bar width in dots (2 = safe; 3 = wider bars) | `3` |
| `barcodeHeight` | Rack barcode: bar height in dots | `150` |
| `showText` | Rack barcode: print the human-readable number below it | `true` |
| `yOffset` / `xOffset` | Rack barcode: nudge down/right (+), in dots | `0` |

The shipment label is rendered by the website at exact printer resolution
(480 × 640 dots) and printed 1:1, so it always fills the 60 × 80 mm label and the
barcode stays scannable. The rack barcode is **auto-centered** for the label
size, so codes of different lengths sit in the middle.

To find the exact printer name, open <http://127.0.0.1:9110/printers> while the
bridge is running, or run `Get-Printer` in PowerShell.

## Phone / mobile printing (cloud queue)

By itself the bridge only prints from a browser **on this PC**. To let staff print
from an **iPhone or Android** (or any other computer), turn on the cloud queue:
the phone sends the job to your server, and this agent picks it up and prints it
here. The label still comes out of the Deli 720C at the warehouse.

```
 Phone / any device ──HTTPS──► your site (Render) ──► print_jobs queue (Postgres)
                                                              ▲
                                    this agent ───poll every ~2s───┘  ──► Deli 720C
```

### One-time server setup
1. **Deploy** the latest backend to Render (it adds the print-queue endpoints).
2. On Render → your service → **Environment**, add a secret:
   ```
   PRINT_AGENT_TOKEN = <a long random string>
   ```
   (Generate one with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.)
3. **Create the table + columns** — run once each (Render Shell, or locally
   against the prod DB):
   ```
   node backend/migrations/add_print_jobs_table.js
   node backend/migrations/add_printjob_bitmap_columns.js
   ```
   (The second adds the columns that carry the pre-rendered shipment-label image,
   so phone-queued labels print identically to the warehouse PC. It's idempotent.)

### Point this agent at the server
In `config.json`, fill in:
```json
"apiBaseUrl": "https://cellzen-trading.onrender.com",
"agentToken": "<the SAME value as PRINT_AGENT_TOKEN>"
```
Restart the bridge. On startup it should say **`Cloud queue : ON`**. Now any
phone that's logged into the warehouse app can press Print and the label prints
here within a couple of seconds. (The on-PC browser still prints instantly via
the local path — no delay there.)

## Troubleshooting

- **Nothing prints / "OpenPrinter failed"** — the `printerName` doesn't match.
  Open `/printers`, copy the exact name into `config.json`, restart the bridge.
- **Prints blank or skips labels** — run the gap calibration (step 4), or adjust
  `gapMm` (try `2`) / `heightMm`.
- **Shipment label prints as a solid black rectangle** — set `bitmapInvert` to `true`.
- **Upside down** — set `direction` to `0`.
- **Faint bars that won't scan** — raise `density` (e.g. `12`) or lower `speed`.
- **Site says it printed but nothing came out** — check the bridge window for an
  error line; confirm `/selftest` works locally first.

### Cloud queue issues
- **Startup shows `Cloud queue : OFF`** — `apiBaseUrl` or `agentToken` is blank in `config.json`.
- **`invalid agentToken`** in the window — the agent's `agentToken` doesn't match
  `PRINT_AGENT_TOKEN` on Render. Make them identical, restart.
- **Phone says "Sent ✓" but nothing prints** — the agent isn't running on the
  warehouse PC, or its printer is offline. Check this window; confirm `/selftest`
  works locally. Jobs stuck >2 min are automatically retried.
- **`Print agent is not configured` (503)** — `PRINT_AGENT_TOKEN` isn't set on Render.

## Endpoints (for reference)

Local (this PC):
- `POST /print` — rack: `{ "code": "CZ-000123", "copies": 1 }`; shipment:
  `{ "code": "...", "kind": "item", "bitmap": { "data": "<base64>", "widthBytes": 60, "height": 640 } }`
- `GET /health` — `{ ok, printer }`
- `GET /printers` — list installed printers + which is selected
- `GET /selftest` — print a sample label

Server (used by phones + this agent, under `/api/inventory/warehouse`):
- `POST /print-jobs` — enqueue `{ code, kind, copies, bitmap? }` (staff/admin login)
- `GET /print-jobs/pending` — agent claims jobs (agent token)
- `POST /print-jobs/:id/complete` — agent reports result (agent token)
- `GET /print-jobs/:id` — status lookup (staff/admin login)
