// Warehouse label + barcode generation.
//
// Shipment (item) labels use the approved 80 x 120 mm design: CELLZEN logo, a
// Code-128 barcode of the item's goods code (the gtradea item code where there
// is one — see goodsCode() in warehouseApi.js), the Shelf / Order / Tracking
// number lines, the handling-icon row, and the footer.
// The whole label is rendered ONCE onto a canvas at exact printer
// resolution (640 x 960 dots = 80 x 120 mm at 8 dots/mm ≈ 203 dpi). That single
// image is the source of truth:
//   - Download  → the canvas as a PNG.
//   - Print     → the canvas packed to a 1-bit bitmap and sent to the Deli 720C
//                 as a native TSPL BITMAP (crisp, no browser dialog). Because it
//                 prints 1:1 with the dots, the barcode stays scannable.
// Rack/shelf labels are unchanged: a simple native barcode (no logo/icons).

import { toCanvas } from "bwip-js";
import { enqueuePrintJob, goodsCode, parcelProductIds } from "./warehouseApi";
import { CELLZEN_LOGO_SVG, LABEL_ICONS_SVG } from "./labelAssets";
import { GTRADEA_LABEL_ART, ART_W, ART_H } from "./gtradeaLabelArt";

const INK = "#2D2D2D";
const PURPLE = "#412460";
const PAPER = "#E5E1DA"; // brand cream — the rack "physical label" colour
const BLACK = "#000000"; // shipment-label content prints as solid black

// ---------------------------------------------------------------- geometry
// 203 dpi ≈ 8 dots/mm (the standard TSPL approximation). The whole label is one
// bitmap at printer resolution so the printed output matches the design exactly.
const DOTS_PER_MM = 8;
const LABEL_W_MM = 80;
const LABEL_H_MM = 120;
const CANVAS_W = LABEL_W_MM * DOTS_PER_MM; // 640
const CANVAS_H = LABEL_H_MM * DOTS_PER_MM; // 960
const CENTER_X = CANVAS_W / 2; // 320

// ------------------------------------------------- CELLZEN design, scaled up
// The CELLZEN label was drawn on the old 60 x 80 mm stock, and every position
// below is one of those hand-tuned 480 x 640 dots. Rather than re-tune the whole
// stack for the 80 x 120 mm stock, the design is scaled up AS A UNIT: CZ_S is the
// largest uniform scale that fits — width-bound, so the design still fills the
// label edge to edge exactly as it did — and CZ_DY centres it on the taller
// stock. cz()/czY() turn a design dot into a printer dot, so every constant below
// stays readable as the number the design was actually tuned with, and the
// physical size of everything on the sticker grows with the stock (a third
// bigger) instead of sitting in the top-left corner of it.
const CZ_W = 480;
const CZ_H = 640;
const CZ_S = Math.min(CANVAS_W / CZ_W, CANVAS_H / CZ_H); // 4/3
const CZ_DY = Math.round((CANVAS_H - CZ_H * CZ_S) / 2);
const cz = (v) => Math.round(v * CZ_S);       // design dot -> printer dot
const czY = (v) => CZ_DY + cz(v);             // ... and down onto the taller stock

// Nudge all content slightly right of centre (to sit better on the label).
const CONTENT_DX = cz(8);
const CX = CENTER_X + CONTENT_DX; // content centre line (all elements centre here)
const CONTENT_W = cz(462); // max text width, centred on CX (small side margins)
const FOOTER_W = cz(470); // the long support line may use a touch more width
const LETTER_SPACING = 0; // no extra letter tracking on the text lines

// Vertical layout (dots). Image blocks use their TOP; text uses its BASELINE.
// The barcode band holds the bars + a gap + the goods number; the Shelf / Order /
// Tracking block sits just below it.
const LOGO_TOP = czY(16);
const LOGO_W = cz(270);
const BARCODE_TOP = czY(122);
const BARCODE_MAX_W = cz(468);
// Module scale (printer dots per narrow bar), PINNED rather than chosen per code.
//
// It used to step 4 -> 3 -> 2, taking the widest scale whose barcode still fit
// BARCODE_MAX_W. That silently made the barcode a different SIZE for different
// ids, and the id got longer when the label moved from the PR id to the gtradea
// item code: PR-1072 fits at scale 4 (420 dots wide), but GTI-100119 needs 508
// there — over the 468 the 60 mm stock allows — so it would have dropped to
// scale 3. And because bwip-js multiplies bar height by the scale too, dropping
// a scale shrank the bars VERTICALLY as well (114 -> 86 dots), not just
// horizontally. Two boxes side by side would have carried visibly different
// barcodes.
//
// 3 was the widest scale a 10-character code fit in at 60 mm. On the 80 mm stock
// a design dot is 4/3 of a printer dot, so 4 is that same bar width in
// millimetres and is the scale every id shares now: GTI-100119 comes to 508 dots,
// inside the 624 this stock allows. Keep it an integer: a module has to land on
// whole printer dots or the bars blur and stop scanning.
const BARCODE_SCALE = 4;
// Bar height in printer DOTS (bars only — the number underneath is drawn
// separately). Expressed in dots rather than bwip-js's millimetres so it stays
// fixed no matter what BARCODE_SCALE is: bwip takes mm at 72dpi and multiplies
// by the scale, so asking for a constant mm value would make the printed height
// swing with the scale. 114 and 79 are what the old scale-4 render produced, so
// the bars come off the printer exactly as tall as they always have.
const BARCODE_BAR_DOTS = cz(114);
const barMm = (dots, scale) => dots / (2.8346 * scale); // dots -> bwip-js mm@72dpi
// The goods number, drawn by us under the bars (smaller + letter-spaced).
const CODE_GAP = cz(12); // space between the bars and the number
const CODE_SIZE = cz(42);
const CODE_SPACING = cz(12); // letter spacing on the number

