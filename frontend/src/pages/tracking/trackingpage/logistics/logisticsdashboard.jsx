import React, { useMemo } from "react";
import LogisticsPortal from "./LogisticsPortal";

function getLogisticsUser() {
  try {
    return JSON.parse(sessionStorage.getItem("customer_user") || "null");
  } catch {
    return null;
  }
}

const TILES = [
  {
    title: "Pickup Queue",
    body: "Review pickups scheduled with suppliers and warehouse partners.",
  },
  {
    title: "Warehouse Checks",
    body: "Coordinate quantity verification, packaging photos, and condition reports.",
  },
  {
    title: "Freight Booking",
    body: "Confirm carriers, container space, and lane choices for active shipments.",
  },
  {
    title: "Customs Status",
    body: "Track import paperwork, duties, and clearance milestones.",
  },
];

export default function LogisticsDashboard() {
  const user = useMemo(getLogisticsUser, []);

  return (
    <LogisticsPortal activePage="Dashboard">
      <div className="space-y-5">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-[#412460] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B99353]">Logistics Dashboard</p>
          <h2 className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">
            Logistics control{user?.firstName ? ` for ${user.firstName}` : ""}.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
            Coordinate pickup, warehouse checks, freight booking, customs status, and final delivery updates.
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
    </LogisticsPortal>
  );
}
