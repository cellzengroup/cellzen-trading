import { useState, useEffect, useCallback, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import RateToggle from "./RateToggle";

function isSectionDark(elements) {
  if (!elements || elements.length === 0) return true;
  const darkKeywords = ["#2A1740", "#412460", "#2e1845", "#553278", "cz-main"];
  const lightKeywords = ["#E5E1DA", "#EAE8E5", "#ffffff", "bg-white", "bg-cz-paper"];
  for (const el of elements) {
    const inlineStyle = (el.style?.backgroundColor || el.style?.background || "").trim();
    const bgCls = (el.className || "").split(/\s+/).filter(c => /^bg-/.test(c)).join(" ");
    if (darkKeywords.some(k => inlineStyle.includes(k) || bgCls.includes(k))) return true;
    if (lightKeywords.some(k => inlineStyle.includes(k) || bgCls.includes(k))) return false;
    const computed = window.getComputedStyle(el).backgroundColor;
    if (computed && computed !== "rgba(0, 0, 0, 0)" && computed !== "transparent") {
      const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const brightness = (parseInt(match[1]) * 299 + parseInt(match[2]) * 587 + parseInt(match[3]) * 114) / 1000;
        return brightness < 128;
      }
    }
  }
  return true;
}

const NAV_LINKS = [
  { label: "Home", to: "/" },
  { label: "About", to: "/about" },
  { label: "Shipments", to: "/shipments" },
  { label: "Tracking", to: "/tracking" },
  { label: "Portfolio", to: "/portfolio" },
  { label: "Notices", to: "/notices" },
];

