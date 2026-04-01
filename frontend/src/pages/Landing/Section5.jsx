import React, { useState } from "react";
import useScrollReveal from "./useScrollReveal";

const SHIPPING_MODES = [
  {
    mode: "Sea Freight",
    icon: (
      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17h1.5L7 11l3 6h4l3-6 2.5 6H21M5 21h14" />
      </svg>
    ),
    time: "20-35 days",
    best: "Large & heavy shipments",
    cost: "Most affordable",
    color: "from-blue-500 to-cyan-400",
  },
  {
    mode: "Air Freight",
    icon: (
      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    time: "5-10 days",
    best: "Medium shipments",
    cost: "Balanced",
    color: "from-cz-main to-purple-400",
  },
  {
    mode: "Express Delivery",
    icon: (
      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    time: "3-7 days",
    best: "Urgent & small packages",
    cost: "Premium speed",
    color: "from-cz-secondary-light to-yellow-400",
  },
];

const LOGISTICS_STEPS = [
  "Factory Pickup",
  "Warehouse Inspection",
  "Customs Documentation",
  "Freight Booking",
  "In-Transit Tracking",
  "Destination Customs",
  "Last-Mile Delivery",
];

export default function Section5() {
  const [ref, visible] = useScrollReveal(0.1);
  const [selectedMode, setSelectedMode] = useState(1);

  return (
    <section ref={ref} className="relative bg-cz-paper py-24 overflow-hidden">
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <span className="inline-block rounded-full bg-cz-main/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cz-main">
            End-to-End
          </span>
          <h2 className="mt-4 premium-font-galdgderbold text-3xl text-cz-ink sm:text-4xl lg:text-5xl">
            Logistics & Shipping
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-cz-ink/60">
            We manage full shipping solutions — sea, air, or express — directly to your destination.
          </p>
        </div>

        {/* Shipping modes */}
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {SHIPPING_MODES.map((sm, i) => (
            <button
              key={sm.mode}
              type="button"
              onClick={() => setSelectedMode(i)}
              className={`group relative rounded-2xl border p-6 text-left transition-all duration-500 ${selectedMode === i ? "border-cz-main/30 bg-white shadow-xl shadow-cz-main/10 scale-[1.02]" : "border-cz-ink/5 bg-white hover:border-cz-ink/15 hover:shadow-md"} ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
              style={{ transitionDelay: `${300 + i * 150}ms` }}
            >
              {/* Selected indicator */}
              {selectedMode === i && (
                <div className="absolute -top-px left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-cz-main to-cz-secondary-light" />
              )}

              <div className={`inline-flex rounded-xl p-3 transition-all duration-300 bg-gradient-to-br ${sm.color} ${selectedMode === i ? "text-white shadow-lg" : "text-white/80"}`}>
                {sm.icon}
              </div>

              <h3 className="mt-4 text-lg font-bold text-cz-ink">{sm.mode}</h3>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cz-ink/50">Transit Time</span>
                  <span className="font-semibold text-cz-ink">{sm.time}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cz-ink/50">Best For</span>
                  <span className="font-medium text-cz-ink/80">{sm.best}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cz-ink/50">Pricing</span>
                  <span className="font-medium text-cz-secondary-light">{sm.cost}</span>
                </div>
              </div>

              {selectedMode === i && (
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-cz-main">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Selected
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Logistics pipeline */}
        <div className={`mt-16 rounded-2xl border border-cz-ink/5 bg-white p-8 transition-all duration-700 delay-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h3 className="text-lg font-bold text-cz-ink mb-6">Full Logistics Pipeline</h3>

          <div className="flex flex-wrap items-center gap-2">
            {LOGISTICS_STEPS.map((step, i) => (
              <React.Fragment key={step}>
                <div className="group flex items-center gap-2 rounded-full bg-cz-main/5 border border-cz-main/10 px-4 py-2 transition-all duration-300 hover:bg-cz-main hover:text-white hover:shadow-lg hover:scale-105 cursor-default">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cz-main/10 text-[10px] font-bold text-cz-main group-hover:bg-white/20 group-hover:text-white transition-colors duration-300">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-cz-ink group-hover:text-white transition-colors duration-300">
                    {step}
                  </span>
                </div>
                {i < LOGISTICS_STEPS.length - 1 && (
                  <svg className="h-4 w-4 text-cz-ink/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
