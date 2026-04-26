import React from "react";
import { Link } from "react-router-dom";

function getDistributorUser() {
  try {
    return JSON.parse(sessionStorage.getItem("customer_user") || "null");
  } catch {
    return null;
  }
}

export default function DistributorDashboard() {
  const user = getDistributorUser();

  return (
    <section className="min-h-screen bg-[#F6F2EA] px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between border-b border-[#412460]/10 pb-6">
          <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-12 w-auto" />
          <Link to="/login" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#412460] hover:text-[#B99353]">
            Login
          </Link>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#B99353]">Distributor Dashboard</p>
            <h1 className="mt-4 premium-font-galdgderbold text-4xl leading-tight text-[#412460] sm:text-5xl">
              Distributor workspace{user?.firstName ? ` for ${user.firstName}` : ""}.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[#2D2D2D]/60">
              Manage regional orders, allocation requests, shipment batches, and partner delivery updates.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {["Regional Orders", "Stock Allocation", "Shipment Batches", "Delivery Reports"].map((item) => (
              <div key={item} className="border border-[#412460]/10 bg-white p-6">
                <h2 className="text-sm font-bold text-[#412460]">{item}</h2>
                <p className="mt-2 text-xs leading-relaxed text-[#2D2D2D]/50">
                  Distributor tracking workspace module.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
