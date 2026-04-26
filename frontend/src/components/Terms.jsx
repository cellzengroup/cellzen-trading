import React from "react";
import Footer from "./Footer";

const SECTIONS = [
  {
    title: "Acceptance of Terms",
    body: `By accessing or using the Cellzen Trading website and services, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you may not use our services. These terms apply to all visitors, clients, and partners who access or use our services.`,
  },
  {
    title: "Services",
    body: `Cellzen Trading provides global product sourcing, supply chain coordination, quality inspection, and logistics services. We act as an intermediary between buyers and verified suppliers. The scope, pricing, and timeline of each engagement are agreed upon in writing before any order is confirmed.`,
  },
  {
    title: "Quotations & Orders",
    body: `All quotations provided by Cellzen Trading are valid for 14 days unless otherwise stated. A quotation does not constitute a binding contract. An order is confirmed only upon receipt of a signed purchase agreement or written confirmation from both parties, accompanied by the agreed deposit payment.

Prices are subject to change due to supplier price fluctuations, currency exchange rates, and shipping costs. Any such changes will be communicated to the client before the order is confirmed.`,
  },
  {
    title: "Payment Terms",
    body: `Payment terms are agreed on a per-order basis and outlined in the purchase agreement. Typically, a deposit of 30–50% is required upon order confirmation, with the balance due prior to shipment.

Late payments may result in delays to your order. Cellzen Trading reserves the right to cancel an order if payment is not received within the agreed timeframe.`,
  },
  {
    title: "Shipping & Delivery",
    body: `Estimated shipping timelines are provided in good faith but are not guaranteed. Delays may occur due to customs inspections, carrier delays, weather events, or other factors outside our control. Cellzen Trading will communicate any known delays promptly.

Risk of loss or damage transfers to the buyer upon handover to the freight carrier unless otherwise agreed in writing.`,
  },
  {
    title: "Quality & Inspections",
    body: `We conduct basic supplier verification for all orders. Pre-shipment quality inspections are available upon request and may incur additional fees. While we make every effort to ensure product quality, Cellzen Trading does not provide warranties on behalf of third-party manufacturers.

Claims for defective or non-conforming goods must be raised within 14 days of delivery, supported by photographic evidence and a written description.`,
  },
  {
    title: "Limitation of Liability",
    body: `To the fullest extent permitted by applicable law, Cellzen Trading shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services or any order placed through us. Our total liability in any matter shall not exceed the value of the specific order to which the claim relates.`,
  },
  {
    title: "Confidentiality",
    body: `Both parties agree to keep confidential any proprietary or sensitive business information shared during the course of the business relationship, including supplier details, pricing structures, and client requirements. This obligation survives termination of the business relationship.`,
  },
  {
    title: "Intellectual Property",
    body: `All content on the Cellzen Trading website — including text, graphics, logos, and images — is the property of Cellzen Trading and is protected by applicable intellectual property laws. You may not reproduce, distribute, or use any content without prior written permission.`,
  },
  {
    title: "Governing Law",
    body: `These Terms and Conditions are governed by and construed in accordance with the laws of the People's Republic of China. Any disputes arising from or related to these terms shall be subject to the exclusive jurisdiction of the courts of Guangzhou, China, unless otherwise agreed in writing.`,
  },
  {
    title: "Changes to Terms",
    body: `We reserve the right to modify these Terms and Conditions at any time. Changes will be effective immediately upon posting to our website. Continued use of our services following any changes constitutes your acceptance of the revised terms.`,
  },
  {
    title: "Contact",
    body: `For any questions regarding these Terms and Conditions, please contact:\n\nCellzen Trading\nGuangzhou Mingxin International, Baiyun District, Guangzhou City, China\nEmail: support@cellzen.com\nGeneral: cellzengroup@gmail.com`,
  },
];

export default function Terms() {
  return (
    <>
        {/* Hero */}
        <section className="bg-[#E5E1DA] pt-28 pb-16">
          <div className="mx-auto max-w-3xl px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353] mb-4">Legal</p>
            <h1 className="premium-font-galdgderbold text-3xl sm:text-4xl text-[#2D2D2D] leading-tight">Terms &amp; Conditions</h1>
            <p className="mt-4 text-xs text-[#2D2D2D]/40">Last updated: April 2026</p>
          </div>
        </section>

        {/* Content */}
        <section className="py-14 sm:py-18 bg-white">
          <div className="mx-auto max-w-3xl px-6">
            <p className="text-sm leading-relaxed text-[#2D2D2D]/60 mb-12">
              Please read these Terms and Conditions carefully before using the Cellzen Trading website or engaging our services. These terms constitute a legally binding agreement between you and Cellzen Trading.
            </p>
            <div className="space-y-10">
              {SECTIONS.map((section, i) => (
                <div key={section.title}>
                  <h2 className="text-sm font-bold text-[#2D2D2D] mb-3">
                    <span className="text-[#B99353] mr-2">{String(i + 1).padStart(2, "0")}.</span>
                    {section.title}
                  </h2>
                  <div className="text-sm leading-relaxed text-[#2D2D2D]/60 whitespace-pre-line">{section.body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

      <Footer />
    </>
  );
}
