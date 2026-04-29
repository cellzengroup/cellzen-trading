import React from "react";
import { useCurrency } from "../../../contexts/CurrencyContext.jsx";

const STATS_DATA = [
  { label: "Total Sales", value: 612917, detail: "Products sold this month", accent: "bg-[#412460]", tone: "text-white", badge: "+24.6%" },
  { label: "Total Orders", value: 34760, detail: "Orders in last month", accent: "bg-[#EAE8E5]", tone: "text-[#2D2D2D]", badge: "+18.4%", isNumber: true },
  { label: "Visitors", value: 14987, detail: "Users in last month", accent: "border border-[#E1E3EE] bg-white", tone: "text-[#2D2D2D]", badge: "-3.8%", isNumber: true },
  { label: "Products", value: 12987, detail: "Products this year", accent: "bg-[#EAE8E5]", tone: "text-[#2D2D2D]", badge: "+12.8%", isNumber: true },
];

const PRODUCT_STATS = [
  { label: "Electronics", value: "2,487", color: "#412460", growth: "+1.8%" },
  { label: "Games", value: "1,892", color: "#B99353", growth: "+2.7%" },
  { label: "Furniture", value: "1,463", color: "#E05353", growth: "-1.0%" },
];

const HABITS = [
  { month: "Jan", seen: 34, sales: 42 },
  { month: "Feb", seen: 50, sales: 61 },
  { month: "Mar", seen: 39, sales: 27 },
  { month: "Apr", seen: 45, sales: 36 },
  { month: "May", seen: 29, sales: 18 },
  { month: "Jun", seen: 37, sales: 31 },
  { month: "Jul", seen: 30, sales: 21 },
];

const COUNTRIES = [
  { name: "United States", value: "2,417", color: "#412460" },
  { name: "Germany", value: "981", color: "#B99353" },
  { name: "Australia", value: "872", color: "#6B5BD6" },
  { name: "France", value: "698", color: "#E05353" },
];

const ACTIVITIES = [
  { order: "INV-00076", activity: "Mobile App Purchase", price: 6596, status: "Completed", date: "17 Apr, 2026" },
  { order: "INV-00075", activity: "Hotel Booking", price: 322, status: "Pending", date: "15 Apr, 2026" },
  { order: "INV-00074", activity: "Freight Ticket Booking", price: 40200, status: "Completed", date: "14 Apr, 2026" },
  { order: "INV-00073", activity: "Grocery Purchase", price: 650, status: "In Progress", date: "14 Apr, 2026" },
];

