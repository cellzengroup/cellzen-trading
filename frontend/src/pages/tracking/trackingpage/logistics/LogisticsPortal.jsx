import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import NotificationBell from "../components/NotificationBell";

function UserProfileDropdown({ adminUser, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-[#F4F2EF] transition-colors"
      >
        <div className="flex h-10 w-10 items-center justify-center bg-[#412460] text-sm font-bold text-white rounded-full">
          {(adminUser?.name || "L").charAt(0)}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs font-semibold text-[#2D2D2D]">{adminUser?.name || "Logistics"}</p>
          <p className="text-[10px] text-[#2D2D2D]/45">{adminUser?.role || "Logistics"}</p>
        </div>
        <svg
          className={`h-4 w-4 text-[#2D2D2D]/60 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white shadow-lg border border-[#F4F2EF] py-2 z-50">
          <Link
            to="#"
            className="flex items-center gap-2 px-4 py-2 text-sm text-[#2D2D2D] hover:bg-[#F4F2EF] transition-colors"
          >
            Profile Settings
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-[calc(100%-16px)] items-center gap-2 px-3 py-2 text-sm bg-[#412460] text-white hover:bg-[#412460]/90 transition-colors rounded-lg mx-2 mt-1 justify-center"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

const NAV_LINKS = [
  { title: "Dashboard", path: "/tracking/trackingpage/logistics/dashboard", icon: "home" },
  { title: "Notices", path: "/tracking/trackingpage/logistics/notices", icon: "notices" },
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

  if (icon === "notices") {
    return (
      <svg {...iconProps}>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    );
  }

  return null;
}

export default function LogisticsPortal({ activePage, children }) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("logistics_sidebar_collapsed") === "true"
  );
  const adminUser = useMemo(() => {
    try {
      const storedUser = sessionStorage.getItem("customer_user");
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("customer_token")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem("logistics_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleLogout = () => {
    localStorage.removeItem("customer_token");
    sessionStorage.removeItem("customer_user");
    navigate("/login", { replace: true });
  };

  return (
    <section className="admin-portal-scrollbar min-h-screen w-full bg-white p-3 text-[#2D2D2D] sm:p-4 lg:p-5">
      <div
        className="grid h-[calc(100vh-2.5rem)] w-full overflow-hidden rounded-[2rem] bg-white transition-all duration-300"
        style={{ gridTemplateColumns: `${sidebarCollapsed ? "88px" : "260px"} minmax(0, 1fr)` }}
      >
        <aside className="flex h-full flex-col overflow-hidden bg-white p-4">
          <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} gap-3`}>
            <Link
              to="/tracking/trackingpage/logistics/dashboard"
              aria-label="Logistics dashboard"
              className="flex min-w-0 items-center gap-2"
            >
              <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-9 w-auto shrink-0" />
            </Link>
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/65 transition-colors hover:bg-[#412460] hover:text-white"
                aria-label="Collapse sidebar"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </aside>

        <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="flex w-full flex-col gap-4 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#2D2D2D]">
                Hey there! {adminUser?.firstName || adminUser?.name?.split(" ")[0] || "Logistics"}, Have a wonderful Day
              </h1>
              <p className="mt-1 text-xs text-[#2D2D2D]/45">
                Coordinate pickup, freight booking, customs status, and final delivery updates.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <NotificationBell noticesPath="/tracking/trackingpage/logistics/notices" />
              <UserProfileDropdown adminUser={adminUser} onLogout={handleLogout} />
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#412460] text-white transition-colors hover:bg-[#412460]/90"
                aria-label="Log Out"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
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
