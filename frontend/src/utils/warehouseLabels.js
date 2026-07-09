// Warehouse label + barcode generation.
//
// Shipment (item) labels use the approved 60 x 80 mm design: CELLZEN logo, a
// Code-128 barcode, Shelf / Tracking lines, the handling-icon row, and the
// footer. The whole label is rendered ONCE onto a canvas at exact printer
// resolution (480 x 640 dots = 60 x 80 mm at 8 dots/mm ≈ 203 dpi). That single
// image is the source of truth:
//   - Download  → the canvas as a PNG.
//   - Print     → the canvas packed to a 1-bit bitmap and sent to the Deli 720C
//                 as a native TSPL BITMAP (crisp, no browser dialog). Because it
//                 prints 1:1 with the dots, the barcode stays scannable.
// Rack/shelf labels are unchanged: a simple native barcode (no logo/icons).

import { toCanvas } from "bwip-js";
import { enqueuePrintJob } from "./warehouseApi";
import { CELLZEN_LOGO_SVG, LABEL_ICONS_SVG } from "./labelAssets";

const INK = "#2D2D2D";
const PURPLE = "#412460";
const PAPER = "#E5E1DA"; // brand cream — the rack "physical label" colour
const BLACK = "#000000"; // shipment-label content prints as solid black

// ---------------------------------------------------------------- geometry
// 203 dpi ≈ 8 dots/mm (the standard TSPL approximation). The whole label is one
// bitmap at printer resolution so the printed output matches the design exactly.
const DOTS_PER_MM = 8;
const LABEL_W_MM = 60;
const LABEL_H_MM = 80;
const MARGIN_MM = 2.5; // → a 55 x 75 mm content safe-area, centred on the label
const CANVAS_W = LABEL_W_MM * DOTS_PER_MM; // 480
const CANVAS_H = LABEL_H_MM * DOTS_PER_MM; // 640
const MARGIN = MARGIN_MM * DOTS_PER_MM; // 20
const SAFE_W = CANVAS_W - 2 * MARGIN; // 440
const CENTER_X = CANVAS_W / 2; // 240

// Nudge all content slightly right of centre (to sit better on the label).
const CONTENT_DX = 8;
const CX = CENTER_X + CONTENT_DX; // content centre line (all elements centre here)
const CONTENT_W = 448; // max text width, centred on CX (small side margins)
const FOOTER_W = 468; // the long support line may use a touch more width
const LETTER_SPACING = 0; // no extra letter tracking on the text lines

// Vertical layout (dots). Image blocks use their TOP; text uses its BASELINE.
// The barcode band holds the bars + a gap + the CZN number; Shelf/Tracking sit
// just below it.
const LOGO_TOP = 16;
const LOGO_W = 270;
const BARCODE_TOP = 122;
const BARCODE_MAX_W = 468;
// The CZN code number, drawn by us under the bars (smaller + letter-spaced).
const CODE_GAP = 12; // space between the bars and the number
const CODE_SIZE = 30;
const CODE_SPACING = 12; // letter spacing on the number
const SHELF_Y = 336;
const TRACKING_Y = 374;
const ICONS_TOP = 394;
const ICONS_W = 270;
const FOOTER1_Y = 540;
const FOOTER2_Y = 572;
const FOOTER3_Y = 604;

const FONT_STACK = "'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
const SUPPORT_PHONE = "+8613073040201";

// Inter, hosted on Supabase Storage (public bucket) and loaded via FontFace so
// the label renders in the same face on every device — not the local machine's
// fonts. Best-effort: if Supabase is unreachable the canvas falls back to the
// system sans in FONT_STACK, so a label still prints.
const INTER_BASE =
  "https://sdecwugvmhyychwxnrvh.supabase.co/storage/v1/object/public/public-assets/fonts/inter";
const INTER_FACES = [
  { weight: "400", file: "inter-latin-400-normal.woff2" },
  { weight: "500", file: "inter-latin-500-normal.woff2" },
  { weight: "600", file: "inter-latin-600-normal.woff2" },
  { weight: "700", file: "inter-latin-700-normal.woff2" },
];

