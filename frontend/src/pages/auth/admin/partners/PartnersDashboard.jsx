import React from "react";
import PartnersPortal from "./PartnersPortal";

export default function PartnersDashboard() {
  return (
    <PartnersPortal activePage="Dashboard">
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">Partner Dashboard</h2>
            <p className="mt-1 text-xs text-[#2D2D2D]/45">Overview of partnership activities</p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-[#FBFAF8] p-5">
            <p className="text-xs font-semibold text-[#2D2D2D]/45">Active Projects</p>
            <p className="mt-2 text-2xl font-bold text-[#412460]">0</p>
          </div>
          <div className="rounded-2xl bg-[#FBFAF8] p-5">
            <p className="text-xs font-semibold text-[#2D2D2D]/45">Collaborations</p>
            <p className="mt-2 text-2xl font-bold text-[#412460]">0</p>
          </div>
          <div className="rounded-2xl bg-[#FBFAF8] p-5">
            <p className="text-xs font-semibold text-[#2D2D2D]/45">Shipments</p>
            <p className="mt-2 text-2xl font-bold text-[#412460]">0</p>
          </div>
          <div className="rounded-2xl bg-[#FBFAF8] p-5">
            <p className="text-xs font-semibold text-[#2D2D2D]/45">Invoices</p>
            <p className="mt-2 text-2xl font-bold text-[#412460]">0</p>
          </div>
        </div>

        <div className="mt-8 flex-1 rounded-2xl bg-[#FBFAF8] p-8 text-center">
          <p className="text-sm font-semibold text-[#2D2D2D]/70">Welcome to Partner Portal</p>
          <p className="mt-2 text-xs text-[#2D2D2D]/50">Manage partnerships, collaborations, and operations</p>
        </div>
      </div>
    </PartnersPortal>
  );
}
