// Reads the approved GtradeA label design (frontend/public/Images/barcode.svg)
// and emits frontend/src/utils/gtradeaLabelArt.js containing only the FIXED
// artwork, verbatim, in the design's own 569x726 coordinates.
//
//   node scripts/generate-label-art.cjs
//
// Re-run this whenever the design file changes — the art module is generated,
// never hand-edited, so the printed label can't drift from the design.
//
// Dropped on purpose: every element whose content changes per box (shelf code,
// PR number, order no, tracking no, timestamp, VIA AIR/LAND) plus the embedded
// raster barcode — those are drawn at print time instead. A pasted-in barcode
// image would print blurry; we generate a real Code-128 at printer resolution.
//
// The DYNAMIC list below is by element index, so if the design gains or loses
// elements the indices must be rechecked against the new file before trusting
// the output.
const fs = require('fs');
const svg = fs.readFileSync('frontend/public/Images/barcode.svg', 'utf8');

// Element order in the file == paint order, and it is preserved below.
// Indices refer to the bbox listing (see _bbox.cjs output).
const DYNAMIC = new Set([6, 9, 10, 13, 18, 20, 21]);
const NOTES = {
  1: 'fragile panel (black)',
  2: 'gtradea mark', 3: 'gtradea mark', 4: 'gtradea mark',
  5: '"Order No:"',
  7: '"Tracking No:"',
  8: '"HANDLE WITH CARE" (rotated)',
  11: 'fragile glass icon (knocked out of the panel)',
  12: '"Shelf No:"',
  14: 'rule under the tracking block', 15: 'rule under the order block', 16: 'rule under the barcode block',
  17: '"www.gtradea.com"',
  19: 'shipment-mode panel (black)',
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
  if (tag === 'rect') {
    const g = (k) => parseFloat((attrs.match(new RegExp(k + '="([^"]+)"')) || [])[1] || 0);
    parts.push(`  { rect: [${g('x')}, ${g('y')}, ${g('width')}, ${g('height')}], fill: "${fill}" },${note}`);
  } else {
    const d = (attrs.match(/\bd="([^"]+)"/) || [])[1];
    if (!d) continue;
    parts.push(`  { d: "${d}", fill: "${fill}" },${note}`);
  }
}

const header = `// The fixed artwork of the approved GtradeA shipment label, GENERATED from the
// design file at frontend/public/Images/barcode.svg — do not hand-edit. Re-run
// the generator if the design changes.
//
// Coordinates are the design's OWN 569 x 726 artboard; warehouseLabels.js scales
// the whole thing onto the label stock in one transform, so every position here
// is exactly what the designer drew.
//
// Only the FIXED parts live here. The shelf code, PR number, order no, tracking
// no, timestamp and the VIA AIR/LAND wording change per box and are drawn as
// live text; the design's placeholder barcode image is replaced by a real
// Code-128 of the PR number, generated at printer resolution so it scans.
export const ART_W = 569;
export const ART_H = 726;

// Painted in order. \`d\` is an SVG path; \`rect\` is [x, y, w, h].
export const GTRADEA_LABEL_ART = [
`;

fs.writeFileSync('frontend/src/utils/gtradeaLabelArt.js', header + parts.join('\n') + '\n];\n');
console.log(`wrote ${parts.length} fixed elements -> frontend/src/utils/gtradeaLabelArt.js`);
console.log(`file size: ${(fs.statSync('frontend/src/utils/gtradeaLabelArt.js').size / 1024).toFixed(1)} KB`);