// Optional "SHIPMENT: BY AIR/LAND" banner, drawn full-bleed under the logo when
// a shipment mode is picked at print time. Everything below it (down through the
// info block) has to keep fitting in the same space, so the barcode band shrinks
// to make room instead of pushing the info lines / icons / footer around.
const MODE_BAR_TOP = czY(128);
const MODE_BAR_H = cz(32);
const MODE_BAR_FONT = cz(19);
const MODE_BAR_SPACING = cz(2);
const BARCODE_TOP_WITH_MODE = MODE_BAR_TOP + MODE_BAR_H + cz(14);
const BARCODE_BAR_DOTS_WITH_MODE = cz(79); // vs. BARCODE_BAR_DOTS for the normal barcode
const CODE_GAP_WITH_MODE = cz(10);
const CODE_SIZE_WITH_MODE = cz(32); // vs. CODE_SIZE for the normal barcode's number

// The info block — "Shelf Number:", "Order Number:", "Tracking Number:" — laid
// out as one stack between the barcode band and the handling icons.
// INFO_TOP_Y is the FIRST line's baseline; each further line sits
// INFO_LINE_GAP below it. All lines share ONE font size (the longest line
// governs it) so they read as a set. A cellzen item has no 1688 order number,
// so its block is two lines and simply ends higher — the icons and footer stay
// put either way.
const INFO_TOP_Y = czY(330);
const INFO_LINE_GAP = cz(35);
const INFO_FONT_MAX = cz(30);
const ICONS_TOP = czY(422);
const ICONS_W = cz(250);
const FOOTER1_Y = czY(542);
const FOOTER2_Y = czY(574);
const FOOTER3_Y = czY(606);
const FOOTER_FONT_MAX = cz(28); // the three footer lines share one size

const FONT_STACK = "'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
const SUPPORT_PHONE = "+8613073040201";

