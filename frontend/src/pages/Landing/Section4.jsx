import { useState, useEffect, Fragment } from "react";
import { motion, useReducedMotion } from "framer-motion";
import useScrollReveal from "./useScrollReveal";

const CARD_W = 1024; // px — desktop full card width (main + callout panel)
const CARD_GAP = 32;  // px — desktop gap between cards
const REPEATS = 3;    // render 3 copies of steps for infinite loop illusion

const STEP_MS = 4800;

const getCarouselMetrics = () => {
  if (typeof window === "undefined") return { cardWidth: CARD_W, cardGap: CARD_GAP };

  const width = window.innerWidth;

  if (width < 480) {
    return { cardWidth: Math.max(288, width - 32), cardGap: 12 };
  }

  if (width < 768) {
    return { cardWidth: Math.min(420, width - 40), cardGap: 16 };
  }

  if (width < 1024) {
    return { cardWidth: Math.min(720, width - 64), cardGap: 24 };
  }

  return { cardWidth: CARD_W, cardGap: CARD_GAP };
};

const STEPS = [
  {
    num: "01", short: "Requirements",
    title: "Tell us what you need",
    desc: "Share your product requirements — type, quantity, specifications, and quality standards. The more detail you provide, the better we can match you with the right supplier.",
    callout: { value: "24 hrs", label: "Average response time" },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="butt" strokeLinejoin="miter" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    num: "02", short: "Sourcing",
    title: "We source from verified factories",
    desc: "We contact verified manufacturers across China, compare options, and negotiate on your behalf to get the best price and quality combination available.",
    callout: { value: "200+", label: "Verified factory partners" },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="butt" strokeLinejoin="miter" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    num: "03", short: "Quotation",
    title: "We send you a detailed quote",
    desc: "Includes product cost, shipping, and all applicable fees — no hidden charges, no surprises. You see exactly what you're paying for before committing.",
    callout: { value: "Zero", label: "Hidden fees" },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="butt" strokeLinejoin="miter" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    num: "04", short: "Order",
    title: "You approve — we place the order",
    desc: "Once you confirm, we place the order directly with the factory and manage production updates, keeping you informed at every stage of manufacturing.",
    callout: { value: "48 hrs", label: "Production update cycle" },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="butt" strokeLinejoin="miter" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    num: "05", short: "Delivery",
    title: "We handle shipping to your door",
    desc: "From China to Australia or Nepal — we manage freight, customs clearance, and last-mile delivery so you receive your goods without the paperwork or hassle.",
    callout: { value: "Door-to-door", label: "Full logistics coverage" },
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="butt" strokeLinejoin="miter" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
  },
];

