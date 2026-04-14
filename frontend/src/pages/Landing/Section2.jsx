import React, { useState, useEffect, useRef } from "react";
import useScrollReveal from "./useScrollReveal";

const STATS = [
  { value: 500, suffix: "+", label: "Products Sourced" },
  { value: 10, suffix: "+", label: "Countries Served" },
  { value: 100, suffix: "%", label: "Transparency" },
  { value: 24, suffix: "/7", label: "Support Available" },
];

// Animated counter hook
function useCountUp(target, suffix, duration, shouldStart) {
  const [display, setDisplay] = useState("0" + suffix);
  const started = useRef(false);

  useEffect(() => {
    if (!shouldStart || started.current) return;
    started.current = true;
    let startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.floor(eased * target) + suffix);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [target, suffix, duration, shouldStart]);

  return display;
}

function StatItem({ value, suffix, label }) {
  const [statRef, statVisible] = useScrollReveal(0.3);
  const display = useCountUp(value, suffix, 2000, statVisible);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={statRef}
      className="group text-center cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`premium-font-galdgderbold text-3xl sm:text-4xl transition-all duration-300 ${hovered ? "text-cz-secondary-light scale-110" : "text-white"}`}>
        {display}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
        {label}
      </div>
    </div>
  );
}

function StatsStrip() {
  const [stripRef, stripVisible] = useScrollReveal(0.3);

  return (
    <div ref={stripRef} className={`bg-cz-main transition-all duration-1000 ${stripVisible ? "opacity-100" : "opacity-0"}`}>
      <div className="mx-auto max-w-5xl px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
        {STATS.map((s, i) => (
          <StatItem key={s.label} value={s.value} suffix={s.suffix} label={s.label} delay={i * 200} />
        ))}
      </div>
    </div>
  );
}

export default function Section2() {
  const [ref, visible] = useScrollReveal(0.08);

  return (
    <section ref={ref} id="who-we-are" className="relative bg-[#EAE8E5] overflow-hidden">

      {/* —— Top: Full-width heading with massive negative space —— */}
      <div className="pt-32 pb-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className={`transition-all duration-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-cz-main/60">
              About Us
            </span>
            <h2 className="mt-4 premium-font-galdgderbold text-4xl text-cz-ink sm:text-5xl lg:text-7xl xl:text-8xl leading-[0.95]">
              Who We{" "}
              <span className="text-cz-main">Are</span>
            </h2>
          </div>

          <div className={`mt-8 sm:mt-12 grid gap-0 lg:grid-cols-[1fr_1px_1fr] items-start transition-all duration-1000 delay-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <p className="text-base sm:text-lg leading-[1.8] text-cz-ink/70 pr-0 lg:pr-12">
              <span className="font-semibold text-cz-ink">Cellzen Trading</span> is a global
              sourcing and trading company connecting businesses worldwide
              with manufacturers and suppliers across China.
            </p>
            <div className="hidden lg:block w-px h-full bg-cz-ink/10" />
            <p className="text-sm sm:text-base leading-[1.8] text-cz-ink/50 pl-0 lg:pl-12 mt-4 lg:mt-0">
              Founded with a mission to make international trade simple and accessible, we act as
              the trusted bridge between our clients and the world's largest manufacturing hub —
              your single point of contact from sourcing to delivery, anywhere in the world.
            </p>
          </div>
        </div>
      </div>

      {/* —— Stats strip with animated counters —— */}
      <StatsStrip />
    </section>
  );
}