// Inter, served from THIS site (frontend/public/fonts/Inter) and loaded via
// FontFace so the label renders in the same face on every device — not the local
// machine's fonts.
//
// It used to be fetched from a Supabase Storage bucket, which turned out to be a
// silent single point of failure: the moment that project passed its egress
// quota every request came back 402 and EVERY label printed in the machine's
// system sans instead of Inter, with nothing but a console warning to say so.
// The four faces are 90 KB in total — far too little to be worth an external
// dependency the printer's typeface hangs on. Same origin as the app now, so a
// label can only lose Inter if the app itself failed to load.
//
// The fallback below stays regardless: a label that prints in the wrong face
// still beats one that doesn't print.
const INTER_BASE = "/fonts/Inter";
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
          // Bound the fetch: a slow or unreachable font must never hang printing.
          await Promise.race([
            face.load(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("font load timeout")), 4000)),
          ]);
          document.fonts.add(face);
        } catch (e) {
          allOk = false;
          console.warn(`Inter ${weight} not loaded (using fallback):`, (e && e.message) || e);
        }
      })
    );
    // If some faces didn't load, let a later print retry (the woff2 is HTTP-cached
    // once fetched, so retries are cheap) instead of caching the fallback forever.
    // Worth keeping now that the files are local: the first print of a session can
    // race a cold cache, and the retry is what gets Inter onto the second one.
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
// `barHeight` is the bwip-js bar height in mm@72dpi (BARS ONLY — the goods
// number is drawn separately below); pass it through barMm() so it's expressed
// in printer dots. It's shrunk when the shipment-mode banner is showing so the
// whole barcode band still fits above the info lines.
function shipmentBarcodeCanvas(text, scale, barHeight = barMm(BARCODE_BAR_DOTS, scale)) {
  return barcodeCanvas(text, {
    scale,
    height: barHeight,
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

// Normalize a shipment-mode value to "air" | "land" | null (any other/empty
// input means no banner). Accepts either the short form ("air"/"land") or the
// full display string stored on the item ("By Air"/"By Land").
function normalizeShipmentMode(mode) {
  const m = String(mode || "").trim().toLowerCase();
  if (m.includes("land")) return "land";
  if (m.includes("air")) return "air";
  return null;
}

// Full-bleed black banner ("SHIPMENT: BY AIR" / "SHIPMENT: BY LAND") drawn
// under the logo. Runs edge-to-edge (unlike the rest of the content, which
// sits inside the safe margin) to match the approved design. Text is white on
// black, so this draws directly rather than via drawTextAt (which is always
// black-on-white).
function drawShipmentModeBar(ctx, mode) {
  const label = mode === "air" ? "SHIPMENT: BY AIR" : "SHIPMENT: BY LAND";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, MODE_BAR_TOP, CANVAS_W, MODE_BAR_H);

  ctx.font = `700 ${MODE_BAR_FONT}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  const y = MODE_BAR_TOP + MODE_BAR_H / 2;
  let x = CX - spacedWidth(ctx, label, MODE_BAR_SPACING) / 2;
  for (const ch of label) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + MODE_BAR_SPACING;
  }
}

// "2026-07-09" / Date → "July 9, 2026", matching the design's footer.
function formatLabelDate(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// → "July 30, 2026 05:48 PM" — the GtradeA design's footer stamp. Built from two
// calls rather than one toLocaleString: en-US would splice in "at" and drop the
// leading zero on the hour, and the design has neither.
function formatLabelStamp(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${day} ${time}`;
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
  return { data: bytesToBase64(out), widthBytes, width, height };
}

// Wait for Inter, but hard-bound the whole step so a slow/offline network can
// never hang label rendering — we fall back to a system sans (see FONT_STACK)
// and still print. Shared by both label designs.
async function loadLabelFonts() {
  try {
    await Promise.race([
      (async () => {
        await loadInterFonts();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      })(),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch { /* fall back to system sans */ }
}

// ============================================================ GtradeA label
// The approved GtradeA design (frontend/public/Images/newbarcode80120.svg). Its
// fixed artwork — mark, fragile panel, the four rules, the "Shelf No:" /
// "Order Included Inside" / "Order No:" / "Tracking No:" wording, "HANDLE WITH
// CARE", "www.gtradea.com", the shipment chip — is drawn straight from the
// design's own vector paths (see gtradeaLabelArt.js), so it is exact by
// construction rather than retyped as canvas coordinates. Only the values that
// change per box are set as live text.
//
// The artboard IS the label: 800 x 1200 units is 80 x 120 mm at 10 units per mm,
// so it maps onto the 640 x 960 dot bitmap by a flat 0.8 with nothing left over.
// That is why there is no art direction here any more — no shift across the
// stock, no group nudges, no seam to open up. Everything is where the designer
// put it.
// Values below are ARTBOARD units: 1 unit = 0.1 mm = 0.8 printer dots.

// One transform maps the whole artboard onto the label stock: the largest
// uniform scale that fits, centred. Uniform, never stretched — squashing it
// would show up immediately on the round mark.
function artTransform() {
  const scale = Math.min(CANVAS_W / ART_W, CANVAS_H / ART_H);
  return {
    scale,
    dx: (CANVAS_W - ART_W * scale) / 2,
    dy: (CANVAS_H - ART_H * scale) / 2,
  };
}

// Two parts of the design are drawn LARGER than the artboard sets them: the
// gtradea mark and the shelf block are what someone picks a box out by from
// across the aisle, and at the design's size they were the quietest things on a
// label that had grown a third. Each is scaled about an ANCHOR rather than its
// own centre, so it grows into stock that is free:
//   logo  - anchored top-left, so it grows down and right into the gap above the
//           barcode and never crosses the trim.
//   shelf - anchored top-RIGHT, so it grows LEFT. Anchoring it left instead would
//           push a long shelf code (the block is set flush left, and the design's
//           own value already ends 26 units off the trim) straight off the label.
// The scale is deliberately modest: these sit beside artwork that is NOT scaled,
// and the design's proportions have to survive.
const ART_ZOOM = {
  logo:  { scale: 1.15, x: 45, y: 36 },
  shelf: { scale: 1.15, x: 774, y: 56 },
};

// Scale a tagged group about its anchor. The caller has already established the
// artboard coordinate space, so this is a plain transform on top of it.
function applyZoom(ctx, group) {
  const z = group && ART_ZOOM[group];
  if (!z) return;
  ctx.translate(z.x, z.y);
  ctx.scale(z.scale, z.scale);
  ctx.translate(-z.x, -z.y);
}

// Fixed artwork, painted in the design's order. Fills collapse to pure black or
// pure white: the stock is monochrome thermal, and the glass icon is knocked
// OUT of the fragile panel, so its white has to survive as white.
function drawLabelArt(ctx, { scale, dx, dy }, listDy = 0) {
  for (const el of GTRADEA_LABEL_ART) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(scale, scale);
    // The "Order Included Inside" caption is the one piece of artwork that moves:
    // it heads the list below it, so it travels with it (see listLayout).
    if (el.group === "list" && listDy) ctx.translate(0, listDy);
    applyZoom(ctx, el.group);
    const f = String(el.fill || "").toLowerCase();
    ctx.fillStyle = f === "white" || f === "#ffffff" || f === "#fff" ? "#FFFFFF" : "#000000";
    if (el.rect) ctx.fillRect(el.rect[0], el.rect[1], el.rect[2], el.rect[3]);
    else ctx.fill(new Path2D(el.d)); // nonzero winding — matches the source SVG
    ctx.restore();
  }
}

// The values that change per box, measured off the design file. `x` is the ink's
// left edge and `top`/`bottom` its ink box, all in artboard coordinates.
//
// `ref` is the exact string the designer set, and it alone decides the type
// size. Sizing from the live value instead would make the type jump about —
// "July 30" has a descender and "March 4" doesn't, so the same field would come
// out at two different sizes on two different days.
//
// `right` is the hard edge the text may not cross (the next element, or the
// rules' right edge at 566). `center` centres the field on that x instead of
// setting it flush left.
const GT_FIELDS = {
  shelf:    { x: 600.6, top: 85.4,   bottom: 109.5,  right: 780, weight: "700", ref: "GT-01-003", group: "shelf" },
  // ref is a real gtradea product id — the id this field actually prints, and
  // the one the China Operations table lists the parcel under. Caps + digits of
  // the same length with no descender, so the ink box — and therefore the type
  // size and baseline derived from it — is stable across every id that prints
  // here. Centred on the BARCODE BOX, so the number sits under the bars.
  item:     { x: 154.2, top: 485.3,  bottom: 517.7,  right: 566, weight: "700", ref: "GTI-100119", center: 265.5 },
  order:    { x: 82.7,  top: 849,    bottom: 874,    right: 566, weight: "700", ref: "ORD-20260730-195740" },
  tracking: { x: 82.6,  top: 968,    bottom: 993,    right: 566, weight: "700", ref: "435291915403962" },
  stamp:    { x: 45.9,  top: 1117,   bottom: 1138.7, right: 590, weight: "400", ref: "July 30, 2026 05:48 PM" },
  mode:     { x: 627.8, top: 1093.3, bottom: 1118,   right: 765, weight: "700", ref: "VIA AIR", center: 688.5, ink: "#FFFFFF" },
};

// Ink height of `text` at `px` — what the design's bounding boxes actually
// measure, as opposed to the em size, which no two typefaces agree on.
function inkHeight(ctx, text, px, weight) {
  ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  const m = ctx.measureText(text);
  return m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
}

// Set one field. Ink height scales linearly with the type size, so measuring the
// reference string once at 100px gives the exact size in a single step. The
// BASELINE is then fixed for the field; if the live value is too long for its
// slot the size comes down but the baseline stays put, so a long tracking number
// still sits on the same line as a short one.
function drawField(ctx, field, text, t) {
  if (!text) return;
  const target = field.bottom - field.top;
  let px = (100 * target) / inkHeight(ctx, field.ref, 100, field.weight);
  ctx.font = `${field.weight} ${px}px ${FONT_STACK}`;
  const baseline = field.top + ctx.measureText(field.ref).actualBoundingBoxAscent;

  const room = field.right - field.x;
  let w = ctx.measureText(text).width;
  if (w > room) {
    px *= room / w;
    ctx.font = `${field.weight} ${px}px ${FONT_STACK}`;
    w = ctx.measureText(text).width;
  }

  ctx.fillStyle = field.ink || "#000000";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const x = field.center != null ? field.center - w / 2 : field.x;
  ctx.save();
  ctx.translate(t.dx, t.dy);
  ctx.scale(t.scale, t.scale);
  applyZoom(ctx, field.group); // the shelf code grows with the caption above it
  ctx.fillText(text, x, baseline);
  ctx.restore();
}

// The design's placeholder barcode image is replaced by a real Code-128 of the
// item code, generated at printer resolution. It is drawn 1:1 at a fixed
// whole-module scale so bars land on dot boundaries and scan.
//
// The scale is pinned rather than chosen per id: it used to try 4, then 3, then
// 2, taking the first that fit, which made the barcode a different SIZE for
// different ids — and because bwip-js multiplies bar height by the scale too,
// dropping a scale shrank the bars vertically as well. Two boxes side by side
// carried visibly different barcodes.
//
// 3 is the pin. A 10-character id comes to 381 dots there, a little over the
// design's own 441-unit box (353 dots), so the bars are centred on that box and
// allowed to run wider than it rather than being squashed into it: the design
// leaves 64 units of clear stock before the fragile panel, and even at 381 dots
// there is ~46 units (4.6 mm) of quiet zone left — well over the 10 modules
// Code-128 asks for. GT_BARCODE_MAX_W is the backstop for an id longer than the
// design ever anticipated; past that the bars do get squashed.
const GT_BARCODE_BOX = { x: 45, y: 215, w: 441, h: 258 };
const GT_BARCODE_SCALE = 3;
const GT_BARCODE_MAX_W = 510; // artboard units of clear stock (20..530)

function drawLabelBarcode(ctx, code, t) {
  if (!code) return;
  const boxH = GT_BARCODE_BOX.h * t.scale;
  // bwip-js takes bar height in mm at 72dpi, then multiplies by the scale —
  // solve it back (barMm) so the bars come out the height of the design's box.
  const bc = shipmentBarcodeCanvas(code, GT_BARCODE_SCALE, barMm(boxH, GT_BARCODE_SCALE));
  const w = Math.min(bc.width, GT_BARCODE_MAX_W * t.scale);
  const cx = t.dx + (GT_BARCODE_BOX.x + GT_BARCODE_BOX.w / 2) * t.scale;
  const y = t.dy + GT_BARCODE_BOX.y * t.scale + (boxH - bc.height) / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bc, Math.round(cx - w / 2), Math.round(y), w, bc.height);
  ctx.imageSmoothingEnabled = true;
}

// -------------------------------------------------- "Order Included Inside"
// What is in the parcel, listed under the design's "Order Included Inside"
// caption (the caption itself is fixed artwork).
//
// A supplier bags several 1688 lines under ONE tracking number, and the
// "Order No:" block below can only name one of them, so the box's own label was
// the one place that could not say what was actually inside it. EVERY id is
// listed here, the one printed above the bars included: someone holding the box
// has to be able to check the whole contents off the label, and a list that
// quietly leaves out the id shown above reads as "two things" in a bag of three.
// A parcel with one line lists that one id, so the block reads the same way on
// every box.
//
// Set as the design has it: comma-separated, wrapped over as many rows as the
// band holds, and with the SHARED PREFIX written once — "GTI-100119, 100210,
// 100212" rather than repeating "GTI-" on every one of them.
const GT_LIST = {
  x: 82.7,          // the left margin the captions and values are set on
  right: 566,       // the rules' right edge
  bandTop: 623,     // clear stock starts under the rule above
  bandBottom: 787,  // ... and ends at the rule below
  bandPad: 8,       // never crowd either rule
  captionTop: 648,  // where the design sets the caption, and what dy is measured from
  captionInk: 22,   // its ink height
  captionGap: 18,   // caption ink bottom -> first row's ink top, from the design
  ink: 30,          // the design's row ink height (a comma descends below the digits)
  inkMin: 15,       // never set smaller: list fewer ids and count the rest
  pitch: 40 / 30,   // row pitch as a multiple of the ink height, from the design
  firstRow: 4,      // ids on the first row — it carries the one id set in full
  nextRow: 5,       // ... and on every row after it, which are bare numbers
  ref: "GTI-100119, 100210, 100212", // sizes every row, so they cannot jump about
};

// The ids to list, with the prefix they share written once.
//
// A prefix is only collapsed when EVERY id carries it, and only the leading
// non-digit run counts — so "GTI-100119, GTI-100210" prints as
// "GTI-100119, 100210" while a mixed bag stays spelled out in full. The first id
// always keeps its prefix, so the list still reads as ids rather than as a row
// of bare numbers.
function includedIds(item) {
  const ids = [...new Set(parcelProductIds(item).filter(Boolean).map((c) => String(c).trim()))];
  if (ids.length < 2) return ids;
  const prefix = (ids[0].match(/^\D+/) || [])[0];
  if (!prefix || !ids.every((c) => c.startsWith(prefix) && c.length > prefix.length)) return ids;
  return [ids[0], ...ids.slice(1).map((c) => c.slice(prefix.length))];
}

// Rows of a FIXED number of ids, comma-separated: four on the first row and five
// on every row after it.
//
// Fixed rather than "as many as fit the width" because a parcel of two or three
// then always sits on one line with nothing hanging under it, and a bigger one
// breaks in the same place every time, so two labels side by side read the same
// way. Four on the first row and five after because only the FIRST id is set in
// full ("GTI-100215") — every one after it is the bare number, so the later rows
// hold one more in the same width. A wrapped row keeps no trailing comma; the
// break carries it, which is how the design sets it.
function listRows(ids) {
  const rows = [];
  for (let i = 0; i < ids.length; ) {
    const take = rows.length ? GT_LIST.nextRow : GT_LIST.firstRow;
    rows.push(ids.slice(i, i + take).join(", "));
    i += take;
  }
  return rows;
}

// Work out the rows, their type size, and how far the whole block sits from the
// design's own position — measured once and used by BOTH the artwork (the
// caption is tagged "list", so it travels with the rows) and drawIncludedList.
//
// The block is CENTRED in the band between the two rules. The designer drew it
// with two rows of ids, which fills that band almost exactly; a parcel with one
// row would otherwise leave all of the leftover stock in one gap under the
// value, which reads as a mistake rather than as spacing. Centring reproduces
// the design at two rows (it comes out 2 units off what was drawn) and keeps a
// one-row and a four-row block looking equally deliberate.
function listLayout(ctx, item) {
  const ids = includedIds(item);
  if (!ids.length) return null;

  const room = GT_LIST.right - GT_LIST.x;
  const band = GT_LIST.bandBottom - GT_LIST.bandTop - 2 * GT_LIST.bandPad;
  const pxFor = (v) => (100 * v) / inkHeight(ctx, GT_LIST.ref, 100, "700");
  const blockHeight = (n, v) =>
    GT_LIST.captionInk + GT_LIST.captionGap + v * ((n - 1) * GT_LIST.pitch + 1);
  // ONE size for every row, so the list reads as one block: the size has to suit
  // the widest row and the number of rows at once.
  const fits = (rows, v) => {
    if (blockHeight(rows.length, v) > band) return false;
    ctx.font = `700 ${pxFor(v)}px ${FONT_STACK}`;
    return rows.every((row) => ctx.measureText(row).width <= room);
  };

  // Shrink the type before dropping anything; only once the rows would be too
  // small to read does the list close with a count, so the number of things in
  // the box is still right even when the band cannot name them all.
  let rows = listRows(ids);
  let v = GT_LIST.ink;
  while (v > GT_LIST.inkMin && !fits(rows, v)) v -= 0.5;
  for (let keep = ids.length - 1; keep >= 1 && !fits(rows, v); keep -= 1) {
    rows = listRows([...ids.slice(0, keep), `+${ids.length - keep}`]);
  }

  const top = GT_LIST.bandTop + (GT_LIST.bandBottom - GT_LIST.bandTop - blockHeight(rows.length, v)) / 2;
  return { rows, v, px: pxFor(v), dy: top - GT_LIST.captionTop };
}

function drawIncludedList(ctx, t, layout) {
  if (!layout) return;
  const { rows, v, px, dy } = layout;
  const first = GT_LIST.captionTop + dy + GT_LIST.captionInk + GT_LIST.captionGap;

  ctx.save();
  ctx.translate(t.dx, t.dy);
  ctx.scale(t.scale, t.scale);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#000000";
  ctx.font = `700 ${px}px ${FONT_STACK}`;
  const ascent = ctx.measureText(GT_LIST.ref).actualBoundingBoxAscent;
  rows.forEach((row, i) => {
    ctx.fillText(row, GT_LIST.x, first + i * v * GT_LIST.pitch + ascent);
  });
  ctx.restore();
}

async function renderGtradeaLabel(item, shipmentMode = null) {
  await loadLabelFonts();

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const t = artTransform();
  // Measured before the artwork is painted: the list decides where its own
  // caption sits, and the caption is part of that artwork.
  const list = listLayout(ctx, item);
  drawLabelArt(ctx, t, list ? list.dy : 0);
  // The GOODS id — gtradea's own "Product ID" (GTI-100119), the id the China
  // Operations table lists this parcel under. It has to be the id on the
  // sticker: staff read the label and then look the box up in the portal, and
  // the box id minted here (box_code, GTP-000123) exists in this database only —
  // typing it into gtradea finds nothing.
  //
  // A parcel can hold several products, so this names ONE of them — the lowest,
  // picked stably (see goodsCode / item_code); what is in the bag is spelled out
  // by the list under the rule (see drawIncludedList). Scanning is unaffected
  // either way: the resolver matches every id a box has ever been printed with,
  // box ids included, so the GTP labels already on the shelves keep resolving.
  const code = goodsCode(item);
  drawLabelBarcode(ctx, code, t);

  // The shipment panel always reads one way or the other — it's part of the
  // fixed artwork, so it can never be left blank. Fall back to the mode already
  // recorded on the item when the print dialog didn't pick one.
  const mode = normalizeShipmentMode(shipmentMode) || normalizeShipmentMode(item.shipmentFrom) || "air";

  drawField(ctx, GT_FIELDS.shelf, item.rackId || "-", t);
  drawField(ctx, GT_FIELDS.item, code, t);
  drawIncludedList(ctx, t, list);
  drawField(ctx, GT_FIELDS.order, item.orderNumber || "-", t);
  drawField(ctx, GT_FIELDS.tracking, item.trackingNumber || "-", t);
  drawField(ctx, GT_FIELDS.stamp, formatLabelStamp(item.createdAt), t);
  drawField(ctx, GT_FIELDS.mode, mode === "land" ? "VIA LAND" : "VIA AIR", t);

  return { png: canvas.toDataURL("image/png"), mono: packMono(ctx, CANVAS_W, CANVAS_H) };
}

// ---------------------------------------------------------------- shipment label
// Render the full 80 x 120 mm shipment label. `shipmentMode` is the optional
// "air" | "land" pick from the print dialog — when set, a full-bleed
// "SHIPMENT: BY AIR/LAND" banner is drawn under the logo and the barcode band
// shrinks to make room for it. Returns { png, mono } where `mono` is the
// packed 1-bit bitmap payload for the print bridge / queue.
async function renderCellzenLabel(item, shipmentMode = null) {
  const mode = normalizeShipmentMode(shipmentMode);
  await loadLabelFonts();

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); // the white label stock

  // Logo (centred) — vector paths, so the canvas is never tainted.
  drawSvgCentered(ctx, CELLZEN_LOGO_SVG, LOGO_TOP, LOGO_W);

  // Optional shipment-mode banner under the logo.
  if (mode) drawShipmentModeBar(ctx, mode);

  // Barcode — fixed module scale (see BARCODE_SCALE), drawn at natural width
  // (1:1) so bars land on dot boundaries and scan cleanly. The scale and the bar
  // height are both constants now, so every label's barcode is the same size:
  // only the overall width follows the code's length, which is inherent to
  // Code-128 and is why the band is centred. With a shipment-mode banner
  // showing, the bars render shorter and start lower so the whole band still
  // clears the info lines below it.
  const barcodeTop = mode ? BARCODE_TOP_WITH_MODE : BARCODE_TOP;
  const barDots = mode ? BARCODE_BAR_DOTS_WITH_MODE : BARCODE_BAR_DOTS;
  const codeGap = mode ? CODE_GAP_WITH_MODE : CODE_GAP;
  const codeSize = mode ? CODE_SIZE_WITH_MODE : CODE_SIZE;
  // What the barcode encodes and the number under it reads: the gtradea item
  // code (GTI-100119) when the item has one, else the PR id it was labelled with
  // before, else the internal CZN goods number. Scanning this label anywhere in
  // the app resolves back to the item in all three cases.
  const code = goodsCode(item);
  const bc = shipmentBarcodeCanvas(code, BARCODE_SCALE, barMm(barDots, BARCODE_SCALE));
  let bw = bc.width;
  let bh = bc.height;
  if (bw > BARCODE_MAX_W) { bh = Math.round(bh * (BARCODE_MAX_W / bw)); bw = BARCODE_MAX_W; } // rare clamp
  const bcx = Math.round(CX - bw / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bc, bcx, barcodeTop, bw, bh);
  ctx.imageSmoothingEnabled = true;
  // The goods number under the bars — our own render: smaller + letter-spaced.
  drawTextAt(ctx, code, barcodeTop + bh + codeGap, codeSize, "500", CODE_SPACING, "top");

  // Info block — Shelf / Order / Tracking, all at ONE shared font size so they
  // read as a set. The longest line governs that size (every line then fits).
  // The order line is skipped entirely for an item with no 1688 order (cellzen),
  // rather than printing an empty "Order Number: -".
  const infoLines = [
    `Shelf Number: ${item.rackId || "-"}`,
    ...(item.orderNumber ? [`Order Number: ${item.orderNumber}`] : []),
    `Tracking Number: ${item.trackingNumber || "-"}`,
  ];
  const infoSize = infoLines.reduce(
    (smallest, line) => Math.min(smallest, fitFont(ctx, line, CONTENT_W, INFO_FONT_MAX, "600", LETTER_SPACING)),
    INFO_FONT_MAX
  );
  infoLines.forEach((line, i) => {
    drawTextAt(ctx, line, INFO_TOP_Y + i * INFO_LINE_GAP, infoSize, "600", LETTER_SPACING);
  });

  // Handling icons (centred) — vector paths, so the canvas is never tainted.
  drawSvgCentered(ctx, LABEL_ICONS_SVG, ICONS_TOP, ICONS_W);

  // Footer — all three lines share one size (the "If any doubts" line is the
  // longest and fixed-length, so it governs the shared size for all three).
  const footer1Text = `Recorded by: ${item.createdByName || "-"}`;
  const footer2Text = `If any doubts please inform ${SUPPORT_PHONE}`;
  const footer3Text = formatLabelDate(item.createdAt);
  const sFooter = fitFont(ctx, footer2Text, FOOTER_W, FOOTER_FONT_MAX, "500", LETTER_SPACING);
  drawTextAt(ctx, footer1Text, FOOTER1_Y, sFooter, "400", LETTER_SPACING);
  drawTextAt(ctx, footer2Text, FOOTER2_Y, sFooter, "500", LETTER_SPACING);
  drawTextAt(ctx, footer3Text, FOOTER3_Y, sFooter, "500", LETTER_SPACING);

  const png = canvas.toDataURL("image/png");
  const mono = packMono(ctx, CANVAS_W, CANVAS_H);
  return { png, mono };
}

// Which label a box gets: 1688 goods carry the GtradeA design (gtradea mark,
// PR number, www.gtradea.com); everything in the Cellzen section keeps the
// CELLZEN label it has always had. Same signature for both, so every caller —
// download, local bridge, cloud queue, browser fallback — is unchanged.
function renderShipmentLabel(item, shipmentMode = null) {
  return item?.source === "gtradea"
    ? renderGtradeaLabel(item, shipmentMode)
    : renderCellzenLabel(item, shipmentMode);
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
function printImageOnLabel(dataUrl, title, fit, copies = 1) {
  const n = Math.max(1, Math.min(parseInt(copies, 10) || 1, 20));
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const cleanup = () => setTimeout(() => iframe.remove(), 1500);
  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    // One label div per copy, each on its own page.
    const oneLabel = `<div class="label"><img src="${dataUrl}"></div>`;
    doc.write(
      `<!doctype html><html><head><title>${title || ""}</title><style>` +
        `@page { size: ${PAGE_W} ${PAGE_H}; margin: 0; }` +
        `html,body { margin:0; padding:0; }` +
        `.label { width:${PAGE_W}; height:${PAGE_H}; display:flex; align-items:center; justify-content:center; overflow:hidden; page-break-after: always; }` +
        `.label img { ${fit === "cover" ? `width:${PAGE_W};height:${PAGE_H};object-fit:contain;` : "max-width:100%;max-height:100%;"} }` +
        `</style></head><body>${oneLabel.repeat(n)}</body></html>`
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
export async function downloadItemLabel(item, shipmentMode = null) {
  const { png } = await renderShipmentLabel(item, shipmentMode);
  triggerDownload(png, `${goodsCode(item)}_label.png`);
}

export async function downloadRackLabel(rackId) {
  triggerDownload(renderRackLabelDataUrl(rackLabel(rackId)), `${rackId}_shelf.png`);
}

// Item print flow, in priority order:
//   1. Local bridge  — the warehouse PC prints the full-design bitmap instantly.
//   2. Cloud queue   — any other device (incl. phones) queues the SAME bitmap;
//                      the on-site agent prints it identically seconds later.
//   3. Browser print — last resort: print the rendered PNG on an 80 x 120 page.
// Returns { how: "local" | "queued" | "browser", full: boolean }. `full` is
// false when the canvas render failed (e.g. no Path2D support) and every path
// above fell back to a bare barcode — callers should surface that distinctly,
// since a barcode-only print looks identical to a successful one otherwise.
export async function printItemLabel(item, copies = 1, shipmentMode = null) {
  const n = Math.max(1, Math.min(parseInt(copies, 10) || 1, 20));
  let rendered = null;
  try {
    rendered = await renderShipmentLabel(item, shipmentMode);
  } catch (e) {
    // If this ever fires we drop to a plain barcode — log it so the cause is visible.
    console.error("Shipment label render failed, falling back to plain barcode:", e);
  }
  const bitmap = rendered ? rendered.mono : null;
  const full = Boolean(rendered);
  // The code travels with the job so the queue, the bridge's log, and the
  // barcode-only fallback all name the label by the same id the label prints.
  const code = goodsCode(item);

  if (await printViaBridge(code, "item", n, bitmap)) return { how: "local", full };
  try {
    await enqueuePrintJob(code, "item", n, bitmap);
    return { how: "queued", full };
  } catch {
    if (rendered) printImageOnLabel(rendered.png, code, "cover", n);
    else printImageOnLabel(barcodeDataUrl(code), code, undefined, n);
    return { how: "browser", full };
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
