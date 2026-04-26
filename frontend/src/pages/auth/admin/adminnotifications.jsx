import React from "react";
import AdminPageShell from "./AdminPageShell";

const NOTIFICATIONS = [
  { title: "New supplier registration", message: "Shenzhen Partner Hub submitted updated compliance documents.", time: "12 min ago", status: "Review" },
  { title: "Low stock warning", message: "Lithium Battery Pack stock dropped below the preferred threshold.", time: "32 min ago", status: "Inventory" },
  { title: "Shipment delay update", message: "Atlas Cargo Team reported a customs delay for order CZ-SH-2048.", time: "1 hr ago", status: "Logistics" },
  { title: "Monthly report ready", message: "Sales and product performance summaries are ready for review.", time: "Today", status: "Reports" },
];

export default function AdminNotifications() {
  return (
    <AdminPageShell activePage="Notifications" title="Notifications" eyebrow="Cellzen Admin Alerts">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Notification Center</h2>
              <p className="text-xs text-[#2D2D2D]/45">Track important admin updates and operational alerts.</p>
            </div>
            <button className="rounded-full bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]">
              Mark All Read
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {NOTIFICATIONS.map((notification) => (
              <div key={notification.title} className="rounded-[2rem] border border-[#E1E3EE] bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#412460]">{notification.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#2D2D2D]/55">{notification.message}</p>
                  </div>
                  <span className="w-fit rounded-full bg-[#EAE8E5] px-3 py-1 text-[10px] font-semibold text-[#2D2D2D]/55">
                    {notification.status}
                  </span>
                </div>
                <p className="mt-4 text-[11px] font-semibold text-[#2D2D2D]/35">{notification.time}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] bg-[#412460] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">Alerts</p>
          <h2 className="mt-4 text-2xl font-semibold">Stay updated on admin actions.</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Notifications can later connect to live inventory, shipment, supplier, and report events.
          </p>
        </div>
      </div>
    </AdminPageShell>
  );
}
