import React, { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import Footer from "../components/Footer";
import CountrySelector from "../components/ui/CountrySelector";
import { countries } from "../components/countries";

const STEPS = [
  { num: "01", title: "Send us a message", desc: "Fill the form or email us with your requirements." },
  { num: "02", title: "We'll get in touch", desc: "Our team reviews and responds within 24 hours." },
  { num: "03", title: "Confirm your order", desc: "We finalise pricing, timeline, and shipping details." },
  { num: "04", title: "We deliver worldwide", desc: "Sit back while we handle sourcing and logistics." },
];

const flagUrl   = (code) => `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
const flagUrl2x = (code) => `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
const wechatQrSrc = "/wechat.png?v=2";

export default function Contact() {
  const location = useLocation();
  const [form, setForm]                   = useState({ name: "", email: "", message: "" });

  // Pre-fill the message when arriving from a product Inquire button
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const product = params.get("product");
    if (product) {
      setForm((f) => ({
        ...f,
        message: `Product Name: ${product}\n\nMessage: `,
      }));
    }
  }, [location.search]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [phonePrefix, setPhonePrefix]     = useState("");
  const [phoneNumber, setPhoneNumber]     = useState("");
  const [submitted, setSubmitted]         = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");

  const API_URL = import.meta.env.PROD
    ? "/api/forms/contact"
    : "http://localhost:5300/api/forms/contact";

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleCountryChange = (country) => {
    setSelectedCountry(country);
    setPhonePrefix(country.countryCode);
  };

  const handlePhoneNumberChange = (e) =>
    setPhoneNumber(e.target.value.replace(/[^\d\s\-]/g, ''));

  const prefixFlag = useMemo(() => {
    if (selectedCountry) return selectedCountry;
    if (!phonePrefix || phonePrefix.length < 2) return null;
    return countries.find(c => c.countryCode === phonePrefix) ?? null;
  }, [phonePrefix, selectedCountry]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fullPhone = phoneNumber ? `${phonePrefix} ${phoneNumber}`.trim() : phonePrefix;
      await axios.post(API_URL, {
        ...form,
        country: selectedCountry?.name ?? "",
        phone: fullPhone,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setForm({ name: "", email: "", message: "" });
    setSelectedCountry(null);
    setPhonePrefix("");
    setPhoneNumber("");
  };

  return (
    <>
        {/* ═══ SECTION 1 — Hero ═══ */}
        <section className="bg-white pt-24 pb-16 sm:pt-28 sm:pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">

            <div className="grid items-start gap-10 lg:gap-16 lg:grid-cols-2">

              {/* Left — Headline + Contact Details */}
              <div>
                <h1 className="premium-font-galdgderbold text-3xl sm:text-4xl md:text-5xl text-[#412460] leading-tight">
                  We are always ready to help you and answer your questions
                </h1>

                <p className="mt-5 text-sm leading-relaxed text-[#2D2D2D]/50 max-w-md">
                  Whether you're looking for global sourcing, supply chain solutions, or trading partnerships — our team is here to assist you every step of the way.
                </p>

                {/* Contact Info Grid */}
                <div className="mt-8 sm:mt-10 grid grid-cols-2 gap-6 sm:gap-8">
                  {/* Contacts */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">Contacts</h4>
                    <div className="mt-2 space-y-2 text-sm text-[#2D2D2D]/60 leading-relaxed">
                      <p><span className="font-semibold text-[#2D2D2D]/80">China:</span><br />+86 130 7304 0201<br />+86 130 7301 7734</p>
                      <p><span className="font-semibold text-[#2D2D2D]/80">Nepal:</span><br />+977 984 995 6242</p>
                      <p><span className="font-semibold text-[#2D2D2D]/80">Australia:</span><br />+61 415 587 068</p>
                    </div>
                  </div>

                  {/* Email, Location, Social */}
                  <div className="space-y-6 sm:space-y-8">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">Email</h4>
                      <p className="mt-2 text-sm text-[#2D2D2D]/60 break-all">cellzengroup@gmail.com</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">Our Location</h4>
                      <p className="mt-2 text-sm text-[#2D2D2D]/60 leading-relaxed">
                        Guangzhou Mingxin International,<br />Baiyun District, Guangzhou City,<br />China
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">Social Network</h4>
                      <div className="mt-3 flex items-center gap-4">
                        <a href="https://www.facebook.com/profile.php?id=61583020224419" target="_blank" rel="noopener noreferrer" className="text-[#2D2D2D]/40 transition hover:text-[#412460]" aria-label="Facebook">
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
                        </a>
                        <a href="https://www.instagram.com/cellzentrading/?fbclid=IwY2xjawRLFB1leHRuA2FlbQIxMQBicmlkETFyblJ5U1ZTdHJPS01LVXdqc3J0YwZhcHBfaWQBMAABHlcnPi-mAS0ecZQkeWpI4dcALg7dIV5r_Hjt7nDLwGb7T5MNEOrnpwk07wTK_aem__RJak-V5H97PJBwECpaPUw" target="_blank" rel="noopener noreferrer" className="text-[#2D2D2D]/40 transition hover:text-[#412460]" aria-label="Instagram">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" /></svg>
                        </a>
                        <div className="group relative z-50">
                          <button type="button" className="text-[#2D2D2D]/40 transition hover:text-[#412460] focus:text-[#412460] focus:outline-none" aria-label="WeChat QR code">
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 3535 3082">
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
                </div>
              </div>

              {/* Right — Contact Form */}
              <div className="bg-[#412460]/5 backdrop-blur-sm p-6 sm:p-8 md:p-10">
                <h2 className="premium-font-galdgdersemi text-xl sm:text-2xl text-[#412460]">Get in Touch</h2>
                <p className="mt-2 text-sm text-[#2D2D2D]/50">
                  Define your goals and identify areas where we can add value to your business.
                </p>

                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-10 sm:py-12 text-center">
                    <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[#412460]/10 text-[#412460] mb-4">
                      <svg className="h-7 w-7 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#2D2D2D]">Thank You for Your Inquiry!</h3>
                    <p className="mt-2 text-sm text-[#2D2D2D]/60">
                      We've received your message and will get back to you within 24 hours.
                    </p>
                    <button
                      onClick={handleReset}
                      className="mt-6 w-full bg-[#412460] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#412460]/90"
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-6 sm:mt-8 space-y-4 sm:space-y-5">

                    <input
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      className="w-full border border-[#2D2D2D]/8 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-[#2D2D2D] outline-none transition-colors focus:border-[#412460] focus:bg-white/80 placeholder:text-[#2D2D2D]/30"
                      placeholder="Full name"
                    />

                    <input
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      className="w-full border border-[#2D2D2D]/8 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-[#2D2D2D] outline-none transition-colors focus:border-[#412460] focus:bg-white/80 placeholder:text-[#2D2D2D]/30"
                      placeholder="Email"
                    />

                    <CountrySelector
                      value={selectedCountry}
                      onChange={handleCountryChange}
                      placeholder="Country"
                      required
                    />

                    {/* Phone */}
                    <div className="flex border border-[#2D2D2D]/8 bg-white/60 backdrop-blur-sm focus-within:border-[#412460] focus-within:bg-white/80 transition-colors">
                      <div className="flex items-center gap-1.5 pl-3 pr-2 border-r border-[#2D2D2D]/8 flex-shrink-0">
                        {prefixFlag && (
                          <img
                            src={flagUrl(prefixFlag.code)}
                            srcSet={`${flagUrl2x(prefixFlag.code)} 2x`}
                            alt=""
                            className="w-5 h-4 object-contain flex-shrink-0"
                          />
                        )}
                        <input
                          type="text"
                          value={phonePrefix}
                          onChange={e => setPhonePrefix(e.target.value.replace(/[^\d+]/g, ''))}
                          placeholder="+1"
                          className="w-12 bg-transparent text-sm text-[#2D2D2D] outline-none placeholder:text-[#2D2D2D]/30 py-3"
                        />
                      </div>
                      <input
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={handlePhoneNumberChange}
                        className="flex-1 bg-transparent px-3 py-3 text-sm text-[#2D2D2D] outline-none placeholder:text-[#2D2D2D]/30 min-w-0"
                        placeholder="Phone number"
                      />
                    </div>

                    <textarea
                      name="message"
                      required
                      rows={4}
                      value={form.message}
                      onChange={handleChange}
                      className="w-full border border-[#2D2D2D]/10 bg-white px-4 py-3 text-sm text-[#2D2D2D] outline-none transition-colors focus:border-[#412460] resize-none placeholder:text-[#2D2D2D]/30"
                      placeholder="Message"
                    />

                    {error && <p className="text-red-500 text-sm">{error}</p>}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#412460] py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#412460]/90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <span>{loading ? "Sending..." : "Send a message"}</span>
                      {!loading && (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      )}
                    </button>
                  </form>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* ═══ SECTION 2 — Steps ═══ */}
        <section className="border-t border-[#2D2D2D]/8 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="premium-font-galdgdersemi text-xl sm:text-2xl text-[#412460] italic mb-10 sm:mb-14">
              How to work with Cellzen Trading
            </h2>
            <div className="grid gap-6 sm:gap-8 grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step) => (
                <div key={step.num} className="flex flex-col items-start">
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 border-[#412460] text-xs sm:text-sm font-bold text-[#412460]">
                    {step.num}
                  </div>
                  <h3 className="mt-3 sm:mt-4 text-xs sm:text-sm font-bold text-[#2D2D2D]">{step.title}</h3>
                  <p className="mt-1.5 sm:mt-2 text-xs leading-relaxed text-[#2D2D2D]/50">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Footer />
    </>
  );
}
