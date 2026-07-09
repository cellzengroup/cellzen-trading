#!/usr/bin/env node
/*
 * Cellzen thermal print bridge
 * ----------------------------
 * A tiny local HTTP service that runs on the warehouse PC (the one with the
 * Deli DL-720C plugged in over USB). The website's Print button POSTs a code
 * here; the bridge builds a native TSPL label (exact 50 x 25 mm) and sends it
 * straight to the printer as a RAW spool job — no browser print dialog, and
 * crisp scannable barcodes rendered by the printer itself.
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
  widthIn: 1.97,        // media (label stock) width
  heightIn: 0.97,       // media (label stock) height
  gapMm: 3,             // gap between die-cut labels; set 0 for continuous stock
  direction: 1,         // flip to 0 if labels print upside down
  density: 10,          // darkness 0-15
  speed: 4,             // print speed
  barcodeNarrow: 3,     // narrow-bar width in dots (3 ≈ 1.8" wide; drop to 2 if it won't scan)
  barcodeHeight: 150,   // bar height in dots
  showText: true,       // print the human-readable number under the barcode
  textFont: "3",        // TSPL internal font for the number
  textScale: 1,         // text size multiplier (1-3)
  yOffset: 0,           // nudge whole group up (negative) / down (positive), in dots
  xOffset: 0,           // nudge whole group left (negative) / right (positive), in dots
  allowOrigin: "*",     // CORS: your Render origin, or "*" for any
  apiBaseUrl: "",       // site origin for phone printing, e.g. https://cellzen-trading.onrender.com
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
  const mediaW = Math.round(cfg.widthIn * dpi);   // label width in dots
  const mediaH = Math.round(cfg.heightIn * dpi);  // label height in dots
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
    `SIZE ${cfg.widthIn},${cfg.heightIn}`,   // inches (unit-less number = inch in TSPL)
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

// --- RAW send via PowerShell ----------------------------------------------

function sendRaw(tspl) {
  return new Promise((resolve, reject) => {
    if (!PRINTER) return reject(new Error("No printer selected — set printerName in config.json"));
    const tmp = path.join(os.tmpdir(), `cellzen-label-${process.pid}-${tmpCounter++}.prn`);
    fs.writeFile(tmp, tspl, { encoding: "latin1" }, (werr) => {
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
    req.on("data", (c) => { data += c; if (data.length > 1e5) req.destroy(); });
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
      if (!body.code) return json(res, 400, { ok: false, error: "Missing code" });
      await sendRaw(buildTSPL(body.code, body.copies));
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

function cloudEnabled() {
  return Boolean(cfg.apiBaseUrl && cfg.agentToken);
}

function reportJob(id, body) {
  const base = String(cfg.apiBaseUrl).replace(/\/+$/, "");
  return fetch(`${base}${WAREHOUSE_PATH}/print-jobs/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.agentToken}` },
    body: JSON.stringify(body),
  }).catch(() => {}); // best-effort; a stuck job re-claims after 2 min server-side
}

async function pollOnce() {
  const base = String(cfg.apiBaseUrl).replace(/\/+$/, "");
  const res = await fetch(`${base}${WAREHOUSE_PATH}/print-jobs/pending?limit=5`, {
    headers: { Authorization: `Bearer ${cfg.agentToken}` },
  });
  if (res.status === 401) {
    console.error("  Cloud queue: invalid agentToken (must match PRINT_AGENT_TOKEN on the server)");
    return;
  }
  if (!res.ok) return;
  const json = await res.json().catch(() => ({}));
  for (const job of (json && json.data) || []) {
    try {
      await sendRaw(buildTSPL(job.code, job.copies));
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
      console.log("  Cloud queue    : ON  → " + cfg.apiBaseUrl + " (phones can print; polling " + (cfg.pollMs || 2500) + "ms)");
      startCloudPoller();
    } else {
      console.log("  Cloud queue    : OFF (set apiBaseUrl + agentToken in config.json to enable phone printing)");
    }
    console.log("  Keep this window open while staff print. Ctrl+C to stop.");
    console.log("");
  });
})();
