import React from "react";
import { Link } from "react-router-dom";
import Footer from "../../components/Footer";

const CHECKPOINTS = [
  {
    title: "Order confirmed",
    body: "We confirm supplier details, payment status, production plan, and expected ready date.",
  },
  {
    title: "Production update",
    body: "You receive updates when the supplier confirms progress or flags any schedule changes.",
  },
  {
    title: "Warehouse inspection",
    body: "Goods can be checked for quantity, visible condition, packaging, and required documents.",
  },
  {
    title: "Freight booked",
    body: "We share the shipping method, estimated transit time, and handover details.",
  },
  {
    title: "In transit",
    body: "You get practical updates based on carrier status, customs movement, and route changes.",
  },
  {
    title: "Delivered",
    body: "We confirm final delivery and help close out any delivery or document questions.",
  },
];

const DETAILS = [
  "Order or invoice reference",
  "Product name and supplier",
  "Shipping method",
  "Destination country and city",
  "Contact person for delivery",
];

export default function Tracking() {
  return (
    <>
      <section className="relative overflow-hidden bg-[#2A1740] pt-32 pb-24">
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353]">Tracking</p>
            <h1 className="premium-font-galdgderbold text-4xl leading-[1] text-white sm:text-5xl lg:text-7xl">
              Know where your order stands.
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-[1.9] text-white/60">
              Tracking at Cellzen is not just a number. Our team follows the order from supplier confirmation through production, inspection, freight handover, customs, and delivery.
            </p>
          </div>
          <div className="border border-white/12 bg-white/[0.07] p-7 shadow-[0_18px_55px_rgba(0,0,0,0.2)] backdrop-blur-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B99353]">Need an update?</p>
            <h2 className="mt-4 premium-font-galdgdersemi text-2xl text-white">Send your order reference.</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              We will check the latest internal status and share the next clear step with you.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/contact" className="inline-flex justify-center bg-[#B99353] px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#B99353]/85">
                Request tracking update
              </Link>
              <Link to="/login" className="inline-flex justify-center border border-white/20 px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white/75 transition-colors hover:border-[#B99353] hover:text-[#B99353]">
                Customer Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B99353]">Status checkpoints</p>
            <h2 className="mt-3 premium-font-galdgdersemi text-3xl text-[#412460]">What we monitor for you</h2>
          </div>
          <div className="grid gap-px bg-[#412460]/10 md:grid-cols-2 lg:grid-cols-3">
            {CHECKPOINTS.map((item, index) => (
              <article key={item.title} className="bg-white p-6 transition-colors hover:bg-[#EAE8E5]/55">
                <span className="text-xs font-black text-[#B99353]">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 text-sm font-bold text-[#2D2D2D]">{item.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[#2D2D2D]/55">{item.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-16 grid gap-8 bg-[#EAE8E5] p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h3 className="premium-font-galdgdersemi text-2xl text-[#412460]">Details that help us track faster</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/58">
                If you contact us for an update, include as many of these details as possible.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {DETAILS.map((detail) => (
                <div key={detail} className="border border-[#412460]/10 bg-white px-4 py-3 text-sm font-medium text-[#2D2D2D]/72">
                  {detail}
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
