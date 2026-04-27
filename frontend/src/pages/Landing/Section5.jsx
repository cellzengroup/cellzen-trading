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
  <section ref={ref} className="relative overflow-hidden py-16 sm:py-24 lg:py-28" style={{ backgroundColor: "#EAE8E5" }}>
  <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
  <div className={`text-center transition-all duration-700 motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
  <span className="inline-flex bg-cz-main/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cz-main">
  End-to-End
  </span>
  <h2 className="mt-4 sm:mt-5 premium-font-galdgderbold text-2xl sm:text-4xl lg:text-5xl text-cz-main leading-tight">
  Shipping Made Simple
  </h2>
  <p className="mx-auto mt-3 sm:mt-4 max-w-2xl text-xs sm:text-base leading-relaxed text-cz-ink/65">
  Whether you choose sea, air, or express, we handle the process and deliver to your location.
  </p>
  </div>

  {/* Shipping modes */}
  <div className="mt-8 sm:mt-14 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
  {SHIPPING_MODES.map((sm, i) => (
  <button
  key={sm.mode}
  type="button"
  onClick={() => setSelectedMode(i)}
  className={`group relative min-h-[44px] overflow-hidden border p-5 text-left transition-all duration-500 ease-out touch-manipulation motion-reduce:transition-none sm:p-6 ${selectedMode === i ? "border-cz-main/35 bg-white shadow-[0_16px_40px_rgba(65,36,96,0.12)] sm:-translate-y-1" : "border-cz-ink/10 bg-white/90 hover:border-cz-ink/20 hover:shadow-[0_10px_28px_rgba(45,45,45,0.10)] sm:hover:-translate-y-0.5"} ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
  style={{ transitionDelay: visible ? `${220 + i * 90}ms` : "0ms" }}
  >
  {/* Selected indicator */}
  {selectedMode === i && (
  <div className="absolute -top-px left-0 right-0 h-1 bg-cz-secondary-light" />
  )}

  <div className={`inline-flex p-3 transition-all duration-300 motion-reduce:transition-none ${selectedMode === i ? "bg-cz-secondary-light text-white shadow-lg" : "bg-cz-main text-white/85"}`}>
  {sm.icon}
  </div>

  <h3 className="mt-4 text-lg font-bold tracking-tight text-cz-ink">{sm.mode}</h3>

  <div className="mt-4 space-y-2.5">
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
  <span className="text-cz-ink/50">Transit Time</span>
  <span className="font-semibold text-cz-ink">{sm.time}</span>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
  <span className="text-cz-ink/50">Best For</span>
  <span className="font-medium text-cz-ink/80">{sm.best}</span>
  </div>
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
  <span className="text-cz-ink/50">Pricing</span>
  <span className="font-semibold text-cz-secondary-light">{sm.cost}</span>
  </div>
  </div>

  {selectedMode === i && (
  <div className="mt-4 flex items-center gap-2 text-xs font-semibold tracking-wide text-cz-secondary-light">
  <span className="h-1.5 w-1.5 bg-cz-secondary-light" />
  Active option
  </div>
  )}
  </button>
  ))}
  </div>

  {/* Logistics pipeline */}
  <div className={`mt-8 sm:mt-14 border border-cz-ink/10 bg-white/95 p-4 sm:p-8 shadow-[0_12px_32px_rgba(45,45,45,0.06)] transition-all duration-700 delay-300 motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
  <h3 className="mb-4 sm:mb-6 text-base sm:text-lg font-bold tracking-tight text-cz-ink">How Your Shipment Moves</h3>

  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
  {LOGISTICS_STEPS.map((step, i) => (
  <React.Fragment key={step}>
  <div className="group flex min-h-11 cursor-default items-center gap-2 border border-cz-main/12 bg-cz-main/5 px-3 py-2.5 transition-all duration-300 motion-reduce:transition-none hover:border-cz-main/25 hover:bg-cz-main hover:text-white hover:shadow-md sm:px-4">
  <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-cz-main/10 text-[10px] font-bold text-cz-main transition-colors duration-300 motion-reduce:transition-none group-hover:bg-white/20 group-hover:text-white">
  {i + 1}
  </span>
  <span className="text-sm font-medium text-cz-ink transition-colors duration-300 motion-reduce:transition-none group-hover:text-white">
  {step}
  </span>
  </div>
  {i < LOGISTICS_STEPS.length - 1 && (
  <svg className="hidden h-4 w-4 shrink-0 text-cz-ink/25 sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
