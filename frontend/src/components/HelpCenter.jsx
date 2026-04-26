import React from "react";
import { Link } from "react-router-dom";
import Footer from "./Footer";

const TOPICS = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
      </svg>
    ),
    title: "Getting Started",
    desc: "Learn how to place your first order, request a quote, and onboard with Cellzen Trading.",
    links: ["How to request a quote", "Our sourcing process", "What to expect on your first order"],
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    title: "Payments & Pricing",
    desc: "Understand our pricing model, accepted payment methods, and how invoicing works.",
    links: ["Accepted payment methods", "How pricing is calculated", "Invoice & receipt guide"],
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2-2h6l2 2z" />
      </svg>
    ),
    title: "Shipping & Delivery",
    desc: "Everything about freight options, delivery timelines, customs, and tracking your shipment.",
    links: ["Shipping methods explained", "Tracking your order", "Customs & import duties"],
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Quality & Inspections",
    desc: "How we ensure product quality, pre-shipment inspections, and what to do if something goes wrong.",
    links: ["Our quality control process", "Requesting an inspection", "Damaged goods claims"],
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Partnerships",
    desc: "Information for businesses interested in becoming a long-term sourcing partner with Cellzen.",
    links: ["Partnership requirements", "How to become a partner", "Partner benefits & rates"],
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Account & Orders",
    desc: "Managing your inquiries, order history, and communication with the Cellzen team.",
    links: ["Checking your order status", "How to update your inquiry", "Communication guidelines"],
  },
];

export default function HelpCenter() {
  return (
    <>

        {/* Hero */}
        <section className="bg-[#2A1740] pt-28 pb-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353] mb-4">Support</p>
            <h1 className="premium-font-galdgderbold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight">
              How can we help you?
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-white/50 max-w-md mx-auto">
              Browse our help topics below, or reach out directly and a member of our team will get back to you within 24 hours.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/contact" className="bg-[#B99353] px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-[#B99353]/85">
                Contact Us
              </Link>
              <a href="mailto:support@cellzen.com" className="border border-white/20 px-7 py-3 text-xs font-semibold uppercase tracking-widest text-white/70 transition-colors hover:border-white hover:text-white">
                Email Support
              </a>
            </div>
          </div>
        </section>

        {/* Topics Grid */}
        <section className="py-16 sm:py-20 bg-white">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {TOPICS.map((topic) => (
                <div key={topic.title} className="border border-[#2D2D2D]/25 p-7 hover:border-[#412460]/40 hover:shadow-sm transition-all duration-200">
                  <div className="flex h-11 w-11 items-center justify-center bg-[#412460]/8 text-[#412460] mb-5">
                    {topic.icon}
                  </div>
                  <h3 className="text-sm font-bold text-[#2D2D2D]">{topic.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#2D2D2D]/50">{topic.desc}</p>
                  <ul className="mt-4 space-y-2">
                    {topic.links.map((link) => (
                      <li key={link} className="flex items-center gap-2 text-xs text-[#412460]/70 hover:text-[#412460] cursor-pointer transition-colors">
                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        {link}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Still need help */}
            <div className="mt-14 bg-[#2A1740] px-10 py-12 text-center">
              <h3 className="premium-font-galdgdersemi text-xl text-white">Still need help?</h3>
              <p className="mt-2 text-sm text-white/50">Our support team is available Monday – Friday, 9am – 6pm (GMT+8).</p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm">
                <a href="mailto:support@cellzen.com" className="flex items-center gap-2 text-[#B99353] hover:text-[#B99353]/80 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  support@cellzen.com
                </a>
                <a href="tel:+8613073040201" className="flex items-center gap-2 text-[#B99353] hover:text-[#B99353]/80 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  +86 130 7304 0201
                </a>
              </div>
            </div>
          </div>
        </section>

      <Footer />
    </>
  );
}
