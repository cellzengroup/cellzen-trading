// Reads the approved GtradeA label design (frontend/public/Images/newbarcode80120.svg)
// and emits frontend/src/utils/gtradeaLabelArt.js containing only the FIXED
// artwork, verbatim, in the design's own 800x1200 coordinates.
//
//   node scripts/generate-label-art.cjs
//
// Re-run this whenever the design file changes — the art module is generated,
// never hand-edited, so the printed label can't drift from the design.
//
// The artboard is the label at 10 units per mm (80 x 120 mm), so it maps onto the
// 640 x 960 dot bitmap by a single uniform 0.8 and nothing needs nudging.
//
// Dropped on purpose: every element whose content changes per box (shelf code,
// the goods id under the bars, the orders included, order no, tracking no,
// timestamp, VIA AIR/LAND) plus the embedded raster barcode and the rounded grey
// backing rectangle — the backing is the sticker itself (thermal stock is white
// and the corners are die-cut), and a pasted-in barcode image would print
// blurry; we generate a real Code-128 at printer resolution.
//
// The DYNAMIC list below is by element index, so if the design gains or loses
// elements the indices must be rechecked against the new file before trusting
// the output.
const fs = require('fs');
const svg = fs.readFileSync('frontend/public/Images/newbarcode80120.svg', 'utf8');

// Element order in the file == paint order, and it is preserved below.
const DYNAMIC = new Set([1, 9, 10, 13, 15, 16, 17, 24, 25]);
const NOTES = {
  2: 'fragile panel (black)',
  3: 'gtradea mark', 4: 'gtradea mark', 5: 'gtradea mark',
  6: '"HANDLE WITH CARE" (rotated)',
  7: 'fragile glass icon (knocked out of the panel)',
  8: '"Shelf No:"',
  11: '"Order No:"',
  12: '"Order Included Inside"',
  14: '"Tracking No:"',
  18: 'rule under the tracking block', 19: 'rule under the order block',
  20: 'rule under the included-orders block', 21: 'rule under the barcode block',
  22: '"www.gtradea.com"',
  23: 'shipment-mode panel (black)',
};

// Elements warehouseLabels.js repositions or resizes after the fact. Tagging them
// here keeps them the design's own vector art — an exact match for the artwork
// around them — rather than being retyped as live text to move them.
//
//   list  - the "Order Included Inside" caption, which travels with the list of
//           ids under it: a parcel with one row of ids makes a shorter block than
//           the design's two, and it is centred in the band rather than leaving
//           all the leftover stock in one gap under the value.
//   logo  - the gtradea mark, and
//   shelf - the "Shelf No:" caption, both drawn larger than the artboard sets
//           them (see ART_ZOOM) — they are what someone identifies a box by from
//           across the room.
const GROUPS = {
  3: 'logo', 4: 'logo', 5: 'logo',  // the gtradea mark
  8: 'shelf',                       // the "Shelf No:" caption
  12: 'list',                       // the "Order Included Inside" caption
};

const parts = [];
const tagRe = /<(path|rect)\b([^>]*?)\/?>/g;
let m, n = 0;
while ((m = tagRe.exec(svg))) {
  const [, tag, attrs] = m;
  n += 1;
  if (DYNAMIC.has(n)) continue;
  const fill = (attrs.match(/fill="([^"]+)"/) || [])[1] || '#000000';
  const note = NOTES[n] ? `  // ${NOTES[n]}` : '';
  const group = GROUPS[n] ? `, group: "${GROUPS[n]}"` : '';
  if (tag === 'rect') {
    const g = (k) => parseFloat((attrs.match(new RegExp(k + '="([^"]+)"')) || [])[1] || 0);
    parts.push(`  { rect: [${g('x')}, ${g('y')}, ${g('width')}, ${g('height')}], fill: "${fill}"${group} },${note}`);
  } else {
    const d = (attrs.match(/\bd="([^"]+)"/) || [])[1];
    if (!d) continue;
    parts.push(`  { d: "${d}", fill: "${fill}"${group} },${note}`);
  }
}

const header = `// The fixed artwork of the approved GtradeA shipment label, GENERATED from the
// design file at frontend/public/Images/newbarcode80120.svg — do not hand-edit.
// Re-run scripts/generate-label-art.cjs if the design changes.
//
// Coordinates are the design's OWN 800 x 1200 artboard, which is the 80 x 120 mm
// label at 10 units per mm; warehouseLabels.js scales the whole thing onto the
// stock in one transform (a flat 0.8 at 203 dpi), so every position here is
// exactly what the designer drew.
//
// Only the FIXED parts live here. The shelf code, the goods id under the bars,
// the orders included in the parcel, order no, tracking no, timestamp and the
// VIA AIR/LAND wording change per box and are drawn as live text; the design's
// placeholder barcode image is replaced by a real Code-128 of the goods id,
// generated at printer resolution so it scans.
export const ART_W = 800;
export const ART_H = 1200;

// Painted in order. \`d\` is an SVG path; \`rect\` is [x, y, w, h]; \`group\` ties an
// element to a layout nudge in warehouseLabels.js.
export const GTRADEA_LABEL_ART = [
`;

fs.writeFileSync('frontend/src/utils/gtradeaLabelArt.js', header + parts.join('\n') + '\n];\n');
console.log(`wrote ${parts.length} fixed elements -> frontend/src/utils/gtradeaLabelArt.js`);
console.log(`file size: ${(fs.statSync('frontend/src/utils/gtradeaLabelArt.js').size / 1024).toFixed(1)} KB`);
