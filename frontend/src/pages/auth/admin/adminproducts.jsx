import React from "react";
import AdminPageShell from "./AdminPageShell";

const PRODUCTS = [
  { name: "Consumer Electronics", count: "2,487", growth: "+18%", color: "bg-[#412460]" },
  { name: "Mobile Accessories", count: "1,892", growth: "+12%", color: "bg-[#B99353]" },
  { name: "Home Appliances", count: "1,463", growth: "+8%", color: "bg-[#6B5BD6]" },
  { name: "Industrial Supplies", count: "984", growth: "+5%", color: "bg-[#E05353]" },
];

export default function AdminProducts() {
  return (
    <AdminPageShell activePage="Products" title="Products" eyebrow="Cellzen Product Management">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="border border-[#E1E3EE] bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Product Categories</h2>
              <p className="text-xs text-[#2D2D2D]/45">Manage categories and sourcing records.</p>
            </div>
            <button className="bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]">
              Add Product
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {PRODUCTS.map((product) => (
              <div key={product.name} className="border border-[#E1E3EE] p-5">
                <div className={`h-2 w-16 ${product.color}`} />
                <p className="mt-5 text-sm font-semibold text-[#2D2D2D]">{product.name}</p>
                <div className="mt-4 flex items-end justify-between">
                  <p className="text-3xl font-bold text-[#412460]">{product.count}</p>
                  <span className="bg-[#E9F8ED] px-2 py-1 text-[10px] font-semibold text-[#1C9B55]">{product.growth}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#E1E3EE] bg-white p-5">
          <h2 className="text-lg font-semibold">Product Statistic</h2>
          <p className="text-xs text-[#2D2D2D]/45">Current product performance.</p>
          <div className="mt-8 flex items-center justify-center">
            <div className="relative h-52 w-52">
              <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
                <circle cx="90" cy="90" r="72" fill="none" stroke="#ECEEF5" strokeWidth="13" />
                <circle cx="90" cy="90" r="72" fill="none" stroke="#412460" strokeWidth="13" strokeDasharray="310 452" />
                <circle cx="90" cy="90" r="48" fill="none" stroke="#ECEEF5" strokeWidth="13" />
                <circle cx="90" cy="90" r="48" fill="none" stroke="#B99353" strokeWidth="13" strokeDasharray="180 302" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold">6,826</p>
                <p className="text-[10px] text-[#2D2D2D]/45">Active Products</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
