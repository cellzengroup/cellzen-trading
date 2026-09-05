// Reads the goods ids out of a packing list this app exported — the 1688 panel's
// "Export" → .xlsx — so a shipment can be picked by handing the sheet back
// instead of hunting every line down in the table by hand.
//
// Only two of the sheet's columns matter here:
//   "Goods No."  one per LINE — the id printed on the box's label (GTI-100119).
//                This is what a shipment is picked by: one id, one line, so the
//                import selects exactly what the sheet lists and nothing else.
//   "Order ID"   one per SHIPMENT, merged down its group. Read only as a FALLBACK
//                for a line with no Goods No. — an order number names every line
//                of its order, so matching on it generally would tick goods that
//                were never on the list. See `orderFallbacks` below.
// Everything else on the sheet (photos, weights, amounts) is packing paperwork
// this never looks at.
//
// Deliberately tolerant about WHERE those columns are. The export writes its
// header on row 3 under a title band and a logo, ?images=0 shifts every column
// left, and a sheet that has been through a forwarder's hands has usually been
// re-saved, re-ordered or exported to CSV at least once. So the header row is
// searched for by name rather than assumed, and the billing report's "Product
// ID" is accepted as a goods column too — it holds the same ids.

// SheetJS, which is what this codebase already parses uploaded spreadsheets
// with — adminCreateInvoice / staffCreateInvoice both call XLSX.read on a file
// the user picked, down to the same `new Uint8Array(...)` below.
//
// It beats exceljs (also a dependency, and what WRITES this sheet server-side)
// for reading, measured on a real exported packing list: same ids out, but 16ms
// against 106ms, and `wb.xlsx.load` handles only .xlsx — .csv throws. SheetJS
// takes .xlsx, .xls, .xlsb, .ods and .csv through this one call, all verified
// against this parser in a browser build.
//
// NOTE: `import()` here does NOT make it lazy today. Vite bundles xlsx and
// exceljs into one `vendor-spreadsheet` chunk (see manualChunks in
// vite.config.js) which the invoice screens import statically, so index.html
// already preloads it. This stays a dynamic import because it keeps the parser
// out of WarehouseApp's static graph — the day those screens get route-split,
// the warehouse stops paying for it with no change here.
async function sheetJs() {
  return import("xlsx");
}

const cleanText = (v) => String(v ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
// Ids are matched case-insensitively against the table, so they are keyed
// uppercase on the way in — "gti-100119" typed into a re-saved sheet still ticks
// its row.
const idKey = (v) => cleanText(v).toUpperCase();

// Header names accepted for each column. `Goods No.` is what the packing list
// writes; `Product ID` is the billing report's name for the same id, and the two
// spellings without the dot cover a hand-retyped header.
const GOODS_HEADER = /^(goods\s*(no\.?|number|id)|product\s*id|item\s*code)$/i;
const ORDER_HEADER = /^order\s*(id|no\.?|number|#)?$/i;

// Cell values that are placeholders rather than ids. The export writes "-" into
// Order ID when gtradea gave the line no order number, and leaves Goods No.
// blank until the box is actually received — neither should be matched against.
const PLACEHOLDERS = new Set(["", "-", "--", "—", "–", "N/A", "NA", "NULL", "NONE"]);
const isPlaceholder = (key) => PLACEHOLDERS.has(key) || /^TOTAL\b/.test(key);

// The header row's position in `grid`, plus the two column indexes it puts the
// ids at. Searched over the first rows only: past that a match is far more
// likely to be a data cell that happens to read like a header than the header
// itself. Either column alone is enough — a sheet trimmed down to just its
// Goods No. column still imports.
function findHeader(grid) {
  const limit = Math.min(grid.length, 25);
  for (let r = 0; r < limit; r++) {
    const row = grid[r] || [];
    let goods = -1;
    let order = -1;
    for (let c = 0; c < row.length; c++) {
      const name = cleanText(row[c]);
      if (!name) continue;
      if (goods < 0 && GOODS_HEADER.test(name)) goods = c;
      else if (order < 0 && ORDER_HEADER.test(name)) order = c;
    }
    if (goods >= 0 || order >= 0) return { row: r, goods, order };
  }
  return null;
}

// Every id a packing list names, read out of `file` (.xlsx / .xls / .csv).
//
// Returns { goods, orders, orderFallbacks, sheet, rows }. `goods` is what should
// actually be matched on — one id per printed line. `orderFallbacks` is the
// subset of `orders` belonging to lines that carried NO Goods No., and is the
// only place an order number should be used as a matcher; `orders` is the full
// list, kept for callers that want to report on it.
//
// Throws when no sheet in the workbook carries either column, which is the one
// failure worth stopping on: it means the wrong file was picked, and every other
// outcome — ids that match nothing, a half-empty column — is something the
// caller reports rather than refuses.
export async function readPackingListIds(file) {
  const XLSX = await sheetJs();
  // type "array" means a byte ARRAY — a Uint8Array — not an ArrayBuffer. Handing
  // it the raw buffer doesn't throw: SheetJS's browser build falls through to
  // reading the bytes as text, and an .xlsx (a zip) then parses as a one-column
  // CSV whose first cell is "PK\x03\x04". Every column lookup after that misses
  // and the file reads as "not a packing list". The node build coerces it and
  // works, so this only ever breaks in the browser.
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });

  const goods = new Set();
  const orders = new Set();
  const orderFallbacks = new Set();
  let sheet = "";
  let rows = 0;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    // raw values, not the formatted text: a long order number that Excel has
    // decided is a number formats as "1.23457E+11" but stringifies in full.
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "", raw: true });
    const head = findHeader(grid);
    if (!head) continue;

    for (let r = head.row + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const g = head.goods >= 0 ? idKey(row[head.goods]) : "";
      const o = head.order >= 0 ? idKey(row[head.order]) : "";
      if (isPlaceholder(g) && isPlaceholder(o)) continue; // spacer or total row
      if (!isPlaceholder(g)) goods.add(g);
      if (!isPlaceholder(o)) {
        orders.add(o);
        // An Order ID names every line of its order, so matching on it selects
        // goods the sheet never listed. Only collect it as a matcher for a line
        // this sheet could NOT name a Goods No. for — a line that hadn't arrived
        // when the list was exported, whose box may have landed since. For a
        // normal packing list that set is empty and the import selects exactly
        // one row per printed line.
        if (isPlaceholder(g)) orderFallbacks.add(o);
      }
      rows += 1;
    }
    // First sheet that carries the columns wins — a workbook normally has only
    // "Packing List" in it, and merging a second sheet's ids into the same pick
    // would ship rows nobody looked at.
    if (goods.size || orders.size) {
      sheet = name;
      break;
    }
  }

  if (!sheet) {
    throw new Error('No "Goods No." or "Order ID" column found in that file — pick a packing list exported from this panel.');
  }
  return { goods: [...goods], orders: [...orders], orderFallbacks: [...orderFallbacks], sheet, rows };
}
