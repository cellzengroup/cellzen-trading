import React from "react";
import useScrollReveal from "./useScrollReveal";

export default function Section6() {
  const [ref, visible] = useScrollReveal(0.15);

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#2A1740] py-16 sm:py-20 lg:py-24">
      {/* Soft background orbs */}
      <div className="absolute top-1/2 left-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cz-secondary-light/5 blur-[90px] animate-pulse-slow motion-reduce:animate-none sm:h-[520px] sm:w-[520px] lg:h-[600px] lg:w-[600px] lg:blur-[120px]" />
      <div className="absolute top-0 right-0 h-[220px] w-[220px] rounded-full bg-cz-main/20 blur-[70px] animate-pulse-slow motion-reduce:animate-none sm:h-[300px] sm:w-[300px] sm:blur-[80px]" style={{ animationDelay: "3s" }} />

      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
        {/* Quote marks */}
        <div className={`transition-all duration-500 ease-out motion-reduce:transition-none ${visible ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
          <svg className="mx-auto h-12 w-12 text-cz-secondary-light/30 sm:h-16 sm:w-16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391C0 7.905 3.731 4.039 8.983 3l.995 2.151C7.546 6.068 5.983 8.789 5.983 11h4v10H0z" />
          </svg>
        </div>

        <blockquote
          className={`mt-5 sm:mt-8 premium-font-galdgdersemi text-xl sm:text-3xl lg:text-4xl leading-relaxed text-white transition-all duration-700 delay-150 motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          We make global trade simpler, more affordable, and easier to access for businesses of every size.
        </blockquote>

        <div className={`mt-8 transition-all duration-500 delay-300 motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="inline-block h-px w-24 bg-cz-secondary-light/70" />
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.3em] text-cz-secondary-light">
            Our Mission
          </p>
        </div>

        {/* Values */}
        <div className={`mt-12 grid grid-cols-1 gap-4 transition-all duration-700 delay-500 motion-reduce:transition-none sm:mt-16 sm:grid-cols-3 sm:gap-5 lg:gap-6 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {[
            {
              icon: (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "Accessible",
              desc: "Trade made easy for businesses of all sizes",
            },
            {
              icon: (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ),
              title: "Trustworthy",
              desc: "Full transparency at every step",
            },
            {
              icon: (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "Affordable",
              desc: "Competitive pricing for everyone",
            },
          ].map((v, i) => (
            <div
              key={v.title}
              className="group rounded-xl border border-white/15 bg-white/[0.08] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition-all duration-300 ease-out motion-reduce:transition-none hover:border-cz-secondary-light/35 hover:bg-white/[0.14] hover:shadow-[0_22px_55px_rgba(0,0,0,0.24)] sm:p-6 sm:hover:scale-[1.03] cursor-default"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-cz-secondary-light shadow-inner backdrop-blur-xl transition-all duration-300 motion-reduce:transition-none group-hover:bg-cz-secondary-light group-hover:text-white group-hover:shadow-lg">
                {v.icon}
              </div>
              <h4 className="font-bold text-white">{v.title}</h4>
              <p className="mt-1 text-sm text-white/50">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
