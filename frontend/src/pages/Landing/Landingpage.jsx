import React, { useState } from "react";

import Footer from "../../components/ui/Footer";
import Section1 from "./Section1";
import Section2 from "./Section2";
import Section3 from "./Section3";
import Section4 from "./Section4";
import Section5 from "./Section5";
import Section6 from "./Section6";
import Section7 from "./Section7";

function GuideCTA() {
  const [form, setForm] = useState({ firstName: "", email: "" });
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: integrate with backend
  };

  return (
    <section className="bg-[#EAE8E5] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2">
          <div>
            <h2 className="premium-font-galdgderbold text-xl sm:text-2xl md:text-3xl text-[#2D2D2D] leading-tight">
              Get Our Product Sourcing<br />& Pricing Guide
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#2D2D2D]/60">
              Interested in working with us, but want more info regarding costs?
              Leave your details below to receive our comprehensive sourcing &amp; pricing guide.
            </p>
            <p className="mt-3 text-xs text-[#2D2D2D]/40">
              The guide will be sent to you as an email. We'll never sell your details, including your
              email, and it's easy to unsubscribe at any time.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 sm:mt-8">
              <div className="flex flex-col gap-4 sm:flex-row">
                <input
                  name="firstName"
                  type="text"
                  required
                  value={form.firstName}
                  onChange={handleChange}
                  className="flex-1 border-0 border-b border-[#2D2D2D]/20 bg-transparent pb-3 text-sm text-[#2D2D2D] outline-none transition-colors focus:border-[#412460] placeholder:text-[#2D2D2D]/35"
                  placeholder="First Name"
                />
                <input
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  className="flex-1 border-0 border-b border-[#2D2D2D]/20 bg-transparent pb-3 text-sm text-[#2D2D2D] outline-none transition-colors focus:border-[#412460] placeholder:text-[#2D2D2D]/35"
                  placeholder="Email Address"
                />
              </div>
              <button
                type="submit"
                className="mt-6 rounded-full bg-[#412460] px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#412460]/90 hover:shadow-lg"
              >
                Send
              </button>
            </form>
          </div>
          <div className="relative hidden sm:flex items-center justify-center">
            <div
              className="absolute h-72 w-72 rounded-full opacity-30"
              style={{ background: "radial-gradient(circle, #B99353 0%, transparent 70%)", right: "10%", top: "50%", transform: "translateY(-50%)" }}
            />
            <div className="relative z-10 flex h-[340px] sm:h-[400px] w-[200px] sm:w-[220px] items-center justify-center overflow-hidden rounded-[2rem] border-4 border-[#2D2D2D]/10 bg-white shadow-2xl">
              <div className="flex flex-col items-center justify-center px-4 text-center">
                <svg className="h-12 w-auto mb-4" viewBox="0 0 180 181" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#cz-guide)">
                    <path d="M179.938 104.968C174.068 136.468 157.075 159.321 128.033 172.6C85.7055 192.056 36.8899 176.615 12.791 137.086C1.97741 118.865 -1.7301 99.4095 0.741575 78.4097C5.37597 41.66 33.8003 10.7779 70.8755 2.13091C106.097 -5.89844 144.717 9.23379 165.108 39.8071C172.523 50.9246 177.467 62.9686 179.629 76.248C179.629 76.8656 179.938 77.7921 179.938 78.4097C179.32 78.7185 179.011 78.7185 179.011 78.7185C161.71 79.3362 144.408 78.7185 128.033 74.0862C121.545 72.2333 116.91 66.3657 116.91 59.5716V52.1599C116.91 48.1452 112.585 45.6747 109.186 47.8364L98.6819 54.0128L86.9414 60.4981L66.55 72.2333L49.5572 82.1155L42.7601 86.1302C39.3616 87.9831 39.3616 92.9243 42.7601 95.086L49.5572 99.1007L66.859 108.983L86.9414 120.409L98.9908 127.203L109.495 133.38C112.894 135.233 117.219 132.762 117.219 129.056V121.953C117.219 115.468 121.545 109.601 127.724 107.439C139.156 103.733 151.205 102.189 163.563 102.498H177.467C179.629 101.88 180.247 102.807 179.938 104.968Z"
                      fill="#412460"
                    />
                  </g>
                  <defs>
                    <clipPath id="cz-guide"><rect width="180" height="181" fill="white"/></clipPath>
                  </defs>
                </svg>
                <p className="text-xs font-bold text-[#412460] uppercase tracking-wider">Cellzen</p>
                <p className="text-[10px] text-[#2D2D2D]/40 mt-1">Trading Worldwide</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Landingpage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#412460", width: "100vw", marginLeft: "calc(-50vw + 50%)", marginTop: "-2rem", marginBottom: "-2rem" }}>
      <main className="flex-grow">
        <Section1 />
        <Section2 />
        <Section4 />
        <Section3 />
        <Section5 />
        <Section6 />
        <GuideCTA />
        <Section7 />
      </main>
      <Footer />
    </div>
  );
}