let _interLoaded = null;
function loadInterFonts() {
  if (_interLoaded) return _interLoaded;
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) {
    _interLoaded = Promise.resolve();
    return _interLoaded;
  }
  _interLoaded = (async () => {
    let allOk = true;
    await Promise.all(
      INTER_FACES.map(async ({ weight, file }) => {
        try {
          const face = new FontFace("Inter", `url(${INTER_BASE}/${file}) format('woff2')`, {
            weight,
            style: "normal",
          });
          // Bound the fetch: a slow/offline Supabase must never hang printing.
          await Promise.race([
            face.load(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("font load timeout")), 4000)),
          ]);
          document.fonts.add(face);
        } catch (e) {
          allOk = false;
          console.warn(`Inter ${weight} not loaded from Supabase (using fallback):`, (e && e.message) || e);
        }
      })
    );
    // If some faces didn't load, let a later print retry (the woff2 is HTTP-cached
    // once fetched, so retries are cheap) instead of caching the fallback forever.
    if (!allOk) _interLoaded = null;
  })();
  return _interLoaded;
}

// Browser-print fallback page size (matches the loaded label stock).
const PAGE_W = `${LABEL_W_MM}mm`;
const PAGE_H = `${LABEL_H_MM}mm`;

// ---------------------------------------------------------------- barcode
// Render a Code-128 barcode for `text` onto an offscreen canvas.
function barcodeCanvas(text, opts = {}) {
  const canvas = document.createElement("canvas");
  toCanvas(canvas, {
    bcid: "code128",
    text: String(text || ""),
    scale: 3,
    height: 16,
    includetext: true,
    textxalign: "center",
    textsize: 12,
    paddingwidth: 10,
    paddingheight: 8,
    backgroundcolor: "FFFFFF",
    ...opts,
  });
  return canvas;
}

// Barcode PNG sized for a thermal sticker (tight quiet zone, high scale). Used
// only by the browser-print fallback for rack labels.
function barcodeDataUrl(text) {
  return barcodeCanvas(text, {
    scale: 4,
    height: 13,
    textsize: 10,
    paddingwidth: 4,
    paddingheight: 2,
  }).toDataURL("image/png");
}

// A Code-128 barcode + human-readable text for the shipment label. `scale` is
// device px per module; the canvas is drawn 1:1 so a module = `scale` printer
// dots — keep it an integer so the bars land on dot boundaries and scan cleanly.
function shipmentBarcodeCanvas(text, scale) {
  return barcodeCanvas(text, {
    scale,
    height: 12,        // BARS ONLY — the CZN number is drawn separately below
    includetext: false,
    paddingwidth: 2,   // ~464 dots wide at scale 4 — wide, with a quiet zone
    paddingheight: 0,
    backgroundcolor: "FFFFFF",
  });
}

// ---------------------------------------------------------------- vector artwork
// The logo + icons are drawn as vector paths straight onto the canvas via Path2D.
// This matters: loading them as <img> (data: URL) can taint the canvas in some
// browsers, and then getImageData()/toDataURL() throw — which silently dropped
// us back to a plain barcode. Path2D fills never taint the canvas, and they're
// synchronous, so nothing can fail to load.

const _svgCache = new Map();

// Parse a self-contained SVG string into { vbW, vbH, paths:[{d, fill}] } (cached).
function parseSvg(svg) {
  if (_svgCache.has(svg)) return _svgCache.get(svg);
  let vbW = 100;
  let vbH = 100;
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p[2]) vbW = p[2];
    if (p[3]) vbH = p[3];
  }
  const paths = [];
  const tagRe = /<path\b([^>]*?)\/?>/g;
  let m;
  while ((m = tagRe.exec(svg))) {
    const attrs = m[1];
    const d = (attrs.match(/\bd="([^"]+)"/) || [])[1];
    if (!d) continue;
    const fill = (attrs.match(/\bfill="([^"]+)"/) || [])[1] || "#000000";
    paths.push({ d, fill });
  }
  const parsed = { vbW, vbH, paths };
  _svgCache.set(svg, parsed);
  return parsed;
}

