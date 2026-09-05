#!/usr/bin/env node
/*
 * Cellzen thermal print bridge
 * ----------------------------
 * A tiny local HTTP service that runs on the warehouse PC (the one with the
 * Deli DL-720C plugged in over USB). The website's Print button POSTs here:
 *   - Shipment labels send a pre-rendered image (the full 80 x 120 mm design);
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
  widthMm: 80,          // media (label stock) width  — the shipment-label roll
  heightMm: 120,        // media (label stock) height
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
  // Refuse to print (and to take queued jobs) while Windows reports the printer
  // offline — see printerUsable(). Set false only if a printer that genuinely
  // works is being reported offline; jobs would then spool blind.
  requirePrinterOnline: true,
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

// Every installed printer, plus whether Windows can actually reach it right now.
// That second part is the whole point: Windows keeps a USB printer *installed*
// long after the cable is unplugged, so simply appearing in this list proves
// nothing. Win32_Printer.WorkOffline is the flag that flips when the cable is
// out, the printer is switched off, or someone ticked "Use Printer Offline" —
// exactly the cases where this PC must not print or claim jobs.
// (Get-Printer's own PrinterStatus is no use here: it still reads "Normal" for
// a printer whose cable has been pulled.)
// Returns [{ name, offline }]; [] if the query itself failed.
function listPrinters() {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
       "Get-CimInstance Win32_Printer | ForEach-Object { $_.Name + '|' + $_.WorkOffline }"],
      { windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const rows = stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((line) => {
            // Split on the LAST "|" so a printer name containing one survives.
            const i = line.lastIndexOf("|");
            if (i === -1) return { name: line, offline: false };
            return { name: line.slice(0, i).trim(), offline: /^true$/i.test(line.slice(i + 1)) };
          })
          .filter((p) => p.name);
        resolve(rows);
      }
    );
  });
}

// Rank a printer name as a label-printer candidate: lower is better, 2 = not one.
function printerRank(name) {
  if (/720/i.test(name)) return 0;  // most specific: the DL-720C model number
  if (/deli/i.test(name)) return 1; // any other Deli printer
  return 2;
}

function pickPrinter(printers) {
  const names = printers.map((p) => p.name);
  // An exact configured name always wins. Trust it too when the printer list
  // came back empty (PowerShell blocked by policy) — the name is a deliberate
  // choice, so a failed lookup shouldn't override it.
  if (cfg.printerName && (names.includes(cfg.printerName) || names.length === 0))
    return cfg.printerName;
  // Otherwise only auto-pick something that really is the thermal label printer.
  // Deliberately NO "else just take the first installed printer": on a PC that
  // doesn't have the Deli that would quietly spool 80x120mm label jobs to an
  // office laser or to Microsoft Print to PDF. That matters most in the
  // several-PCs-one-printer layout — such a PC would also claim phone jobs off
  // the shared cloud queue and swallow them where nobody is watching.
  const candidates = printers
    .filter((p) => printerRank(p.name) < 2)
    // Model match first (never print 720C labels on a different Deli just
    // because that one is plugged in), then prefer a connected one.
    .sort((a, b) =>
      printerRank(a.name) - printerRank(b.name) ||
      Number(a.offline) - Number(b.offline)
    );
  return candidates.length ? candidates[0].name : "";
}

// --- "does this PC actually have the printer right now?" -------------------
// The cable gets moved between PCs, so this is re-detected rather than decided
// once at startup: every check re-reads the printer list, re-picks the printer,
// and asks whether Windows can currently reach it. The PC holding the cable
// starts printing and taking queued jobs within seconds; the one that lost it
// stops. Nothing to restart, nothing to click, and it is safe to run the bridge
// on all of the PCs at the same time.
let lastPrinters = [];
let printerOnline = false;
let lastCheckAt = 0;
let lastReported = null;

// `maxAgeMs` reuses the previous answer if it is that fresh. Pass 0 (the
// default) to always re-read — printing is rare and human-initiated, and a
// stale "yes" here is the exact bug this guards against.
async function printerUsable(maxAgeMs = 0) {
  const now = Date.now();
  if (maxAgeMs && now - lastCheckAt < maxAgeMs) return printerOnline;
  lastCheckAt = now;

  const printers = await listPrinters();
  lastPrinters = printers;
  PRINTER = pickPrinter(printers);

  let online;
  if (!PRINTER) online = false;
  else if (cfg.requirePrinterOnline === false) online = true;
  else if (!printers.length) online = true; // couldn't query — don't block printing
  else {
    const found = printers.find((p) => p.name === PRINTER);
    online = Boolean(found) && !found.offline;
  }

  if (lastReported !== online) {
    if (online) {
      console.log(`  >> Printer CONNECTED here (${PRINTER}) — this PC now prints, including queued jobs.`);
    } else if (PRINTER) {
      console.log(`  >> Printer "${PRINTER}" is OFFLINE here (cable unplugged or powered off).`);
      console.log("     Labels will print on whichever PC has the cable.");
    } else {
      console.log("  >> No thermal printer on this PC — labels print on whichever PC has the cable.");
    }
    lastReported = online;
  }
  printerOnline = online;
  return online;
}

function offlineReason() {
  return PRINTER
    ? `Printer "${PRINTER}" is offline on this PC (cable unplugged or powered off)`
    : "No thermal printer on this PC";
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
  const mediaW = Math.round((cfg.widthMm || 80) * dotsPerMm);  // label width in dots
  const mediaH = Math.round((cfg.heightMm || 120) * dotsPerMm); // label height in dots
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

// Build a TSPL job that prints a pre-rendered label image (the full 80x120mm
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

  // `ok` stays true whatever the printer is doing — it identifies this as a
  // Cellzen bridge (see probeExistingBridge). `online` is the printer answer.
  if (req.method === "GET" && url === "/health")
    return json(res, 200, { ok: true, printer: PRINTER, online: await printerUsable(10000) });

  if (req.method === "GET" && url === "/printers") {
    const printers = await listPrinters();
    return json(res, 200, {
      ok: true,
      selected: PRINTER,
      online: printerOnline,
      printers: printers.map((p) => p.name),
      details: printers,
    });
  }

  if (req.method === "GET" && url === "/selftest") {
    if (!(await printerUsable())) return json(res, 503, { ok: false, error: offlineReason() });
    try { await sendRaw(buildTSPL("CZN00001", 1)); return json(res, 200, { ok: true, printer: PRINTER }); }
    catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  }

  if (req.method === "POST" && url === "/print") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      // Refuse rather than spool blind. Windows happily accepts a job into an
      // offline queue, so printing anyway would report success, the website
      // would never fall back to the cloud queue, and the label would sit in
      // this PC's spooler unseen. The error is what hands the job over: the
      // site queues it and the PC holding the cable prints it seconds later.
      if (!(await printerUsable())) return json(res, 503, { ok: false, error: offlineReason() });
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
  // Claiming is destructive — the server marks the job 'printing' and, if we
  // then report a failure, 'error', which is never retried by anyone else. So a
  // PC that can't print must not claim at all: it stays quiet and the job waits
  // for the PC that has the cable. Cached briefly so this doesn't spawn a
  // PowerShell query every couple of seconds.
  if (!(await printerUsable(5000))) return;
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

// --- single instance -------------------------------------------------------
// Only one copy can own the port. That's routinely hit in practice: the bridge
// already starts hidden at login (install-autostart.bat), so double-clicking a
// launcher afterwards starts a second copy that can't bind. Left unhandled Node
// throws EADDRINUSE and run-forever.bat restarts it into the same clash every
// 3 seconds forever. Instead we detect it and exit with this code, which the
// launcher scripts read as "already running — stop, don't restart".
const EXIT_ALREADY_RUNNING = 3;

// Ask whoever holds the port whether it's one of us. True only for a Cellzen
// bridge's /health, so an unrelated program squatting on the port is reported
// as the different problem it is.
function probeExistingBridge() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: cfg.port, path: "/health", timeout: 1500 },
      (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try { resolve(JSON.parse(body).ok === true); } catch { resolve(false); }
        });
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function onListenError(err) {
  console.log("");
  if (!err || err.code !== "EADDRINUSE") {
    console.error("  The print bridge could not start: " + ((err && err.message) || err));
    console.log("");
    return process.exit(1);
  }
  if (await probeExistingBridge()) {
    console.log("  The Cellzen print bridge is ALREADY RUNNING on this PC.");
    console.log("  Nothing is wrong and nothing to fix — printing works right now.");
    console.log("  (It starts by itself at login, so you never need to open it.)");
    console.log("  You can close this window.");
    console.log("");
    return process.exit(EXIT_ALREADY_RUNNING);
  }
  console.error("  Port " + cfg.port + " is being used by a different program.");
  console.error("  Either close that program, or pick another \"port\" in config.json");
  console.error("  (and change PRINT_BRIDGE_URL in the website to match).");
  console.error("  To see what is holding it:  netstat -ano | findstr :" + cfg.port);
  console.log("");
  return process.exit(1);
}

// Start the service only when run directly (`node bridge.js`). When required as
// a module (e.g. by a test), just expose the TSPL builders.
if (require.main === module) {
  (async () => {
    const online = await printerUsable(); // also sets PRINTER + lastPrinters
    const names = lastPrinters.map((p) => p.name + (p.offline ? " (offline)" : ""));
    server.on("error", onListenError);
    server.listen(cfg.port, "127.0.0.1", () => {
      console.log("");
      console.log("  Cellzen print bridge is running.");
      console.log("  URL            : http://127.0.0.1:" + cfg.port);
      console.log("  Installed      : " + (names.length ? names.join(" | ") : "(no printers found)"));
      console.log("  Using printer  : " + (PRINTER || "(none found on this PC)"));
      console.log("  Printer status : " + (online ? "CONNECTED — this PC prints" : "not connected here — another PC prints"));
      console.log("  Local test     : open http://127.0.0.1:" + cfg.port + "/selftest");
      // Started regardless of what's plugged in right now: pollOnce() re-checks
      // before every claim, so the poller simply idles on a PC without the
      // cable and takes over by itself when the cable is moved to it.
      if (cloudEnabled()) {
        console.log("  Cloud queue    : ON  → " + API_BASES.join(", ") + " (phones can print; polling " + (cfg.pollMs || 2500) + "ms)");
        startCloudPoller();
      } else {
        console.log("  Cloud queue    : OFF (set apiBaseUrl + agentToken in config.json to enable phone printing)");
      }
      console.log("");
      console.log("  Safe to run on every PC at once. Whichever one has the USB cable");
      console.log("  plugged in does the printing; move the cable and it follows, within");
      console.log("  a few seconds and with nothing to restart.");
      console.log("");
      console.log("  Keep this window open while staff print. Ctrl+C to stop.");
      console.log("");
    });
  })();
}

module.exports = { buildTSPL, buildBitmapTSPL };
