import React, { useState } from "react";
import Footer from "./Footer";

const FAQS = [
  {
    category: "General",
    items: [
      {
        q: "What is Cellzen Trading?",
        a: "Cellzen Trading is a global sourcing and trading company based in Guangzhou, China. We connect businesses worldwide with verified suppliers, handling everything from product sourcing and quality inspection to logistics and delivery.",
      },
      {
        q: "Where is Cellzen Trading based?",
        a: "Our main office is located at Guangzhou Mingxin International, Baiyun District, Guangzhou City, China. We also have representatives in Nepal and Australia to serve our clients across different time zones.",
      },
      {
        q: "What types of products do you source?",
        a: "We source a wide range of products including electronics, garments, machinery, consumer goods, building materials, and more. If you have a specific product in mind, contact us and we'll let you know whether we can help.",
      },
    ],
  },
  {
    category: "Ordering & Pricing",
    items: [
      {
        q: "How do I get a price quote?",
        a: "Simply visit our Contact page, fill in your requirements, and our team will get back to you within 24 hours with a detailed quote including sourcing, inspection, and shipping costs.",
      },
      {
        q: "Is there a minimum order quantity (MOQ)?",
        a: "MOQ varies by product and supplier. We work with businesses of all sizes — from small startups to large enterprises — and will always try to find a supplier that fits your volume needs.",
      },
      {
        q: "What currencies do you accept for payment?",
        a: "We primarily transact in USD, CNY, AUD, and NPR. We support international wire transfers and other agreed-upon payment methods. Contact us to discuss what works best for you.",
      },
    ],
  },
  {
    category: "Shipping & Logistics",
    items: [
      {
        q: "Do you handle shipping and logistics?",
        a: "Yes. We coordinate the full logistics chain — from factory pickup in China to delivery at your destination — including customs documentation, freight forwarding, and last-mile delivery options.",
      },
      {
        q: "How long does shipping take?",
        a: "Shipping times depend on the destination and chosen freight method. Sea freight typically takes 15–35 days; air freight 3–7 days. We'll provide an estimated timeline when we confirm your order.",
      },
      {
        q: "Do you offer door-to-door delivery?",
        a: "Yes, we offer door-to-door delivery to most countries. We'll handle all the customs clearance and freight on your behalf so you can focus on your business.",
      },
    ],
  },
  {
    category: "Quality & Trust",
    items: [
      {
        q: "How do you ensure product quality?",
        a: "We conduct pre-shipment inspections and work only with verified, trusted suppliers. For larger orders, we can arrange third-party quality inspections at the factory before goods are shipped.",
      },
      {
        q: "What happens if my goods are damaged during shipping?",
        a: "All shipments are covered by cargo insurance. In the event of damage, we assist you in filing a claim and resolving the issue as quickly as possible.",
      },
    ],
  },
];

function AccordionItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#2D2D2D]/8 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="text-sm font-medium text-[#2D2D2D] pr-6">{question}</span>
        <span className={`shrink-0 h-5 w-5 flex items-center justify-center rounded-full border border-[#412460]/20 text-[#412460] transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-96 pb-5" : "max-h-0"}`}>
        <p className="text-sm leading-relaxed text-[#2D2D2D]/55">{answer}</p>
      </div>
    </div>
  );
}

export default function FAQ() {
  return (
    <>

        {/* Hero */}
        <section className="bg-[#2A1740] pt-28 pb-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353] mb-4">Support</p>
            <h1 className="premium-font-galdgderbold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight">
              Frequently Asked<br />Questions
            </h1>
          </div>
        </section>

        {/* FAQ Sections */}
        <section className="py-16 sm:py-20 bg-white">
          <div className="mx-auto max-w-3xl px-6">
            {FAQS.map((section) => (
              <div key={section.category} className="mb-12">
                <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-[#B99353] mb-2">{section.category}</h2>
                <div className="border-t border-[#2D2D2D]/8">
                  {section.items.map((item) => (
                    <AccordionItem key={item.q} question={item.q} answer={item.a} />
                  ))}
                </div>
              </div>
            ))}

            {/* Still have questions */}
            <div className="mt-8 bg-[#412460]/5 p-8 text-center">
              <h3 className="premium-font-galdgdersemi text-lg text-[#412460]">Still have questions?</h3>
              <p className="mt-2 text-sm text-[#2D2D2D]/50">Our team is happy to help you with anything not covered here.</p>
              <a
                href="mailto:support@cellzen.com"
                className="mt-5 inline-block bg-[#412460] px-8 py-3 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-[#412460]/85"
              >
                Contact Support
              </a>
            </div>
          </div>
        </section>

      <Footer />
    </>
  );
}
