import { useRef, useState, Suspense, useEffect } from "react";
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from "framer-motion";
import WorldMap from "../world-map";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

useGLTF.preload("/Images/earth.glb");

const MARKETS = [
  {
    flag: "🇨🇳", country: "China", role: "Sourcing Hub",
    desc: "Direct access to thousands of verified factories across all major manufacturing regions — Guangdong, Zhejiang, Jiangsu, and beyond.",
    stats: [{ label: "Factory Partners", value: "200+" }, { label: "Product Categories", value: "50+" }],
  },
  {
    flag: "🇳🇵", country: "Nepal", role: "Growing Market",
    desc: "Connecting Nepalese businesses with Chinese manufacturers, handling all logistics and customs clearance end-to-end.",
    stats: [{ label: "Customs Support", value: "Full" }, { label: "Pricing", value: "Best Rate" }],
  },
  {
    flag: "🇮🇳", country: "India", role: "Strategic Hub",
    desc: "Expanding partnerships with Indian manufacturers and distributors — a key bridge for our South Asian trade operations.",
    stats: [{ label: "Partner Mills", value: "30+" }, { label: "Trade Routes", value: "Active" }],
  },
  {
    flag: "🇦🇺", country: "Australia", role: "Active Market",
    desc: "Serving Australian businesses with reliable, cost-effective sourcing. Sea, air, or express delivery options available.",
    stats: [{ label: "Delivery Options", value: "3" }, { label: "Transit Time", value: "10–25d" }],
  },
];

const TABS = [
  { tab: "Global Reach", cardTitle: "A Worldwide Sourcing Network", desc: "We connect businesses around the world with trusted manufacturers. Our team handles everything — sourcing, negotiation, quality checks, and logistics — so you can focus on growing your business." },
  { tab: "Our Markets", cardTitle: "A Trusted Global Partner", desc: "Strategically positioned across 10+ countries with fully integrated operations. We deliver quality products at competitive prices, with full transparency and reliable delivery every step of the way." },
];

// Final resting position for each card in the stack
// index 0 = first to enter = bottom of stack (most buried)
// index 3 = last to enter  = top of stack (most prominent)
// Diagonal cascade: card 01 at top-left, card 04 at bottom-right.
// Each card settles with a slight tilt for a natural "tossed-stack" feel.
const STACK_POSITIONS = {
  mobile: [
    { rotate: -2.5, y: -84, x: -12 },
    { rotate: 1.5, y: -24, x: -8 },
    { rotate: -1, y: 34, x: 8 },
    { rotate: 2, y: 92, x: 14 },
  ],
  tablet: [
    { rotate: -3, y: -104, x: -28 },
    { rotate: 2, y: -36, x: -22 },
    { rotate: -1.5, y: 28, x: 0 },
    { rotate: 2.5, y: 96, x: 16 },
  ],
  desktop: [
    { rotate: -3, y: -120, x: -40 },
    { rotate: 2, y: -40, x: -35 },
    { rotate: -1.5, y: 20, x: 0 },
    { rotate: 2.5, y: 85, x: 20 },
  ],
};

const getStackLayout = () => {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
};

// Scroll thresholds — Australia ends at 0.80 with a wide span, leaving 0.20 (20% =
// ~112vh of scroll) of buffer for the spring to fully settle before the section unpins.
// Cards finish stacking by 0.60 — leaves a short pause (0.60–0.64) to view the full
// stack, then the next section (Section4) slides up as a reveal over progress 0.64–0.82.
const CARD_ENTRY = [
  { start: 0.02, end: 0.14 },
  { start: 0.16, end: 0.28 },
  { start: 0.30, end: 0.42 },
  { start: 0.44, end: 0.60 },
];

/* ─────────────────────────────────────────── */
/*  Earth Globe                                */
/* ─────────────────────────────────────────── */
function EarthModel() {
  const { scene } = useGLTF("/Images/earth.glb");
  useEffect(() => {
    if (!scene) return;
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = 2.0 / maxDim;
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  }, [scene]);
  return <primitive object={scene} />;
}

