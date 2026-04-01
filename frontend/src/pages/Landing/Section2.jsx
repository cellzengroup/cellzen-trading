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

const TABS = [
  {
    tab: "Global Reach",
    cardTitle: "A Worldwide Sourcing Network",
    desc: "We connect businesses around the world with trusted manufacturers. Our team handles everything \u2014 sourcing, negotiation, quality checks, and logistics \u2014 so you can focus on growing your business.",
    image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=200&h=200&fit=crop",
    color: "#412460",
  },
  {
    tab: "Our Markets",
    cardTitle: "A Trusted Global Partner",
    desc: "Strategically positioned across 10+ countries with fully integrated operations. We deliver quality products at competitive prices, with full transparency and reliable delivery every step of the way.",
    image: "https://images.unsplash.com/photo-1494412574643-ff11b0a5eb95?w=200&h=200&fit=crop",
    color: "#B99353",
  },
];


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
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section ref={ref} id="who-we-are" className="relative bg-[#E5E1DA] overflow-hidden">

      {/* \u2014\u2014 Top: Full-width heading with massive negative space \u2014\u2014 */}
      <div className="pt-32 pb-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className={`transition-all duration-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-cz-main/60">
              About Us
            </span>
            <h2 className="mt-4 premium-font-galdgderbold text-5xl text-cz-ink sm:text-6xl lg:text-7xl xl:text-8xl leading-[0.95]">
              Who We{" "}
              <span className="text-cz-main">Are</span>
            </h2>
          </div>

          <div className={`mt-12 grid gap-0 lg:grid-cols-[1fr_1px_1fr] items-start transition-all duration-1000 delay-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <p className="text-lg leading-[1.8] text-cz-ink/70 pr-0 lg:pr-12">
              <span className="font-semibold text-cz-ink">Cellzen Trading</span> is a global
              sourcing and trading company connecting businesses worldwide
              with manufacturers and suppliers across China.
            </p>
            <div className="hidden lg:block w-px h-full bg-cz-ink/10" />
            <p className="text-base leading-[1.8] text-cz-ink/50 pl-0 lg:pl-12 mt-4 lg:mt-0">
              Founded with a mission to make international trade simple and accessible, we act as
              the trusted bridge between our clients and the world's largest manufacturing hub \u2014
              your single point of contact from sourcing to delivery, anywhere in the world.
            </p>
          </div>
        </div>
      </div>

      {/* \u2014\u2014 Stats strip with animated counters \u2014\u2014 */}
      <StatsStrip />

      {/* \u2014\u2014 Our Unique Position \u2014 Exact reference layout \u2014\u2014 */}
      <div className="py-24 px-6">
        <div className="mx-auto max-w-5xl">
          <div className={`transition-all duration-1000 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div className="grid gap-12 lg:grid-cols-2 items-center">

              {/* \u2014\u2014 Left: 3D Rotating Earth Globe \u2014\u2014 */}
              <div className="relative flex justify-center items-center" style={{ perspective: "1000px" }}>
                <div className="relative w-72 h-72 sm:w-[22rem] sm:h-[22rem]" style={{ transformStyle: "preserve-3d" }}>

                  {/* 3D Globe \u2014 CSS sphere with rotating texture */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      transformStyle: "preserve-3d",
                      animation: "tiltGlobe 8s ease-in-out infinite",
                    }}
                  >
                    {/* Sphere base with earth texture */}
                    <div className="absolute inset-0 rounded-full overflow-hidden"
                      style={{
                        boxShadow: "inset -30px -30px 60px rgba(0,0,0,0.6), inset 20px 20px 40px rgba(255,255,255,0.1), 0 0 40px 8px rgba(65,36,96,0.15)",
                      }}
                    >
                      {/* Rotating earth map — seamless loop */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "300%",
                          height: "100%",
                          backgroundImage: "url('https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Blue_Marble_2002.png/1280px-Blue_Marble_2002.png')",
                          backgroundSize: "33.333% 100%",
                          backgroundRepeat: "repeat-x",
                          animation: "rotateEarth 35s linear infinite",
                        }}
                      />

                      {/* Specular highlight \u2014 top left shine */}
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 20%, transparent 45%)",
                          zIndex: 3,
                        }}
                      />

                      {/* Edge darkening \u2014 sphere falloff */}
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "radial-gradient(circle at 50% 50%, transparent 45%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.4) 75%, rgba(0,0,0,0.8) 100%)",
                          zIndex: 4,
                        }}
                      />

                      {/* Bottom shadow gradient */}
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "linear-gradient(170deg, transparent 30%, rgba(0,0,0,0.4) 80%)",
                          zIndex: 3,
                        }}
                      />
                    </div>
                  </div>

                  {/* Atmosphere glow \u2014 blue haze around the sphere */}
                  <div
                    className="absolute inset-[-6px] rounded-full"
                    style={{
                      background: "radial-gradient(circle, transparent 55%, rgba(65,36,96,0.06) 70%, rgba(65,36,96,0.10) 85%, rgba(65,36,96,0.04) 100%)",
                      boxShadow: "0 0 30px 8px rgba(65,36,96,0.06)",
                    }}
                  />

                  {/* Shadow on the ground */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 -bottom-8 w-[70%] h-6 rounded-full"
                    style={{
                      background: "radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)",
                    }}
                  />

                  {/* Outer orbit ring */}
                  <div className="absolute inset-[-24px] rounded-full border border-dashed border-cz-main/6 animate-spin-reverse" />
                </div>
              </div>

              {/* \u2014\u2014 Right: Content \u2014\u2014 */}
              <div>

                {/* Heading */}
                <h3 className="premium-font-galdgderbold text-3xl text-cz-ink sm:text-4xl lg:text-[2.6rem] leading-[1.15]">
                  We Are Connecting Global Business Success With{" "}
                  <span className="text-cz-main">Trading</span>
                </h3>

                <p className="mt-5 text-sm leading-[1.9] text-cz-ink/50">
                  Strategically positioned across 10+ countries through fully integrated sourcing
                  operations \u2014 a single point of contact for your global supply chain needs.
                </p>

                {/* Tabs \u2014 rectangular, side by side, no gap */}
                <div className="mt-8 flex">
                  {TABS.map((t, i) => (
                    <button
                      key={t.tab}
                      type="button"
                      onClick={() => setActiveTab(i)}
                      className={`flex-1 py-3.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 ${activeTab === i ? "bg-cz-secondary-dark text-white" : "bg-cz-ink text-white/70 hover:text-white"}`}
                      style={{ borderRadius: 0 }}
                    >
                      {t.tab}
                    </button>
                  ))}
                </div>

                {/* Info card */}
                <div className="mt-0 bg-white border border-t-0 border-cz-ink/5 rounded-none overflow-hidden">
                  <div className="p-6 sm:p-8">
                    <div>
                      <h4 className="font-bold text-cz-ink text-lg leading-tight">
                        {TABS[activeTab].cardTitle}
                      </h4>

                      <p className="mt-2.5 text-xs leading-relaxed text-cz-ink/50">
                        {TABS[activeTab].desc}
                      </p>

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* \u2014\u2014 Bottom breathing space \u2014\u2014 */}
      <div className="h-16" />
    </section>
  );
}
