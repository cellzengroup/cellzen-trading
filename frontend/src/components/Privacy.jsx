import React from "react";
import Footer from "./Footer";

const SECTIONS = [
  {
    title: "Information We Collect",
    body: `We collect information you provide directly to us when you fill out our contact form, request a quote, or communicate with our team. This includes your name, email address, phone number, country of residence, and any details you provide about your business or sourcing requirements.

We may also automatically collect certain technical information when you visit our website, such as your IP address, browser type, pages visited, and time spent on pages. This information is used solely for improving our website and services.`,
  },
  {
    title: "How We Use Your Information",
    body: `We use the information we collect to:
• Respond to your inquiries and provide the services you request
• Send you our Product Sourcing & Pricing Guide if you have subscribed
• Communicate with you about your orders, shipments, and business relationship
• Improve and personalise your experience on our website
• Comply with legal obligations

We will never sell, rent, or trade your personal information to third parties for marketing purposes.`,
  },
  {
    title: "Information Sharing",
    body: `We may share your information with trusted third-party service providers who assist us in operating our website, processing payments, and delivering services — but only to the extent necessary for those purposes and subject to confidentiality obligations.

We may also disclose your information if required by law, court order, or governmental authority, or to protect the rights, property, or safety of Cellzen Trading, our clients, or others.`,
  },
  {
    title: "Data Retention",
    body: `We retain personal data only for as long as necessary to fulfil the purposes for which it was collected, or as required by applicable law. Business inquiry records are typically retained for up to 5 years for commercial and legal purposes. You may request deletion of your data at any time by contacting us.`,
  },
  {
    title: "Cookies",
    body: `Our website uses cookies to enhance your browsing experience and analyse site traffic. Cookies are small text files stored on your device. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, some features of our website may not function properly without cookies.`,
  },
  {
    title: "Security",
    body: `We take reasonable technical and organisational measures to protect your personal information from unauthorised access, disclosure, alteration, or destruction. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.`,
  },
  {
    title: "Your Rights",
    body: `Depending on your location, you may have certain rights regarding your personal data, including the right to access, correct, delete, or restrict processing of your personal information. To exercise any of these rights, please contact us at support@cellzen.com and we will respond within 30 days.`,
  },
  {
    title: "Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. When we do, we will revise the "Last Updated" date at the top of this page. We encourage you to review this policy periodically to stay informed about how we protect your information.`,
  },
  {
    title: "Contact Us",
    body: `If you have any questions about this Privacy Policy or our data practices, please contact us at:\n\nCellzen Trading\nGuangzhou Mingxin International, Baiyun District, Guangzhou City, China\nEmail: support@cellzen.com\nGeneral: cellzengroup@gmail.com`,
  },
];

export default function Privacy() {
  return (
    <>
        {/* Hero */}
        <section className="bg-[#E5E1DA] pt-28 pb-16">
          <div className="mx-auto max-w-3xl px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353] mb-4">Legal</p>
            <h1 className="premium-font-galdgderbold text-3xl sm:text-4xl text-[#2D2D2D] leading-tight">Privacy Policy</h1>
            <p className="mt-4 text-xs text-[#2D2D2D]/40">Last updated: April 2026</p>
          </div>
        </section>

        {/* Content */}
        <section className="py-14 sm:py-18 bg-white">
          <div className="mx-auto max-w-3xl px-6">
            <p className="text-sm leading-relaxed text-[#2D2D2D]/60 mb-12">
              Cellzen Trading ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, share, and safeguard your personal information when you visit our website or engage with our services.
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
