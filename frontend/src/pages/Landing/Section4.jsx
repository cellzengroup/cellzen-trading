import { useRef, useState, Suspense, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

useGLTF.preload("/Images/earth.glb");

const MARKETS = [
  {
    flag: "🇨🇳", country: "China", role: "Sourcing Hub",
    desc: "Direct access to thousands of verified factories across all major manufacturing regions — Guangdong, Zhejiang, Jiangsu, and beyond.",
    color: "from-red-500 to-orange-500",
    stats: [{ label: "Factory Partners", value: "200+" }, { label: "Product Categories", value: "50+" }],
  },
  {
    flag: "🇦🇺", country: "Australia", role: "Growing Market",
    desc: "Serving Australian businesses with reliable, cost-effective sourcing solutions. Shipping by sea, air, or express delivery.",
    color: "from-blue-500 to-cyan-500",
    stats: [{ label: "Delivery Options", value: "3" }, { label: "Transit Time", value: "10-25 days" }],
  },
  {
    flag: "🇳🇵", country: "Nepal", role: "Growing Market",
    desc: "Connecting Nepalese businesses with Chinese manufacturers at competitive prices, handling all logistics and customs clearance.",
    color: "from-red-600 to-blue-600",
    stats: [{ label: "Customs Support", value: "Full" }, { label: "Pricing", value: "Best Rate" }],
  },
];

const TABS = [
  { tab: "Global Reach", cardTitle: "A Worldwide Sourcing Network", desc: "We connect businesses around the world with trusted manufacturers. Our team handles everything — sourcing, negotiation, quality checks, and logistics — so you can focus on growing your business." },
  { tab: "Our Markets", cardTitle: "A Trusted Global Partner", desc: "Strategically positioned across 10+ countries with fully integrated operations. We deliver quality products at competitive prices, with full transparency and reliable delivery every step of the way." },
];

function EarthModel() {
  const { scene } = useGLTF("/Images/earth.glb");

  useEffect(() => {
    if (!scene) return;
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2.0 / maxDim;
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  }, [scene]);

  return <primitive object={scene} />;
}

function GlobeCanvas() {
  return (
    <div style={{ width: "560px", height: "560px" }}>
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
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={true}
          autoRotateSpeed={1.0}
        />
      </Canvas>
    </div>
  );
}

function MarketCard({ m, i, progress }) {
  // Stagger in, hold at full opacity, then fade out together near section end
  const start = 0.44 + i * 0.02;
  const end   = 0.48 + i * 0.02;
  const opacity = useTransform(progress, [start, end, 0.88, 0.96], [0, 1, 1, 0]);
  const y = useTransform(progress, [start, end], [30, 0]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="group relative rounded-2xl border border-[#412460]/10 bg-white/70 backdrop-blur-md overflow-hidden hover:border-[#412460]/25 hover:scale-[1.02] shadow-sm hover:shadow-md transition-all duration-500"
    >
      <div className={`h-1 bg-gradient-to-r ${m.color}`} />
      <div className="relative z-10 p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{m.flag}</span>
          <div>
            <h3 className="text-base font-bold text-cz-main">{m.country}</h3>
            <span className={`inline-block rounded-full bg-gradient-to-r ${m.color} px-2 py-0.5 text-[10px] font-semibold text-white`}>
              {m.role}
            </span>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[#2D2D2D]/55 mb-3">{m.desc}</p>
        <div className="grid grid-cols-2 gap-2">
          {m.stats.map((stat) => (
            <div key={stat.label} className="rounded-lg bg-[#412460]/5 border border-[#412460]/5 p-2 text-center group-hover:border-[#412460]/10 group-hover:bg-[#412460]/10 transition-all duration-300">
              <div className="text-sm font-bold text-cz-secondary-dark">{stat.value}</div>
              <div className="text-[9px] uppercase tracking-wider text-[#2D2D2D]/40">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function Section4() {
  const containerRef = useRef(null);
  const [activeTab, setActiveTab] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  /* ── Phase 1: Globe + intro text (0 → 0.45) ── */
  const phase1Opacity = useTransform(scrollYProgress, [0, 0.05, 0.38, 0.46], [0, 1, 1, 0]);
  const textOpacity   = useTransform(scrollYProgress, [0, 0.07, 0.30, 0.40], [0, 1, 1, 0]);
  const textY         = useTransform(scrollYProgress, [0, 0.07, 0.30, 0.40], [30, 0, 0, -20]);

  /* ── Phase 2: fade in → hold → fade out before section ends ── */
  // Fade in at 0.36–0.42, hold, then fade out at 0.88–0.95
  const phase2Opacity  = useTransform(scrollYProgress, [0.36, 0.42, 0.88, 0.96], [0, 1, 1, 0]);
  const headingOpacity = useTransform(scrollYProgress, [0.38, 0.44, 0.88, 0.96], [0, 1, 1, 0]);
  const headingY       = useTransform(scrollYProgress, [0.38, 0.44], [28, 0]);

  return (
    <section ref={containerRef} className="relative" style={{ height: "700vh" }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-gradient-to-b from-[#2e1845] to-cz-main">

        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative z-10 flex h-full flex-col items-center justify-center">

          {/* ═══ PHASE 1 — 3D Globe + Intro Text ═══ */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: phase1Opacity }}
          >
            <div className="mx-auto max-w-6xl px-6 w-full pointer-events-auto">
              <div className="grid gap-12 lg:grid-cols-2 items-center">

                {/* 3D Globe — fades with the text */}
                <motion.div className="flex justify-center items-center" style={{ opacity: textOpacity }}>
                  <GlobeCanvas />
                </motion.div>

                {/* Intro text + tabs */}
                <motion.div style={{ opacity: textOpacity, y: textY }}>
                  <h3 className="premium-font-galdgderbold text-3xl text-white sm:text-4xl lg:text-[2.6rem] leading-[1.15]">
                    We Are Connecting Global Business Success With{" "}
                    <span className="text-cz-secondary-light">Trading</span>
                  </h3>
                  <p className="mt-5 text-sm leading-[1.9] text-white/50">
                    Strategically positioned across 10+ countries through fully integrated sourcing
                    operations — a single point of contact for your global supply chain needs.
                  </p>
                  <div className="mt-8 flex">
                    {TABS.map((t, i) => (
                      <button
                        key={t.tab}
                        type="button"
                        onClick={() => setActiveTab(i)}
                        className={`flex-1 py-3.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 ${activeTab === i ? "bg-cz-secondary-dark text-white" : "bg-white/10 text-white/60 hover:text-white"}`}
                        style={{ borderRadius: 0 }}
                      >
                        {t.tab}
                      </button>
                    ))}
                  </div>
                  <div className="bg-white/5 border border-white/10 border-t-0 overflow-hidden backdrop-blur-sm">
                    <div className="p-6 sm:p-8">
                      <h4 className="font-bold text-white text-lg leading-tight">{TABS[activeTab].cardTitle}</h4>
                      <p className="mt-2.5 text-xs leading-relaxed text-white/50">{TABS[activeTab].desc}</p>
                    </div>
                  </div>
                </motion.div>

              </div>
            </div>
          </motion.div>

          {/* ═══ PHASE 2 — Markets We Serve + Cards ═══ */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ opacity: phase2Opacity, backgroundColor: "#EAE8E5" }}
          >
            <div className="mx-auto max-w-5xl px-6 w-full pointer-events-auto">

              <motion.div className="text-center mb-10" style={{ opacity: headingOpacity, y: headingY }}>
                <h2 className="premium-font-galdgderbold text-3xl text-cz-main sm:text-4xl lg:text-5xl">
                  Markets We Serve
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base text-[#2D2D2D]/60">
                  Strategically positioned across three countries to deliver maximum value.
                </p>
              </motion.div>

              <div className="grid gap-5 sm:grid-cols-3">
                {MARKETS.map((m, i) => (
                  <MarketCard key={m.country} m={m} i={i} progress={scrollYProgress} />
                ))}
              </div>


            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