export default function Header({ isAdmin, role, rateCurrency, onRateCurrencyChange, onLogout, visible = true }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isContact = location.pathname === "/contact";
  const [dark, setDark] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef(null);

    const DARK_HERO = ["/", "/about", "/shipments", "/tracking", "/portfolio", "/notices", "/faq", "/support", "/help-center"];

  const detectBackground = useCallback(() => {
    if (isContact) { setDark(false); return; }
    if (DARK_HERO.includes(location.pathname) && window.scrollY < 80) { setDark(true); return; }
    const headerEl = headerRef.current;
    if (!headerEl) { setDark(isLanding); return; }
    const headerBottom = headerEl.getBoundingClientRect().bottom;
    const probeX = window.innerWidth / 2;
    const probeY = headerBottom + 2;
    headerEl.style.pointerEvents = "none";
    headerEl.style.visibility = "hidden";
    const elements = document.elementsFromPoint(probeX, probeY);
    headerEl.style.pointerEvents = "";
    headerEl.style.visibility = "";
    if (!elements || elements.length === 0) { setDark(isLanding); return; }
    setDark(isSectionDark(elements));
  }, [isLanding, isContact, location.pathname]);

  useEffect(() => {
    detectBackground();
    window.addEventListener("scroll", detectBackground, { passive: true });
    return () => window.removeEventListener("scroll", detectBackground);
  }, [isLanding, detectBackground]);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const textColor   = dark ? "text-white/80"   : "text-[#2D2D2D]/70";
  const hoverColor  = dark ? "hover:text-white" : "hover:text-[#2D2D2D]";
  const borderColor = dark ? "rgba(255,255,255,0.15)" : "rgba(45,45,45,0.12)";
  const bgColor     = dark ? "rgba(255,255,255,0.08)" : "rgba(45,45,45,0.06)";

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 transition-all duration-700 ease-out px-4 py-3"
      style={{
        backgroundColor: "transparent",
        transform: visible ? "translateY(0)" : "translateY(-120%)",
      }}
    >
      {/* ── Pill bar ── */}
      <div
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 py-3 transition-all duration-500"
        style={{
          background: bgColor,
          backdropFilter: "blur(40px) saturate(120%)",
          WebkitBackdropFilter: "blur(40px) saturate(120%)",
          borderRadius: "9999px",
          border: `1px solid ${borderColor}`,
          boxShadow: isContact ? "none" : "0 8px 32px rgba(0,0,0,0.08)",
        }}
      >
        {/* Logo */}
        <Link to={isAdmin ? "/admin/dashboard" : "/"} className="flex items-center gap-2 shrink-0">
          <svg className="h-7 w-auto sm:h-8" viewBox="0 0 180 181" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#cz-logo)">
              <path
                d="M179.938 104.968C174.068 136.468 157.075 159.321 128.033 172.6C85.7055 192.056 36.8899 176.615 12.791 137.086C1.97741 118.865 -1.7301 99.4095 0.741575 78.4097C5.37597 41.66 33.8003 10.7779 70.8755 2.13091C106.097 -5.89844 144.717 9.23379 165.108 39.8071C172.523 50.9246 177.467 62.9686 179.629 76.248C179.629 76.8656 179.938 77.7921 179.938 78.4097C179.32 78.7185 179.011 78.7185 179.011 78.7185C161.71 79.3362 144.408 78.7185 128.033 74.0862C121.545 72.2333 116.91 66.3657 116.91 59.5716V52.1599C116.91 48.1452 112.585 45.6747 109.186 47.8364L98.6819 54.0128L86.9414 60.4981L66.55 72.2333L49.5572 82.1155L42.7601 86.1302C39.3616 87.9831 39.3616 92.9243 42.7601 95.086L49.5572 99.1007L66.859 108.983L86.9414 120.409L98.9908 127.203L109.495 133.38C112.894 135.233 117.219 132.762 117.219 129.056V121.953C117.219 115.468 121.545 109.601 127.724 107.439C139.156 103.733 151.205 102.189 163.563 102.498H177.467C179.629 101.88 180.247 102.807 179.938 104.968Z"
                fill={dark ? "#E5E1DA" : "#412460"}
                className="transition-colors duration-500"
              />
            </g>
            <defs>
              <clipPath id="cz-logo"><rect width="180" height="181" fill="white" /></clipPath>
            </defs>
          </svg>
        </Link>

        {/* Desktop nav */}
        <div className="flex-1 flex justify-center">
          {!isAdmin ? (
            <nav className={`hidden md:flex flex-nowrap items-center justify-center gap-8 text-sm font-medium whitespace-nowrap transition-colors duration-500 ${textColor}`}>
              {NAV_LINKS.map(({ label, to }) => (
                <NavLink
                  key={label}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) => `transition-colors duration-300 ${isActive ? "text-[#B99353]" : hoverColor}`}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          ) : (
            <nav className="hidden md:flex flex-nowrap items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap">
              {[
                { to: "/admin/dashboard", label: "Dashboard", exact: true },
                ...(role === "superadmin" ? [
                  { to: "/admin/addgoods",        label: "Add Goods" },
                  { to: "/admin/landingrate",     label: "Landing Rate" },
                  { to: "/admin/goodscalculator", label: "Goods Calculator" },
                ] : []),
              ].map(({ to, label, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) => [
                    "rounded-full px-4 py-1.5 transition-colors whitespace-nowrap",
                    isActive
                      ? (dark ? "bg-white/20 text-white" : "bg-[#2D2D2D]/15 text-[#2D2D2D]")
                      : (dark ? "text-white/70 hover:text-white hover:bg-white/10" : "text-[#2D2D2D]/60 hover:text-[#2D2D2D] hover:bg-[#2D2D2D]/10"),
                  ].join(" ")}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        {/* Right — CTA + hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin ? (
            <>
              <div className="hidden sm:block transform scale-[.90] origin-center">
                <RateToggle currency={rateCurrency} setCurrency={onRateCurrencyChange} />
              </div>
              <button
                type="button"
                className={`rounded-full border px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold transition-colors ${dark ? "border-white/40 text-white hover:bg-white/10" : "border-[#2D2D2D]/30 text-[#2D2D2D] hover:bg-[#2D2D2D]/10"}`}
                onClick={onLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/contact"
              className="hidden sm:flex rounded-full bg-[#B99353] px-5 py-2 text-sm font-semibold text-white transition-colors duration-300 items-center gap-2 hover:bg-[#B99353]/85"
            >
              Get a Quote
            </Link>
          )}

          {/* Hamburger — mobile only */}
          {!isAdmin && (
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(o => !o)}
              className={`md:hidden flex flex-col justify-center items-center w-9 h-9 rounded-full transition-colors ${dark ? "hover:bg-white/10" : "hover:bg-[#2D2D2D]/10"}`}
            >
              <span className={`block w-5 h-0.5 rounded transition-all duration-300 ${dark ? "bg-white" : "bg-[#2D2D2D]"} ${menuOpen ? "rotate-45 translate-y-[3px]" : ""}`} />
              <span className={`block w-5 h-0.5 rounded mt-1 transition-all duration-300 ${dark ? "bg-white" : "bg-[#2D2D2D]"} ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-5 h-0.5 rounded mt-1 transition-all duration-300 ${dark ? "bg-white" : "bg-[#2D2D2D]"} ${menuOpen ? "-rotate-45 -translate-y-[7px]" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile dropdown menu ── */}
      {!isAdmin && (
        <div
          className={`md:hidden mx-auto max-w-6xl mt-2 overflow-hidden transition-all duration-300 ease-out ${menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
        >
          <div
            className="rounded-2xl px-4 py-3"
            style={{
              background: dark ? "rgba(30,10,55,0.92)" : "rgba(255,255,255,0.95)",
              backdropFilter: "blur(40px) saturate(120%)",
              WebkitBackdropFilter: "blur(40px) saturate(120%)",
              border: `1px solid ${borderColor}`,
              boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
            }}
          >
            <nav className="flex flex-col">
              {NAV_LINKS.map(({ label, to }, i) => (
                <NavLink
                  key={label}
                  to={to}
                  end={to === "/"}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `px-4 py-3 text-sm font-medium rounded-xl transition-colors duration-200
                    ${isActive ? "text-[#B99353]" : dark ? "text-white/80 hover:text-white hover:bg-white/10" : "text-[#2D2D2D]/70 hover:text-[#2D2D2D] hover:bg-[#2D2D2D]/6"}
                    ${i < NAV_LINKS.length - 1 ? (dark ? "border-b border-white/5" : "border-b border-[#2D2D2D]/5") : ""}
                  `}
                >
                  {label}
                </NavLink>
              ))}
              <div className="pt-3 pb-1 px-1">
                <Link
                  to="/contact"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full text-center rounded-full bg-[#B99353] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]/85"
                >
                  Get a Quote
                </Link>
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
