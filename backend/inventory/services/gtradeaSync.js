// Background sync: logs into the external gtradea 1688 procurement dashboard,
// pulls procurement jobs + their item details (order number + china_tracking_no
// + status), and upserts them into the supplier_orders table. Runs on an
// interval so the warehouse "1688 Orders" view stays fresh without anyone
// opening gtradea. Stores NO customer PII.
//
// Auth: gtradea is a Supabase-backed app. We do a password-grant login
// (apikey = the public anon key) to get a short-lived access_token (+ refresh
// token), then call the custom /api/v1/admin/procurement endpoints with a
// Bearer token. Credentials come from env (GTRADEA_EMAIL / GTRADEA_PASSWORD)
// and are NEVER logged.

const { SupplierOrder } = require('../models');

const BASE = (process.env.GTRADEA_BASE_URL || 'https://gtradea.com').replace(/\/+$/, '');
// Public anon key (shipped to every browser; safe to hardcode). Overridable via env.
const ANON = process.env.GTRADEA_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0a2R0eWh1Y3lkcGtuemhoaWJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NjMyODEsImV4cCI6MjA3NjEzOTI4MX0.OLvWKouodCWL1XulvnJjwW-iId1zBw5b7vOIefdN7rg';

// Dashboard env editors (Render included) store the raw string, so a value pasted
// straight out of a .env file often arrives as "secret" (quotes included) or with
// a stray trailing space/newline. Supabase answers all three with the same
// "Invalid login credentials" 400, which is indistinguishable from a wrong
// password — so normalise here and say so out loud.
function cleanEnv(name) {
  const raw = process.env[name];
  if (raw == null) return '';
  let v = String(raw).trim();
  const unquoted = v.replace(/^(["'])([\s\S]*)\1$/, '$2');
  if (unquoted !== v) {
    console.warn(`[gtradeaSync] ${name} was wrapped in quotes — stripping them. Store the bare value (no quotes) in the dashboard.`);
    v = unquoted.trim();
  }
  if (v !== String(raw)) {
    console.warn(`[gtradeaSync] ${name} had surrounding whitespace/quotes that were trimmed.`);
  }
  return v;
}

const EMAIL = cleanEnv('GTRADEA_EMAIL');
const PASSWORD = cleanEnv('GTRADEA_PASSWORD');
// Unattended cadence. The 1688 tab now also drives an on-demand pull while it's
// open (kick-on-open + every 60s, server-throttled), so this mainly keeps the
// local cache warm for cold opens and the warehouse-match badge. 90s (down from
// 180s) halves the worst-case staleness when nobody is watching.
const INTERVAL_MS = Math.max(parseInt(process.env.GTRADEA_SYNC_INTERVAL_MS, 10) || 90000, 60000);
const ENABLED = String(process.env.GTRADEA_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';
// Hard ceiling on any single gtradea request. gtradea is slow, but a healthy call
// still returns in a few seconds; without a cap a stalled socket parked an await
// forever and pinned `syncing` true, which silently stopped the whole loop (a
// day-old order never appeared in the 1688 portal) until the server was restarted.
// Env-tunable.
const REQUEST_TIMEOUT_MS = Math.max(parseInt(process.env.GTRADEA_REQUEST_TIMEOUT_MS, 10) || 25000, 5000);
// Watchdog: a sync still "in flight" past this is treated as wedged and superseded
// on the next tick, so the loop always recovers on its own. Kept well above the
// worst-case healthy pass (a handful of requests x REQUEST_TIMEOUT_MS) so it only
// ever fires on a genuine hang, never on a merely-slow run.
const SYNC_STALE_MS = Math.max(parseInt(process.env.GTRADEA_SYNC_STALE_MS, 10) || 240000, 120000);
// gtradea sits behind Cloudflare. A bare undici request sends no User-Agent,
// which trips bot heuristics far more readily than a normal-looking browser
// request, so send a realistic UA/Accept set on every call. This is a legitimate
// client using the account holder's own credentials; it does NOT solve
// challenges. If Cloudflare escalates to a real JS challenge, the only durable
// fix is allowlisting this server's outbound IP on gtradea's side.
const BROWSER_HEADERS = {
  'User-Agent': process.env.GTRADEA_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};
// When gtradea blocks us (Cloudflare) or keeps failing, retrying every
// INTERVAL_MS floods the log with hundreds of identical lines and hammers an
// edge that is already refusing us (which can make Cloudflare escalate).
// Exponential backoff, capped. A user-clicked "Sync now" bypasses it.
const MAX_BACKOFF_MS = Math.max(parseInt(process.env.GTRADEA_MAX_BACKOFF_MS, 10) || 1800000, 60000);
// Only start slowing down after this many CONSECUTIVE failures. A one-off blip
// (a timeout, a brief 5xx) must still retry at the normal cadence so a new order
// isn't delayed — backoff is for a persistent block, not a transient hiccup.
const BACKOFF_AFTER = 3;

let token = null; // { accessToken, refreshToken, expiresAt(ms epoch) }
let syncing = false;
let syncStartedAt = 0; // epoch ms the in-flight run began — drives the stale-run watchdog
let runSeq = 0;        // monotonic run id so a superseded zombie run can't clobber a fresh one
let consecutiveFailures = 0;
let backoffUntil = 0;  // epoch ms; scheduler skips until then after repeated failures
let lastSync = { at: null, ok: null, jobs: 0, items: 0, upserted: 0, error: null, ms: null };

const isConfigured = () => Boolean(SupplierOrder && EMAIL && PASSWORD);

// Node/undici reports DNS, TLS and connection failures as a bare "fetch failed",
// which tells an operator nothing. Unwrap the underlying cause and name the host.
async function fetchOrExplain(url, init) {
  // Bound every request — INCLUDING the response-body read — with one deadline.
  // CRITICAL: Node's global fetch() resolves as soon as the response HEADERS
  // arrive, BEFORE the body is downloaded. An earlier version armed an
  // AbortController and cleared its timer on fetch() resolve, which stopped
  // guarding exactly when a body-stalling upstream hurts most: fetch() returns in
  // <1s, the timer is cleared, then the caller's res.json()/res.text() parks on a
  // half-sent body forever. AbortSignal.timeout stays armed through that body read
  // too — undici keeps the signal bound to the response stream — so a stalled body
  // aborts at the deadline instead of wedging the sync. On timeout we fail fast;
  // the next tick retries clean.
  try {
    return await fetch(url, {
      ...init,
      headers: { ...BROWSER_HEADERS, ...(init?.headers || {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    // AbortSignal.timeout rejects with a TimeoutError; a manual abort would be
    // AbortError — treat both as "gtradea was too slow".
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error(`gtradea request timed out after ${REQUEST_TIMEOUT_MS}ms (${BASE}) — server slow or connection stalled`);
    }
    const code = e?.cause?.code || e?.code || e?.message || 'unknown';
    throw new Error(`cannot reach ${BASE} (${code}) — the server has no outbound access to gtradea, or DNS/TLS failed`);
  }
}

// Pull the human-readable reason out of a Supabase/GoTrue error body. Without
// this every failure looks like a bare status code and can't be told apart.
// Cloudflare's "Just a moment…" interstitial is an HTML challenge page, not an
// API error. Left unrecognised it dumped 160 chars of its inlined CSS into every
// log line, which told an operator nothing about the actual problem.
const isCloudflareChallenge = (res, text) =>
  res?.headers?.get?.('cf-mitigated') === 'challenge' ||
  /just a moment|cf-browser-verification|__cf_chl|challenge-platform/i.test(text || '');

async function explainHttp(res) {
  const text = await res.text().catch(() => '');
  if (isCloudflareChallenge(res, text)) {
    return "blocked by Cloudflare bot protection — this server's outbound IP is being challenged. " +
      'Ask gtradea to allowlist the Render outbound IPs (or issue an API token)';
  }
  try {
    const j = JSON.parse(text);
    return j.msg || j.error_description || j.message || j.error || text.slice(0, 160);
  } catch {
    // Non-JSON body = usually an HTML challenge/error page from a proxy or WAF.
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
}

// Read a response body, mapping an abort (the request deadline firing DURING the
// body stream — see fetchOrExplain) to the same friendly timeout error as a
// headers-phase timeout, so a body stall is reported clearly and never bubbles up
// as a cryptic "The operation was aborted".
async function readJson(res) {
  try {
    return await res.json();
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error(`gtradea response body stalled — timed out after ${REQUEST_TIMEOUT_MS}ms (${BASE})`);
    }
    throw e;
  }
}

async function login() {
  // Drop any stale/poisoned token before asking for a fresh one, so a failed
  // login can never leave a half-valid token behind for the next call to reuse.
  token = null;
  const res = await fetchOrExplain(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    const why = await explainHttp(res);
    // 400 invalid_credentials here is almost always the env value, not the account:
    // a quoted or space-padded password is rejected exactly like a wrong one.
    const hint =
      res.status === 400
        ? ` — check GTRADEA_EMAIL/GTRADEA_PASSWORD in the deploy env: paste the bare value with no quotes and no trailing space (account: ${EMAIL || 'MISSING'})`
        : '';
    throw new Error(`gtradea login failed (HTTP ${res.status}${why ? `: ${why}` : ''})${hint}`);
  }
  const j = await readJson(res);
  token = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000,
  };
}

async function refresh() {
  if (!token?.refreshToken) return login();
  const res = await fetchOrExplain(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token.refreshToken }),
  });
  if (!res.ok) return login(); // refresh chain broke → full login
  const j = await readJson(res);
  token = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || token.refreshToken,
    expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000,
  };
}

async function ensureToken() {
  if (!token) return login();
  if (Date.now() > token.expiresAt - 60000) return refresh(); // refresh 1 min before expiry
}

// GET a gtradea API path with the bearer token; one auto re-login on 401.
async function apiGet(path, retry = true) {
  await ensureToken();
  const res = await fetchOrExplain(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token.accessToken}`, apikey: ANON },
  });
  if (res.status === 401 && retry) {
    await login();
    return apiGet(path, false);
  }
  if (!res.ok) {
    const why = await explainHttp(res);
    throw new Error(`gtradea GET ${path} failed (HTTP ${res.status}${why ? `: ${why}` : ''})`);
  }
  return readJson(res);
}

// The "Pay 1688 Supplier Orders" panel's data — how much was ACTUALLY paid for
// each individual 1688/Alibaba order (sumPaymentCents), keyed by that supplier
// order's id. This is NOT the same figure as a procurement job's order.total /
// order.advance_amount: one gtradea job can bundle several 1688 orders, so the
// job-level advance is their combined total, not any single item's real cost.
// Each procurement item carries its own `supplier_order_id` (see mapDetail)
// that keys into this map. Returns null (not an empty Map) on failure, so
// callers can tell "nothing paid" apart from "couldn't ask" and skip filling
// in a misleading number.
// The amounts endpoint. Named because it appears twice in this file's story: the
// direct pull calls it, and the on-site bridge calls the same path from an
// unblocked network and relays the response to /ingest (see ingestDetails).
const PAYMENTS_PATH = '/api/v1/admin/procurement/supplier-orders';

async function fetchSupplierOrderPayments() {
  try {
    const resp = await apiGet(PAYMENTS_PATH);
    return paymentMapFrom(resp);
  } catch (e) {
    console.error('[gtradeaSync] failed to fetch 1688 supplier-order payments:', e.message);
    return null;
  }
}

// gtradea's supplier-orders response -> the `id -> amount paid` map mapDetail
// wants. Accepts either the whole `{ supplierOrders: [...] }` envelope or the
// bare array, because the bridge relays whichever shape gtradea handed it.
//
// Split out of the fetch above so the DIRECT pull and the BRIDGE relay build the
// map through the same code: the cents -> yuan divide has to happen exactly once
// on both paths, or the same order would be billed 100x apart depending on which
// path happened to sync it.
function paymentMapFrom(resp) {
  const list = Array.isArray(resp) ? resp : (Array.isArray(resp?.supplierOrders) ? resp.supplierOrders : []);
  const map = new Map();
  for (const so of list) {
    if (so && so.id) map.set(so.id, Number(so.sumPaymentCents || 0) / 100);
  }
  return map;
}

// Run async fn over items with at most `limit` in flight; preserves order.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// Normalise a tracking number the same way the warehouse does (trim + uppercase)
// so a value join against warehouse_items.tracking_number lines up exactly.
const normTracking = (v) => {
  const s = String(v || '').trim().toUpperCase();
  return s || null;
};

// Flatten a job's detail into per-item supplier_orders rows.
// gtradea puts no date on the order object — the procurement job's created_at is
// the order date (it matches the date encoded in order_number). Fall back to the
// item's own created_at if a job ever arrives without one.
const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// `paymentMap` (id -> amount paid, from fetchSupplierOrderPayments) is keyed
// by each ITEM's own supplier_order_id — one gtradea job/order_number can
// bundle several distinct 1688 orders, each paid separately, so the paid
// amount has to be looked up per item, not taken from the job-level order
// object. Pass null when the payment list couldn't be fetched (bridge relay
// path, or a failed live call) — paid_amount is then left blank rather than
// silently substituting the job's combined advance_amount, which would be
// the wrong (inflated, shared-across-orders) figure.
function mapDetail(detail, paymentMap) {
  const order = detail.order || {};
  const items = Array.isArray(detail.procurement_items) ? detail.procurement_items : [];
  const jobCreatedAt = toDate(detail.created_at);
  return items
    .filter((it) => it && it.id)
    .map((it) => {
      const oi = it.order_item || {};
      // Coerce only real values — null / '' mean "unknown", not 0.
      const rawQty = oi.quantity;
      const qty = (rawQty == null || rawQty === '') ? NaN : Number(rawQty);
      // Sequelize's .update() treats `undefined` as "leave this column alone"
      // (unlike `null`, which overwrites). So when paymentMap itself is
      // missing — the bridge relay path never fetches one, or the live list
      // call failed — paidAmount stays undefined and a previously-synced
      // paid_amount survives untouched instead of being blanked out this pass.
      const paidAmount = paymentMap
        ? (it.supplier_order_id && paymentMap.has(it.supplier_order_id) ? paymentMap.get(it.supplier_order_id) : null)
        : undefined;
      return {
        source: 'gtradea',
        source_item_id: String(it.id),
        job_id: detail.id ? String(detail.id) : null,
        job_code: detail.job_code || null,
        // gtradea's per-item "Product ID" (GTI-100119). It has always been in the
        // detail payload we pull — it just used to land only in `raw`.
        item_code: it.item_code || null,
        order_number: order.order_number || null,
        gtradea_order_id: order.id ? String(order.id) : null,
        china_tracking_no: normTracking(it.china_tracking_no),
        nepal_tracking_no: normTracking(it.nepal_tracking_no),
        status: it.status || null,
        product_name: oi.product_name || null,
        product_image: oi.product_image || null,
        supplier_url: oi.supplier_url || it.supplier_url || null,
        source_product_id: oi.source_product_id ? String(oi.source_product_id) : null,
        quantity: Number.isFinite(qty) ? qty : null,
        shipping_mode: order.shipping_mode || null,
        order_status: order.status || null,
        order_total: order.total != null ? order.total : null,
        // How much was actually paid for THIS item's own 1688 order (the "Pay
        // 1688 Supplier Orders" panel's Total), not the job-level advance.
        paid_amount: paidAmount,
        ordered_at: jobCreatedAt || toDate(it.created_at),
        raw: it,
        synced_at: new Date(),
      };
    });
}

// Upsert already-mapped rows and record the outcome. Shared by the direct
// poller and by the on-site bridge relay (see ingestDetails), so both report
// status identically and the 1688 tab can't tell which one fed it.
async function persistRows(rows, { jobs, started, via, payments = null }) {
  let upserted = 0;
  let failed = 0;
  let firstErr = null;
  for (const row of rows) {
    try {
      const [record, created] = await SupplierOrder.findOrCreate({
        where: { source_item_id: row.source_item_id },
        defaults: row,
      });
      if (!created) await record.update(row);
      upserted++;
    } catch (e) {
      failed++;
      if (!firstErr) firstErr = e.message;
    }
  }
  // Aggregate write failures into ONE line. Logging one console.error per row
  // turned a systemic DB fault into a ~200-line-per-tick flood that buried every
  // other message; a single line with the count + first error is enough to act on.
  if (failed) console.error(`[gtradeaSync] ${failed}/${rows.length} upsert(s) failed (first: ${firstErr})`);

  // Never paint a total write failure green. If we fetched rows but persisted
  // NONE, the portal is genuinely not receiving new orders — report ok:false so
  // the status label, the header, and any future alerting reflect reality instead
  // of a reassuring "Synced N items" while nothing actually landed.
  const writeOutage = rows.length > 0 && upserted === 0;
  lastSync = {
    at: new Date(),
    ok: !writeOutage,
    jobs,
    items: rows.length,
    upserted,
    failed,
    via,
    // How many 1688 orders this pass knew a paid amount for, or null when the
    // pass carried no amounts at all (already-stored ones were left alone). This
    // is the field to look at when a downloaded report's Amount/Price column is
    // empty — it says whether the money side of the sync is arriving.
    payments,
    error: writeOutage ? `all ${rows.length} upsert(s) failed — DB write outage (first: ${firstErr})` : null,
    ms: Date.now() - started,
  };
  console.log(`[gtradeaSync] synced ${upserted}/${rows.length} item(s) from ${jobs} job(s) via ${via} in ${lastSync.ms}ms${failed ? ` — ${failed} failed` : ''}`);
  // Said out loud, once per pass: a silent "synced 21/21" while every amount is
  // missing is what let blank Amount columns go unnoticed in production.
  if (payments == null && rows.length) {
    console.warn(
      `[gtradeaSync] no 1688 paid amounts in this ${via} pass — stored amounts left as they were. ` +
        (via === 'bridge'
          ? 'Update the on-site bridge (gtradea-bridge/bridge.js) so it relays supplierOrders too.'
          : `Check the ${PAYMENTS_PATH} call above for the reason.`)
    );
  }
  return lastSync;
}

// Ingest RAW job-detail payloads relayed by the on-site bridge. Used when this
// server's own IP is blocked by the Cloudflare in front of gtradea: the bridge
// runs on a network that isn't challenged, fetches the same payloads, and posts
// them here. Mapping + upsert are identical to a direct pull.
//
// `supplierOrders` is gtradea's supplier-orders payload (PAYMENTS_PATH), relayed
// in the same POST. It is what carries the AMOUNT PAID per 1688 order, and it has
// to travel with the details: paid amounts live on a different endpoint from the
// job details, so a relay that forwards only the details can never populate
// paid_amount — which is exactly why the packing list's Amount column and the
// billing report's Total Price came out blank in production (bridge mode) while
// they filled in correctly on a directly-pulling machine.
//
// Omit it (an older bridge that doesn't send one) and paid_amount is left
// UNTOUCHED rather than overwritten with null — see mapDetail on why undefined
// and null mean different things to Sequelize here.
async function ingestDetails(details, supplierOrders) {
  if (!SupplierOrder) throw new Error('supplier_orders table unavailable');
  const started = Date.now();
  const list = Array.isArray(details) ? details.filter(Boolean) : [];
  const paymentMap = supplierOrders == null ? undefined : paymentMapFrom(supplierOrders);
  const rows = list.flatMap((d) => {
    try {
      return mapDetail(d, paymentMap);
    } catch (e) {
      console.error('[gtradeaSync] bridge payload could not be mapped:', e.message);
      return [];
    }
  });
  return persistRows(rows, {
    jobs: list.length,
    started,
    via: 'bridge',
    payments: paymentMap ? paymentMap.size : null,
  });
}

// Full sync pass: list jobs → fetch each job's detail → upsert every item.
async function runSync({ force = false } = {}) {
  if (!isConfigured()) {
    lastSync = { at: new Date(), ok: false, jobs: 0, items: 0, upserted: 0, error: 'not configured', ms: 0 };
    return lastSync;
  }
  // Backing off after repeated failures (e.g. Cloudflare is refusing us). Skip
  // without touching gtradea so we don't flood the log or dig the block deeper.
  // An explicit user-clicked "Sync now" (force) always gets through.
  if (!force && backoffUntil && Date.now() < backoffUntil) {
    return { ...lastSync, ok: null, skipped: true, reason: 'backing-off', retryInMs: backoffUntil - Date.now() };
  }
  // Overlap guard WITH a watchdog. Normally a run already in progress means we
  // skip this tick. But if that run has been "in flight" longer than SYNC_STALE_MS
  // it is almost certainly wedged (a request or DB call that never settled), so we
  // log it and supersede it — this is what lets the loop self-heal without a server
  // restart instead of silently never fetching new orders again.
  if (syncing) {
    if (Date.now() - syncStartedAt < SYNC_STALE_MS) {
      return { ...lastSync, ok: null, skipped: true };
    }
    console.warn(`[gtradeaSync] previous sync wedged for ${Math.round((Date.now() - syncStartedAt) / 1000)}s — superseding it`);
  }
  const myRun = ++runSeq;
  syncing = true;
  syncStartedAt = Date.now();
  const started = syncStartedAt;
  try {
    const jobsResp = await apiGet('/api/v1/admin/procurement/jobs');
    const jobs = Array.isArray(jobsResp?.jobs) ? jobsResp.jobs : (Array.isArray(jobsResp) ? jobsResp : []);
    // One list call for every 1688 order's real paid amount (see
    // fetchSupplierOrderPayments) — fetched once per pass, not per job.
    const paymentMap = await fetchSupplierOrderPayments();

    // Fetch job details with bounded concurrency (gtradea is slow; sequential
    // fetches over many jobs could outrun the request/proxy timeout).
    const withId = jobs.filter((j) => j && j.id);
    const detailRows = await mapLimit(withId, 5, async (job) => {
      try {
        const detail = await apiGet(`/api/v1/admin/procurement/jobs/${encodeURIComponent(job.id)}/detail`);
        return mapDetail(detail, paymentMap);
      } catch (e) {
        console.error('[gtradeaSync] detail fetch failed for job', job.id, '-', e.message);
        return [];
      }
    });
    const rows = detailRows.flat();

    const result = await persistRows(rows, {
      jobs: jobs.length,
      started,
      via: 'direct',
      payments: paymentMap ? paymentMap.size : null,
    });
    consecutiveFailures = 0;
    backoffUntil = 0;
    return result;
  } catch (e) {
    // Exponential backoff so a persistent block (Cloudflare) doesn't repeat this
    // same line every 90s forever — it was filling the Render log with hundreds
    // of identical entries and re-hitting an edge already refusing us.
    consecutiveFailures++;
    let wait = 0;
    if (consecutiveFailures >= BACKOFF_AFTER) {
      wait = Math.min(INTERVAL_MS * 2 ** Math.min(consecutiveFailures - BACKOFF_AFTER + 1, 6), MAX_BACKOFF_MS);
      backoffUntil = Date.now() + wait;
    }
    console.error(
      `[gtradeaSync] sync failed (${consecutiveFailures}x): ${e.message}` +
        (wait ? ` — backing off, next attempt in ${Math.round(wait / 1000)}s` : '')
    );
    lastSync = { at: new Date(), ok: false, jobs: 0, items: 0, upserted: 0, error: e.message, ms: Date.now() - started };
    return lastSync;
  } finally {
    // Only the current run may clear the flag. A zombie run that the watchdog
    // superseded must not reset it and let a third run overlap the fresh one.
    if (myRun === runSeq) syncing = false;
  }
}

// Kick off the recurring sync (no-op unless configured + enabled).
function startScheduler() {
  if (!ENABLED) {
    console.log('[gtradeaSync] disabled (GTRADEA_SYNC_ENABLED=false)');
    return;
  }
  if (!isConfigured()) {
    // Name the exact missing piece — "not configured" alone sends operators
    // hunting the wrong thing (e.g. re-pasting creds when it's the DB that's off).
    console.log(
      `[gtradeaSync] not configured — sync skipped. GTRADEA_EMAIL: ${EMAIL ? 'set' : 'MISSING'}, ` +
        `GTRADEA_PASSWORD: ${PASSWORD ? 'set' : 'MISSING'}, supplier_orders table: ${SupplierOrder ? 'ready' : 'UNAVAILABLE (no DB)'}`
    );
    return;
  }
  console.log(`[gtradeaSync] scheduler on — every ${Math.round(INTERVAL_MS / 1000)}s, account ${EMAIL}`);
  setTimeout(() => { runSync().catch(() => {}); }, 8000); // first run shortly after boot
  const timer = setInterval(() => { runSync().catch(() => {}); }, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref(); // don't keep the process alive on its own
}

function getStatus() {
  return {
    ...lastSync,
    configured: isConfigured(),
    enabled: ENABLED,
    intervalMs: INTERVAL_MS,
    syncing,
    // How long the current run has been going — makes a wedged/slow pull visible.
    runningForMs: syncing && syncStartedAt ? Date.now() - syncStartedAt : null,
    // Set while we're deliberately pausing after repeated failures.
    backingOffMs: backoffUntil && Date.now() < backoffUntil ? backoffUntil - Date.now() : null,
    consecutiveFailures,
  };
}

module.exports = { runSync, startScheduler, getStatus, isConfigured, ingestDetails };
