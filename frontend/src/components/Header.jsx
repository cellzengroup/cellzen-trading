import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import RateToggle from "./RateToggle";

function isSectionDark(el) {
  if (!el) return true;
  const bg = el.style?.background || el.style?.backgroundColor || "";
  const cls = el.className || "";
  const darkKeywords = ["#2A1740", "#412460", "#2e1845", "#553278", "cz-main"];
  if (darkKeywords.some(k => bg.includes(k) || cls.includes(k))) return true;
  const lightKeywords = ["bg-white", "bg-cz-paper", "bg-[#E5E1DA]"];
  if (lightKeywords.some(k => cls.includes(k))) return false;
  const computed = window.getComputedStyle(el).backgroundColor;
  if (computed) {
    const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const brightness = (parseInt(match[1]) * 299 + parseInt(match[2]) * 587 + parseInt(match[3]) * 114) / 1000;
      return brightness < 128;
    }
  }
  return true;
}

export default function Header({ isAdmin, role, rateCurrency, onRateCurrencyChange, onLogout, visible = true }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isContact = location.pathname === "/contact";
  const [dark, setDark] = useState(isLanding && !isContact);
  const headerRef = useRef(null);

  const detectBackground = useCallback(() => {
    if (isContact) { setDark(false); return; }
    const headerEl = headerRef.current;
    if (!headerEl) { setDark(isLanding); return; }
    const headerBottom = headerEl.getBoundingClientRect().bottom;
    const probeX = window.innerWidth / 2;
    const probeY = headerBottom + 2;
    headerEl.style.pointerEvents = "none";
    headerEl.style.visibility = "hidden";
    const el = document.elementFromPoint(probeX, probeY);
    headerEl.style.pointerEvents = "";
    headerEl.style.visibility = "";
    if (!el) { setDark(isLanding); return; }
    const section = el.closest("section") || el;
    setDark(isSectionDark(section));
  }, [isLanding, isContact]);

  useEffect(() => {
    setDark(isLanding);
    detectBackground();
    window.addEventListener("scroll", detectBackground, { passive: true });
    return () => window.removeEventListener("scroll", detectBackground);
  }, [isLanding, detectBackground]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 transition-all duration-700 ease-out px-4 pt-3"
      style={{
        backgroundColor: "transparent",
        transform: visible ? "translateY(0)" : "translateY(-120%)",
      }}
    >
      <div
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3 transition-all duration-500"
        style={{
          background: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(45, 45, 45, 0.06)",
          backdropFilter: "blur(40px) saturate(120%)",
          WebkitBackdropFilter: "blur(40px) saturate(120%)",
          borderRadius: "9999px",
          border: dark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(45, 45, 45, 0.12)",
          boxShadow: isContact ? "none" : "0 8px 32px rgba(0, 0, 0, 0.08)",
        }}
      >
        {/* Logo */}
        <Link to={isAdmin ? "/admin/dashboard" : "/"} className="flex items-center gap-2 shrink-0">
          <svg className="h-8 w-auto" viewBox="0 0 180 181" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#cz-logo)">
              <path d="M179.938 104.968C174.068 136.468 157.075 159.321 128.033 172.6C85.7055 192.056 36.8899 176.615 12.791 137.086C1.97741 118.865 -1.7301 99.4095 0.741575 78.4097C5.37597 41.66 33.8003 10.7779 70.8755 2.13091C106.097 -5.89844 144.717 9.23379 165.108 39.8071C172.523 50.9246 177.467 62.9686 179.629 76.248C179.629 76.8656 179.938 77.7921 179.938 78.4097C179.32 78.7185 179.011 78.7185 179.011 78.7185C161.71 79.3362 144.408 78.7185 128.033 74.0862C121.545 72.2333 116.91 66.3657 116.91 59.5716V52.1599C116.91 48.1452 112.585 45.6747 109.186 47.8364L98.6819 54.0128L86.9414 60.4981L66.55 72.2333L49.5572 82.1155L42.7601 86.1302C39.3616 87.9831 39.3616 92.9243 42.7601 95.086L49.5572 99.1007L66.859 108.983L86.9414 120.409L98.9908 127.203L109.495 133.38C112.894 135.233 117.219 132.762 117.219 129.056V121.953C117.219 115.468 121.545 109.601 127.724 107.439C139.156 103.733 151.205 102.189 163.563 102.498H177.467C179.629 101.88 180.247 102.807 179.938 104.968Z"
                fill={dark ? "#E5E1DA" : "#412460"}
                className="transition-colors duration-500"
              />
            </g>
            <defs>
              <clipPath id="cz-logo">
                <rect width="180" height="181" fill="white"/>
              </clipPath>
            </defs>
          </svg>
        </Link>

        {/* Center Nav */}
        <div className="flex-1 flex justify-center">
          {!isAdmin ? (
            <nav className={`hidden md:flex flex-nowrap items-center justify-center gap-8 text-sm font-medium whitespace-nowrap transition-colors duration-500 ${dark ? "text-white/80" : "text-[#2D2D2D]/70"}`}>
              <Link to="/" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-[#2D2D2D]"}`}>
                Home
              </Link>
              <Link to="/#about" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-[#2D2D2D]"}`}>
                About
              </Link>
              <Link to="/#partner" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-[#2D2D2D]"}`}>
                Partner
              </Link>
              <Link to="/#faq" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-[#2D2D2D]"}`}>
                FAQs
              </Link>
              <Link to="/contact" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-[#2D2D2D]"}`}>
                Contact
              </Link>
            </nav>
          ) : (
            <nav className="hidden md:flex flex-nowrap items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap">
              <NavLink
                to="/admin/dashboard"
                end
                className={({ isActive }) =>
                  [
                    "rounded-full px-4 py-1.5 transition-colors whitespace-nowrap",
                    isActive
                      ? (dark ? "bg-white/20 text-white" : "bg-[#2D2D2D]/15 text-[#2D2D2D]")
                      : (dark ? "text-white/70 hover:text-white hover:bg-white/10" : "text-[#2D2D2D]/60 hover:text-[#2D2D2D] hover:bg-[#2D2D2D]/10")
                  ].join(" ")
                }
              >
                Dashboard
              </NavLink>
              {role === "superadmin" ? (
                <>
              <NavLink
                to="/admin/addgoods"
                end
                className={({ isActive }) =>
                  [
                    "rounded-full px-4 py-1.5 transition-colors whitespace-nowrap",
                    isActive
                      ? (dark ? "bg-white/20 text-white" : "bg-[#2D2D2D]/15 text-[#2D2D2D]")
                      : (dark ? "text-white/70 hover:text-white hover:bg-white/10" : "text-[#2D2D2D]/60 hover:text-[#2D2D2D] hover:bg-[#2D2D2D]/10")
                  ].join(" ")
                }
              >
                Add Goods
              </NavLink>
              <NavLink
                to="/admin/landingrate"
                end
                className={({ isActive }) =>
                  [
                    "rounded-full px-4 py-1.5 transition-colors whitespace-nowrap",
                    isActive
                      ? (dark ? "bg-white/20 text-white" : "bg-[#2D2D2D]/15 text-[#2D2D2D]")
                      : (dark ? "text-white/70 hover:text-white hover:bg-white/10" : "text-[#2D2D2D]/60 hover:text-[#2D2D2D] hover:bg-[#2D2D2D]/10")
                  ].join(" ")
                }
              >
                Landing Rate
              </NavLink>
              <NavLink
                to="/admin/goodscalculator"
                end
                className={({ isActive }) =>
                  [
                    "rounded-full px-4 py-1.5 transition-colors whitespace-nowrap",
                    isActive
                      ? (dark ? "bg-white/20 text-white" : "bg-[#2D2D2D]/15 text-[#2D2D2D]")
                      : (dark ? "text-white/70 hover:text-white hover:bg-white/10" : "text-[#2D2D2D]/60 hover:text-[#2D2D2D] hover:bg-[#2D2D2D]/10")
                  ].join(" ")
                }
              >
                Goods Calculator
              </NavLink>
                </>
              ) : null}
            </nav>
          )}
        </div>

        {/* Right CTA */}
        <nav className="flex items-center gap-2 shrink-0">
          {isAdmin ? (
            <>
              <div className="inline-block transform scale-[.90] origin-center mr-2">
                <RateToggle currency={rateCurrency} setCurrency={onRateCurrencyChange} className="mr-0" />
              </div>
              <button
                type="button"
                className={`rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${dark ? "border-white/40 text-white hover:bg-white/10" : "border-[#2D2D2D]/30 text-[#2D2D2D] hover:bg-[#2D2D2D]/10"}`}
                onClick={onLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/admin/login"
              className="rounded-full bg-[#B99353] px-5 py-2 text-sm font-semibold text-white transition-colors duration-300 flex items-center gap-2 hover:bg-[#B99353]/85"
            >
              Get Started
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
