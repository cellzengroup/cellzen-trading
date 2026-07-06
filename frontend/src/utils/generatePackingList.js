// Packing List exporters — Excel (ExcelJS) and PDF (jsPDF + autotable).
// Columns: S.N | MARKA | Product Name | Quantity Per Carton | Weight | Size | CBM
// Weight/Size/CBM are the CARTON (packed) values and are shown once per carton.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

const HEADERS = ["S.N", "MARKA", "Product Name", "Qty / Carton", "Weight (kg)", "Size (L×W×H cm)", "CBM"];

const num = (v) => (v === 0 || v ? Number(v) : 0);
const sizeStr = (c) => {
  // Prefer the single typed size string (e.g. "50x60x70"); fall back to any
  // older L/W/H fields for cartons saved before the single-size change.
  if (c.size) return String(c.size);
  if (c.length || c.width || c.height) return `${c.length || "-"}×${c.width || "-"}×${c.height || "-"}`;
  return "";
};

// Flatten cartons → table rows. Carton-level values appear only on the carton's
// first product row (so the carton's Weight/Size/CBM aren't repeated per item).
function buildRows(packing) {
  const cartons = packing.cartons || [];
  const rows = [];
  let totalQty = 0;
  let totalWeight = 0;
  let totalCbm = 0;

  cartons.forEach((c, i) => {
    const items = (c.items && c.items.length) ? c.items : [{ productName: "", quantity: "" }];
    totalWeight += num(c.weightKg);
    totalCbm += num(c.cbm);
    items.forEach((it, idx) => {
      totalQty += num(it.quantity);
      rows.push([
        idx === 0 ? String(i + 1) : "",
        idx === 0 ? (c.marka || packing.marka || "") : "",
        it.productName || "",
        it.quantity ?? "",
        idx === 0 ? (num(c.weightKg) || "") : "",
        idx === 0 ? sizeStr(c) : "",
        idx === 0 ? (num(c.cbm) ? num(c.cbm).toFixed(4) : "") : "",
      ]);
    });
  });

  return {
    rows,
    totals: {
      cartons: cartons.length,
      qty: totalQty,
      weight: Math.round(totalWeight * 1000) / 1000,
      cbm: Math.round(totalCbm * 10000) / 10000,
    },
  };
}

export function generatePackingListPDF(packing) {
  const { rows, totals } = buildRows(packing);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const purple = [65, 36, 96];

  doc.setFontSize(16);
  doc.setTextColor(...purple);
  doc.text("PACKING LIST", 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(45, 45, 45);
  const meta = [
    `Packing No: ${packing.packingNumber || "-"}`,
    packing.reference ? `Ref/PI: ${packing.reference}` : "",
    packing.customerName ? `Customer: ${packing.customerName}` : "",
    `Date: ${new Date().toLocaleDateString()}`,
  ].filter(Boolean);
  doc.text(meta.join("    |    "), 14, 23);

  autoTable(doc, {
    head: [HEADERS],
    body: rows,
    foot: [["", "TOTAL", `${totals.cartons} carton(s)`, totals.qty, totals.weight, "", totals.cbm.toFixed(4)]],
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
    headStyles: { fillColor: purple, textColor: 255, halign: "center" },
    footStyles: { fillColor: [229, 225, 218], textColor: [45, 45, 45], fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 14 },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
    },
  });

  doc.save(`${packing.packingNumber || "packing-list"}.pdf`);
}

export async function generatePackingListExcel(packing) {
  const { rows, totals } = buildRows(packing);
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Packing List");

  sheet.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `PACKING LIST  —  ${packing.packingNumber || ""}`;
  titleCell.font = { size: 14, bold: true, color: { argb: "FF412460" } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, HEADERS.length);
  sheet.getCell(2, 1).value = [
    packing.reference ? `Ref/PI: ${packing.reference}` : "",
    packing.customerName ? `Customer: ${packing.customerName}` : "",
    `Date: ${new Date().toLocaleDateString()}`,
  ].filter(Boolean).join("    |    ");
  sheet.getCell(2, 1).font = { size: 10, color: { argb: "FF2D2D2D" } };

  const headerRow = sheet.getRow(4);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF412460" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  headerRow.height = 22;

  const widths = [8, 16, 34, 12, 12, 20, 10];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  let r = 5;
  for (const row of rows) {
    const xlRow = sheet.getRow(r);
    row.forEach((val, i) => {
      const cell = xlRow.getCell(i + 1);
      cell.value = val === "" ? null : val;
      cell.alignment = { horizontal: i === 2 ? "left" : "center", vertical: "middle" };
      cell.border = { top: { style: "thin", color: { argb: "FFE1E3EE" } }, bottom: { style: "thin", color: { argb: "FFE1E3EE" } }, left: { style: "thin", color: { argb: "FFE1E3EE" } }, right: { style: "thin", color: { argb: "FFE1E3EE" } } };
    });
    r += 1;
  }

  const footRow = sheet.getRow(r);
  const footVals = ["", "TOTAL", `${totals.cartons} carton(s)`, totals.qty, totals.weight, "", totals.cbm.toFixed(4)];
  footVals.forEach((val, i) => {
    const cell = footRow.getCell(i + 1);
    cell.value = val === "" ? null : val;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E1DA" } };
    cell.alignment = { horizontal: i === 2 ? "left" : "center", vertical: "middle" };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${packing.packingNumber || "packing-list"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