// Fill an SVG's paths into the box (dx,dy,dw,dh), scaling from its viewBox.
function drawSvgPaths(ctx, svg, dx, dy, dw, dh) {
  const { vbW, vbH, paths } = parseSvg(svg);
  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(dw / vbW, dh / vbH);
  for (const p of paths) {
    if (p.fill === "none") continue;
    // Monochrome thermal label — everything prints solid black (the source art
    // has some dark-grey fills like "group of companies" / "FRAGILE").
    ctx.fillStyle = "#000000";
    ctx.fill(new Path2D(p.d)); // nonzero winding — matches the source SVG
  }
  ctx.restore();
}

// Draw an SVG centred horizontally at `topY`, `width` wide, aspect preserved.
function drawSvgCentered(ctx, svg, topY, width) {
  const { vbW, vbH } = parseSvg(svg);
  const height = Math.round((width * vbH) / vbW);
  drawSvgPaths(ctx, svg, Math.round(CX - width / 2), topY, width, height);
}

// Width of `text` at the current ctx.font including per-character letter-spacing.
function spacedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w > 0 ? w - spacing : 0; // no trailing gap
}

// Largest size ≤ startPx at which `text` (with spacing) fits maxWidth.
function fitFont(ctx, text, maxWidth, startPx, weight, spacing) {
  let size = startPx;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  while (size > 8 && spacedWidth(ctx, text, spacing) > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }
  return size;
}

// Draw letter-spaced text centred on CX at the given baseline and pixel size.
// (Manual per-glyph spacing so it renders identically in the browser and Node.)
function drawTextAt(ctx, text, y, px, weight, spacing, baseline = "alphabetic") {
  ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = baseline;
  ctx.fillStyle = BLACK;
  let x = CX - spacedWidth(ctx, text, spacing) / 2;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}

// Fit-to-width + draw, centred on CX with letter-spacing.
function drawCenteredText(ctx, text, baselineY, size, weight = "600", maxWidth = CONTENT_W, spacing = LETTER_SPACING) {
  const px = fitFont(ctx, text, maxWidth, size, weight, spacing);
  drawTextAt(ctx, text, baselineY, px, weight, spacing);
}

// "2026-07-09" / Date → "July 9, 2026", matching the design's footer.
function formatLabelDate(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ---------------------------------------------------------------- mono packing
function bytesToBase64(bytes) {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Pack the canvas to a 1-bit bitmap in TSPL BITMAP layout: MSB-first, rows padded
// to whole bytes, bit 0 = black dot (printed), bit 1 = white. A pixel is "black"
// if it's opaque and dark; anti-aliased edges resolve at a mid threshold.
function packMono(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  const widthBytes = Math.ceil(width / 8);
  const out = new Uint8Array(widthBytes * height).fill(0xff); // start all-white
  for (let y = 0; y < height; y++) {
    const rowByte = y * widthBytes;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 128) continue; // transparent → white
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 128) out[rowByte + (x >> 3)] &= ~(0x80 >> (x & 7)); // clear bit → black
    }
  }
  return { data: bytesToBase64(out), widthBytes, height };
}

