# Cellzen Print Bridge (Deli DL-720C)

A tiny local service that lets the website print barcode labels **directly** to
the Deli 720C thermal printer — exact 1.97 × 0.98 in (50 × 25 mm), native
Code-128 barcodes, no browser print dialog.

The website runs in the cloud (Render) and a web page can't touch a USB printer.
So this little program runs on the **warehouse PC that has the printer plugged
in**. The site's Print button quietly POSTs the code here, and this bridge sends
a native TSPL label straight to the Deli 720C.

```
[Print button in browser]  --POST /print-->  [this bridge]  --RAW TSPL-->  [Deli 720C]
```

If the bridge isn't running, the website automatically falls back to the old
browser print — nothing breaks.

## One-time setup (on the warehouse PC only)

1. **Install Node.js** (LTS) from <https://nodejs.org> — next-next-finish.
2. Copy this whole `print-bridge` folder onto the warehouse PC (e.g. the Desktop).
3. Make sure the Deli 720C is installed in Windows and prints a Windows test page.
4. **Calibrate the labels once**: with 50 × 25 mm labels loaded, run the gap
   calibration (Deli utility, or hold the FEED button per the manual) so the
   printer learns where each label starts.
5. Double-click **`start-bridge.bat`**. A window opens and lists your printers and
   which one it picked. Leave this window open while staff are printing.
6. In a browser on that PC, open <http://127.0.0.1:9110/selftest> — a test label
   should print. 🎉

## Make it start automatically (recommended)

So staff never have to launch it:

1. Press `Win + R`, type `shell:startup`, press Enter.
2. Right-drag `start-bridge.bat` into that folder → **Create shortcuts here**.

Now the bridge starts whenever the PC logs in.

## Configuration — `config.json`

| Field | Meaning | Default |
|---|---|---|
| `port` | Local port the site talks to | `9110` |
| `printerName` | Exact Windows printer name. Leave `""` to auto-pick the Deli/720. | `""` |
| `dpi` | Printer resolution (203 dpi = 8 dots/mm) | `203` |
| `widthIn` / `heightIn` | Label (media) size in inches | `1.97` × `0.97` |
| `gapMm` | Gap between die-cut labels (use `0` for continuous roll) | `3` |
| `direction` | Flip to `0` if labels come out upside down | `1` |
| `density` | Darkness 0–15 (raise if bars look faint) | `10` |
| `speed` | Print speed | `4` |
| `barcodeNarrow` | Narrow-bar width in dots (2 = safe; 3 = wider bars) | `2` |
| `barcodeHeight` | Bar height in dots | `140` |
| `showText` | Print the human-readable number under the barcode | `true` |
| `yOffset` | Nudge the whole group up (−) / down (+), in dots | `0` |
| `xOffset` | Nudge the whole group left (−) / right (+), in dots | `0` |

Note: `barcodeNarrow` only takes whole numbers — `3` ≈ 1.66″ wide for an
8-char code, `4` ≈ 2.2″ (too wide for a 1.97″ label). 1.66″ is the practical max.

The barcode is **auto-centered** horizontally and vertically for the given label
size, so codes of different lengths all sit in the middle.

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
3. **Create the table** — run once (Render Shell, or locally against the prod DB):
   ```
   node backend/migrations/add_print_jobs_table.js
   ```

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
- `POST /print` — body `{ "code": "CZ-000123", "copies": 1 }`
- `GET /health` — `{ ok, printer }`
- `GET /printers` — list installed printers + which is selected
- `GET /selftest` — print a sample label

Server (used by phones + this agent, under `/api/inventory/warehouse`):
- `POST /print-jobs` — enqueue `{ code, kind, copies }` (staff/admin login)
- `GET /print-jobs/pending` — agent claims jobs (agent token)
- `POST /print-jobs/:id/complete` — agent reports result (agent token)
- `GET /print-jobs/:id` — status lookup (staff/admin login)
