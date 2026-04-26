import React from "react";
import AdminPageShell from "./AdminPageShell";

const SETTINGS = [
  "Admin profile and access",
  "Notification preferences",
  "Shipment update rules",
  "Security and password policy",
  "Brand and dashboard display",
];

export default function AdminSettings() {
  return (
    <AdminPageShell activePage="Settings" title="Settings" eyebrow="Cellzen Admin Settings">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="border border-[#E1E3EE] bg-white p-5">
          <h2 className="text-lg font-semibold">Workspace Settings</h2>
          <div className="mt-5 space-y-3">
            {SETTINGS.map((setting) => (
              <label key={setting} className="flex items-center justify-between border border-[#E1E3EE] p-4 text-sm">
                <span className="font-semibold text-[#2D2D2D]/70">{setting}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#412460]" />
              </label>
            ))}
          </div>
        </div>

        <div className="border border-[#E1E3EE] bg-[#412460] p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">System</p>
          <h2 className="mt-4 text-2xl font-semibold">Cellzen Admin</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            These settings are placeholders for the Cellzen admin workspace and can be connected to the backend later.
          </p>
        </div>
      </div>
    </AdminPageShell>
  );
}
