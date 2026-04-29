import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

// User Profile Dropdown Component
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
          {(adminUser?.name || "P").charAt(0)}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs font-semibold text-[#2D2D2D]">{adminUser?.name || "Partner"}</p>
          <p className="text-[10px] text-[#2D2D2D]/45">Partner</p>
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
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.8a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.8a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.3.27.66.47 1.1.6h.7a2 2 0 1 1 0 4h-.7c-.44.13-.8.33-1.1.6Z" />
            </svg>
            Profile Settings
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-[calc(100%-16px)] items-center gap-2 px-3 py-2 text-sm bg-[#412460] text-white hover:bg-[#412460]/90 transition-colors rounded-lg mx-2 mt-1 justify-center"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

const NAV_LINKS = [
  { title: "Dashboard", path: "/tracking/trackingpage/partners/dashboard", icon: "home" },
  { title: "Management", path: "/tracking/trackingpage/partners/management", icon: "management" },
  { title: "Catalogs", path: "/tracking/trackingpage/partners/catalogs", icon: "catalogs" },
  { title: "Goods Tracking", path: "/tracking/trackingpage/partners/goods-tracking", icon: "tracking" },
  { title: "Invoices", path: "/tracking/trackingpage/partners/invoices", icon: "invoices" },
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

  if (icon === "catalogs") {
    return (
      <svg {...iconProps}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M12 7v10" />
        <path d="M8 7h8" />
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
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.8a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.8a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.3.27.66.47 1.1.6h.7a2 2 0 1 1 0 4h-.7c-.44.13-.8.33-1.1.6Z" />
    </svg>
  );
}

export default function PartnersPortal({ activePage, children }) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("partners_sidebar_collapsed") === "true");
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
    localStorage.setItem("partners_sidebar_collapsed", String(sidebarCollapsed));
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
            <Link to="/tracking/trackingpage/partners/dashboard" aria-label="Partners dashboard" className="flex min-w-0 items-center gap-2">
              <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-9 w-auto shrink-0" />
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
              <h1 className="text-2xl font-semibold text-[#2D2D2D]">
                Hey there! {adminUser?.firstName || adminUser?.name?.split(' ')[0] || "User"}, Have a wonderful Day
              </h1>
              <p className="mt-1 text-xs text-[#2D2D2D]/45">Collaborate on projects, track shared shipments, and manage partnership deals</p>
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