export default function AdminDashboard() {
  const { formatCurrency, currency } = useCurrency();

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {STATS_DATA.map((stat) => (
            <div key={stat.label} className={`${stat.accent} ${stat.tone} rounded-[2rem] p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]`}>
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${stat.tone === "text-white" ? "bg-white/14" : "bg-[#2A1740] text-white"}`}>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                </div>
                <span className={`px-2 py-1 text-[10px] font-semibold ${stat.badge.startsWith("-") ? "bg-[#FFECEC] text-[#E05353]" : "bg-[#E9F8ED] text-[#1C9B55]"}`}>
                  {stat.badge}
                </span>
              </div>
              <p className={`mt-4 text-xs font-medium ${stat.tone === "text-white" ? "text-white/70" : "text-[#2D2D2D]/45"}`}>{stat.label}</p>
              <p className="mt-2 text-3xl font-bold">
                {stat.isNumber 
                  ? stat.value.toLocaleString() 
                  : formatCurrency(stat.value)
                }
              </p>
              <p className={`mt-1 text-[11px] ${stat.tone === "text-white" ? "text-white/55" : "text-[#2D2D2D]/40"}`}>{stat.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Monthly Performance</h2>
              <p className="text-xs text-[#2D2D2D]/40">Track sales and customer activity.</p>
            </div>
            <span className="rounded-full bg-[#F4F2EF] px-3 py-1 text-xs font-semibold text-[#2D2D2D]/45">This year</span>
          </div>

          <div className="mt-6 h-72">
            <div className="flex h-full items-end gap-4 overflow-x-auto pb-2">
              {HABITS.map((item) => (
                <div key={item.month} className="flex min-w-[58px] flex-1 flex-col items-center justify-end gap-3">
                  <div className="flex h-56 items-end gap-2">
                    <span className="w-4 bg-[#E3E5EE]" style={{ height: `${item.seen * 2.4}px` }} />
                    <span className="w-4 bg-[#412460]" style={{ height: `${item.sales * 2.4}px` }} />
                  </div>
                  <span className="text-xs text-[#2D2D2D]/45">{item.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent Activities</h2>
              <p className="text-xs text-[#2D2D2D]/40">Latest orders, actions, and account movements.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#E1E3EE] px-3 py-2 text-xs text-[#2D2D2D]/45">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              Search
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="text-[#2D2D2D]/35">
                <tr>
                  <th className="py-3 font-semibold">Order ID</th>
                  <th className="py-3 font-semibold">Activity</th>
                  <th className="py-3 font-semibold">Price ({currency})</th>
                  <th className="py-3 font-semibold">Status</th>
                  <th className="py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITIES.map((activity) => (
                  <tr key={activity.order} className="border-t border-[#EAE8E5]">
                    <td className="py-3 font-semibold text-[#2D2D2D]/60">{activity.order}</td>
                    <td className="py-3 font-semibold text-[#2D2D2D]">{activity.activity}</td>
                    <td className="py-3 text-[#2D2D2D]/60">{formatCurrency(activity.price)}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${
                        activity.status === "Completed"
                          ? "bg-[#E9F8ED] text-[#1C9B55]"
                          : activity.status === "Pending"
                            ? "bg-[#FFF5E8] text-[#B99353]"
                            : "bg-[#ECEBFF] text-[#6B5BD6]"
                      }`}>
                        {activity.status}
                      </span>
                    </td>
                    <td className="py-3 text-[#2D2D2D]/45">{activity.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[2rem] bg-[#EAE8E5] p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Product Statistic</h2>
              <p className="text-xs text-[#2D2D2D]/40">Track your product sales</p>
            </div>
            <span className="text-xs font-semibold text-[#2D2D2D]/45">Today</span>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="relative h-52 w-52">
              <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
                <circle cx="90" cy="90" r="72" fill="none" stroke="#ECEEF5" strokeWidth="13" />
                <circle cx="90" cy="90" r="72" fill="none" stroke="#412460" strokeWidth="13" strokeDasharray="310 452" strokeLinecap="butt" />
                <circle cx="90" cy="90" r="52" fill="none" stroke="#ECEEF5" strokeWidth="13" />
                <circle cx="90" cy="90" r="52" fill="none" stroke="#B99353" strokeWidth="13" strokeDasharray="198 327" strokeLinecap="butt" />
                <circle cx="90" cy="90" r="32" fill="none" stroke="#ECEEF5" strokeWidth="13" />
                <circle cx="90" cy="90" r="32" fill="none" stroke="#E05353" strokeWidth="13" strokeDasharray="109 201" strokeLinecap="butt" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-[#2D2D2D]">9,829</p>
                <p className="text-[10px] text-[#2D2D2D]/45">Products Sales</p>
                <span className="mt-1 bg-[#E9F8ED] px-2 py-1 text-[10px] font-semibold text-[#1C9B55]">+6.34%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {PRODUCT_STATS.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5" style={{ backgroundColor: item.color }} />
                  <span className="font-semibold text-[#2D2D2D]/65">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{item.value}</span>
                  <span className={item.growth.startsWith("-") ? "text-[#E05353]" : "text-[#1C9B55]"}>
                    {item.growth}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Customer Growth</h2>
              <p className="text-xs text-[#2D2D2D]/40">Track customer by location</p>
            </div>
            <span className="text-xs font-semibold text-[#2D2D2D]/45">Today</span>
          </div>

          <div className="mt-6 grid grid-cols-[120px_1fr] items-center gap-5">
            <div className="relative h-28 w-28">
              <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
                <circle cx="56" cy="56" r="45" fill="none" stroke="#ECEEF5" strokeWidth="16" />
                <circle cx="56" cy="56" r="45" fill="none" stroke="#412460" strokeWidth="16" strokeDasharray="170 283" />
                <circle cx="56" cy="56" r="27" fill="none" stroke="#B99353" strokeWidth="16" strokeDasharray="92 170" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-lg font-bold">287</p>
                <p className="text-[9px] text-[#2D2D2D]/45">New</p>
              </div>
            </div>
            <div className="space-y-3">
              {COUNTRIES.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </div>
                  <span className="font-bold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
