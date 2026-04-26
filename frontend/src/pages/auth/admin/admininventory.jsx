import React from "react";
import AdminPageShell from "./AdminPageShell";

const STOCK_ITEMS = [
  { sku: "CZ-PH-1208", item: "Smartphone Display Module", stock: "1,248", status: "In Stock", warehouse: "Guangzhou" },
  { sku: "CZ-BT-0911", item: "Lithium Battery Pack", stock: "684", status: "Low Stock", warehouse: "Shenzhen" },
  { sku: "CZ-CA-4410", item: "Charging Cable Set", stock: "3,920", status: "In Stock", warehouse: "Yiwu" },
  { sku: "CZ-SP-2088", item: "Bluetooth Speaker Unit", stock: "312", status: "Review", warehouse: "Ningbo" },
];

export default function AdminInventory() {
  const metrics = [
    { label: "Total SKUs", value: "8,421" },
    { label: "Warehouses", value: "6" },
    { label: "Low Stock", value: "38" },
  ];

  return (
    <AdminPageShell activePage="Inventory" title="Inventory" eyebrow="Cellzen Stock Control">
      <div className="grid gap-4 lg:grid-cols-3">
        {metrics.map((metric) => {
          return (
            <div key={metric.label} className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2D2D2D]/40">{metric.label}</p>
              <p className="mt-3 text-3xl font-bold text-[#412460]">{metric.value}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
        <h2 className="text-lg font-semibold">Inventory List</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#2A1740] text-xs uppercase tracking-[0.16em] text-white/70">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Warehouse</th>
              </tr>
            </thead>
            <tbody>
              {STOCK_ITEMS.map((item) => (
                <tr key={item.sku} className="border-b border-[#E1E3EE] last:border-0">
                  <td className="px-4 py-4 font-semibold text-[#412460]">{item.sku}</td>
                  <td className="px-4 py-4">{item.item}</td>
                  <td className="px-4 py-4 font-semibold">{item.stock}</td>
                  <td className="px-4 py-4 text-[#B99353]">{item.status}</td>
                  <td className="px-4 py-4 text-[#2D2D2D]/55">{item.warehouse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageShell>
  );
}
