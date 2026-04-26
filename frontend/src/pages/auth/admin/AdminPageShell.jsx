import React, { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

const NAV_LINKS = [
  { title: "Dashboard", path: "/admin-dashboard" },
  { title: "Inventory", path: "/admin-inventory" },
  { title: "Products", path: "/admin-products" },
  { title: "Customers", path: "/admin-customers" },
  { title: "Reports", path: "/admin-reports" },
  { title: "Settings", path: "/admin-settings" },
];

export default function AdminPageShell({ activePage, title, eyebrow, children }) {
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
        <aside className="bg-[#FFFFFF] p-5 lg:min-h-[calc(100vh-40px)]">
          <Link to="/" aria-label="Cellzen Trading home">
            <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-10 w-auto" />
          </Link>

          <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#2D2D2D]/35">Menu</p>
          <nav className="mt-4 space-y-2">
            {NAV_LINKS.map((item) => {
              const active = item.title === activePage;
              return (
                <Link
                  key={item.title}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-[#412460] text-white"
                      : "text-[#2D2D2D]/55 hover:bg-[#412460]/8 hover:text-[#412460]"
                  }`}
                >
                  <span className={`h-2 w-2 ${active ? "bg-[#B99353]" : "bg-[#DADDE8]"}`} />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <header className="mb-4 flex flex-col gap-4 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B99353]">{eyebrow}</p>
              <h1 className="mt-1 text-2xl font-semibold text-[#2D2D2D]">{title}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center bg-[#412460] text-sm font-bold text-white">
                {(adminUser?.name || "A").charAt(0)}
              </div>
              <div>
                <p className="text-xs font-semibold">{adminUser?.name || "Admin User"}</p>
                <p className="text-[10px] text-[#2D2D2D]/45">{adminUser?.role || "Superadmin"}</p>
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

          <div className="bg-cz-paper p-4">
            {children}
          </div>
        </main>
      </div>
    </section>
  );
}
