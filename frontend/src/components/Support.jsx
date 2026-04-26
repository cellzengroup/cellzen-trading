import React, { useState } from "react";
import Footer from "./Footer";

export default function Support() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>

        {/* Hero */}
        <section className="bg-[#2A1740] pt-28 pb-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#B99353] mb-4">We're here to help</p>
            <h1 className="premium-font-galdgderbold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight">
              Support Centre
            </h1>
            <p className="mt-5 text-sm leading-relaxed text-white/50 max-w-md mx-auto">
              Reach out to our team for any questions, concerns, or assistance. We respond to all inquiries within 24 hours.
            </p>
          </div>
        </section>

        <section className="py-16 sm:py-20 bg-white">
          <div className="mx-auto max-w-5xl px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-start">

              {/* Contact channels */}
              <div>
                <h2 className="premium-font-galdgdersemi text-xl text-[#412460] mb-8">Get in touch</h2>

                <div className="space-y-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#412460]/8 text-[#412460]">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">Email Support</h4>
                      <a href="mailto:support@cellzen.com" className="mt-1 block text-sm text-[#412460] hover:underline">support@cellzen.com</a>
                      <p className="mt-1 text-xs text-[#2D2D2D]/40">Response within 24 hours</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#412460]/8 text-[#412460]">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">General Enquiries</h4>
                      <a href="mailto:cellzengroup@gmail.com" className="mt-1 block text-sm text-[#412460] hover:underline">cellzengroup@gmail.com</a>
                      <p className="mt-1 text-xs text-[#2D2D2D]/40">For business & partnership inquiries</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#412460]/8 text-[#412460]">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">Phone</h4>
                      <div className="mt-1 space-y-0.5 text-sm text-[#2D2D2D]/60">
                        <p>China: +86 130 7304 0201</p>
                        <p>Nepal: +977 984 995 6242</p>
                        <p>Australia: +61 415 587 068</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#412460]/8 text-[#412460]">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#2D2D2D]">Business Hours</h4>
                      <p className="mt-1 text-sm text-[#2D2D2D]/60">Monday – Friday: 9:00am – 6:00pm (GMT+8)</p>
                      <p className="text-sm text-[#2D2D2D]/60">Saturday: 9:00am – 1:00pm (GMT+8)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Support form */}
              <div className="bg-[#412460]/5 p-8">
                <h2 className="premium-font-galdgdersemi text-xl text-[#412460] mb-6">Send a message</h2>

                {submitted ? (
                  <div className="text-center py-10">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#412460]/10 text-[#412460]">
                      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-base font-bold text-[#2D2D2D]">Message Sent!</h3>
                    <p className="mt-2 text-sm text-[#2D2D2D]/50">We'll get back to you at {form.email} within 24 hours.</p>
                    <button onClick={() => { setSubmitted(false); setForm({ name: "", email: "", subject: "", message: "" }); }}
                      className="mt-6 bg-[#412460] px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#412460]/85 transition-colors">
                      Send Another
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <input name="name" type="text" required value={form.name} onChange={handleChange}
                      className="w-full border border-[#2D2D2D]/10 bg-white px-4 py-3 text-sm text-[#2D2D2D] outline-none focus:border-[#412460] placeholder:text-[#2D2D2D]/30 transition-colors"
                      placeholder="Your name" />
                    <input name="email" type="email" required value={form.email} onChange={handleChange}
                      className="w-full border border-[#2D2D2D]/10 bg-white px-4 py-3 text-sm text-[#2D2D2D] outline-none focus:border-[#412460] placeholder:text-[#2D2D2D]/30 transition-colors"
                      placeholder="Email address" />
                    <input name="subject" type="text" required value={form.subject} onChange={handleChange}
                      className="w-full border border-[#2D2D2D]/10 bg-white px-4 py-3 text-sm text-[#2D2D2D] outline-none focus:border-[#412460] placeholder:text-[#2D2D2D]/30 transition-colors"
                      placeholder="Subject" />
                    <textarea name="message" required rows={5} value={form.message} onChange={handleChange}
                      className="w-full border border-[#2D2D2D]/10 bg-white px-4 py-3 text-sm text-[#2D2D2D] outline-none focus:border-[#412460] resize-none placeholder:text-[#2D2D2D]/30 transition-colors"
                      placeholder="Describe your issue or question" />
                    <button type="submit"
                      className="w-full bg-[#412460] py-3.5 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-[#412460]/85">
                      Submit Request
                    </button>
                  </form>
                )}
              </div>

            </div>
          </div>
        </section>

      <Footer />
    </>
  );
}
