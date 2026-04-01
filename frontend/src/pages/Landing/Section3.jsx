import React, { useState } from "react";
import useScrollReveal from "./useScrollReveal";

const STEPS = [
  {
    num: "01",
    title: "You tell us what you need",
    desc: "Share your product requirements — type, quantity, specifications, and quality standards.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "We source from Chinese factories",
    desc: "We contact verified manufacturers, compare options, and negotiate on your behalf.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "We send you a detailed quote",
    desc: "Includes product cost, shipping, and all applicable fees — no hidden charges.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "You approve and we place the order",
    desc: "We confirm with the factory and manage production on your behalf.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    num: "05",
    title: "We handle shipping and delivery",
    desc: "From China to your door in Australia or Nepal — including freight, customs, and delivery.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
  },
];

export default function Section3() {
  const [ref, visible] = useScrollReveal(0.1);
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section ref={ref} id="how-it-works" className="relative bg-white py-24 overflow-hidden">
      {/* Decorative side gradient */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cz-main via-cz-secondary-light to-cz-main opacity-20" />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className={`text-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <span className="inline-block rounded-full bg-cz-secondary-light/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-cz-secondary-light">
            Simple Process
          </span>
          <h2 className="mt-4 premium-font-galdgderbold text-3xl text-cz-ink sm:text-4xl lg:text-5xl">
            How It Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-cz-ink/60">
            Our process is simple, transparent, and built around your needs.
          </p>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-[280px_1fr] items-start">
          {/* Step navigator */}
          <div className="hidden lg:flex flex-col gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setActiveStep(i)}
                className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-300 ${activeStep === i ? "bg-cz-main text-white shadow-lg shadow-cz-main/20" : "hover:bg-cz-main/5 text-cz-ink/60 hover:text-cz-ink"} ${visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}
                style={{ transitionDelay: `${300 + i * 100}ms` }}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-300 ${activeStep === i ? "bg-white/20" : "bg-cz-main/10 text-cz-main"}`}>
                  {s.num}
                </span>
                <span className="text-sm font-medium truncate">{s.title}</span>
              </button>
            ))}
          </div>

          {/* Step cards - mobile shows all, desktop shows active */}
          <div className="space-y-4 lg:space-y-0">
            {STEPS.map((s, i) => {
              const isActive = activeStep === i;
              return (
                <div
                  key={s.num}
                  className={`rounded-2xl border transition-all duration-500 cursor-pointer ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${isActive ? "border-cz-main/20 bg-gradient-to-br from-cz-main/5 to-cz-secondary-light/5 shadow-lg lg:block" : "border-cz-ink/5 bg-white lg:hidden"}`}
                  style={{ transitionDelay: `${400 + i * 100}ms` }}
                  onClick={() => setActiveStep(i)}
                >
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start gap-5">
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-all duration-300 ${isActive ? "bg-cz-main text-white shadow-lg shadow-cz-main/20 scale-110" : "bg-cz-main/10 text-cz-main"}`}>
                        {s.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="rounded-md bg-cz-secondary-light/10 px-2 py-0.5 text-xs font-bold text-cz-secondary-light">
                            Step {s.num}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-cz-ink">{s.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-cz-ink/60">{s.desc}</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {isActive && (
                      <div className="mt-6 flex items-center gap-2">
                        {STEPS.map((_, j) => (
                          <div key={j} className="h-1 flex-1 rounded-full bg-cz-ink/10 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${j <= i ? "bg-cz-main w-full" : "bg-transparent w-0"}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
