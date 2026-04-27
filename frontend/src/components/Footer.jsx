import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const wechatQrSrc = "/wechat.png?v=2";
const newsletterApiUrl = import.meta.env.PROD
  ? "/api/forms/newsletter"
  : "http://localhost:5300/api/forms/newsletter";

const Footer = () => {
  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState("");
  const [subscribeError, setSubscribeError] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    setSubscribeStatus("");
    setSubscribeError("");
    setIsSubscribing(true);

    try {
      await axios.post(newsletterApiUrl, { email });
      setEmail("");
      setSubscribeStatus("Thank you for subscribing.");
    } catch (err) {
      setSubscribeError(err.response?.data?.message || "Subscription failed. Please try again.");
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <footer className="bg-[#2D2D2D] text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-14 pb-6">

        {/* ── Top row: tagline + newsletter ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between pb-8 sm:pb-12">
          {/* Tagline */}
          <h2 className="premium-font-galdgderbold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight shrink-0">
            <span className="block">Global Trade,</span>
            <span className="block">Made Simple.</span>
          </h2>

          {/* Newsletter */}
          <div className="flex flex-col items-start w-full sm:w-auto">
            <p className="text-sm font-semibold text-white mb-3">Get In Touch!</p>
            <form onSubmit={handleSubscribe} className="flex items-center overflow-hidden border border-white/15 bg-white/5 backdrop-blur-sm w-full sm:w-80">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 bg-transparent px-4 py-3 text-xs text-white outline-none placeholder:text-white/30 min-w-0"
              />
              <button
                type="submit"
                disabled={isSubscribing}
                className="shrink-0 bg-[#B99353] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubscribing ? "Sending..." : "Subscribe"}
              </button>
            </form>
            {subscribeStatus && <p className="mt-2 text-xs text-white/70">{subscribeStatus}</p>}
            {subscribeError && <p className="mt-2 text-xs text-red-300">{subscribeError}</p>}
          </div>
        </div>

        {/* ── Middle row: 4 columns ── */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:flex sm:flex-row sm:flex-wrap sm:justify-between pb-10 border-b border-white/10">

          {/* Contact Information */}
          <div className="col-span-2 sm:col-span-1">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-4">Contact Information</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-xs text-white/60">
                <svg className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#B99353]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <a href="mailto:cellzengroup@gmail.com" className="hover:text-white transition-colors break-all">cellzengroup@gmail.com</a>
              </li>
              <li className="flex items-start gap-2 text-xs text-white/60">
                <svg className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#B99353]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>+86 130 7304 0201<br />+977 984 995 6242<br />+61 415 587 068</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-white/60">
                <svg className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#B99353]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Guangzhou Mingxin International,<br />Baiyun District, Guangzhou City,<br />China</span>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-4">Company</h4>
            <ul className="space-y-2.5">
              {[
                { label: "Home",      to: "/" },
                { label: "About",     to: "/#about" },
                { label: "Shipments", to: "/#shipments" },
              ].map(({ label, to }) => (
                <li key={label}>
                  <Link to={to} className="text-xs text-white/60 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-4">Help</h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/faq" className="text-xs text-white/60 transition-colors hover:text-white">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/help-center" className="text-xs text-white/60 transition-colors hover:text-white">
                  Help Center
                </Link>
              </li>
              <li>
                <Link to="/support" className="text-xs text-white/60 transition-colors hover:text-white">
                  Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Follow Us */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-4">Follow Us</h4>
            <div className="flex items-center gap-3">
              <a href="https://www.facebook.com/profile.php?id=61583020224419" target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-[#B99353] hover:text-white">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
                </svg>
              </a>
              <a href="https://www.instagram.com/cellzentrading/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-[#B99353] hover:text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="5" />
                  <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <div className="relative z-50 group">
                <button type="button" aria-label="WeChat QR code"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-[#B99353] hover:text-white focus:bg-[#B99353] focus:text-white focus:outline-none">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 3535 3082">
                    <path d="M341.08 2299C395.4 2189.7 449.73 2080.4 497.97 1983.35C396.74 1881.36 289.82 1792.19 205.42 1685.24C-87.4304 1314.17 -64.1704 800.13 256.06 452.43C582.63 97.8499 995.52 -29.4301 1466.38 5.58991C1754.05 26.9799 2014.04 124.71 2240.99 303.83C2423.2 447.64 2553 628.88 2617.5 853.93C2620.49 864.35 2620.73 875.55 2623.21 893.21C2586.14 889.67 2552 884.59 2517.73 883.4C2112.23 869.39 1744.71 971.94 1443.26 1253.79C1177.3 1502.46 1056.53 1806.45 1126.68 2173.47C1127.34 2176.9 1126 2180.71 1124.12 2197.46C1037.1 2175.39 951.04 2155.7 866.39 2131.14C827.57 2119.88 794.64 2117.39 755.66 2134.93C622.1 2195.05 486.49 2250.63 351.67 2307.94C348.14 2304.96 344.61 2301.98 341.08 2299ZM1049.69 661.51C1050.73 572.03 975.73 495.51 885.97 494.46C796.47 493.42 719.93 568.4 718.88 658.14C717.84 747.62 792.84 824.15 882.6 825.19C972.1 826.23 1048.64 751.25 1049.68 661.51H1049.69ZM1767.83 825.19C1857.44 825.41 1933.38 749.83 1933.6 660.2C1933.82 570.61 1858.22 494.69 1768.57 494.47C1678.96 494.25 1603.02 569.83 1602.8 659.46C1602.58 749.05 1678.18 824.97 1767.83 825.19Z" />
                    <path d="M3296.42 3081.81C3202.58 3041.74 3108.74 3001.67 3014.91 2961.59C2977.77 2945.73 2938.43 2933.6 2903.92 2913.28C2785.68 2843.65 2663.36 2849.83 2529.7 2859.99C2112.47 2891.7 1746.69 2771.81 1479.73 2430.94C1257.34 2146.99 1281.11 1747.3 1526.29 1479.37C1729.8 1256.98 1986.08 1144.4 2281.44 1111.54C2580.03 1078.31 2861.6 1131.86 3115.74 1293.84C3372.25 1457.33 3536.24 1683.22 3534.69 2000.11C3533.59 2224.87 3428.29 2404.88 3268.27 2555.52C3232.27 2589.41 3193.41 2621.55 3151.57 2647.6C3114.17 2670.88 3114.17 2691.34 3133.06 2727.38C3192.56 2840.95 3248.31 2956.48 3305.51 3071.25C3302.48 3074.77 3299.45 3078.29 3296.41 3081.81H3296.42ZM2265.07 1766.16C2266.11 1676.68 2191.11 1600.16 2101.35 1599.11C2011.85 1598.07 1935.31 1673.05 1934.26 1762.79C1933.22 1852.27 2008.22 1928.79 2097.98 1929.84C2187.48 1930.88 2264.02 1855.9 2265.06 1766.16H2265.07ZM2763.88 1599.11C2674.31 1598.33 2597.99 1673.46 2597.21 1763.2C2596.43 1852.75 2671.58 1929.05 2761.34 1929.83C2850.91 1930.61 2927.22 1855.48 2928.01 1765.74C2928.79 1676.19 2853.64 1599.89 2763.88 1599.11Z" />
                  </svg>
                </button>
                <div className="invisible pointer-events-none absolute bottom-full left-1/2 z-[9999] mb-3 -translate-x-1/2 translate-y-2 scale-95 rounded-lg bg-white p-3 opacity-0 shadow-2xl ring-1 ring-black/15 transition duration-200 group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100">
                  <div
                    aria-label="WeChat QR code"
                    className="h-32 w-32 bg-contain bg-center bg-no-repeat"
                    style={{ backgroundImage: `url("${wechatQrSrc}")` }}
                  />
                </div>
              </div>
          </div>
          </div>

        </div>

        {/* ── Bottom row: copyright + legal ── */}
        <div className="flex flex-col items-center justify-between gap-3 pt-6 sm:flex-row">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} Cellzen Trading. All Rights Reserved.
          </p>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="text-xs text-white/30 hover:text-white/60 transition-colors">Privacy</Link>
            <Link to="/terms" className="text-xs text-white/30 hover:text-white/60 transition-colors">Terms &amp; Conditions</Link>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
