import React from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";

const CATEGORIES = [
  {
    title: "Consumer Goods",
    examples: "Homeware, lifestyle goods, packaging, daily-use items",
    note: "Good for retailers and importers looking for repeatable product supply.",
  },
  {
    title: "Electronics",
    examples: "Accessories, small devices, components, smart products",
    note: "Supplier checks and sample review are especially important before bulk orders.",
  },
  {
    title: "Garments",
    examples: "Apparel, uniforms, textiles, bags, seasonal collections",
    note: "We help compare materials, sizing, labels, and production capacity.",
  },
  {
    title: "Machinery",
    examples: "Light equipment, tools, spare parts, industrial supplies",
    note: "Technical specifications, documentation, and packaging are reviewed carefully.",
  },
  {
    title: "Building Materials",
    examples: "Fixtures, fittings, interior materials, construction supply",
    note: "Useful for project buyers who need organized sourcing and shipment planning.",
  },
  {
    title: "Custom Sourcing",
    examples: "Products not listed, niche requests, mixed-category orders",
    note: "Send your requirement and we will check whether the supplier network can support it.",
  },
];

const CAPABILITIES = [
  "Supplier search",
  "Quote comparison",
  "MOQ review",
  "Sample coordination",
  "Packaging checks",
  "Production updates",
  "Inspection support",
  "Shipping planning",
];

export default function Portfolio() {
  return (
    <>
      <section className="relative overflow-hidden bg-[#2A1740] pt-32 pb-24">
        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353]">Portfolio</p>
          <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <h1 className="premium-font-galdgderbold text-4xl leading-[1] text-white sm:text-5xl lg:text-7xl">
              Product categories we source with care.
            </h1>
            <p className="border-l border-white/15 pl-6 text-sm leading-[1.9] text-white/60">
              Our portfolio is not limited to one product type. We help clients compare suppliers, understand cost structure, check samples, and prepare goods for shipment.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((category, index) => (
              <article key={category.title} className="group relative overflow-hidden border border-[#2D2D2D]/10 bg-white p-6 shadow-[0_14px_34px_rgba(45,45,45,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#412460]/25">
                <div className="absolute -right-4 -top-6 premium-font-galdgderbold text-8xl text-[#412460]/5">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="relative z-10">
                  <span className="text-xs font-black text-[#B99353]">{String(index + 1).padStart(2, "0")}</span>
                  <h2 className="mt-5 text-lg font-bold text-[#412460]">{category.title}</h2>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/38">{category.examples}</p>
                  <p className="mt-4 text-sm leading-relaxed text-[#2D2D2D]/55">{category.note}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-16 grid gap-8 bg-[#EAE8E5] p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B99353]">What support includes</p>
              <h2 className="mt-3 premium-font-galdgdersemi text-3xl text-[#412460]">More than finding a supplier.</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#2D2D2D]/58">
                The real value is in checking the details before money, time, and shipments are committed.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CAPABILITIES.map((item) => (
                <div key={item} className="border border-[#412460]/10 bg-white px-4 py-3 text-sm font-medium text-[#2D2D2D]/75">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 border border-[#412460]/12 bg-[#412460] p-8 text-white">
            <h3 className="premium-font-galdgdersemi text-2xl">Looking for a product not listed here?</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">
              Share photos, specifications, target price, quantity, and destination. We will check realistic supplier options and next steps.
            </p>
            <Link to="/contact" className="mt-6 inline-flex bg-[#B99353] px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#B99353]/85">
              Send product request
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
