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
const INTERVAL_MS = Math.max(parseInt(process.env.GTRADEA_SYNC_INTERVAL_MS, 10) || 180000, 60000);
const ENABLED = String(process.env.GTRADEA_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';

let token = null; // { accessToken, refreshToken, expiresAt(ms epoch) }
let syncing = false;
let lastSync = { at: null, ok: null, jobs: 0, items: 0, upserted: 0, error: null, ms: null };

const isConfigured = () => Boolean(SupplierOrder && EMAIL && PASSWORD);

// Node/undici reports DNS, TLS and connection failures as a bare "fetch failed",
// which tells an operator nothing. Unwrap the underlying cause and name the host.
async function fetchOrExplain(url, init) {
  try {
    return await fetch(url, init);
  } catch (e) {
    const code = e?.cause?.code || e?.code || e?.message || 'unknown';
    throw new Error(`cannot reach ${BASE} (${code}) — the server has no outbound access to gtradea, or DNS/TLS failed`);
  }
}

// Pull the human-readable reason out of a Supabase/GoTrue error body. Without
// this every failure looks like a bare status code and can't be told apart.
async function explainHttp(res) {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    return j.msg || j.error_description || j.message || j.error || text.slice(0, 160);
  } catch {
    // Non-JSON body = usually an HTML challenge/error page from a proxy or WAF.
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
}

async function login() {
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
  const j = await res.json();
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
  const j = await res.json();
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
  return res.json();
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

function mapDetail(detail) {
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
      return {
        source: 'gtradea',
        source_item_id: String(it.id),
        job_id: detail.id ? String(detail.id) : null,
        job_code: detail.job_code || null,
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
        ordered_at: jobCreatedAt || toDate(it.created_at),
        raw: it,
        synced_at: new Date(),
      };
    });
}

// Full sync pass: list jobs → fetch each job's detail → upsert every item.
async function runSync() {
  if (!isConfigured()) {
    lastSync = { at: new Date(), ok: false, jobs: 0, items: 0, upserted: 0, error: 'not configured', ms: 0 };
    return lastSync;
  }
  if (syncing) return { ...lastSync, ok: null, skipped: true }; // overlap guard — a run is already in progress
  syncing = true;
  const started = Date.now();
  try {
    const jobsResp = await apiGet('/api/v1/admin/procurement/jobs');
    const jobs = Array.isArray(jobsResp?.jobs) ? jobsResp.jobs : (Array.isArray(jobsResp) ? jobsResp : []);

    // Fetch job details with bounded concurrency (gtradea is slow; sequential
    // fetches over many jobs could outrun the request/proxy timeout).
    const withId = jobs.filter((j) => j && j.id);
    const detailRows = await mapLimit(withId, 5, async (job) => {
      try {
        const detail = await apiGet(`/api/v1/admin/procurement/jobs/${encodeURIComponent(job.id)}/detail`);
        return mapDetail(detail);
      } catch (e) {
        console.error('[gtradeaSync] detail fetch failed for job', job.id, '-', e.message);
        return [];
      }
    });
    const rows = detailRows.flat();

    let upserted = 0;
    for (const row of rows) {
      try {
        const [record, created] = await SupplierOrder.findOrCreate({
          where: { source_item_id: row.source_item_id },
          defaults: row,
        });
        if (!created) await record.update(row);
        upserted++;
      } catch (e) {
        console.error('[gtradeaSync] upsert failed for item', row.source_item_id, '-', e.message);
      }
    }

    lastSync = { at: new Date(), ok: true, jobs: jobs.length, items: rows.length, upserted, error: null, ms: Date.now() - started };
    console.log(`[gtradeaSync] synced ${upserted}/${rows.length} item(s) from ${jobs.length} job(s) in ${lastSync.ms}ms`);
    return lastSync;
  } catch (e) {
    console.error('[gtradeaSync] sync failed:', e.message);
    lastSync = { at: new Date(), ok: false, jobs: 0, items: 0, upserted: 0, error: e.message, ms: Date.now() - started };
    return lastSync;
  } finally {
    syncing = false;
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
  return { ...lastSync, configured: isConfigured(), enabled: ENABLED, intervalMs: INTERVAL_MS, syncing };
}

module.exports = { runSync, startScheduler, getStatus, isConfigured };
