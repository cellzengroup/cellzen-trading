import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const NAV_LINKS = [
  { title: "Dashboard", path: "/admin/partners/dashboard", icon: "home" },
  { title: "Management", path: "/admin/partners/management", icon: "management" },
  { title: "Goods Tracking", path: "/admin/partners/goods-tracking", icon: "tracking" },
  { title: "Invoices", path: "/admin/partners/invoices", icon: "invoices" },
];

function NavIcon({ icon }) {
  const iconProps = {
    className: "h-6 w-6",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (icon === "home") {
    return (
      <svg {...iconProps}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }

  if (icon === "management") {
    return (
      <svg {...iconProps}>
        <path d="M16 11a4 4 0 1 0-8 0" />
        <path d="M4 20a8 8 0 0 1 16 0" />
        <path d="M18 7h3" />
        <path d="M19.5 5.5v3" />
      </svg>
    );
  }

  if (icon === "tracking") {
    return (
      <svg {...iconProps}>
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" />
        <path d="M12 6v6l4 2" />
      </svg>
    );
  }

  if (icon === "invoices") {
    return (
      <svg {...iconProps}>
        <path d="M5 20V4h14v16H5Z" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </svg>
    );
  }

  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export default function PartnersPortal({ activePage, children }) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("partners_sidebar_collapsed") === "true");
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

  useEffect(() => {
    localStorage.setItem("partners_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleLogout = () => {
    localStorage.removeItem("inv_token");
    sessionStorage.removeItem("inv_user");
    navigate("/admin-login", { replace: true });
  };

  return (
    <section className="admin-portal-scrollbar min-h-screen w-full bg-white p-3 text-[#2D2D2D] sm:p-4 lg:p-5">
      <div
        className="grid h-[calc(100vh-2.5rem)] w-full overflow-hidden rounded-[2rem] bg-white transition-all duration-300"
        style={{ gridTemplateColumns: `${sidebarCollapsed ? "88px" : "260px"} minmax(0, 1fr)` }}
      >
        <aside className="flex h-full flex-col overflow-hidden bg-white p-4">
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} gap-3`}>
            <Link to="/admin/partners/dashboard" aria-label="Partners Dashboard" className="flex min-w-0 items-center gap-2">
              <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-9 w-auto shrink-0" />
              {!sidebarCollapsed && <span className="text-sm font-semibold text-[#412460]">Partners</span>}
            </Link>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/65 transition-colors hover:bg-[#412460] hover:text-white"
                aria-label="Collapse sidebar"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
          </div>

          <nav className="mt-14 space-y-2">
            {NAV_LINKS.map((item) => {
              const active = item.title === activePage;
              return (
                <Link
                  key={item.title}
                  to={item.path}
                  className={`flex items-center gap-3 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-[#412460] text-white"
                      : "text-[#2D2D2D]/55 hover:bg-[#412460]/8 hover:text-[#412460]"
                  } ${sidebarCollapsed ? "mx-auto h-14 w-14 justify-center rounded-full p-0" : "rounded-xl px-4 py-3"}`}
                  title={sidebarCollapsed ? item.title : undefined}
                >
                  <NavIcon icon={item.icon} />
                  {!sidebarCollapsed && item.title}
                </Link>
              );
            })}
          </nav>

          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="mt-auto flex h-12 w-12 items-center justify-center self-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/65 transition-colors hover:bg-[#412460] hover:text-white"
              aria-label="Expand sidebar"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </aside>

        <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="flex w-full flex-col gap-4 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#2D2D2D]">Partners Portal</h1>
              <p className="mt-1 text-xs text-[#2D2D2D]/45">Manage partnership operations and collaboration</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/60 transition-colors hover:bg-[#412460] hover:text-white" aria-label="Search">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3-3" />
                </svg>
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/60 transition-colors hover:bg-[#412460] hover:text-white" aria-label="Notifications">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
              </button>
              <div className="flex h-10 w-10 items-center justify-center bg-[#412460] text-sm font-bold text-white">
                {(adminUser?.name || "P").charAt(0)}
              </div>
              <div>
                <p className="text-xs font-semibold">{adminUser?.name || "Partner Admin"}</p>
                <p className="text-[10px] text-[#2D2D2D]/45">{adminUser?.role || "Partner"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full bg-[#2D2D2D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#412460]"
              >
                Logout
              </button>
            </div>
          </header>

          <div className="w-full flex-1 overflow-y-auto rounded-[2rem] bg-[#F7F6F2] p-5 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </section>
  );
}
