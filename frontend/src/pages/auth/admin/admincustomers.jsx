import React from "react";
import AdminPageShell from "./AdminPageShell";

const CUSTOMERS = [
  { name: "Nova Retail Group", type: "Customer", country: "United States", orders: "148" },
  { name: "Shenzhen Partner Hub", type: "Supplier", country: "China", orders: "96" },
  { name: "Atlas Cargo Team", type: "Logistics", country: "Germany", orders: "72" },
  { name: "Brightline Imports", type: "Customer", country: "Australia", orders: "61" },
];

export default function AdminCustomers() {
  return (
    <AdminPageShell activePage="Customers" title="Customers" eyebrow="Cellzen Customer Management">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="border border-[#E1E3EE] bg-[#412460] p-5 text-white">
          <p className="text-xs text-white/60">Total Customers</p>
          <p className="mt-3 text-3xl font-bold">2,417</p>
        </div>
        <div className="border border-[#E1E3EE] bg-white p-5">
          <p className="text-xs text-[#2D2D2D]/45">Suppliers</p>
          <p className="mt-3 text-3xl font-bold text-[#412460]">981</p>
        </div>
        <div className="border border-[#E1E3EE] bg-white p-5">
          <p className="text-xs text-[#2D2D2D]/45">Logistics Partners</p>
          <p className="mt-3 text-3xl font-bold text-[#B99353]">287</p>
        </div>
      </div>

      <div className="mt-4 border border-[#E1E3EE] bg-white p-5">
        <h2 className="text-lg font-semibold">Account Directory</h2>
        <div className="mt-5 grid gap-3">
          {CUSTOMERS.map((customer) => (
            <div key={customer.name} className="grid gap-3 border border-[#E1E3EE] p-4 text-sm md:grid-cols-[1fr_130px_160px_90px] md:items-center">
              <p className="font-semibold text-[#412460]">{customer.name}</p>
              <p className="text-[#B99353]">{customer.type}</p>
              <p className="text-[#2D2D2D]/55">{customer.country}</p>
              <p className="font-bold">{customer.orders} orders</p>
            </div>
          ))}
        </div>
      </div>
    </AdminPageShell>
  );
}
