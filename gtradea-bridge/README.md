# Cellzen gtradea 1688 Bridge

Pulls the 1688 procurement orders from **gtradea.com** and feeds them into the
Cellzen website, from an on-site PC.

## Why this exists

gtradea.com sits behind **Cloudflare**, which challenges the Render server's
datacenter IP. Every login attempt from the website comes back:

```
[gtradeaSync] sync failed: gtradea login failed (HTTP 403: Just a moment...)
```

The identical request from a normal office/home connection succeeds. So the
website can't fetch orders itself, but this bridge — running on a machine whose
IP *isn't* challenged — can. It fetches the data and posts it to the website,
which stores it exactly as it would a direct pull.

```
gtradea.com  --(login + fetch, from an allowed IP)-->  this bridge
this bridge  --(POST /api/inventory/supplier-orders/ingest)-->  website
```

It is a **dumb relay on purpose**: no order-parsing logic lives here, so changes
to how orders are interpreted never require touching the on-site machine.

> **This is a workaround.** The proper fix is to ask gtradea to allowlist the
> Render service's outbound IPs (Render dashboard → your service → *Connect* →
> Outbound IPs). Once that's done, set `GTRADEA_SYNC_ENABLED=true` on Render and
> stop this bridge — see *Turning it off* below.

## Requirements

- A PC that stays on, on a connection gtradea does **not** block (the same
  warehouse PC that runs `print-bridge` is ideal).
- **Node.js 18+** ([nodejs.org](https://nodejs.org) — take the LTS build).
- No `npm install` needed; it uses only Node's standard library.

## Setup

### 1. On Render (the website) — one time

Add an environment variable:

| Key | Value |
| --- | --- |
| `GTRADEA_BRIDGE_TOKEN` | a long random string you invent (this is the shared password between the bridge and the site) |
| `GTRADEA_SYNC_ENABLED` | `false` |

Setting `GTRADEA_SYNC_ENABLED=false` stops the server from making its own doomed
attempts to reach gtradea. Without it the site keeps trying, failing, and the
1688 header flips between "Synced …" and "Sync failing".

A good way to generate the token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. On the on-site PC

1. Copy this whole `gtradea-bridge` folder to the PC (e.g. `C:\cellzen\gtradea-bridge`).
2. Copy `config.example.json` to **`config.json`** and fill it in:

```json
{
  "gtradeaEmail": "procurement@gtradea.com",
  "gtradeaPassword": "the real gtradea password",
  "apiBaseUrl": ["https://www.cellzengroup.com", "https://cellzengroup.com"],
  "bridgeToken": "the same value you put in GTRADEA_BRIDGE_TOKEN"
}
```

3. Double-click **`start-bridge.bat`** to test it. You should see:

```
gtradea bridge starting — https://gtradea.com -> https://www.cellzengroup.com, every 90s
relayed 9 job(s) -> 21/21 item(s) stored in 13210ms
```

4. Once that works, close it and double-click **`install-autostart.bat`** once.
   The bridge then starts invisibly at every login and keeps itself running.

`config.json` is gitignored — it holds the gtradea password, so never commit it.

## Settings (`config.json`)

| Key | Default | Meaning |
| --- | --- | --- |
| `gtradeaEmail` / `gtradeaPassword` | — | the gtradea procurement login |
| `apiBaseUrl` | — | the Cellzen site origin. One origin, or several tried in order — a string, a comma-separated string, or an array (e.g. www first, then the apex) |
| `bridgeToken` | — | must match `GTRADEA_BRIDGE_TOKEN` on Render |
| `pollMs` | `90000` | how often to pull (ms) |
| `requestTimeoutMs` | `25000` | per-request ceiling so a stall can't wedge it |
| `detailConcurrency` | `5` | parallel job-detail fetches |
| `gtradeaBaseUrl` | `https://gtradea.com` | source site |

## Checking it works

- **On the site**: open the warehouse → **1688 Orders** tab. The header should
  read "Synced <time>", not "⚠ Sync failing".
- **On the PC**: the console prints one `relayed …` line per cycle.
- **Render logs**: `[gtradeaSync] synced 21/21 item(s) from 9 job(s) via bridge`
  — note `via bridge`, which tells you the data path in use.
- **Amounts**: the PC's line reads `relayed 9 job(s) + 14 paid amount(s)`. That
  second figure is what fills the **Amount** column of the downloaded packing
  list and the **Total Price** column of the billing report. If it says
  `+ 0 paid amount(s)` — or Render warns `no 1688 paid amounts in this bridge
  pass` — those columns will download empty.

## Troubleshooting

| Message | Meaning |
| --- | --- |
| `blocked by Cloudflare … THIS machine's IP is being challenged too` | This PC is blocked as well. Try a different connection (e.g. a mobile hotspot) or get the IP allowlisted. |
| `ingest rejected (HTTP 401): Invalid bridge token` | `bridgeToken` ≠ `GTRADEA_BRIDGE_TOKEN`. |
| `ingest rejected (HTTP 503): gtradea bridge is not configured` | `GTRADEA_BRIDGE_TOKEN` isn't set on Render (or the service hasn't redeployed). |
| `gtradea login failed (HTTP 400)` | Wrong gtradea email/password in `config.json`. |
| `supplier-order payments fetch failed …` | gtradea wouldn't hand over the paid amounts this pass. The orders still relay; the website keeps the amounts it already had, so nothing is lost — but new orders download with an empty Amount/Price column until a pass succeeds. |
| Reports download with a blank **Amount** / **Price** column | This PC is running an old `bridge.js` that relays only the job details. The paid amounts come from a *second* gtradea endpoint, so they have to be relayed too — copy the current `bridge.js` over and restart the bridge (below). |
| `Missing config: …` | Fill in those keys in `config.json`. |

## Updating the bridge on the PC

The bridge is a single file with no dependencies, so an update is a copy:

1. Copy the new **`bridge.js`** over the one on the PC (leave `config.json`
   alone — it holds this machine's credentials).
2. Restart it: close the bridge window and run `start-bridge.bat`, or just
   reboot if it's installed via `install-autostart.bat`.
3. Watch one cycle. The line should now read
   `relayed N job(s) + M paid amount(s)`; the next report you download from
   the site will have its Amount/Price column filled in.

This matters because the website **cannot** do it for you: in bridge mode
Render's own requests to gtradea are blocked, so the amounts can only reach
the site through this machine.

## Turning it off (once gtradea allowlists Render)

1. On Render set `GTRADEA_SYNC_ENABLED=true` (or remove it) — the site resumes
   pulling directly.
2. On the PC run **`uninstall-autostart.bat`**, then close the bridge window
   (or reboot).

Nothing else changes: the website stores bridge-relayed and directly-pulled
orders identically.
