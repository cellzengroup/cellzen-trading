import React from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";

const NOTICES = [
  {
    type: "Shipping",
    title: "Shipping timelines can vary by season",
    body: "Peak-season demand, customs inspections, carrier availability, and weather can affect final delivery dates. We recommend confirming timelines before placing urgent orders.",
  },
  {
    type: "Quotations",
    title: "Final costs are confirmed before order placement",
    body: "Product cost, local handling, inspection needs, shipping method, and payment terms are reviewed before an order is confirmed. This keeps expectations clear before production begins.",
  },
  {
    type: "Inspection",
    title: "Inspection should be planned before dispatch",
    body: "If you need quantity checks, packaging photos, sample review, or third-party inspection, it is best to request this before goods leave the supplier or warehouse.",
  },
  {
    type: "Customs",
    title: "Import rules depend on destination country",
    body: "Duties, taxes, restricted items, and documentation requirements vary by market. Our team can help prepare documents, but final import rules are set by local authorities.",
  },
];

const REMINDERS = [
  "Share complete product specifications before quotation.",
  "Confirm packaging requirements before production starts.",
  "Allow extra time around holidays and peak shipping seasons.",
  "Keep order references ready when asking for updates.",
];

export default function Notices() {
  return (
    <>
      <section className="relative overflow-hidden bg-[#2A1740] pt-32 pb-24">
        <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[1fr_0.75fr] lg:items-end">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353]">Notices</p>
            <h1 className="premium-font-galdgderbold text-4xl leading-[1] text-white sm:text-5xl lg:text-7xl">
              Important notes before you order or ship.
            </h1>
          </div>
          <p className="border-l border-white/15 pl-6 text-sm leading-[1.9] text-white/60">
            These notices help clients plan better around quotations, inspections, shipping timelines, customs documents, and delivery expectations.
          </p>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-5 lg:grid-cols-2">
            {NOTICES.map((notice, index) => (
              <article key={notice.title} className="border border-[#2D2D2D]/10 bg-white p-6 shadow-[0_14px_34px_rgba(45,45,45,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#412460]/25">
                <div className="flex items-center justify-between gap-4">
                  <span className="bg-[#B99353]/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#B99353]">{notice.type}</span>
                  <span className="text-xs font-black text-[#412460]/35">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h2 className="mt-6 text-lg font-bold text-[#412460]">{notice.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/58">{notice.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-16 grid gap-8 bg-[#EAE8E5] p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B99353]">Client reminders</p>
              <h2 className="mt-3 premium-font-galdgdersemi text-3xl text-[#412460]">Small details prevent shipment delays.</h2>
            </div>
            <div className="space-y-3">
              {REMINDERS.map((reminder, index) => (
                <div key={reminder} className="flex gap-4 border border-[#412460]/10 bg-white p-4">
                  <span className="text-xs font-black text-[#B99353]">{String(index + 1).padStart(2, "0")}</span>
                  <p className="text-sm font-medium text-[#2D2D2D]/72">{reminder}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 border-l-4 border-[#B99353] bg-[#2A1740] p-7 text-white sm:p-9">
            <h3 className="premium-font-galdgdersemi text-2xl">Need clarification on an order notice?</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/58">
              Tell us your product, destination, and shipment stage. We will explain what applies to your case.
            </p>
            <Link to="/contact" className="mt-6 inline-flex bg-[#B99353] px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#B99353]/85">
              Contact our team
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