function GlobeCanvas() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="w-full max-w-[280px] sm:max-w-[400px] lg:max-w-[560px] mx-auto" style={{ aspectRatio: "1 / 1" }}>
      <Canvas
        camera={{ position: [0, 0, 3.8], fov: 40, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.4} color="#412460" />
        <directionalLight position={[4, 3, 4]} intensity={1.6} />
        <directionalLight position={[-4, -2, -4]} intensity={0.8} color="#412460" />
        <Suspense fallback={null}>
          <EarthModel />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={!prefersReducedMotion} autoRotateSpeed={1.0} />
      </Canvas>
    </div>
  );
}

/* ─────────────────────────────────────────── */
/*  Globe Section                              */
/* ─────────────────────────────────────────── */
function GlobeSection() {
  const [activeTab, setActiveTab] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const revealTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] };

  return (
    <section style={{ backgroundColor: "#EAE8E5" }} className="py-16 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 md:gap-10 lg:gap-12 grid-cols-1 md:grid-cols-2 items-center">

          <motion.div
            className="flex justify-center items-center order-2 md:order-1"
            initial={prefersReducedMotion ? false : { opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={revealTransition}
          >
            <GlobeCanvas />
          </motion.div>

          <motion.div
            className="order-1 md:order-2"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={prefersReducedMotion ? revealTransition : { ...revealTransition, delay: 0.08 }}
          >
            <h3 className="premium-font-galdgderbold text-3xl text-cz-main sm:text-4xl md:text-5xl lg:text-6xl leading-[1]">
              We Are Connecting Global Business Success With{" "}
              <span className="text-[#B99353]">Trading</span>
            </h3>
            <p className="mt-4 sm:mt-5 text-sm leading-[1.9] text-[#2D2D2D]/55">
              Strategically positioned across 10+ countries through fully integrated sourcing
              operations — a single point of contact for your global supply chain needs.
            </p>
            <div className="mt-6 sm:mt-8 flex">
              {TABS.map((t, i) => (
                <button
                  key={t.tab}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`flex-1 min-h-11 py-3 sm:py-3.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 motion-reduce:transition-none ${activeTab === i ? "bg-[#412460] text-white" : "bg-[#412460]/10 text-[#412460]/60 hover:text-[#412460]"}`}
                  style={{ borderRadius: 0 }}
                >
                  {t.tab}
                </button>
              ))}
            </div>
            <div className="bg-[#412460]/5 border border-[#412460]/10 border-t-0 overflow-hidden">
              <div className="p-5 sm:p-8">
                <h4 className="font-bold text-[#412460] text-base sm:text-lg leading-tight">{TABS[activeTab].cardTitle}</h4>
                <p className="mt-2.5 text-xs leading-relaxed text-[#2D2D2D]/50">{TABS[activeTab].desc}</p>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────── */
/*  Single stacking market card                */
/* ─────────────────────────────────────────── */
function MarketStackCard({ m, index, progress, pos, layout, reducedMotion }) {
  const entry = CARD_ENTRY[index];

  const entryDistance = layout === "mobile" ? 760 : layout === "tablet" ? 900 : 1100;

  const rawY      = useTransform(progress, [entry.start, entry.end], [reducedMotion ? pos.y : entryDistance, pos.y], { clamp: true });
  const rawX      = useTransform(progress, [entry.start, entry.end], [reducedMotion ? pos.x : 48, pos.x], { clamp: true });
  const rawRotate = useTransform(progress, [entry.start, entry.end], [reducedMotion ? pos.rotate : 10, pos.rotate], { clamp: true });

  // Stiff spring → settles ~0.13s. Combined with the 20% scroll buffer after
  // Australia's entry, the card is guaranteed to reach its final position and full
  // opacity before the section unpins.
  const spring = reducedMotion
    ? { stiffness: 1000, damping: 100, mass: 0.2 }
    : { stiffness: 220, damping: 32, mass: 0.55 };
  const y      = useSpring(rawY,      spring);
  const x      = useSpring(rawX,      spring);
  const rotate = useSpring(rawRotate, spring);

  // Alternating card treatments: solid purple (0, 2) vs. frosted glass (1, 3)
  const isGlass = index % 2 === 1;

  const cardStyle = isGlass
    ? {
        y, x, rotate, zIndex: index + 1,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px) saturate(120%)",
        WebkitBackdropFilter: "blur(16px) saturate(120%)",
        border: "1px solid rgba(255,255,255,0.7)",
        boxShadow: "0 20px 56px rgba(65,36,96,0.22), 0 4px 12px rgba(0,0,0,0.08)",
        isolation: "isolate",
      }
    : {
        y, x, rotate, zIndex: index + 1,
        backgroundColor: "#412460",
        boxShadow: "0 24px 64px rgba(65,36,96,0.35), 0 8px 24px rgba(0,0,0,0.2)",
        isolation: "isolate",
      };

  // Color tokens flip based on variant — all at 100% opacity now
  const watermarkCls    = isGlass ? "text-[#412460]/10"     : "text-white/[0.04]";
  const dotColor        = isGlass ? "#412460"               : "#fff";
  const indexCls        = isGlass ? "text-[#412460]"        : "text-[#B99353]";
  const roleCls         = isGlass ? "text-[#412460] bg-[#412460]/15" : "text-[#B99353] bg-[#B99353]/25";
  const titleCls        = isGlass ? "text-[#412460]"        : "text-white";
  const descCls         = isGlass ? "text-[#2D2D2D]"        : "text-white";
  const statBoxCls      = isGlass ? "bg-[#412460]/10"       : "bg-white/15";
  const statLabelCls    = isGlass ? "text-[#2D2D2D]"        : "text-white";

  return (
    <motion.div
      style={cardStyle}
      className={`absolute w-[min(82vw,300px)] sm:w-[300px] md:w-[320px] lg:w-[340px] overflow-hidden ${isGlass ? "" : "bg-[#412460]"}`}
    >
      {/* Ghost number watermark */}
      <div
        className={`absolute -top-3 -left-1 font-black leading-none select-none pointer-events-none ${watermarkCls}`}
        style={{ fontSize: "clamp(72px, 10vw, 104px)" }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative z-10 flex flex-col p-5 sm:p-6 lg:p-7" style={{ minHeight: "clamp(330px, 48vh, 400px)" }}>

        {/* Role badge */}
        <div className="flex justify-between items-start mb-6">
          <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${indexCls}`}>
            {String(index + 1).padStart(2, "0")}.
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 ${roleCls}`}>
            {m.role}
          </span>
        </div>

        {/* Country */}
        <h3 className={`premium-font-galdgderbold text-[1.7rem] sm:text-[2.1rem] lg:text-[2.3rem] leading-tight mb-2 ${titleCls}`}>
          {m.country}
        </h3>

        {/* Description */}
        <p className={`text-[12px] leading-relaxed mb-5 ${descCls}`} style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {m.desc}
        </p>

        {/* Gold accent line */}
        <div className="w-8 h-[2px] bg-[#B99353] mb-4" />

        {/* Stats */}
        <div className="flex gap-2 mt-auto">
          {m.stats.map(stat => (
            <div key={stat.label} className={`flex-1 p-2.5 ${statBoxCls}`}>
              <div className="text-sm font-bold text-[#B99353] leading-none mb-1">{stat.value}</div>
              <div className={`text-[8px] uppercase tracking-wider leading-tight ${statLabelCls}`}>{stat.label}</div>
            </div>
          ))}
        </div>

      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────── */
/*  Markets We Serve — sticky scroll section   */
/* ─────────────────────────────────────────── */
function MarketsSection() {
  const containerRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const [stackLayout, setStackLayout] = useState(getStackLayout);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const updateLayout = () => setStackLayout(getStackLayout());
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  const headingOpacity = useTransform(scrollYProgress, [0.02, 0.09], [0, 1]);

  // Pin indicators: each fades 0→1 when its card's entry starts and 1→0 when the next
  // card's entry starts, so only the currently-active country's pin is ever visible.
  // Raw values track scroll precisely; springs smooth the on/off transitions.
  const pinSpring = { stiffness: 90, damping: 22, mass: 0.9 };
  const pinCnRaw = useTransform(
    scrollYProgress,
    [CARD_ENTRY[0].start, CARD_ENTRY[0].start + 0.04, CARD_ENTRY[1].start, CARD_ENTRY[1].start + 0.04],
    [0, 1, 1, 0],
    { clamp: true }
  );
  const pinNpRaw = useTransform(
    scrollYProgress,
    [CARD_ENTRY[1].start, CARD_ENTRY[1].start + 0.04, CARD_ENTRY[2].start, CARD_ENTRY[2].start + 0.04],
    [0, 1, 1, 0],
    { clamp: true }
  );
  const pinInRaw = useTransform(
    scrollYProgress,
    [CARD_ENTRY[2].start, CARD_ENTRY[2].start + 0.04, CARD_ENTRY[3].start, CARD_ENTRY[3].start + 0.04],
    [0, 1, 1, 0],
    { clamp: true }
  );
  // Australia is the last card — no next card to hand off to, stays visible.
  const pinAuRaw = useTransform(
    scrollYProgress,
    [CARD_ENTRY[3].start, CARD_ENTRY[3].start + 0.04],
    [0, 1],
    { clamp: true }
  );
  const pinCn = useSpring(pinCnRaw, pinSpring);
  const pinNp = useSpring(pinNpRaw, pinSpring);
  const pinIn = useSpring(pinInRaw, pinSpring);
  const pinAu = useSpring(pinAuRaw, pinSpring);

  return (
    <section ref={containerRef} className="relative" style={{ height: stackLayout === "mobile" ? "500vh" : "560vh" }}>
      <div
        className="sticky top-0 h-[100dvh] min-h-[640px] overflow-hidden flex flex-col sm:min-h-[680px] sm:flex-row items-stretch"
        style={{ backgroundColor: "#EAE8E5" }}
      >

        {/* ── Full static world map — centered, no animation. Pins fade in per card via CSS vars. ── */}
        <motion.div
          style={{ "--pin-cn": pinCn, "--pin-np": pinNp, "--pin-in": pinIn, "--pin-au": pinAu }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 opacity-80 sm:opacity-100"
        >
          <WorldMap style={{ maxWidth: "112%", maxHeight: "100%", transform: stackLayout === "mobile" ? "translateY(12%) scale(1.08)" : "translateY(6%)" }} />
        </motion.div>

        {/* Mobile-only horizontal title */}
        <motion.div
          style={{ opacity: headingOpacity }}
          className="sm:hidden relative z-10 py-3 flex items-center justify-center shrink-0 pointer-events-none"
        >
          <h2 className="premium-font-galdgderbold text-[11px] text-[#2D2D2D]/45 uppercase tracking-[0.25em]">
            Markets We Serve
          </h2>
        </motion.div>

        {/* ── LEFT / TOP: card stack (overlays map) ── */}
        <div className="relative z-10 flex items-center justify-center w-full sm:w-[55%] lg:w-[42%] h-[60dvh] min-h-[400px] sm:h-full overflow-hidden">
          {MARKETS.map((m, i) => (
            <MarketStackCard
              key={m.country}
              m={m}
              index={i}
              progress={scrollYProgress}
              pos={STACK_POSITIONS[stackLayout][i]}
              layout={stackLayout}
              reducedMotion={prefersReducedMotion}
            />
          ))}
        </div>

        {/* ── Spacer so the map's center is visible between cards and title ── */}
        <div className="hidden sm:block flex-1" />

        {/* ── RIGHT: vertical title ── */}
        <motion.div
          style={{ opacity: headingOpacity }}
          className="hidden sm:flex relative z-10 h-full items-center justify-center w-[72px] lg:w-[96px] shrink-0"
        >
          <h2
            className="premium-font-galdgderbold text-xl lg:text-3xl text-[#2D2D2D] whitespace-nowrap select-none"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.12em" }}
          >
            Markets We Serve
          </h2>
        </motion.div>

      </div>
    </section>
  );
}

/* ─────────────────────────────────────────── */
/*  Export                                     */
/* ─────────────────────────────────────────── */
export default function Section4() {
  return (
    <>
      <GlobeSection />
      <MarketsSection />
    </>
  );
}
