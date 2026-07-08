// Warehouse label + barcode generation.
//  - Download → a full "physical label" PNG (code + meta + barcode).
//  - Print   → JUST the Code-128 barcode, sized to a 1.97in × 0.98in thermal
//              sticker, so it prints accurately on a label printer.

import { toCanvas } from "bwip-js";
import { enqueuePrintJob } from "./warehouseApi";

const INK = "#2D2D2D";
const PURPLE = "#412460";
const PAPER = "#E5E1DA"; // brand cream — the "physical label" colour

// Thermal sticker dimensions.
const THERMAL_W = "1.97in";
const THERMAL_H = "0.98in";

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

// Barcode PNG sized for the thermal sticker (tight quiet zone, high scale).
function barcodeDataUrl(text) {
  return barcodeCanvas(text, {
    scale: 4,
    height: 13,
    textsize: 10,
    paddingwidth: 4,
    paddingheight: 2,
  }).toDataURL("image/png");
}

// Composite a printable "label" (code + meta lines + barcode) → PNG data URL.
function renderLabelDataUrl({ code, lines, caption }) {
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

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Print JUST the barcode on a 1.97in × 0.98in thermal sticker, via a hidden
// iframe (no popup-blocker, unlike window.open).
function printBarcode(text, title) {
  const dataUrl = barcodeDataUrl(text);
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
        `@page { size: ${THERMAL_W} ${THERMAL_H}; margin: 0; }` +
        `html,body { margin:0; padding:0; }` +
        `.label { width:${THERMAL_W}; height:${THERMAL_H}; display:flex; align-items:center; justify-content:center; overflow:hidden; }` +
        `.label img { max-width:100%; max-height:100%; }` +
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

// Local thermal print bridge — a tiny service running on the warehouse PC that
// owns the Deli 720C (see /print-bridge). We use 127.0.0.1 (not "localhost") so
// the request always hits the IPv4 loopback the bridge binds to; browsers treat
// it as a secure origin, so this http:// call is allowed from the HTTPS site.
const PRINT_BRIDGE_URL = "http://127.0.0.1:9110";

// Try to print a native TSPL label via the local bridge. Resolves true on
// success; false if the bridge is offline or errors — caller then falls back to
// the browser print path so machines without the printer still work.
async function printViaBridge(code, kind, copies = 1) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${PRINT_BRIDGE_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, kind, copies }),
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

const itemLabel = (item) => ({
  code: item.code,
  lines: [`Shelf: ${item.rackId || "-"}`, `Tracking: ${item.trackingNumber || "-"}`],
  caption: "Scan at Ship / Locate to confirm shipment.",
});

const rackLabel = (rackId) => ({
  code: rackId,
  lines: ["Warehouse shelf label"],
  caption: "Scan to set this as the active shelf.",
});

export async function downloadItemLabel(item) {
  triggerDownload(renderLabelDataUrl(itemLabel(item)), `${item.code}_label.png`);
}

export async function downloadRackLabel(rackId) {
  triggerDownload(renderLabelDataUrl(rackLabel(rackId)), `${rackId}_shelf.png`);
}

// Print flow, in priority order:
//   1. Local bridge  — the warehouse PC prints instantly over 127.0.0.1.
//   2. Cloud queue   — any other device (incl. phones) queues the job; the
//                      on-site agent picks it up and prints it seconds later.
//   3. Browser print — last resort if both are unreachable.
// Returns "local" | "queued" | "browser" so the caller can inform the user.
async function printFlow(code, kind, title) {
  if (await printViaBridge(code, kind)) return "local";
  try {
    await enqueuePrintJob(code, kind);
    return "queued";
  } catch {
    printBarcode(code, title);
    return "browser";
  }
}

export function printItemLabel(item) {
  return printFlow(item.code, "item", item.code);
}

export function printRackLabel(rackId) {
  return printFlow(rackId, "rack", rackId);
}
