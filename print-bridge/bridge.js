#!/usr/bin/env node
/*
 * Cellzen thermal print bridge
 * ----------------------------
 * A tiny local HTTP service that runs on the warehouse PC (the one with the
 * Deli DL-720C plugged in over USB). The website's Print button POSTs here:
 *   - Shipment labels send a pre-rendered image (the full 60 x 80 mm design);
 *     the bridge prints it verbatim as a native TSPL BITMAP.
 *   - Rack/shelf labels send just a code; the bridge builds a native barcode.
 * Either way it goes out as a RAW spool job — no browser print dialog, and a
 * crisp scannable barcode because the image prints 1:1 with the printer dots.
 *
 * No `npm install` needed: uses only Node's standard library, plus the
 * built-in Windows PowerShell for the RAW printer write (see rawprint.ps1).
 *
 *   node bridge.js
 *
 * All tunables live in config.json next to this file.
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = __dirname;

const DEFAULTS = {
  port: 9110,
  printerName: "",      // exact Windows printer name; "" = auto-detect (Deli/720)
  dpi: 203,             // Deli 720C native resolution (8 dots/mm)
  widthMm: 60,          // media (label stock) width  — the shipment-label roll
  heightMm: 80,         // media (label stock) height
  gapMm: 3,             // gap between die-cut labels; set 0 for continuous stock
  direction: 1,         // flip to 0 if labels print upside down
  density: 10,          // darkness 0-15
  speed: 4,             // print speed
  // --- native barcode (rack/shelf labels; the full shipment label is a bitmap) ---
  barcodeNarrow: 3,     // narrow-bar width in dots (3 ≈ 1.8" wide; drop to 2 if it won't scan)
  barcodeHeight: 150,   // bar height in dots
  showText: true,       // print the human-readable number under the barcode
  textFont: "3",        // TSPL internal font for the number
  textScale: 1,         // text size multiplier (1-3)
  yOffset: 0,           // nudge native barcode up (negative) / down (positive), in dots
  xOffset: 0,           // nudge native barcode left (negative) / right (positive), in dots
  // --- full-design shipment label (pre-rendered bitmap) ---
  bitmapXOffset: 0,     // nudge the whole label image right (+) / left (-), in dots
  bitmapYOffset: 0,     // nudge the whole label image down (+) / up (-), in dots
  bitmapInvert: false,  // set true only if the label prints as a black rectangle
  allowOrigin: "*",     // CORS: your production origin, or "*" for any
  // Site origin for phone printing. One origin, or several to try in order —
  // accepts a string, a comma-separated string, or an array, e.g.
  //   ["https://www.cellzengroup.com", "https://cellzengroup.com"]
  apiBaseUrl: "",       // e.g. https://www.cellzengroup.com
  agentToken: "",       // must match PRINT_AGENT_TOKEN in the backend env
  pollMs: 2500,         // how often to check the cloud queue for new jobs (ms)
};

// Config path defaults to config.json next to this file; override with an arg
// (e.g. `node bridge.js other-config.json`) — handy for testing.
const CONFIG_PATH = process.argv[2] || path.join(ROOT, "config.json");

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

const cfg = loadConfig();
let PRINTER = cfg.printerName || "";
let tmpCounter = 0;

// --- printer discovery -----------------------------------------------------

function listPrinters() {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
       "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        resolve(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      }
    );
  });
}

function pickPrinter(names) {
  if (cfg.printerName && names.includes(cfg.printerName)) return cfg.printerName;
  return (
    names.find((n) => /720/i.test(n)) ||   // most specific: the DL-720C model number
    names.find((n) => /deli/i.test(n)) ||  // any Deli printer
    cfg.printerName ||
    names[0] ||
    ""
  );
}

// --- TSPL label ------------------------------------------------------------

// TSPL internal bitmap fonts — cell width/height in dots (at scale 1).
const FONT = {
  "1": { w: 8, h: 12 },
  "2": { w: 12, h: 20 },
  "3": { w: 16, h: 24 },
  "4": { w: 24, h: 32 },
  "5": { w: 32, h: 48 },
};

function buildTSPL(code, copies) {
  // Only allow characters that are safe inside a TSPL quoted string.
  const safe = String(code).replace(/[^A-Za-z0-9 ._\-\/]/g, "").slice(0, 48);
  const n = Math.min(Math.max(parseInt(copies, 10) || 1, 1), 20);

  const dpi = cfg.dpi || 203;
  const dotsPerMm = dpi / 25.4;
  const mediaW = Math.round((cfg.widthMm || 60) * dotsPerMm);  // label width in dots
  const mediaH = Math.round((cfg.heightMm || 80) * dotsPerMm); // label height in dots
  const narrow = cfg.barcodeNarrow || 3;
  const barH = cfg.barcodeHeight || 150;
  const showText = cfg.showText !== false;
  const font = FONT[String(cfg.textFont)] ? String(cfg.textFont) : "3";
  const scale = Math.min(Math.max(parseInt(cfg.textScale, 10) || 1, 1), 6);
  const GAP = 8; // dots between barcode and the number

  // Barcode width (dots), approx: ~11 modules/char + 35 overhead, x narrow.
  const barW = (11 * safe.length + 35) * narrow;
  const textW = safe.length * FONT[font].w * scale;
  const textH = showText ? FONT[font].h * scale : 0;

  // Center the WHOLE group (barcode + number) vertically in the label, then
  // apply the manual yOffset nudge. Each element is centered horizontally.
  const groupH = barH + (showText ? GAP + textH : 0);
  const topY = Math.max(Math.round((mediaH - groupH) / 2) + (cfg.yOffset || 0), 2);
  const barX = Math.max(Math.round((mediaW - barW) / 2) + (cfg.xOffset || 0), 2);
  const textX = Math.max(Math.round((mediaW - textW) / 2) + (cfg.xOffset || 0), 2);
  const textY = topY + barH + GAP;

  const lines = [
    `SIZE ${cfg.widthMm} mm,${cfg.heightMm} mm`,
    `GAP ${cfg.gapMm} mm,0 mm`,
    `DIRECTION ${cfg.direction}`,
    `REFERENCE 0,0`,
    `DENSITY ${cfg.density}`,
    `SPEED ${cfg.speed}`,
    `CLS`,
    // Barcode's own text is OFF (the "0"); we draw the number ourselves below,
    // because some Deli units don't render the built-in human-readable line.
    `BARCODE ${barX},${topY},"128",${barH},0,0,${narrow},${narrow},"${safe}"`,
  ];
  if (showText) lines.push(`TEXT ${textX},${textY},"${font}",0,${scale},${scale},"${safe}"`);
  lines.push(`PRINT ${n}`, "");
  return lines.join("\r\n");
}

// Build a TSPL job that prints a pre-rendered label image (the full 60x80mm
// shipment design). `bitmap` = { data: base64 packed 1-bit rows, widthBytes,
// height }, packed MSB-first with bit 0 = black — TSPL BITMAP polarity. Returns
// a Buffer because the image bytes are binary and must survive verbatim.
function buildBitmapTSPL(bitmap, copies) {
  const n = Math.min(Math.max(parseInt(copies, 10) || 1, 1), 20);
  const widthBytes = parseInt(bitmap && bitmap.widthBytes, 10);
  const height = parseInt(bitmap && bitmap.height, 10);
  let data = Buffer.from(String((bitmap && bitmap.data) || ""), "base64");
  const need = widthBytes * height;
  if (!widthBytes || !height || !need || data.length < need) {
    throw new Error("Invalid bitmap payload");
  }
  if (data.length > need) data = data.subarray(0, need); // ignore any trailing bytes
  if (cfg.bitmapInvert) {
    const inv = Buffer.allocUnsafe(data.length);
    for (let i = 0; i < data.length; i++) inv[i] = ~data[i] & 0xff;
    data = inv;
  }
  const x = Math.max(0, parseInt(cfg.bitmapXOffset, 10) || 0);
  const y = Math.max(0, parseInt(cfg.bitmapYOffset, 10) || 0);

  // The image bytes follow the BITMAP header comma with NO separator, then CRLF.
  const header = Buffer.from(
    [
      `SIZE ${cfg.widthMm} mm,${cfg.heightMm} mm`,
      `GAP ${cfg.gapMm} mm,0 mm`,
      `DIRECTION ${cfg.direction}`,
      `REFERENCE 0,0`,
      `DENSITY ${cfg.density}`,
      `SPEED ${cfg.speed}`,
      `CLS`,
      `BITMAP ${x},${y},${widthBytes},${height},0,`,
    ].join("\r\n"),
    "latin1"
  );
  const footer = Buffer.from(`\r\nPRINT ${n}\r\n`, "latin1");
  return Buffer.concat([header, data, footer]);
}

// --- RAW send via PowerShell ----------------------------------------------

function sendRaw(tspl) {
  return new Promise((resolve, reject) => {
    if (!PRINTER) return reject(new Error("No printer selected — set printerName in config.json"));
    // Accept a Buffer (binary BITMAP jobs) or a string (native TSPL). Write the
    // bytes verbatim — no text encoding — so the image survives to the printer.
    const buf = Buffer.isBuffer(tspl) ? tspl : Buffer.from(String(tspl), "latin1");
    const tmp = path.join(os.tmpdir(), `cellzen-label-${process.pid}-${tmpCounter++}.prn`);
    fs.writeFile(tmp, buf, (werr) => {
      if (werr) return reject(werr);
      execFile(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         path.join(ROOT, "rawprint.ps1"), "-PrinterName", PRINTER, "-FilePath", tmp],
        { windowsHide: true },
        (err, _stdout, stderr) => {
          fs.unlink(tmp, () => {});
          if (err) return reject(new Error((stderr || err.message || "").trim()));
          resolve();
        }
      );
    });
  });
}

// --- HTTP ------------------------------------------------------------------

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", cfg.allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Chrome "Private Network Access": a public HTTPS page (the site) calling a
  // loopback address is gated behind this header on the preflight, else blocked.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    // Allow room for a pre-rendered label bitmap (~51KB base64) plus overhead.
    req.on("data", (c) => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); return res.end(); }

  if (req.method === "GET" && url === "/health")
    return json(res, 200, { ok: true, printer: PRINTER });

  if (req.method === "GET" && url === "/printers") {
    const names = await listPrinters();
    return json(res, 200, { ok: true, selected: PRINTER, printers: names });
  }

  if (req.method === "GET" && url === "/selftest") {
    try { await sendRaw(buildTSPL("CZN00001", 1)); return json(res, 200, { ok: true, printer: PRINTER }); }
    catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  }

  if (req.method === "POST" && url === "/print") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      // A pre-rendered label image (full shipment design) prints verbatim; a bare
      // code builds a native barcode (rack labels, or a render-failed fallback).
      if (body.bitmap && body.bitmap.data) {
        await sendRaw(buildBitmapTSPL(body.bitmap, body.copies));
        console.log(`  printed FULL-DESIGN label image (${body.bitmap.widthBytes * 8}x${body.bitmap.height} dots)`);
        return json(res, 200, { ok: true, printer: PRINTER, mode: "bitmap" });
      }
      if (!body.code) return json(res, 400, { ok: false, error: "Missing code" });
      await sendRaw(buildTSPL(body.code, body.copies));
      console.log(`  printed plain barcode ${body.code} (no image was sent)`);
      return json(res, 200, { ok: true, printer: PRINTER, code: body.code });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  json(res, 404, { ok: false, error: "Not found" });
});

// --- cloud print queue poller (phone / any-device printing) ---------------
// Polls the backend for queued jobs, prints each on the Deli 720C, reports back.
const WAREHOUSE_PATH = "/api/inventory/warehouse";

// apiBaseUrl may be a single origin, a comma-separated list, or an array — we
// try each in order so the apex and www hostnames can both be listed.
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

// The origin that last answered, so we don't re-probe a dead one every 2.5s.
let preferredBase = API_BASES[0] || "";
const basesInPreferredOrder = () =>
  [preferredBase, ...API_BASES.filter((b) => b !== preferredBase)].filter(Boolean);

function cloudEnabled() {
  return Boolean(API_BASES.length && cfg.agentToken);
}

// `redirect: "error"` matters here: fetch() follows redirects by default, but a
// 301/302 on a POST is replayed as a bodyless GET — so an apex -> www redirect
// would report success while sending no result at all. Failing instead means
// the job simply re-claims server-side after 2 min rather than being lost.
function reportJob(id, body) {
  return fetch(`${preferredBase}${WAREHOUSE_PATH}/print-jobs/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.agentToken}` },
    body: JSON.stringify(body),
    redirect: "error",
  }).catch(() => {}); // best-effort; a stuck job re-claims after 2 min server-side
}

// Claim from the first origin that answers, and remember it for next time.
async function claimPending() {
  let lastErr = null;
  for (const base of basesInPreferredOrder()) {
    try {
      const res = await fetch(`${base}${WAREHOUSE_PATH}/print-jobs/pending?limit=5`, {
        headers: { Authorization: `Bearer ${cfg.agentToken}` },
        redirect: "error",
      });
      preferredBase = base;
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("no apiBaseUrl configured");
}

async function pollOnce() {
  const res = await claimPending();
  if (res.status === 401) {
    console.error("  Cloud queue: invalid agentToken (must match PRINT_AGENT_TOKEN on the server)");
    return;
  }
  if (!res.ok) return;
  const json = await res.json().catch(() => ({}));
  for (const job of (json && json.data) || []) {
    try {
      if (job.bitmap_data) {
        // Phone-queued full-design label — print the stored image verbatim.
        await sendRaw(buildBitmapTSPL(
          { data: job.bitmap_data, widthBytes: job.bitmap_width_bytes, height: job.bitmap_height },
          job.copies
        ));
      } else {
        await sendRaw(buildTSPL(job.code, job.copies));
      }
      await reportJob(job.id, { ok: true });
      console.log(`  printed queued label ${job.code}`);
    } catch (e) {
      await reportJob(job.id, { ok: false, error: String((e && e.message) || e) });
      console.error(`  queued label ${job.code} failed:`, (e && e.message) || e);
    }
  }
}

async function startCloudPoller() {
  for (;;) {
    try { await pollOnce(); } catch { /* network hiccup — retry next tick */ }
    await new Promise((r) => setTimeout(r, cfg.pollMs || 2500));
  }
}

// Start the service only when run directly (`node bridge.js`). When required as
// a module (e.g. by a test), just expose the TSPL builders.
if (require.main === module) {
  (async () => {
    const names = await listPrinters();
    PRINTER = pickPrinter(names);
    server.listen(cfg.port, "127.0.0.1", () => {
      console.log("");
      console.log("  Cellzen print bridge is running.");
      console.log("  URL            : http://127.0.0.1:" + cfg.port);
      console.log("  Installed      : " + (names.length ? names.join(" | ") : "(no printers found)"));
      console.log("  Using printer  : " + (PRINTER || "(NONE — set printerName in config.json)"));
      console.log("  Local test     : open http://127.0.0.1:" + cfg.port + "/selftest");
      if (cloudEnabled()) {
        console.log("  Cloud queue    : ON  → " + API_BASES.join(", ") + " (phones can print; polling " + (cfg.pollMs || 2500) + "ms)");
        startCloudPoller();
      } else {
        console.log("  Cloud queue    : OFF (set apiBaseUrl + agentToken in config.json to enable phone printing)");
      }
      console.log("  Keep this window open while staff print. Ctrl+C to stop.");
      console.log("");
    });
  })();
}

module.exports = { buildTSPL, buildBitmapTSPL };
