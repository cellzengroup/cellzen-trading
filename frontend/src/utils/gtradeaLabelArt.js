// The fixed artwork of the approved GtradeA shipment label, GENERATED from the
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

// Painted in order. `d` is an SVG path; `rect` is [x, y, w, h]; `group` ties an
// element to a layout nudge in warehouseLabels.js.
export const GTRADEA_LABEL_ART = [
  { rect: [550, 206, 221, 297], fill: "black" },  // fragile panel (black)
  { d: "M120.363 86.8862V111.992C112.371 120.074 101.335 125.073 89.1408 125.073C78.7861 125.073 69.2633 121.467 61.7349 115.422C62.8989 115.52 64.0899 115.572 65.2792 115.572C83.9057 115.572 99.8182 103.67 106.156 86.8862H120.362H120.363Z", fill: "#231F20", group: "logo" },  // gtradea mark
  { d: "M142.779 68.1172V124.958H120.363V86.8862H82.9883L96.8526 68.144L96.87 68.1172H142.779Z", fill: "#231F20", group: "logo" },  // gtradea mark
  { d: "M120.442 36V36.2574L114.491 44.3044L108.398 52.5378L96.8527 68.1439C73.5779 68.8435 54.8818 86.3287 54.401 107.97C48.5096 100.402 45 90.8575 45 80.4798C45 57.3666 62.4102 38.3671 84.6855 36.2132C86.0773 36.0711 87.4944 36 88.9305 36H120.441H120.442Z", fill: "#231F20", group: "logo" },  // gtradea mark
  { d: "M650.631 261.508L726.029 261.25L725.162 319.445C724.848 340.624 702.002 355.945 676.152 361.594L676.436 432.366C693.41 436.537 710.653 436.771 725.237 447.982C684.4 448.733 646.119 448.794 605.163 447.884C619.641 437.079 636.392 435.959 654.651 432.944L654.382 361.938C633.642 356.77 610.721 346.371 607.015 329.241C602.174 306.807 604.176 284.619 603.444 261.447L633.687 261.373C636.929 261.373 641.561 267.575 641.442 268.757L622.57 270.233L641.188 291.449L622.645 293.024C630.743 301.22 637.318 307.545 646.462 315.384C645.312 309.834 643.295 306.635 640.306 301.294L661.404 298.747L643.519 277.949L661.36 275.414L650.616 261.521L650.631 261.508Z", fill: "white" },  // fragile glass icon (knocked out of the panel)
  { rect: [45, 1017, 521, 2], fill: "black" },  // rule under the tracking block
  { rect: [45, 901, 521, 2], fill: "black" },  // rule under the order block
  { rect: [45, 787, 521, 2], fill: "black" },  // rule under the included-orders block
  { rect: [45, 621, 521, 2], fill: "black" },  // rule under the barcode block
  { rect: [606, 1075, 165, 61], fill: "black" },  // shipment-mode panel (black)
];
