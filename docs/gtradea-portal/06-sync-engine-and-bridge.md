# Sync Engine & On-Site Bridge

Not a UI panel — this is the backend machinery that feeds the
[1688 Orders panel](./05-1688-orders-panel.md). Documented separately because
it's substantial and it's the piece most likely to need troubleshooting.

**Files:**
- [`backend/inventory/services/gtradeaSync.js`](../../backend/inventory/services/gtradeaSync.js) — the sync engine
- [`backend/inventory/routes/supplierOrders.js`](../../backend/inventory/routes/supplierOrders.js) — the HTTP surface
- [`gtradea-bridge/bridge.js`](../../gtradea-bridge/bridge.js) — the on-site fallback relay
- [`backend/inventory/models/SupplierOrder.js`](../../backend/inventory/models/SupplierOrder.js) — the table it writes to

## Why this exists in two forms

gtradea.com sits behind **Cloudflare**, which challenges the Cellzen
server's (Render's) datacenter IP — every login attempt from Render can come
back `HTTP 403: Just a moment...`. The identical request from a normal
home/office connection succeeds. So there are two ways this data gets
pulled, and the app doesn't care which one is active:

1. **Direct** — the backend itself logs into gtradea and pulls. Used when
   Render's IP isn't (yet) blocked.
2. **Bridge** — a small script on an on-site PC (an unblocked network)
   fetches the same data and **relays it** to the backend over a normal
   authenticated POST. Used as a workaround while waiting for gtradea to
   allowlist Render's outbound IP.

Both paths end at the exact same mapping + upsert function
(`persistRows`), so the 1688 Orders panel behaves identically either way —
the only difference visible to an operator is the `via: 'direct' | 'bridge'`
tag in the sync-status log line.

## Authentication against gtradea

gtradea is itself a Supabase-backed app. The sync engine does a **password
grant** login (`POST /auth/v1/token?grant_type=password` with the public
anon key as `apikey`) using credentials from `GTRADEA_EMAIL` /
`GTRADEA_PASSWORD`, getting back a short-lived access token + refresh token.
- `ensureToken()` refreshes 1 minute before expiry, or does a full re-login
  if the refresh call itself fails.
- `apiGet()` retries once with a fresh login on a `401`.
- Credentials are **never logged**; env values are defensively unquoted/
  trimmed (`cleanEnv`) because dashboard env editors often paste a value
  wrapped in quotes or with trailing whitespace, which Supabase rejects with
  the same generic "Invalid login credentials" as an actually-wrong
  password — so the code detects and warns about that specific mistake.

## The pull itself (`runSync`)

1. `GET /api/v1/admin/procurement/jobs` — list of procurement jobs.
2. For each job (bounded to **5 concurrent** requests via `mapLimit` —
   gtradea is slow, and unbounded parallelism risks outrunning a proxy
   timeout), `GET /api/v1/admin/procurement/jobs/:id/detail`.
3. `mapDetail(detail)` flattens each job's `procurement_items` into one row
   per item: order number, CN/Nepal tracking (normalized via `normTracking`
   — trim + uppercase, matching how the warehouse stores tracking numbers),
   product name/image, quantity, shipping mode, and the job's `created_at`
   as the order date (gtradea puts no date on the order object itself, but
   the job's creation date lines up with the date encoded in the order
   number, e.g. `ORD-20260717-908966` → 2026-07-17).
