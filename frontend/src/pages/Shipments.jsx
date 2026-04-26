import React from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";

const MODES = [
  {
    name: "Sea Freight",
    time: "20-35 days",
    fit: "Large, heavy, or planned inventory shipments",
    detail: "Best when cost control matters more than speed. We coordinate freight booking, documents, and destination handover.",
  },
  {
    name: "Air Freight",
    time: "5-10 days",
    fit: "Medium shipments and faster restocking",
    detail: "A balanced option for products that need to move faster without using premium express channels.",
  },
  {
    name: "Express Delivery",
    time: "3-7 days",
    fit: "Samples, urgent parcels, and small orders",
    detail: "Useful for samples, replacement parts, urgent stock, and small high-priority packages.",
  },
];

const PROCESS = [
  "Factory pickup",
  "Warehouse check",
  "Packing review",
  "Customs documents",
  "Freight handover",
  "Transit updates",
  "Destination clearance",
  "Final delivery",
];

export default function Shipments() {
  return (
    <>
      <section className="relative overflow-hidden bg-[#2A1740] pt-32 pb-24">
        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="max-w-3xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353]">Shipments</p>
            <h1 className="premium-font-galdgderbold text-4xl leading-[1] text-white sm:text-5xl lg:text-7xl">
              Move goods with the route that makes sense.
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-[1.9] text-white/60">
              From factory pickup in China to customs support and delivery, we help you choose the right shipping method for your budget, cargo size, and timeline.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#EAE8E5] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-5 lg:grid-cols-3">
            {MODES.map((mode, index) => (
              <article key={mode.name} className="group border border-[#2D2D2D]/10 bg-white p-7 shadow-[0_18px_45px_rgba(45,45,45,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-[#412460]/25">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-xs font-black text-[#B99353]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="bg-[#412460]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#412460]">{mode.time}</span>
                </div>
                <h2 className="mt-8 premium-font-galdgdersemi text-2xl text-[#412460]">{mode.name}</h2>
                <p className="mt-3 text-sm font-medium text-[#2D2D2D]/75">{mode.fit}</p>
                <p className="mt-4 text-xs leading-relaxed text-[#2D2D2D]/52">{mode.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-16 grid gap-8 bg-white p-6 shadow-[0_18px_45px_rgba(45,45,45,0.06)] sm:p-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B99353]">Shipping workflow</p>
              <h2 className="mt-3 premium-font-galdgdersemi text-3xl text-[#412460]">From supplier door to your destination.</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#2D2D2D]/58">
                We keep the process organized so your shipment moves through the right checks before it leaves China.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROCESS.map((step, index) => (
                <div key={step} className="flex items-center gap-3 border border-[#412460]/10 bg-[#412460]/5 px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center bg-[#412460] text-[10px] font-bold text-white">{index + 1}</span>
                  <span className="text-sm font-medium text-[#2D2D2D]/75">{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 border-l-4 border-[#B99353] bg-[#2A1740] p-7 text-white sm:p-9">
            <h3 className="premium-font-galdgdersemi text-2xl">Not sure which shipping method is right?</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">
              Send us your product type, weight, quantity, destination, and timeline. We will suggest a practical route and explain the tradeoffs clearly.
            </p>
            <Link to="/contact" className="mt-6 inline-flex bg-[#B99353] px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#B99353]/85">
              Ask for shipment advice
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
