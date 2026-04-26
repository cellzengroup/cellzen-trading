import React, { useState } from "react";
import { Link } from "react-router-dom";

const TRACKING_FEATURES = [
  "Account recovery",
  "Secure reset link",
  "Tracking access",
];

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="min-h-screen overflow-x-hidden bg-white">
      <div className="grid min-h-screen w-full xl:grid-cols-[1.08fr_0.92fr]">
        <div className="relative hidden min-h-screen flex-col items-center justify-center overflow-hidden bg-[#EAE8E5] px-8 py-12 text-center xl:flex">
          <div className="relative mb-6 flex h-[185px] w-full max-w-[470px] items-center justify-center sm:mb-8 sm:h-[250px] xl:h-[330px] xl:max-w-[620px]">
            <div className="absolute left-1 top-16 z-20 hidden border border-[#412460]/10 bg-white px-3 py-2 text-left sm:left-4 sm:top-20 sm:block sm:px-4 sm:py-3 xl:left-2 xl:top-24 xl:px-5 xl:py-4">
              <p className="text-[10px] font-semibold text-[#2D2D2D]/45 xl:text-xs">Account status</p>
              <p className="mt-1 text-xs font-bold text-[#412460] xl:text-sm">Recovery mode</p>
            </div>

            <div className="absolute right-1 top-24 z-20 hidden border border-[#412460]/10 bg-white px-3 py-2 text-left sm:right-4 sm:top-28 sm:block sm:px-4 sm:py-3 xl:right-2 xl:top-36 xl:px-5 xl:py-4">
              <p className="text-[10px] font-semibold text-[#2D2D2D]/45 xl:text-xs">Cellzen Tracking</p>
              <p className="mt-1 text-xs font-bold text-[#412460] xl:text-sm">Secure reset</p>
            </div>

            <div className="absolute top-0 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-[#B99353]/40 bg-white text-[#B99353] sm:h-14 sm:w-14 xl:h-18 xl:w-18">
              <svg className="h-5 w-5 sm:h-7 sm:w-7 xl:h-9 xl:w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3m-6 0H9a2 2 0 00-2 2v5h10v-5a2 2 0 00-2-2h-3z" />
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

          <h1 className="premium-font-galdgdersemi text-xl text-[#2D2D2D] sm:text-2xl xl:text-4xl">Recover &amp; Continue</h1>
          <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-[#2D2D2D]/45 sm:mt-3 sm:max-w-md sm:text-xs xl:max-w-lg xl:text-sm">
            Reset your Cellzen tracking access and return to managing shipment updates securely.
          </p>
        </div>

        <div className="flex min-h-screen items-center justify-center bg-white px-5 py-10 sm:px-10">
          <div className="w-full max-w-[390px] xl:max-w-[430px]">
            <Link to="/" className="mb-8 flex items-center justify-center" aria-label="Cellzen Trading home">
              <img
                src="/Images/DarkLogo.svg"
                alt="Cellzen Trading"
                className="h-11 w-auto sm:h-12 xl:h-16"
              />
            </Link>

            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-[#B99353]">
              Account Recovery
            </p>
            <h1 className="premium-font-galdgdersemi text-3xl leading-tight text-[#412460] sm:text-4xl">
              Reset your password
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#2D2D2D]/55">
              Enter your account email and we&apos;ll help you recover access to your Cellzen tracking account.
            </p>

            {submitted && (
              <div className="mt-6 border border-[#B99353]/35 bg-[#B99353]/10 p-4 text-sm leading-relaxed text-[#8B6A31]">
                If this email exists, password reset instructions will be sent after reset email service is connected.
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Your e-mail..."
                className="w-full border border-[#E3DEEA] bg-white px-4 py-3 text-sm text-[#2D2D2D] outline-none transition-colors placeholder:text-[#2D2D2D]/30 focus:border-[#412460] xl:px-5 xl:py-4"
              />

              <button
                type="submit"
                className="w-full bg-[#412460] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] xl:py-4"
              >
                Send Reset Link
              </button>
            </form>

            <div className="mt-7 flex items-center justify-between text-xs">
              <Link to="/login" className="font-semibold text-[#412460] hover:text-[#B99353]">
                Back to login
              </Link>
              <Link to="/contact" className="font-semibold text-[#2D2D2D]/45 hover:text-[#412460]">
                Contact support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