4. `persistRows(rows, …)` upserts each row into `supplier_orders`, keyed on
   `source_item_id` (gtradea's own procurement-item id) via
   `findOrCreate` + `update` — so re-running the sync never creates
   duplicates, it just refreshes existing rows.

## Reliability engineering in this file (why it looks the way it does)

This file has accumulated several defenses against real incidents (see the
git history: *"stop 1688 auto-sync spamming the console"*, *"make gtradea
1688 sync self-healing so it can't stop fetching orders"*, *"handle a
Cloudflare block clearly instead of flooding the logs"*):

| Mechanism | Problem it solves |
|---|---|
| **Request timeout incl. body read** (`AbortSignal.timeout` armed through `res.json()`, not just until headers arrive) | `fetch()` resolves as soon as *headers* land — a version that only guarded until then let a stalled response *body* hang the sync forever, since the timer was already cleared by the time the body read started. |
| **Overlap guard + stale-run watchdog** (`syncing` flag + `SYNC_STALE_MS`, default 240s) | Normally a second tick skips while one run is in flight. If that "in-flight" run has actually wedged (past the watchdog threshold), the next tick logs a warning and **supersedes it** instead of waiting forever — this is what makes the loop self-healing without a server restart. A `runSeq` counter ensures only the current run is allowed to clear the `syncing` flag, so a superseded zombie can't stomp on a fresh run's state. |
| **Exponential backoff after repeated failures** (`BACKOFF_AFTER = 3`, capped at `MAX_BACKOFF_MS`) | A persistent block (e.g. Cloudflare) used to retry every 90s forever, filling the log with identical lines and re-hitting an edge that's already refusing the server. A single blip doesn't trigger backoff — only 3+ *consecutive* failures do, so a fresh order is never delayed by a one-off timeout. A user-clicked "Sync now" (`force`) always bypasses backoff. |
| **Cloudflare-challenge detection** (`isCloudflareChallenge`) | An HTML "Just a moment…" interstitial isn't a real API error; without detecting it, ~160 chars of inlined CSS got dumped into the log on every failed attempt, telling an operator nothing. Now it's reported as one clear line naming the actual problem (outbound IP needs allowlisting). |
| **`writeOutage` check in `persistRows`** | If rows were fetched but **zero** could be written (a DB outage), the sync is reported `ok: false`, not a reassuring "synced" — a total write failure must never look like success. |
| **Aggregated failure logging** | Per-row upsert failures are counted and logged as one line (`N/M upsert(s) failed`), not one `console.error` per row — a systemic DB fault used to produce a log flood instead of one actionable line. |

## Scheduling

`startScheduler()` (called once at server boot) is a no-op unless
`GTRADEA_SYNC_ENABLED` isn't explicitly `"false"` **and** both
`GTRADEA_EMAIL`/`GTRADEA_PASSWORD` are set. When active: first run 8 seconds
after boot, then every `GTRADEA_SYNC_INTERVAL_MS` (default 90s, floor 60s).
The timer is `.unref()`'d so it never keeps the Node process alive on its
own.

## HTTP surface (`supplierOrders.js`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /` | staff/admin | List orders + warehouse-match annotation (see the [1688 Orders panel](./05-1688-orders-panel.md)) |
| `POST /sync?force=1` | staff/admin | Kick a pull, respond `202` immediately without waiting for it |
| `POST /ingest` | bridge token | Accept raw job-detail payloads relayed by the on-site bridge |
| `GET /status` | staff/admin | Just the last-sync summary |

### Why `/sync` never returns 409/429 to a normal click

Earlier versions returned `409` (already syncing) / `429` (just synced) as
real HTTP error statuses. Because the 1688 Orders tab fires a sync on every
tab open *and* every 60 seconds *from every open browser*, those collisions
are routine — and browsers log every non-2xx response as a red "failed to
load resource," so a perfectly healthy system looked broken in production.
Now a coalesced request gets **`200` with `{ started: false, reason: … }`**:
the caller's actual intent ("make sure fresh data is being pulled") is
already satisfied by whatever sync is already running or just finished, so
there's nothing to treat as an error.

### Bridge-mode short-circuit

`POST /sync` checks `st.enabled` (i.e. `GTRADEA_SYNC_ENABLED`) **before**
checking `isConfigured()`. This ordering matters: in bridge mode the
server's own `GTRADEA_EMAIL`/`PASSWORD` are typically unset (the real
credentials live only in the bridge's local `config.json`), so checking
`isConfigured()` first would incorrectly return a `503 "not configured"`
even though the bridge is actively and successfully relaying orders.

## The on-site bridge (`gtradea-bridge/bridge.js`)

A standalone Node script (no dependencies beyond the standard library —
Node 18+ for `fetch`) meant to run continuously on a warehouse PC:

```
gtradea.com  --(login + fetch, from an allowed IP)-->  bridge.js
bridge.js    --(POST /api/inventory/supplier-orders/ingest)-->  Cellzen backend
```

It is a **dumb relay by design** — it contains zero order-parsing logic, so
changes to how orders are interpreted only ever require touching the
backend's `mapDetail`, never the on-site machine. Its `login`/`apiGet`/
`mapLimit` are near-identical, independently-implemented copies of the
backend's own logic (kept simple and dependency-free on purpose, since it
runs unattended on a machine nobody actively administers).

Loop (`tick`, guarded against overlap with a `running` flag): list jobs →
fetch each job's detail (5 concurrent by default) → POST the **raw**
detail payloads as `{ details: [...] }` to `/ingest`, authenticated with a
`Bearer <bridgeToken>` that must match the backend's `GTRADEA_BRIDGE_TOKEN`
env var (compared with `crypto.timingSafeEqual` server-side, same pattern as
the print-agent token). Runs every `pollMs` (default 90s), configured via a
local `config.json` (gitignored — it holds the real gtradea password).

Deployment on the PC: `start-bridge.bat` to test interactively,
`install-autostart.bat` to register it as a background task that starts at
login and keeps itself running invisibly (see
[`gtradea-bridge/README.md`](../../gtradea-bridge/README.md) for the full
setup walkthrough and a troubleshooting table).

### Turning the bridge off

Once gtradea allowlists Render's outbound IP, set
`GTRADEA_SYNC_ENABLED=true` on the server (the direct path resumes) and run
`uninstall-autostart.bat` on the PC. Nothing else changes — bridge-relayed
and directly-pulled orders are stored identically, so there's no data
migration involved in switching.
