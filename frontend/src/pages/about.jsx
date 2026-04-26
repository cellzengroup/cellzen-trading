import React from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";

const STATS = [
  { value: "500+", label: "Products sourced" },
  { value: "200+", label: "Factory partners" },
  { value: "10+", label: "Countries served" },
  { value: "24/7", label: "Support access" },
];

const VALUES = [
  {
    title: "Clear sourcing",
    body: "We compare suppliers, pricing, samples, and production capacity before presenting practical options.",
  },
  {
    title: "Quality first",
    body: "Orders can be checked through warehouse inspection, factory coordination, and pre-shipment review.",
  },
  {
    title: "One point of contact",
    body: "From inquiry to shipping, clients work with one team instead of chasing multiple suppliers and agents.",
  },
];

const TIMELINE = [
  "Requirement review",
  "Supplier search",
  "Quote comparison",
  "Sample or inspection",
  "Order coordination",
  "Shipping support",
];

export default function About() {
  return (
    <>
      <section className="relative overflow-hidden bg-[#2A1740] pt-32 pb-24">
        <div className="relative z-10 mx-auto grid max-w-6xl items-end gap-12 px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.32em] text-[#B99353]">About Cellzen</p>
            <h1 className="premium-font-galdgderbold text-4xl leading-[0.98] text-white sm:text-5xl lg:text-7xl">
              Your China sourcing partner, from factory to delivery.
            </h1>
          </div>
          <div className="border-l border-white/15 pl-6">
            <p className="text-sm leading-[1.9] text-white/62">
              Cellzen Trading is based in Guangzhou, close to one of the world&apos;s strongest manufacturing networks. We help businesses find reliable suppliers, understand real costs, inspect goods, and move shipments with confidence.
            </p>
            <Link
              to="/contact"
              className="mt-7 inline-flex bg-[#B99353] px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-[#B99353]/85"
            >
              Start a sourcing request
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#EAE8E5] py-10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-[#412460]/10 px-6 md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="bg-[#EAE8E5] py-8 text-center">
              <div className="premium-font-galdgderbold text-3xl text-[#412460]">{stat.value}</div>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#2D2D2D]/45">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-18 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B99353]">How we work</p>
              <h2 className="mt-4 premium-font-galdgdersemi text-3xl leading-tight text-[#412460]">
                Built for businesses that need practical support, not confusion.
              </h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              {VALUES.map((item) => (
                <div key={item.title} className="border border-[#2D2D2D]/10 bg-white p-6 shadow-[0_14px_34px_rgba(45,45,45,0.06)]">
                  <h3 className="text-sm font-bold text-[#2D2D2D]">{item.title}</h3>
                  <p className="mt-3 text-xs leading-relaxed text-[#2D2D2D]/55">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 border border-[#412460]/12 bg-[#412460]/5 p-6 sm:p-8">
            <h3 className="mb-6 text-sm font-bold uppercase tracking-[0.22em] text-[#412460]">Sourcing flow</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {TIMELINE.map((step, index) => (
                <div key={step} className="border border-[#412460]/12 bg-white px-4 py-4">
                  <span className="text-xs font-black text-[#B99353]">{String(index + 1).padStart(2, "0")}</span>
                  <p className="mt-2 text-xs font-semibold text-[#2D2D2D]/75">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
