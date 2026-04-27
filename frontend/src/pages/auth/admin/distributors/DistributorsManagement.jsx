import React from "react";
import DistributorsPortal from "./DistributorsPortal";

export default function DistributorsManagement() {
  return (
    <DistributorsPortal activePage="Management">
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">Management</h2>
            <p className="mt-1 text-xs text-[#2D2D2D]/45">Manage distributor settings and operations</p>
          </div>
        </div>

        <div className="mt-8 flex-1 rounded-2xl bg-[#FBFAF8] p-8 text-center">
          <p className="text-sm font-semibold text-[#2D2D2D]/70">Management Panel</p>
          <p className="mt-2 text-xs text-[#2D2D2D]/50">Management settings will appear here</p>
        </div>
      </div>
    </DistributorsPortal>
  );
}