export default function Section3() {
  const [sectionRef, visible] = useScrollReveal(0.1);
  const prefersReducedMotion = useReducedMotion();
  const [virtualPos, setVirtualPos] = useState(STEPS.length); // start in middle copy
  const [progress, setProgress] = useState(0);
  const [instant, setInstant] = useState(false);
  const [carouselMetrics, setCarouselMetrics] = useState(getCarouselMetrics);

  const active = ((virtualPos % STEPS.length) + STEPS.length) % STEPS.length;

  useEffect(() => {
    if (!visible || prefersReducedMotion) return;
    let start = performance.now();
    let raf;

    const tick = (now) => {
      const pct = (now - start) / STEP_MS;
      if (pct >= 1) {
        setVirtualPos((prev) => prev + 1);
        setProgress(0);
        start = now;
      } else {
        setProgress(pct);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, virtualPos, prefersReducedMotion]);

  useEffect(() => {
    const updateMetrics = () => setCarouselMetrics(getCarouselMetrics());
    updateMetrics();
    window.addEventListener("resize", updateMetrics);
    return () => window.removeEventListener("resize", updateMetrics);
  }, []);

  const goTo = (i) => {
    const currentActive = ((virtualPos % STEPS.length) + STEPS.length) % STEPS.length;
    let diff = i - currentActive;
    if (diff > STEPS.length / 2) diff -= STEPS.length;
    if (diff < -STEPS.length / 2) diff += STEPS.length;
    setVirtualPos((prev) => prev + diff);
    setProgress(0);
  };

  // After a slide completes, if we've drifted into an outer copy, silently
  // snap back to the equivalent position in the middle copy.
  const handleAnimationComplete = () => {
    if (instant) {
      setInstant(false);
      return;
    }
    if (virtualPos >= STEPS.length * 2) {
      setInstant(true);
      setVirtualPos((prev) => prev - STEPS.length);
    } else if (virtualPos < STEPS.length) {
      setInstant(true);
      setVirtualPos((prev) => prev + STEPS.length);
    }
  };

  const RENDERED = Array.from({ length: REPEATS }).flatMap(() => STEPS);
  const { cardWidth, cardGap } = carouselMetrics;
  const slideTransition = instant || prefersReducedMotion
    ? { duration: 0 }
    : { duration: 1.05, ease: [0.22, 1, 0.36, 1] };

  return (
    <section ref={sectionRef} id="how-it-works" className="relative bg-white py-16 sm:py-24 lg:py-28 overflow-hidden">

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">

        {/* Header */}
        <div className={`text-center mb-8 sm:mb-16 lg:mb-20 transition-all duration-700 motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#B99353] mb-3">Simple Process</p>
          <h2 className="premium-font-galdgderbold text-2xl sm:text-4xl lg:text-5xl text-[#2D2D2D] leading-tight">
            How It Works
          </h2>
          <p className="mx-auto mt-3 sm:mt-4 max-w-xl text-xs sm:text-base leading-relaxed text-[#2D2D2D]/55">
            From first contact to final delivery — a clear, transparent process built around your needs.
          </p>
        </div>

        {/* Timeline */}
        <div className={`relative flex items-start mb-8 sm:mb-10 transition-all duration-700 delay-200 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}>
          {STEPS.map((s, i) => {
            const isActive = active === i;
            const isDone = i < active;
            const connectorFill = isDone ? 1 : isActive ? progress : 0;

            return (
              <Fragment key={s.num}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className="relative flex min-h-11 min-w-11 flex-col items-center group shrink-0 touch-manipulation"
                  aria-label={`Go to step ${s.num}: ${s.short}`}
                >
                  {/* Circle */}
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center border-2 transition-all duration-300 motion-reduce:transition-none ${
                    isActive
                      ? "bg-[#412460] border-[#412460] scale-110 shadow-lg shadow-[#412460]/25"
                      : isDone
                      ? "bg-[#412460] border-[#412460]"
                      : "bg-white border-[#412460]/20 group-hover:border-[#412460]/50"
                  }`}>
                    {isDone ? (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="butt" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-[11px] font-bold transition-colors duration-200 motion-reduce:transition-none ${
                        isActive ? "text-white" : "text-[#412460]/40 group-hover:text-[#412460]/80"
                      }`}>
                        {s.num}
                      </span>
                    )}
                  </div>
                  {/* Label */}
                  <span className={`hidden sm:block mt-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-colors duration-200 motion-reduce:transition-none ${
                    isActive ? "text-[#412460]" : isDone ? "text-[#412460]/40" : "text-[#2D2D2D]/25 group-hover:text-[#2D2D2D]/55"
                  }`}>
                    {s.short}
                  </span>
                </button>

                {/* Connector */}
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-[2px] bg-[#412460]/8 relative mx-1 sm:mx-2 mt-[18px] sm:mt-[19px] shrink">
                    <div
                      className="absolute inset-y-0 left-0 bg-[#B99353]"
                      style={{ width: `${connectorFill * 100}%`, transition: "width 0.08s linear" }}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

      </div>

      {/* Full-width carousel strip */}
      <div className="relative w-full overflow-hidden py-4 sm:py-6">
        <motion.div
          className="flex"
          style={{ gap: `${cardGap}px`, willChange: "transform" }}
          animate={{ x: `calc(50% - ${(virtualPos + 0.5) * (cardWidth + cardGap) - cardGap / 2}px)` }}
          transition={slideTransition}
          onAnimationComplete={handleAnimationComplete}
        >
          {RENDERED.map((s, pos) => {
            const isActive = pos === virtualPos;
            const stepIndex = pos % STEPS.length;
            return (
              <motion.div
                key={pos}
                onClick={() => goTo(stepIndex)}
                style={{ width: `${cardWidth}px`, transformOrigin: "center center" }}
                animate={{
                  scale: isActive ? 1 : 0.94,
                  opacity: isActive ? 1 : 0.38,
                }}
                transition={slideTransition}
                whileHover={!isActive ? { opacity: 0.55 } : {}}
                className="shrink-0 cursor-pointer grid grid-cols-1 items-stretch overflow-hidden md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[minmax(0,1fr)_280px]"
              >
                {/* Main panel */}
                <div className="relative overflow-hidden bg-[#F7F6F4] p-5 sm:p-8 lg:p-12">
                  <div
                    className="absolute -right-2 -top-2 font-black text-[#412460]/[0.04] leading-none select-none pointer-events-none"
                    style={{ fontSize: "clamp(6rem, 18vw, 11rem)" }}
                  >
                    {s.num}
                  </div>

                  <div className="relative z-10 flex flex-col h-full">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B99353] mb-4">
                      Step {s.num}
                    </p>
                    <h3 className="premium-font-galdgderbold text-[1.45rem] sm:text-[1.85rem] text-[#2D2D2D] mb-4 leading-tight">
                      {s.title}
                    </h3>
                    <p className="text-sm leading-[1.75] text-[#2D2D2D]/60 max-w-lg sm:leading-[1.85]">
                      {s.desc}
                    </p>
                  </div>
                </div>

                {/* Callout panel */}
                <div className="relative bg-[#412460] p-5 sm:p-8 lg:p-10 flex flex-col justify-between min-h-[180px] sm:min-h-[220px] md:min-h-[260px] overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-[0.06] pointer-events-none"
                    style={{
                      backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
                      backgroundSize: "20px 20px",
                    }}
                  />
                  <div className="relative z-10 w-12 h-12 bg-white/10 flex items-center justify-center text-white mb-auto">
                    {s.icon}
                  </div>
                  <div className="relative z-10 mt-5 sm:mt-8">
                    <div className="text-2xl sm:text-4xl font-black text-[#B99353] leading-none mb-2">
                      {s.callout.value}
                    </div>
                    <div className="text-xs text-white/45 uppercase tracking-widest">
                      {s.callout.label}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Nav controls */}
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goTo((active - 1 + STEPS.length) % STEPS.length)}
          className="flex min-h-11 items-center gap-2 px-5 py-2.5 border border-[#412460]/15 text-xs font-semibold text-[#412460]/50 hover:border-[#412460]/40 hover:text-[#412460] transition-all duration-200 motion-reduce:transition-none"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={() => goTo((active + 1) % STEPS.length)}
          className="flex min-h-11 items-center gap-2 px-5 py-2.5 bg-[#412460] text-xs font-semibold text-white hover:bg-[#412460]/85 transition-all duration-200 motion-reduce:transition-none"
        >
          Next →
        </button>

        <div className="flex items-center gap-1.5 ml-3">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to process step ${i + 1}`}
              className="flex min-h-11 min-w-6 items-center justify-center"
            >
              <span
                className={`block transition-all duration-200 motion-reduce:transition-none ${
                  i === active ? "h-1.5 w-5 bg-[#412460]" : "h-1.5 w-1.5 bg-[#412460]/20 hover:bg-[#412460]/50"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
