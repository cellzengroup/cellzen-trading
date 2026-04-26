import React from "react";
import AdminPageShell from "./AdminPageShell";

const REPORTS = [
  { title: "Sales Report", description: "Revenue, orders, and product sales by period.", updated: "Today" },
  { title: "Shipment Report", description: "Shipment milestones, delays, and delivery status.", updated: "Today" },
  { title: "Customer Report", description: "Customer growth, country split, and account activity.", updated: "Yesterday" },
  { title: "Inventory Report", description: "Stock health, warehouse movement, and low-stock items.", updated: "This week" },
];

export default function AdminReports() {
  return (
    <AdminPageShell activePage="Reports" title="Reports" eyebrow="Cellzen Business Reports">
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((report) => (
          <div key={report.title} className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#412460]">{report.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">{report.description}</p>
              </div>
              <span className="bg-[#2A1740] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B99353]">
                {report.updated}
              </span>
            </div>
            <button className="mt-6 bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]">
              View Report
            </button>
          </div>
        ))}
      </div>
    </AdminPageShell>
  );
}
