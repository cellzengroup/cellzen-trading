import React, { useState } from "react";
import useScrollReveal from "./useScrollReveal";

const MARKETS = [
  {
    flag: "🇨🇳",
    country: "China",
    role: "Sourcing Hub",
    desc: "Direct access to thousands of verified factories across all major manufacturing regions — Guangdong, Zhejiang, Jiangsu, and beyond.",
    color: "from-red-500 to-orange-500",
    bgGlow: "bg-red-500/10",
    stats: [
      { label: "Factory Partners", value: "200+" },
      { label: "Product Categories", value: "50+" },
    ],
  },
  {
    flag: "🇦🇺",
    country: "Australia",
    role: "Growing Market",
    desc: "Serving Australian businesses with reliable, cost-effective sourcing solutions. Shipping by sea, air, or express delivery.",
    color: "from-blue-500 to-cyan-500",
    bgGlow: "bg-blue-500/10",
    stats: [
      { label: "Delivery Options", value: "3" },
      { label: "Transit Time", value: "10-25 days" },
    ],
  },
  {
    flag: "🇳🇵",
    country: "Nepal",
    role: "Growing Market",
    desc: "Connecting Nepalese businesses with Chinese manufacturers at competitive prices, handling all logistics and customs clearance.",
    color: "from-red-600 to-blue-600",
    bgGlow: "bg-purple-500/10",
    stats: [
      { label: "Customs Support", value: "Full" },
      { label: "Pricing", value: "Best Rate" },
    ],
  },
];

export default function Section4() {
  const [ref, visible] = useScrollReveal(0.1);
  const [hovered, setHovered] = useState(null);

  return (
    <section ref={ref} className="relative bg-gradient-to-b from-[#1a0a2e] to-cz-main py-24 overflow-hidden">
      {/* Animated grid */}
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <span className="inline-block rounded-full border border-cz-secondary-light/30 bg-cz-secondary-light/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cz-secondary-light">
            Global Reach
          </span>
          <h2 className="mt-4 premium-font-galdgderbold text-3xl text-white sm:text-4xl lg:text-5xl">
            Markets We Serve
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/60">
            Strategically positioned across three countries to deliver maximum value.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {MARKETS.map((m, i) => (
            <div
              key={m.country}
              className={`group relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden transition-all duration-500 ${hovered === i ? "border-white/25 scale-[1.03] shadow-2xl" : "hover:border-white/15"} ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
              style={{ transitionDelay: `${300 + i * 150}ms` }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Glow effect on hover */}
              <div className={`absolute inset-0 ${m.bgGlow} opacity-0 transition-opacity duration-500 ${hovered === i ? "opacity-100" : ""}`} />

              {/* Top gradient bar */}
              <div className={`h-1 bg-gradient-to-r ${m.color} transition-all duration-300 ${hovered === i ? "h-1.5" : ""}`} />

              <div className="relative z-10 p-8">
                <div className="flex items-center gap-4 mb-6">
                  <span className={`text-5xl transition-transform duration-500 ${hovered === i ? "scale-125 rotate-6" : ""}`}>
                    {m.flag}
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-white">{m.country}</h3>
                    <span className={`inline-block rounded-full bg-gradient-to-r ${m.color} px-3 py-0.5 text-xs font-semibold text-white`}>
                      {m.role}
                    </span>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-white/60 mb-6">{m.desc}</p>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  {m.stats.map((stat) => (
                    <div key={stat.label} className="rounded-lg bg-white/5 border border-white/5 p-3 text-center transition-all duration-300 group-hover:border-white/10 group-hover:bg-white/10">
                      <div className="text-lg font-bold text-cz-secondary-light">{stat.value}</div>
                      <div className="text-[10px] uppercase tracking-wider text-white/40">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Connection lines */}
              {i < MARKETS.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-4 w-8 border-t border-dashed border-white/20 z-20" />
              )}
            </div>
          ))}
        </div>

        {/* Connection label */}
        <div className={`mt-12 flex justify-center transition-all duration-700 delay-700 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-6 py-3 backdrop-blur-sm">
            <div className="flex -space-x-1">
              {["🇨🇳", "🇦🇺", "🇳🇵"].map((f, i) => (
                <span key={i} className="text-lg">{f}</span>
              ))}
            </div>
            <span className="text-sm text-white/60">Connected supply chain across all three markets</span>
          </div>
        </div>
      </div>
    </section>
  );
}
