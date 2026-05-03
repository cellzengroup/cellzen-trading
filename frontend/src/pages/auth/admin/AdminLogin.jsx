import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPostJson, getApiBaseCandidates } from "../../../utils/apiBase";

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

export default function AdminLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { res, data } = await apiPostJson("/inventory/auth/admin-login", form);
      if (!res.ok || !data.token) {
        setError(data?.message || `Admin login failed (HTTP ${res.status})`);
        return;
      }
      localStorage.setItem("inv_token", data.token);
      sessionStorage.setItem("inv_user", JSON.stringify(data.user));
      navigate("/admin-dashboard", { replace: true });
    } catch (loginError) {
      const tried = getApiBaseCandidates().join(", ");
      setError(
        loginError?.message
          ? `${loginError.message}. Tried: ${tried}`
          : "Unable to reach the server. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="min-h-screen bg-[#EAE8E5]">
      <div className="grid min-h-screen lg:grid-cols-[290px_1fr] xl:grid-cols-[320px_1fr]">
        <div className="sticky top-0 hidden h-screen overflow-hidden bg-cz-login-panel p-5 text-white lg:block">
          <div className="flex min-h-full flex-col justify-between">
            <Link to="/" aria-label="Cellzen Trading home">
              <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-10 w-auto brightness-0 invert" />
            </Link>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B99353]">Admin Portal</p>
              <h1 className="mt-4 premium-font-galdgderbold text-3xl leading-tight xl:text-4xl">
                Secure access for Cellzen operations.
              </h1>
              <p className="mt-4 text-xs leading-relaxed text-white/58 xl:text-sm">
                Sign in to manage inventory, products, reports, shipments, and operational tools.
              </p>
            </div>

            <p className="text-xs text-white/35">Cellzen Trading Administration</p>
          </div>
        </div>

        <div className="h-screen overflow-y-auto bg-white">
          <div className="flex min-h-full items-center justify-center p-5">
            <div className="w-full max-w-[390px]">
            <div className="mb-8 text-center">
              <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="mx-auto h-14 w-auto" />
              <h2 className="mt-8 text-2xl font-semibold uppercase tracking-wide text-[#2D2D2D]">
                Admin Sign In
              </h2>
            </div>

            {error && (
              <div className="mb-4 border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="identifier"
                type="text"
                required
                value={form.identifier}
                onChange={handleChange}
                placeholder="Admin ID or email"
                className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-sm text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460]"
              />

              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Password"
                  className="w-full border border-[#E3DEEA] bg-white px-4 py-3 pr-11 text-sm text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#412460]/55 transition-colors hover:text-[#B99353]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 4.2A10.8 10.8 0 0112 4c5 0 9.3 3.2 11 8a11.8 11.8 0 01-3.1 4.6" />
                      <path d="M6.2 6.2A11.8 11.8 0 001 12c1.7 4.8 6 8 11 8a10.9 10.9 0 005.1-1.2" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#412460] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <Link to="/" className="mt-7 block text-center text-xs font-semibold text-[#412460] hover:text-[#B99353]">
              Back to website
            </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
