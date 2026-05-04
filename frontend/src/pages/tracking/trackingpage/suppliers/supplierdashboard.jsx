import React, { useMemo } from "react";
import SupplierPortal from "./SupplierPortal";

function getSupplierUser() {
  try {
    return JSON.parse(sessionStorage.getItem("customer_user") || "null");
  } catch {
    return null;
  }
}

const TILES = [
  {
    title: "Quote Requests",
    body: "Review pending quotation requests from Cellzen clients.",
  },
  {
    title: "Product Catalog",
    body: "Update specifications, pricing tiers, and minimum order details.",
  },
  {
    title: "Inspection Notes",
    body: "Track sample reviews, third-party inspections, and packaging photos.",
  },
  {
    title: "Ready to Ship",
    body: "Mark goods as production-complete and ready for pickup.",
  },
];

export default function SupplierDashboard() {
  const user = useMemo(getSupplierUser, []);

  return (
    <SupplierPortal activePage="Dashboard">
      <div className="space-y-5">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-[#412460] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B99353]">Supplier Dashboard</p>
          <h2 className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">
            Supplier workspace{user?.firstName ? ` for ${user.firstName}` : ""}.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            Manage quotation requests, product details, inspection notes, and shipment readiness for Cellzen clients.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {TILES.map((tile) => (
            <div key={tile.title} className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
              <h3 className="text-sm font-bold text-[#412460]">{tile.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#2D2D2D]/55">{tile.body}</p>
            </div>
          ))}
        </div>
      </div>
    </SupplierPortal>
  );
}
