import React, { useState } from "react";
import { Link } from "react-router-dom";
import useScrollReveal from "./useScrollReveal";

const REASONS = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    title: "One Point of Contact",
    desc: "From sourcing to delivery \u2014 you deal with one dedicated team throughout the entire process.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    title: "Any Product, Any Industry",
    desc: "Electronics, clothing, furniture, machinery \u2014 if it's manufactured, we can source and ship it.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Competitive Pricing",
    desc: "Direct factory relationships mean better prices \u2014 often 15-30% below market rates.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    title: "Full Transparency",
    desc: "Detailed quotes, real-time updates, and no hidden charges \u2014 ever.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Delivery to Australia & Nepal",
    desc: "Full shipping solutions to both markets with customs clearance included.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Trusted for All Order Sizes",
    desc: "Whether it's a small trial order or a full container \u2014 we handle it with the same care.",
  },
];

export default function Section7() {
  const [ref, visible] = useScrollReveal(0.1);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <section ref={ref} className="relative bg-white py-16 sm:py-24 overflow-hidden">
      {/* Decorative circles */}
      <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full border border-cz-main/5" />
      <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full border border-cz-secondary-light/5" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        <div className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <span className="inline-block rounded-full bg-cz-secondary-light/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cz-secondary-light">
            The Cellzen Advantage
          </span>
          <h2 className="mt-4 premium-font-galdgderbold text-3xl text-cz-ink sm:text-4xl lg:text-5xl">
            Why Choose Cellzen Trading
          </h2>
        </div>

        <div className="mt-10 sm:mt-16 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map((r, i) => (
            <div
              key={r.title}
              className={`group relative rounded-2xl border bg-white p-6 transition-all duration-500 cursor-default ${hoveredIdx === i ? "border-cz-main/30 shadow-xl shadow-cz-main/10 scale-[1.03]" : "border-cz-ink/5 hover:border-cz-ink/15"} ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
              style={{ transitionDelay: `${200 + i * 100}ms` }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Number badge */}
              <span className={`absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${hoveredIdx === i ? "bg-cz-main text-white scale-110 shadow-lg" : "bg-cz-main/10 text-cz-main"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className={`inline-flex rounded-xl p-3 transition-all duration-300 ${hoveredIdx === i ? "bg-cz-main text-white shadow-lg" : "bg-cz-main/5 text-cz-main"}`}>
                {r.icon}
              </div>

              <h3 className="mt-4 font-bold text-cz-ink group-hover:text-cz-main transition-colors duration-300">
                {r.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-cz-ink/60">{r.desc}</p>

              {/* Hover bottom accent */}
              <div className="absolute bottom-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-cz-main to-cz-secondary-light scale-x-0 transition-transform duration-500 origin-center group-hover:scale-x-100" />
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`mt-12 sm:mt-20 rounded-2xl bg-gradient-to-r from-cz-main to-[#553278] p-6 sm:p-10 text-center transition-all duration-700 delay-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h3 className="premium-font-galdgdersemi text-xl text-white sm:text-2xl md:text-3xl">
            Ready to simplify your imports?
          </h3>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
            Get in touch today and let us handle the sourcing, negotiation, and shipping \u2014 so you can focus on growing your business.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/contact"
              className="group inline-flex items-center gap-2 rounded-full bg-cz-secondary-light px-8 py-3 text-sm font-bold text-white transition-all duration-300 hover:shadow-[0_0_30px_rgba(185,147,83,0.4)] hover:scale-105"
            >
              Contact Us
              <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link
              to="/customer"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-white/60 hover:bg-white/10 hover:scale-105"
            >
              Track a Shipment
            </Link>
          </div>
        </div>

        {/* Footer note */}
        <div className={`mt-12 text-center transition-all duration-700 delay-[900ms] ${visible ? "opacity-100" : "opacity-0"}`}>
          <p className="text-xs text-cz-ink/40">
            &copy; {new Date().getFullYear()} Cellzen Trading. All rights reserved. | Australia &bull; Nepal &bull; China
          </p>
        </div>
      </div>
    </section>
  );
}