// ---------------------------------------------------------------- shipment label
// Render the full 60 x 80 mm shipment label. Returns { png, mono } where `mono`
// is the packed 1-bit bitmap payload for the print bridge / queue.
async function renderShipmentLabel(item) {
  // Load Inter (from Supabase) + wait for fonts, but hard-bound the whole step so
  // a slow/offline network can never hang label rendering — we fall back to a
  // system sans (see FONT_STACK) and still print.
  try {
    await Promise.race([
      (async () => {
        await loadInterFonts();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      })(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch { /* fall back to system sans */ }

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); // the white label stock

  // Logo (centred) — vector paths, so the canvas is never tainted.
  drawSvgCentered(ctx, CELLZEN_LOGO_SVG, LOGO_TOP, LOGO_W);

  // Barcode — widest module scale that fits the label width, drawn at natural
  // width (1:1) so bars land on dot boundaries and scan cleanly. Scale 4 fills
  // the full 60 mm for a typical code; longer codes step down to keep fitting.
  let bc = shipmentBarcodeCanvas(item.code, 4);
  if (bc.width > BARCODE_MAX_W) bc = shipmentBarcodeCanvas(item.code, 3);
  if (bc.width > BARCODE_MAX_W) bc = shipmentBarcodeCanvas(item.code, 2);
  let bw = bc.width;
  let bh = bc.height;
  if (bw > BARCODE_MAX_W) { bh = Math.round(bh * (BARCODE_MAX_W / bw)); bw = BARCODE_MAX_W; } // rare clamp
  const bcx = Math.round(CX - bw / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bc, bcx, BARCODE_TOP, bw, bh);
  ctx.imageSmoothingEnabled = true;
  // The CZN number under the bars — our own render: smaller + letter-spaced.
  drawTextAt(ctx, item.code, BARCODE_TOP + bh + CODE_GAP, CODE_SIZE, "500", CODE_SPACING, "top");

  // Shelf + tracking — SAME font size on both lines. Tracking is the longer of
  // the two, so it governs the shared size (both fit, and they match visually).
  const shelfText = `Shelf Number: ${item.rackId || "-"}`;
  const trackText = `Tracking: ${item.trackingNumber || "-"}`;
  const sShelf = fitFont(ctx, shelfText, CONTENT_W, 30, "600", LETTER_SPACING);
  const sTrack = fitFont(ctx, trackText, CONTENT_W, 30, "600", LETTER_SPACING);
  const sCommon = Math.min(sShelf, sTrack);
  drawTextAt(ctx, shelfText, SHELF_Y, sCommon, "600", LETTER_SPACING);
  drawTextAt(ctx, trackText, TRACKING_Y, sCommon, "600", LETTER_SPACING);

  // Handling icons (centred) — vector paths, so the canvas is never tainted.
  drawSvgCentered(ctx, LABEL_ICONS_SVG, ICONS_TOP, ICONS_W);

  // Footer.
  drawCenteredText(ctx, `Recorded by: ${item.createdByName || "-"}`, FOOTER1_Y, 27, "600");
  drawCenteredText(ctx, `If any doubts please inform ${SUPPORT_PHONE}`, FOOTER2_Y, 27, "500", FOOTER_W);
  drawCenteredText(ctx, formatLabelDate(item.createdAt), FOOTER3_Y, 27, "500");

  const png = canvas.toDataURL("image/png");
  const mono = packMono(ctx, CANVAS_W, CANVAS_H);
  return { png, mono };
}

// ---------------------------------------------------------------- rack label
// Composite a simple rack "label" (code + meta + barcode) → PNG data URL.
function renderRackLabelDataUrl({ code, lines, caption }) {
  const W = 520;
  const H = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, W, 12);

  ctx.fillStyle = INK;
  ctx.font = "700 32px Inter, system-ui, sans-serif";
  ctx.fillText(String(code), 26, 70);

  ctx.font = "15px Inter, system-ui, sans-serif";
  let y = 108;
  for (const ln of lines || []) {
    ctx.fillStyle = INK;
    ctx.fillText(String(ln), 26, y);
    y += 26;
  }

  const bc = barcodeCanvas(code);
  const boxX = 20;
  const boxY = H - 116;
  const boxW = W - 40;
  const boxH = 96;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  const s = Math.min(1, (boxW - 24) / bc.width, (boxH - 16) / bc.height);
  const dw = bc.width * s;
  const dh = bc.height * s;
  ctx.drawImage(bc, boxX + (boxW - dw) / 2, boxY + (boxH - dh) / 2, dw, dh);

  if (caption) {
    ctx.fillStyle = "#7d7561";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.fillText(String(caption), 26, H - 8);
  }

  return canvas.toDataURL("image/png");
}

const rackLabel = (rackId) => ({
  code: rackId,
  lines: ["Warehouse shelf label"],
  caption: "Scan to set this as the active shelf.",
});

// ---------------------------------------------------------------- download/print utils
function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Print an image on a label-sized page via a hidden iframe (no popup blocker).
function printImageOnLabel(dataUrl, title, fit) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const cleanup = () => setTimeout(() => iframe.remove(), 1500);
  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>${title || ""}</title><style>` +
        `@page { size: ${PAGE_W} ${PAGE_H}; margin: 0; }` +
        `html,body { margin:0; padding:0; }` +
        `.label { width:${PAGE_W}; height:${PAGE_H}; display:flex; align-items:center; justify-content:center; overflow:hidden; }` +
        `.label img { ${fit === "cover" ? `width:${PAGE_W};height:${PAGE_H};object-fit:contain;` : "max-width:100%;max-height:100%;"} }` +
        `</style></head><body><div class="label"><img src="${dataUrl}"></div></body></html>`
    );
    doc.close();
    const img = doc.querySelector("img");
    const doPrint = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch { /* ignore */ }
      cleanup();
    };
    if (img && img.complete) doPrint();
    else if (img) { img.onload = doPrint; img.onerror = cleanup; }
    else cleanup();
  } catch {
    cleanup();
  }
}

// ---------------------------------------------------------------- print bridge
// Local thermal print bridge — a tiny service running on the warehouse PC that
// owns the Deli 720C (see /print-bridge). We use 127.0.0.1 (not "localhost") so
// the request always hits the IPv4 loopback the bridge binds to; browsers treat
// it as a secure origin, so this http:// call is allowed from the HTTPS site.
const PRINT_BRIDGE_URL = "http://127.0.0.1:9110";

// Try to print via the local bridge. `bitmap` (optional) is the pre-rendered
// shipment-label image; when omitted the bridge builds a native barcode from
// `code` (rack labels, or a fallback if canvas rendering failed). Resolves true
// on success; false if the bridge is offline or errors — caller then falls back.
async function printViaBridge(code, kind, copies = 1, bitmap = null) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${PRINT_BRIDGE_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bitmap ? { code, kind, copies, bitmap } : { code, kind, copies }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data.ok === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- public API
export async function downloadItemLabel(item) {
  const { png } = await renderShipmentLabel(item);
  triggerDownload(png, `${item.code}_label.png`);
}

export async function downloadRackLabel(rackId) {
  triggerDownload(renderRackLabelDataUrl(rackLabel(rackId)), `${rackId}_shelf.png`);
}

// Item print flow, in priority order:
//   1. Local bridge  — the warehouse PC prints the full-design bitmap instantly.
//   2. Cloud queue   — any other device (incl. phones) queues the SAME bitmap;
//                      the on-site agent prints it identically seconds later.
//   3. Browser print — last resort: print the rendered PNG on a 60 x 80 page.
// Returns "local" | "queued" | "browser".
export async function printItemLabel(item) {
  let rendered = null;
  try {
    rendered = await renderShipmentLabel(item);
  } catch (e) {
    // If this ever fires we drop to a plain barcode — log it so the cause is visible.
    console.error("Shipment label render failed, falling back to plain barcode:", e);
  }
  const bitmap = rendered ? rendered.mono : null;

  if (await printViaBridge(item.code, "item", 1, bitmap)) return "local";
  try {
    await enqueuePrintJob(item.code, "item", 1, bitmap);
    return "queued";
  } catch {
    if (rendered) printImageOnLabel(rendered.png, item.code, "cover");
    else printImageOnLabel(barcodeDataUrl(item.code), item.code);
    return "browser";
  }
}

// Rack/shelf labels stay a simple native barcode — no logo/icons, no bitmap.
export async function printRackLabel(rackId) {
  if (await printViaBridge(rackId, "rack", 1, null)) return "local";
  try {
    await enqueuePrintJob(rackId, "rack", 1, null);
    return "queued";
  } catch {
    printImageOnLabel(barcodeDataUrl(rackId), rackId);
    return "browser";
  }
}
