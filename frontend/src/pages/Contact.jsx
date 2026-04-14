import React, { useState, useMemo } from "react";
import axios from "axios";
import Footer from "../components/ui/Footer";
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

export default function Contact() {
  const [form, setForm]                   = useState({ name: "", email: "", message: "" });
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
    <div className="min-h-screen flex flex-col bg-white" style={{ width: "100vw", marginLeft: "calc(-50vw + 50%)", marginTop: "-2rem", marginBottom: "-2rem" }}>
      <main className="flex-grow">

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
                <div className="mt-8 sm:mt-10 grid grid-cols-1 xs:grid-cols-2 gap-6 sm:gap-8">
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
                        <a href="#" className="text-[#2D2D2D]/40 transition hover:text-[#412460]" aria-label="WeChat">
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.5 11a1 1 0 100-2 1 1 0 000 2zm5-1a1 1 0 11-2 0 1 1 0 012 0zm-1.27 5.88c-2.94.36-5.58-.7-6.88-2.54-.2.02-.4.04-.6.04C2.11 13.38 0 11.5 0 9.19S2.11 5 4.75 5c2.3 0 4.2 1.44 4.63 3.38.37-.06.75-.1 1.12-.1 3.59 0 6.5 2.46 6.5 5.5 0 1.17-.42 2.26-1.14 3.15.28 1.07.89 2.07.89 2.07s-1.97-.35-2.82-.82c-.59.2-1.22.34-1.89.38a6.7 6.7 0 01-.41.02z"/></svg>
                        </a>
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
      </main>
    </div>
  );
}
