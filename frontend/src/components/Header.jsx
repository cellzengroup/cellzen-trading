import React, { useState, useEffect, useCallback } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import RateToggle from "./RateToggle";

export default function Header({ isAdmin, role, rateCurrency, onRateCurrencyChange, onLogout, visible = true }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const [dark, setDark] = useState(isLanding);

  const handleScroll = useCallback(() => {
    if (!isLanding) { setDark(false); return; }
    const heroEnd = window.innerHeight * 3.5;
    setDark(window.scrollY < heroEnd - 100);
  }, [isLanding]);

  useEffect(() => {
    if (!isLanding) { setDark(false); return; }
    setDark(true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLanding, handleScroll]);

  useEffect(() => {
    if (!isLanding) setDark(false);
    else setDark(true);
  }, [isLanding]);

  return (
    <header
      className="sticky top-0 z-50 transition-all duration-700 ease-out"
      style={{
        backgroundColor: dark ? "#2A1740" : "#E5E1DA",
        borderBottom: dark ? "none" : "none",
        boxShadow: "none",
        transform: visible ? "translateY(0)" : "translateY(-100%)",
      }}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-4 px-4 py-4">
        <Link to={isAdmin ? "/admin/dashboard" : "/"} className="flex items-center gap-2 justify-self-start">
          <svg className="h-9 w-auto" viewBox="0 0 180 181" fill="none" xmlns="http://www.w3.org/2000/svg">
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

        <div className="justify-self-center">
          {!isAdmin ? (
            <nav className={`hidden md:flex flex-nowrap items-center justify-center gap-6 text-sm font-medium whitespace-nowrap transition-colors duration-500 ${dark ? "text-white/70" : "text-cz-ink/80"}`}>
              <Link to="/#partner" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-cz-ink"}`}>
                Become our Partner
              </Link>
              <Link to="/#contact" className={`transition-colors duration-300 ${dark ? "hover:text-white" : "hover:text-cz-ink"}`}>
                Contact Us
              </Link>
            </nav>
          ) : (
            <nav className="hidden md:flex flex-nowrap items-center justify-center gap-6 text-sm font-semibold text-cz-ink/80 whitespace-nowrap">
              <NavLink
                to="/admin/dashboard"
                end
                className={({ isActive }) =>
                  [
                    "rounded-full px-4 py-2 transition-colors whitespace-nowrap",
                    isActive ? "bg-cz-secondary-light text-white" : "hover:bg-cz-paper/60 hover:text-cz-ink"
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
                    "rounded-full px-4 py-2 transition-colors whitespace-nowrap",
                    isActive ? "bg-cz-secondary-light text-white" : "hover:bg-cz-paper/60 hover:text-cz-ink"
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
                    "rounded-full px-4 py-2 transition-colors whitespace-nowrap",
                    isActive ? "bg-cz-secondary-light text-white" : "hover:bg-cz-paper/60 hover:text-cz-ink"
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
                    "rounded-full px-4 py-2 transition-colors whitespace-nowrap",
                    isActive ? "bg-cz-secondary-light text-white" : "hover:bg-cz-paper/60 hover:text-cz-ink"
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

        <nav className="flex items-center gap-2 justify-self-end">
          {isAdmin ? (
            <>
              <div className="inline-block transform scale-[.90] origin-center mr-2">
                <RateToggle currency={rateCurrency} setCurrency={onRateCurrencyChange} className="mr-0" />
              </div>
              <button
                type="button"
                className="rounded-full bg-cz-main px-4 py-2 text-sm font-semibold text-cz-paper hover:bg-cz-main/90"
                onClick={onLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/admin/login"
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-500 ${dark ? "bg-cz-secondary-light text-white hover:bg-cz-secondary-light/90" : "bg-cz-main text-cz-paper hover:bg-cz-main/90"}`}
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
