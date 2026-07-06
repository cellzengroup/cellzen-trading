import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPostJson, getApiBaseCandidates } from "../../../utils/apiBase";

// Staff portal sign-in. Staff are real database users (role: "staff") created
// by an admin, so they authenticate against the standard DB login endpoint
// (bcrypt) — NOT the hardcoded admin-login. The session is stored under the
// separate staff_token / staff_user keys so it never collides with an admin
// session in the same browser.
export default function StaffLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // First-login email verification: "password" step then "code" step.
  const [step, setStep] = useState("password");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState("");

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const finishLogin = (data) => {
    // Guard: only genuine staff accounts may use the staff portal.
    const role = String(data.user?.role || "").toLowerCase();
    if (role !== "staff") {
      setError("This account is not a staff account.");
      return;
    }
    localStorage.setItem("staff_token", data.token);
    sessionStorage.setItem("staff_user", JSON.stringify(data.user));
    navigate("/staff-dashboard", { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const { res, data } = await apiPostJson("/inventory/auth/login", form);

      // First login for this staff account → a code was emailed. Move to the
      // code step instead of logging in.
      if (res.ok && data?.requiresVerification) {
        setStep("code");
        setCode("");
        setInfo(data.message || `We sent a verification code to ${data.email || form.email}.`);
        return;
      }

      if (!res.ok || !data.token) {
        setError(data?.message || `Staff login failed (HTTP ${res.status})`);
        return;
      }
      finishLogin(data);
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

  const handleVerify = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { res, data } = await apiPostJson("/inventory/auth/verify-login", {
        email: form.email,
        code: code.trim(),
      });
      if (!res.ok || !data.token) {
        setError(data?.message || `Verification failed (HTTP ${res.status})`);
        return;
      }
      finishLogin(data);
    } catch (verifyError) {
      setError(verifyError?.message || "Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const backToPassword = () => {
    setStep("password");
    setCode("");
    setError("");
    setInfo("");
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#B99353]">Staff Portal</p>
              <h1 className="mt-4 premium-font-galdgderbold text-3xl leading-tight xl:text-4xl">
                Secure access for Cellzen warehouse staff.
              </h1>
              <p className="mt-4 text-xs leading-relaxed text-white/58 xl:text-sm">
                Sign in to create invoices, manage your customers, and use operational tools.
              </p>
            </div>

            <p className="text-xs text-white/35">Cellzen Trading Staff</p>
          </div>
        </div>

        <div className="h-screen overflow-y-auto bg-white">
          <div className="flex min-h-full items-center justify-center p-5">
            <div className="w-full max-w-[390px]">
            <div className="mb-8 text-center">
              <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="mx-auto h-14 w-auto" />
              <h2 className="mt-8 text-2xl font-semibold uppercase tracking-wide text-[#2D2D2D]">
                Staff Sign In
              </h2>
            </div>

            {error && (
              <div className="mb-4 border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
                {error}
              </div>
            )}
            {info && (
              <div className="mb-4 border border-[#B99353]/40 bg-[#F6F1EA] p-3 text-xs leading-relaxed text-[#412460]">
                {info}
              </div>
            )}

            {step === "password" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="Staff email"
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
            )}

            {step === "code" && (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-xs leading-relaxed text-[#2D2D2D]/60">
                First-time sign in. Enter the 6-digit code we emailed to{" "}
                <span className="font-semibold text-[#2D2D2D]">{form.email}</span>.
              </p>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="Enter 6-digit code"
                className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-center text-lg font-semibold tracking-[0.4em] text-[#2D2D2D] outline-none transition-colors placeholder:tracking-normal placeholder:text-[#2D2D2D]/30 focus:border-[#412460]"
              />
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full bg-[#412460] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
              <button
                type="button"
                onClick={backToPassword}
                className="block w-full text-center text-xs font-semibold text-[#412460] hover:text-[#B99353]"
              >
                Back
              </button>
            </form>
            )}

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
