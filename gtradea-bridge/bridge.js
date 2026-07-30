#!/usr/bin/env node
/*
 * Cellzen gtradea 1688 bridge
 * ---------------------------
 * Runs on an ON-SITE machine (the warehouse PC — the same box that already runs
 * print-bridge is ideal) and relays 1688 procurement data into the website.
 *
 * WHY THIS EXISTS
 * gtradea.com sits behind Cloudflare, which challenges the Render server's
 * datacenter IP: every login from Render comes back "HTTP 403 Just a moment..."
 * so the website can never pull orders itself. The same request from a normal
 * office/home connection succeeds. This bridge runs on that unblocked network,
 * fetches the procurement jobs, and POSTs the raw payloads to the website, which
 * maps and stores them exactly as it would a direct pull.
 *
 * It is a dumb relay on purpose: NO mapping logic lives here, so changes to how
 * orders are parsed never require touching the on-site machine.
 *
 *   gtradea.com  --(login + fetch, from an allowed IP)-->  this bridge
 *   this bridge  --(POST /api/inventory/supplier-orders/ingest)-->  website
 *
 * This becomes unnecessary the moment gtradea allowlists Render's outbound IPs;
 * then just set GTRADEA_SYNC_ENABLED=true on Render and stop this service.
 *
 * No `npm install` needed — Node's standard library only (Node 18+ for fetch).
 *
 *   node bridge.js
 *
 * All settings live in config.json next to this file.
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

const DEFAULTS = {
  // --- gtradea (the source) ---
  gtradeaBaseUrl: "https://gtradea.com",
  gtradeaEmail: "",        // procurement@gtradea.com
  gtradeaPassword: "",
  // Public Supabase anon key for gtradea. Safe to ship (every browser it).
  gtradeaAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0a2R0eWh1Y3lkcGtuemhoaWJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NjMyODEsImV4cCI6MjA3NjEzOTI4MX0.OLvWKouodCWL1XulvnJjwW-iId1zBw5b7vOIefdN7rg",
  // --- Cellzen website (the destination) ---
  // One origin, or several to try in order. Accepts a string, a
  // comma-separated string, or an array:
  //   "https://www.cellzengroup.com"
  //   ["https://www.cellzengroup.com", "https://cellzengroup.com"]
  apiBaseUrl: "",          // e.g. https://www.cellzengroup.com
  bridgeToken: "",         // must match GTRADEA_BRIDGE_TOKEN in the backend env
  // --- cadence ---
  pollMs: 90000,           // how often to pull from gtradea (ms)
  requestTimeoutMs: 25000, // per-request ceiling so a stall can't wedge the loop
  detailConcurrency: 5,    // parallel job-detail fetches (gtradea is slow)
};

const CONFIG_PATH = process.argv[2] || path.join(ROOT, "config.json");

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

const cfg = loadConfig();
const BASE = String(cfg.gtradeaBaseUrl || "").replace(/\/+$/, "");

// apiBaseUrl may be a single origin, a comma-separated list, or an array — we
// try each in order so the apex and www hostnames can both be listed and
// whichever answers first wins.
function parseApiBases(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const url = String(entry || "").trim().replace(/\/+$/, "");
    if (url && !seen.has(url)) { seen.add(url); out.push(url); }
  }
  return out;
}
const API_BASES = parseApiBases(cfg.apiBaseUrl);
const API = API_BASES[0] || "";

const log = (...a) => console.log(new Date().toISOString(), ...a);
const err = (...a) => console.error(new Date().toISOString(), ...a);

// A normal-looking browser request. A bare Node request sends no User-Agent,
// which is exactly the kind of thing Cloudflare's bot heuristics flag.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// Every request is bounded, INCLUDING the body read: fetch() resolves at
// response headers, so a signal that stops at that point would leave a stalled
// body hanging forever. AbortSignal.timeout stays armed through res.json().
async function req(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { ...BROWSER_HEADERS, ...((init && init.headers) || {}) },
    signal: AbortSignal.timeout(cfg.requestTimeoutMs),
  });
  return res;
}

// POST the pulled details to Cellzen, trying each configured origin in turn.
//
// `redirect: "error"` is deliberate and load-bearing. fetch() follows
// redirects by default, but per spec a 301/302 on a POST is replayed as a
// bodyless GET — so an apex -> www redirect would "succeed" while silently
// discarding every order. Treating a redirect as a hard failure means we move
// on to the next origin (or log loudly) instead of quietly ingesting nothing.
async function postIngest(details) {
  let lastErr = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}/api/inventory/supplier-orders/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.bridgeToken}` },
        body: JSON.stringify({ details }),
        redirect: "error",
        signal: AbortSignal.timeout(cfg.requestTimeoutMs),
      });
      // A 5xx may just be this origin being unhealthy — try the next one.
      if (res.status >= 500 && API_BASES.length > 1 && base !== API_BASES[API_BASES.length - 1]) {
        lastErr = new Error(`${base} returned HTTP ${res.status}`);
        err(`ingest: ${base} returned HTTP ${res.status} — trying next origin`);
        continue;
      }
      const out = await res.json().catch(() => ({}));
      return { res, out, base };
    } catch (e) {
      // Network error, timeout, or a refused redirect.
      lastErr = e;
      err(`ingest: ${base} failed (${e.message})`);
    }
  }
  throw lastErr || new Error("no apiBaseUrl configured");
}

let token = null; // { accessToken, expiresAt }

async function login() {
  token = null;
  const res = await req(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.gtradeaAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.gtradeaEmail, password: cfg.gtradeaPassword }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (/just a moment|cf-browser-verification|__cf_chl/i.test(body)) {
      throw new Error(
        `blocked by Cloudflare (HTTP ${res.status}) — THIS machine's IP is being challenged too. ` +
          "Run the bridge from a different connection, or ask gtradea to allowlist it."
      );
    }
    throw new Error(`gtradea login failed (HTTP ${res.status})`);
  }
  const j = await res.json();
  token = { accessToken: j.access_token, expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000 };
}

async function ensureToken() {
  if (!token || Date.now() > token.expiresAt - 60000) await login();
}

async function apiGet(pathname, retry = true) {
  await ensureToken();
  const res = await req(`${BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${token.accessToken}`, apikey: cfg.gtradeaAnonKey },
  });
  if (res.status === 401 && retry) {
    await login();
    return apiGet(pathname, false);
  }
  if (!res.ok) throw new Error(`gtradea GET ${pathname} failed (HTTP ${res.status})`);
  return res.json();
}

// Run fn over items with at most `limit` in flight; preserves order.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function pullAndRelay() {
  const started = Date.now();
  const jobsResp = await apiGet("/api/v1/admin/procurement/jobs");
  const jobs = Array.isArray(jobsResp && jobsResp.jobs)
    ? jobsResp.jobs
    : Array.isArray(jobsResp)
      ? jobsResp
      : [];
  const withId = jobs.filter((j) => j && j.id);

  const details = (
    await mapLimit(withId, cfg.detailConcurrency, async (job) => {
      try {
        return await apiGet(`/api/v1/admin/procurement/jobs/${encodeURIComponent(job.id)}/detail`);
      } catch (e) {
        // One bad job must not sink the whole batch — the next pass retries it.
        err(`  detail fetch failed for job ${job.id}: ${e.message}`);
        return null;
      }
    })
  ).filter(Boolean);

  if (!details.length) {
    log(`pulled 0 job details from ${jobs.length} job(s) — nothing to relay`);
    return;
  }

  const { res, out, base } = await postIngest(details);
  if (!res.ok || !out.success) {
    throw new Error(`ingest rejected by ${base} (HTTP ${res.status}): ${out.message || "unknown error"}`);
  }
  const d = out.data || {};
  log(
    `relayed ${details.length} job(s) -> ${d.upserted}/${d.items} item(s) stored` +
      `${d.failed ? ` (${d.failed} failed)` : ""} in ${Date.now() - started}ms`
  );
}

let running = false;
async function tick() {
  if (running) return; // never overlap; the next tick picks it up
  running = true;
  try {
    await pullAndRelay();
  } catch (e) {
    err(`sync failed: ${e.message}`);
  } finally {
    running = false;
  }
}

function main() {
  const missing = ["gtradeaEmail", "gtradeaPassword", "bridgeToken"].filter((k) => !cfg[k]);
  if (!API_BASES.length) missing.push("apiBaseUrl");
  if (missing.length) {
    err(`Missing config: ${missing.join(", ")}. Edit ${CONFIG_PATH} (see config.example.json).`);
    process.exit(1);
  }
  log(`gtradea bridge starting — ${BASE} -> ${API_BASES.join(", ")}, every ${Math.round(cfg.pollMs / 1000)}s`);
  tick();
  setInterval(tick, cfg.pollMs);
}

main();
