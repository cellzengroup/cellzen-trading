import React, { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

const SIDEBAR_LINKS = [
  { title: "Dashboard", path: "/admin-dashboard", active: true },
  { title: "Inventory", path: "/admin-inventory" },
  { title: "Products", path: "/admin-products" },
  { title: "Customers", path: "/admin-customers" },
  { title: "Reports", path: "/admin-reports" },
  { title: "Settings", path: "/admin-settings" },
];

const STATS = [
  { label: "Total Sales", value: "$612,917", detail: "Products sold this month", accent: "bg-[#412460]", tone: "text-white", badge: "+24.6%" },
  { label: "Total Orders", value: "34,760", detail: "Orders in last month", accent: "bg-white", tone: "text-[#2D2D2D]", badge: "+18.4%" },
  { label: "Visitors", value: "14,987", detail: "Users in last month", accent: "bg-white", tone: "text-[#2D2D2D]", badge: "-3.8%" },
  { label: "Products", value: "12,987", detail: "Products this year", accent: "bg-white", tone: "text-[#2D2D2D]", badge: "+12.8%" },
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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const adminUser = useMemo(() => {
    try {
      const storedUser = sessionStorage.getItem("inv_user");
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("inv_token")) {
      navigate("/admin-login", { replace: true });
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("inv_token");
    sessionStorage.removeItem("inv_user");
    navigate("/admin-login", { replace: true });
  };

  return (
    <section className="min-h-screen bg-white p-3 text-[#2D2D2D] sm:p-5">
      <div className="mx-auto grid max-w-[1440px] gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="bg-white p-5 lg:min-h-[calc(100vh-40px)]">
          <Link to="/" aria-label="Cellzen Trading home">
            <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-10 w-auto" />
          </Link>

          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#2D2D2D]/35">Menu</p>
          <nav className="mt-4 space-y-2">
            {SIDEBAR_LINKS.map((item) => (
              <Link
                key={item.title}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 text-xs font-semibold transition-colors ${
                  item.active
                    ? "bg-[#412460] text-white"
                    : "text-[#2D2D2D]/55 hover:bg-[#412460]/8 hover:text-[#412460]"
                }`}
              >
                <span className={`h-2 w-2 ${item.active ? "bg-[#B99353]" : "bg-[#DADDE8]"}`} />
                {item.title}
              </Link>
            ))}
          </nav>

          <div className="mt-10 border border-[#E1E3EE] bg-[#2D2D2D] p-4 text-white">
            <p className="text-sm font-semibold">Admin Tools</p>
            <p className="mt-2 text-xs leading-relaxed text-white/55">
              Open the full inventory workspace for detailed operations.
            </p>
            <Link
              to="/admin-inventory"
              className="mt-4 block bg-[#412460] px-4 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
            >
              Open Inventory
            </Link>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="mb-4 flex flex-col gap-4 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#2D2D2D]">Admin Dashboard</h1>
              <p className="mt-1 text-xs text-[#2D2D2D]/45">Saturday, April 25th 2026</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 border border-[#2A1740] bg-[#2A1740] px-3 py-2 text-white/70">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3-3" />
                </svg>
                <span className="text-xs">Search</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center bg-[#2A1740] text-white">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center bg-[#412460] text-sm font-bold text-white">
                  {(adminUser?.name || "A").charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-semibold">{adminUser?.name || "Admin User"}</p>
                  <p className="text-[10px] text-[#2D2D2D]/45">{adminUser?.role || "Superadmin"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="bg-[#B99353] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#412460]"
              >
                Logout
              </button>
            </div>
          </header>

          <div className="grid gap-4 bg-cz-paper p-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {STATS.map((stat) => (
                  <div key={stat.label} className={`${stat.accent} ${stat.tone} border border-[#E1E3EE] p-5`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-11 w-11 items-center justify-center ${stat.tone === "text-white" ? "bg-white/14" : "bg-[#2A1740] text-white"}`}>
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 7h16M4 12h16M4 17h10" />
                        </svg>
                      </div>
                      <span className={`px-2 py-1 text-[10px] font-semibold ${stat.badge.startsWith("-") ? "bg-[#FFECEC] text-[#E05353]" : "bg-[#E9F8ED] text-[#1C9B55]"}`}>
                        {stat.badge}
                      </span>
                    </div>
                    <p className={`mt-4 text-xs font-medium ${stat.tone === "text-white" ? "text-white/70" : "text-[#2D2D2D]/45"}`}>{stat.label}</p>
                    <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                    <p className={`mt-1 text-[11px] ${stat.tone === "text-white" ? "text-white/55" : "text-[#2D2D2D]/40"}`}>{stat.detail}</p>
                  </div>
                ))}
              </div>

              <div className="border border-[#E1E3EE] bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Customer Habits</h2>
                    <p className="text-xs text-[#2D2D2D]/40">Track your customer habits</p>
                  </div>
                  <span className="text-xs font-semibold text-[#2D2D2D]/45">This year</span>
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
            </div>

            <div className="space-y-4">
              <div className="border border-[#E1E3EE] bg-white p-5">
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

              <div className="border border-[#E1E3EE] bg-white p-5">
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
        </main>
      </div>
    </section>
  );
}
