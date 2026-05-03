import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import CountrySelector from "../../components/ui/CountrySelector";
import { countries } from "../../components/countries";
import { apiPostJson, getApiBaseCandidates } from "../../utils/apiBase";

const TRACKING_FEATURES = [
  "Order milestones",
  "Shipping documents",
  "Delivery updates",
];

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

const ACCOUNT_TYPES = ["Costumers", "Logistics", "Suppliers", "Distributor", "Partners"];
const OTP_LENGTH = 6;
const flagUrl = (code) => `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
const flagUrl2x = (code) => `https://flagcdn.com/w80/${code.toLowerCase()}.png`;

const getDashboardPath = (accountType) => {
  const normalized = (accountType || "").toLowerCase();
  if (normalized === "logistics") return "/tracking/trackingpage/logisticsdashboard";
  if (normalized === "suppliers" || normalized === "supplier") return "/tracking/trackingpage/supplierdashboard";
  if (normalized === "distributor") return "/tracking/trackingpage/distributordashboard";
  if (normalized === "partners" || normalized === "partner") return "/tracking/trackingpage/partnersdashboard";
  return "/tracking/trackingpage/costumersdashboard";
};

export default function TrackingLogin({ initialMode = "signin" }) {
  const navigate = useNavigate();
  const verificationInputRefs = useRef([]);
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    accountType: "",
  });
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [phonePrefix, setPhonePrefix] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [registrationResult, setRegistrationResult] = useState(null);

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const handleCountryChange = (country) => {
    setSelectedCountry(country);
    setPhonePrefix(country.countryCode);
  };

  const handlePhoneNumberChange = (event) => {
    setPhoneNumber(event.target.value.replace(/[^\d\s\-]/g, ""));
  };

  const focusVerificationInput = (index) => {
    verificationInputRefs.current[index]?.focus();
    verificationInputRefs.current[index]?.select();
  };

  const handleVerificationCodeChange = (index, event) => {
    const digits = event.target.value.replace(/\D/g, "");
    if (!digits) return;

    const nextCode = `${verificationCode.slice(0, index)}${digits}${verificationCode.slice(index + digits.length)}`.slice(0, OTP_LENGTH);
    setVerificationCode(nextCode);
    focusVerificationInput(Math.min(index + digits.length, OTP_LENGTH - 1));
  };

  const handleVerificationKeyDown = (index, event) => {
    if (event.key !== "Backspace") return;

    event.preventDefault();
    if (verificationCode[index]) {
      setVerificationCode(`${verificationCode.slice(0, index)}${verificationCode.slice(index + 1)}`);
      focusVerificationInput(index);
      return;
    }

    if (index > 0) {
      setVerificationCode(`${verificationCode.slice(0, index - 1)}${verificationCode.slice(index)}`);
      focusVerificationInput(index - 1);
    }
  };

  const handleVerificationPaste = (index, event) => {
    event.preventDefault();
    const pastedCode = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH - index);
    if (!pastedCode) return;

    const nextCode = `${verificationCode.slice(0, index)}${pastedCode}${verificationCode.slice(index + pastedCode.length)}`.slice(0, OTP_LENGTH);
    setVerificationCode(nextCode);
    focusVerificationInput(Math.min(index + pastedCode.length, OTP_LENGTH - 1));
  };

  const prefixFlag = useMemo(() => {
    if (selectedCountry) return selectedCountry;
    if (!phonePrefix || phonePrefix.length < 2) return null;
    return countries.find((country) => country.countryCode === phonePrefix) ?? null;
  }, [phonePrefix, selectedCountry]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(false);
    setError("");
    setRegistrationResult(null);
    setLoading(true);

    try {
      const endpoint = isSignUp ? "/customer/auth/register" : "/customer/auth/login";
      const fullPhone = phoneNumber ? `${phonePrefix} ${phoneNumber}`.trim() : phonePrefix;
      const payload = isSignUp
        ? {
            firstName: form.firstName,
            lastName: form.lastName,
            username: form.username,
            email: form.email,
            password: form.password,
            accountType: form.accountType,
            country: selectedCountry?.name ?? "",
            phone: fullPhone,
          }
        : { identifier: form.email, password: form.password };

      const { res, data } = await apiPostJson(endpoint, payload);

      if (!res.ok) {
        // Server returned an error response — handle the special cases first
        if (data?.requiresEmailVerification) {
          setPendingVerificationEmail(data.email || form.email);
          setVerificationCode("");
        } else if (data?.requiresAdminApproval) {
          setRegistrationResult({ type: "approval", user: data.user });
          return;
        }
        setError(data?.message || `Sign-in failed (HTTP ${res.status})`);
        return;
      }

      if (isSignUp && data.requiresEmailVerification) {
        setPendingVerificationEmail(data.email || form.email);
        setVerificationCode("");
        setSubmitted(true);
        return;
      }

      // Account created but waiting for admin approval (returned as success now)
      if (data.requiresAdminApproval) {
        setRegistrationResult({ type: "approval", user: data.user });
        return;
      }

      if (!data.token) {
        setError(data.message || "Account created, but no session token was returned. Please sign in.");
        return;
      }

      localStorage.setItem("customer_token", data.token);
      sessionStorage.setItem("customer_user", JSON.stringify(data.user));
      setSubmitted(true);
      navigate(getDashboardPath(data.user?.accountType));
    } catch (authError) {
      // Network/CORS failure — every API base host failed
      const tried = getApiBaseCandidates().join(", ");
      setError(
        authError?.message
          ? `${authError.message}. Tried: ${tried}`
          : "Unable to reach the server. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    setSubmitted(false);
    setError("");
    setLoading(true);

    try {
      const { res, data } = await apiPostJson("/customer/auth/verify-email", {
        email: pendingVerificationEmail,
        code: verificationCode,
      });

      if (!res.ok) {
        setError(data?.message || `Verification failed (HTTP ${res.status})`);
        return;
      }

      if (data.requiresAdminApproval) {
        setPendingVerificationEmail("");
        setVerificationCode("");
        setRegistrationResult({ type: "approval", user: data.user });
        return;
      }

      localStorage.setItem("customer_token", data.token);
      sessionStorage.setItem("customer_user", JSON.stringify(data.user));
      setPendingVerificationEmail("");
      setVerificationCode("");
      setRegistrationResult({ type: "success", user: data.user });
      setSubmitted(true);
    } catch (verifyError) {
      setError(verifyError?.message || "Unable to verify your email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setSubmitted(false);
    setError("");
    setResending(true);

    try {
      const { res, data } = await apiPostJson("/customer/auth/resend-verification", {
        email: pendingVerificationEmail,
      });
      if (!res.ok) {
        setError(data?.message || `Resend failed (HTTP ${res.status})`);
        return;
      }
      setSubmitted(true);
    } catch (resendError) {
      setError(resendError?.message || "Unable to resend the verification code.");
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    setMode(initialMode);
    setSubmitted(false);
    setError("");
    setPendingVerificationEmail("");
    setVerificationCode("");
    setRegistrationResult(null);
  }, [initialMode]);

  const isSignUp = mode === "signup";
  const isVerifyingEmail = Boolean(pendingVerificationEmail);
  const isShowingRegistrationResult = Boolean(registrationResult);
  const showAuthForm = !isVerifyingEmail && !isShowingRegistrationResult;

  useEffect(() => {
    if (isVerifyingEmail) {
      focusVerificationInput(0);
    }
  }, [isVerifyingEmail]);

  return (
    <>
      <section className="min-h-screen overflow-x-hidden bg-white">
        <div className="grid min-h-screen w-full xl:grid-cols-[1.08fr_0.92fr]">
          <div className="sticky top-0 hidden h-screen overflow-hidden bg-[#EAE8E5] px-8 py-12 text-center xl:block">
            <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden">
            <div className="relative mb-6 flex h-[185px] w-full max-w-[470px] items-center justify-center sm:mb-8 sm:h-[250px] xl:h-[330px] xl:max-w-[620px]">
              <div className="absolute left-1 top-16 z-20 hidden border border-[#412460]/10 bg-white px-3 py-2 text-left sm:left-4 sm:top-20 sm:block sm:px-4 sm:py-3 xl:left-2 xl:top-24 xl:px-5 xl:py-4">
                <p className="text-[10px] font-semibold text-[#2D2D2D]/45 xl:text-xs">Logistics documents</p>
                <p className="mt-1 text-xs font-bold text-[#412460] xl:text-sm">Ready for review</p>
              </div>

              <div className="absolute right-1 top-24 z-20 hidden border border-[#412460]/10 bg-white px-3 py-2 text-left sm:right-4 sm:top-28 sm:block sm:px-4 sm:py-3 xl:right-2 xl:top-36 xl:px-5 xl:py-4">
                <p className="text-[10px] font-semibold text-[#2D2D2D]/45 xl:text-xs">ETA Guangzhou</p>
                <p className="mt-1 text-xs font-bold text-[#412460] xl:text-sm">In transit</p>
              </div>

              <div className="absolute top-0 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[#B99353]/40 bg-white text-[#B99353] sm:h-14 sm:w-14 xl:h-18 xl:w-18">
                <svg className="h-5 w-5 sm:h-7 sm:w-7 xl:h-9 xl:w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div className="relative z-10 w-[270px] max-w-full sm:w-[360px] xl:w-[500px]">
                <div className="h-36 border-[8px] border-[#412460] bg-white sm:h-48 sm:border-[10px] xl:h-64 xl:border-[14px]">
                  <div className="border-b border-[#E8E4F0] px-3 py-2 sm:px-4 sm:py-3 xl:px-6 xl:py-4">
                    <div className="h-2 w-20 bg-[#412460]/20 sm:w-24 xl:h-3 xl:w-36" />
                  </div>
                  <div className="grid grid-cols-[0.75fr_1.25fr] gap-2 p-3 sm:grid-cols-[0.8fr_1.2fr] sm:gap-3 sm:p-4 xl:gap-5 xl:p-6">
                    <div className="space-y-1.5 sm:space-y-2 xl:space-y-3">
                      <div className="h-2.5 bg-[#B99353]/30 sm:h-3 xl:h-4" />
                      <div className="h-2.5 bg-[#412460]/15 sm:h-3 xl:h-4" />
                      <div className="h-2.5 bg-[#412460]/15 sm:h-3 xl:h-4" />
                      <div className="h-2.5 bg-[#412460]/15 sm:h-3 xl:h-4" />
                    </div>
                    <div className="space-y-2 sm:space-y-3 xl:space-y-4">
                      {TRACKING_FEATURES.map((feature) => (
                        <div key={feature} className="flex items-center justify-between border border-[#E8E4F0] px-2 py-1.5 sm:px-3 sm:py-2 xl:px-4 xl:py-3">
                          <span className="text-[8px] font-semibold text-[#2D2D2D]/55 sm:text-[10px] xl:text-xs">{feature}</span>
                          <span className="h-1.5 w-7 bg-[#412460]/20 sm:h-2 sm:w-10 xl:h-2.5 xl:w-14" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mx-auto h-7 w-14 bg-[#412460]/18 sm:h-10 sm:w-20 xl:h-14 xl:w-28" />
                <div className="mx-auto h-2 w-28 bg-[#412460]/25 sm:h-3 sm:w-36 xl:h-4 xl:w-52" />
              </div>
            </div>

            <h1 className="premium-font-galdgdersemi text-xl text-[#2D2D2D] sm:text-2xl xl:text-4xl">Track, Sign &amp; Store</h1>
            <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-[#2D2D2D]/45 sm:mt-3 sm:max-w-md sm:text-xs xl:max-w-lg xl:text-sm">
              Manage your Cellzen shipment updates, documents, and delivery status in one clean tracking workspace.
            </p>
            </div>
          </div>

          <div className="h-screen overflow-y-auto bg-white">
            <div className="flex min-h-full items-center justify-center px-5 py-9 sm:px-10 sm:py-12">
              <div className="w-full max-w-[330px] sm:max-w-[360px] xl:max-w-[420px]">
              <Link to="/" className="mx-auto mb-6 flex items-center justify-center sm:mb-8" aria-label="Cellzen Trading home">
                <img
                  src="/Images/DarkLogo.svg"
                  alt="Cellzen Trading"
                  className="h-10 w-auto sm:h-12 xl:h-16"
                />
              </Link>

              <h2 className={(isVerifyingEmail || (isShowingRegistrationResult && registrationResult.type !== "approval"))
                ? "mx-auto max-w-[240px] text-center text-sm font-bold leading-snug text-[#2D2D2D] sm:text-base"
                : "text-center text-xl font-semibold uppercase tracking-wide text-[#2D2D2D] sm:text-2xl xl:text-3xl"}
              >
                {isShowingRegistrationResult
                  ? registrationResult.type === "approval"
                    ? ""
                    : "Registered Successfully"
                  : isVerifyingEmail
                    ? "We sent you a code to verify your email"
                    : isSignUp ? "Sign up" : "Sign in"}
              </h2>

              {showAuthForm && (
              <div className="mt-6 grid grid-cols-2 bg-[#412460]/8 p-1">
                {[
                  { id: "signin", label: "Sign In" },
                  { id: "signup", label: "Sign Up" },
                ].map((tab) => {
                  const active = mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setMode(tab.id);
                        setSubmitted(false);
                        setError("");
                      }}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors xl:py-3 xl:text-sm ${
                        active
                          ? "bg-[#412460] text-white"
                          : "text-[#412460]/55 hover:text-[#B99353]"
                      }`}
                    >
                      {tab.id === "signin" ? (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 18a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 3a2 2 0 00-2 2v10h16V5a2 2 0 00-2-2H4zM1 17h18v1H1v-1z" />
                        </svg>
                      )}
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              )}

              {showAuthForm && (
              <div className="mt-6 space-y-3 sm:mt-7">
                <button type="button" className="flex w-full items-center justify-center gap-2 border border-[#412460]/30 bg-white px-4 py-2.5 text-xs font-semibold text-[#412460] transition-colors hover:border-[#B99353] hover:text-[#B99353] xl:py-3.5 xl:text-sm">
                  <span className="font-black text-[#B99353]">G</span>
                  {isSignUp ? "Sign up" : "Sign in"} with Google
                </button>
              </div>
              )}

              {showAuthForm && (
              <div className="my-5 flex items-center gap-3 sm:my-6">
                <div className="h-px flex-1 bg-[#E6E1EE]" />
                <span className="text-[10px] text-[#2D2D2D]/35">Or use e-mail</span>
                <div className="h-px flex-1 bg-[#E6E1EE]" />
              </div>
              )}

              {submitted && showAuthForm && (
                <div className="mb-4 border border-[#B99353]/35 bg-[#B99353]/10 p-3 text-xs leading-relaxed text-[#8B6A31]">
                  {isSignUp ? "Customer account created successfully." : "Signed in successfully."}
                </div>
              )}

              {error && (
                <div className="mb-4 border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
                  {error}
                </div>
              )}

              {isShowingRegistrationResult ? (
                <div className="mt-7 text-center">
                  {registrationResult.type === "approval" ? (
                    <>
                      <h3 className="text-lg font-semibold uppercase leading-snug text-[#412460]">Wait for the Admin to accept your Approval</h3>
                      <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">
                        Sorry For keep you waiting.
                      </p>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRegistrationResult(null);
                            setMode("signin");
                            setError("");
                            setSubmitted(false);
                          }}
                          className="bg-[#412460] px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate("/")}
                          className="border border-[#412460]/25 px-5 py-3 text-xs font-semibold text-[#412460] transition-colors hover:border-[#B99353] hover:text-[#B99353]"
                        >
                          Back Home
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="mt-5 text-xl font-semibold text-[#412460]">Registered Successfully</h3>
                      <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">
                        Your account is ready. Continue to your tracking dashboard.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate(getDashboardPath(registrationResult.user?.accountType))}
                        className="mt-6 w-full bg-[#412460] px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] xl:py-4 xl:text-sm"
                      >
                        Continue
                      </button>
                    </>
                  )}
                </div>
              ) : isVerifyingEmail ? (
                <form onSubmit={handleVerifyEmail} className="mt-7 space-y-6">
                  <p className="text-center text-xs font-medium text-[#2D2D2D]/35">
                    Sent to <span className="text-[#2D2D2D]/45">{pendingVerificationEmail}</span>
                  </p>
                  <div
                    role="group"
                    aria-label="Email verification code"
                    className="grid grid-cols-6 gap-2 sm:gap-3"
                  >
                    {Array.from({ length: OTP_LENGTH }).map((_, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          verificationInputRefs.current[index] = element;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        value={verificationCode[index] || ""}
                        onChange={(event) => handleVerificationCodeChange(index, event)}
                        onKeyDown={(event) => handleVerificationKeyDown(index, event)}
                        onPaste={(event) => handleVerificationPaste(index, event)}
                        aria-label={`Verification code digit ${index + 1}`}
                        className="flex h-14 w-full border border-[#D9D5DE] bg-white text-center text-xl font-semibold text-[#2D2D2D] outline-none transition-colors focus:border-[#412460] focus:shadow-[0_10px_24px_rgba(65,36,96,0.12)] sm:h-16"
                      />
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={loading || verificationCode.length !== OTP_LENGTH}
                    className="w-full bg-[#412460] px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60 xl:py-4 xl:text-sm"
                  >
                    {loading ? "Verifying..." : "Verify & Continue"}
                  </button>
                  <p className="text-center text-xs font-semibold text-[#2D2D2D]/45">
                    I didn&apos;t receive a code!{" "}
                    <button
                      type="button"
                      disabled={resending}
                      onClick={handleResendVerification}
                      className="text-[#2296F3] transition-colors hover:text-[#B99353] disabled:opacity-60"
                    >
                      {resending ? "Sending..." : "Resend"}
                    </button>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingVerificationEmail("");
                      setVerificationCode("");
                      setSubmitted(false);
                      setError("");
                    }}
                    className="w-full px-5 py-2 text-[10px] font-semibold text-[#2D2D2D]/45 transition-colors hover:text-[#412460] xl:text-xs"
                  >
                    Back to sign up
                  </button>
                </form>
              ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {isSignUp && (
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      name="firstName"
                      type="text"
                      required
                      value={form.firstName}
                      onChange={handleChange}
                      placeholder="First name"
                      className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-xs text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460] xl:px-5 xl:py-4 xl:text-sm"
                    />
                    <input
                      name="lastName"
                      type="text"
                      required
                      value={form.lastName}
                      onChange={handleChange}
                      placeholder="Last name"
                      className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-xs text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460] xl:px-5 xl:py-4 xl:text-sm"
                    />
                  </div>
                )}

                {isSignUp && (
                  <input
                    name="username"
                    type="text"
                    required
                    value={form.username}
                    onChange={handleChange}
                    placeholder="Username"
                    className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-xs text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460] xl:px-5 xl:py-4 xl:text-sm"
                  />
                )}

                <input
                  name="email"
                  type={isSignUp ? "email" : "text"}
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder={isSignUp ? "Your e-mail..." : "Email or Username"}
                  className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-xs text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460] xl:px-5 xl:py-4 xl:text-sm"
                />

                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={form.password}
                    onChange={handleChange}
                    placeholder={isSignUp ? "Create password" : "Password"}
                    className="w-full border border-[#E3DEEA] bg-white px-4 py-3 pr-11 text-xs text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460] xl:px-5 xl:py-4 xl:pr-12 xl:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#412460]/55 transition-colors hover:text-[#B99353]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg className="h-4 w-4 xl:h-5 xl:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                        <path d="M9.9 4.2A10.8 10.8 0 0112 4c5 0 9.3 3.2 11 8a11.8 11.8 0 01-3.1 4.6" />
                        <path d="M6.2 6.2A11.8 11.8 0 001 12c1.7 4.8 6 8 11 8a10.9 10.9 0 005.1-1.2" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 xl:h-5 xl:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>

                {isSignUp && (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#2D2D2D]/45 xl:text-xs">
                        Are you an:
                      </span>
                      <select
                        name="accountType"
                        required
                        value={form.accountType}
                        onChange={handleChange}
                        className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-xs text-[#2D2D2D] outline-none transition-colors focus:border-[#412460] xl:px-5 xl:py-4 xl:text-sm"
                      >
                        <option value="">Select account type</option>
                        {ACCOUNT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>

                    <CountrySelector
                      value={selectedCountry}
                      onChange={handleCountryChange}
                      placeholder="Country"
                      required
                    />

                    <div className="flex border border-[#E3DEEA] bg-white transition-colors focus-within:border-[#412460]">
                      <div className="flex shrink-0 items-center gap-1.5 border-r border-[#E3DEEA] pl-3 pr-2">
                        {prefixFlag && (
                          <img
                            src={flagUrl(prefixFlag.code)}
                            srcSet={`${flagUrl2x(prefixFlag.code)} 2x`}
                            alt=""
                            className="h-4 w-5 shrink-0 object-contain"
                          />
                        )}
                        <input
                          type="text"
                          value={phonePrefix}
                          onChange={(event) => setPhonePrefix(event.target.value.replace(/[^\d+]/g, ""))}
                          placeholder="+1"
                          className="w-12 bg-transparent py-3 text-xs text-[#2D2D2D] outline-none placeholder:text-[#2D2D2D]/30 xl:py-4 xl:text-sm"
                        />
                      </div>
                      <input
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={handlePhoneNumberChange}
                        placeholder="Phone number"
                        className="min-w-0 flex-1 bg-transparent px-3 py-3 text-xs text-[#2D2D2D] outline-none placeholder:text-[#2D2D2D]/30 xl:py-4 xl:text-sm"
                      />
                    </div>

                    <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2 text-[10px] leading-relaxed text-[#2D2D2D]/42">
                      <input type="checkbox" required className="mt-0.5 h-3.5 w-3.5 accent-[#412460]" />
                      I agree to the Terms and Conditions
                    </label>
                    <label className="flex items-start gap-2 text-[10px] leading-relaxed text-[#2D2D2D]/42">
                      <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-[#412460]" />
                      I agree to receive occasional tracking updates
                    </label>
                    </div>
                  </>
                )}

                {!isSignUp && (
                  <div className="flex justify-end">
                    <Link to="/reset" className="text-[10px] font-semibold text-[#412460] hover:text-[#B99353] xl:text-xs">
                      Forgot Password?
                    </Link>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#412460] px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] xl:py-4 xl:text-sm"
                >
                  {loading ? "Please wait..." : isSignUp ? "Create Account" : "Continue"}
                </button>
              </form>
              )}

              </div>
            </div>
          </div>
        </div>
      </section>

    </>
  );
}
