import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

const FULL_TEXT = "We Make It Global.";
const TYPE_SPEED = 140;
const CURSOR_BLINK_DURATION = 600;

// ── Generate cinematic "whoosh" boom sound (like a film title reveal) ──
function createCinematicBoom() {
  const sampleRate = 44100;
  const duration = 2.5;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const w = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + numSamples * 2, true);
  w(8, "WAVE"); w(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Deep sub-bass boom (40-60Hz) with fast attack, slow decay
    const boom = Math.sin(2 * Math.PI * 50 * t) * Math.exp(-t * 2.0) * 0.6;

    // Rising whoosh (noise swept through bandpass)
    const noise = (Math.random() * 2 - 1);
    const whooshEnv = Math.exp(-Math.pow(t - 0.3, 2) / 0.08) * 0.25;
    const whoosh = noise * whooshEnv;

    // Impact transient — sharp crack at the start
    const impact = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 30) * 0.5;

    // Low rumble tail
    const rumble = Math.sin(2 * Math.PI * 35 * t + Math.sin(2 * Math.PI * 0.5 * t) * 2) * Math.exp(-t * 1.2) * 0.3;

    // Tonal shimmer (high harmonic that fades in then out)
    const shimmerEnv = Math.exp(-Math.pow(t - 0.5, 2) / 0.15) * 0.08;
    const shimmer = Math.sin(2 * Math.PI * 800 * t) * shimmerEnv;

    const val = Math.max(-1, Math.min(1, boom + whoosh + impact + rumble + shimmer));
    view.setInt16(44 + i * 2, val * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

// ── Blue switch mechanical keyboard click sound ──
function createClickWav() {
  const sampleRate = 44100;
  const duration = 0.08;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const w = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + numSamples * 2, true);
  w(8, "WAVE"); w(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Sharp initial click (the "tactile bump" of blue switch)
    const click = Math.exp(-t * 300) * (Math.random() * 2 - 1) * 0.7;
    // Resonant plastic "tock" body
    const tock = Math.sin(2 * Math.PI * 3500 * t) * Math.exp(-t * 80) * 0.5;
    // Lower thud from keycap bottoming out
    const thud = Math.sin(2 * Math.PI * 800 * t) * Math.exp(-t * 60) * 0.4;
    // High-frequency click shimmer (blue switch signature)
    const shimmer = Math.sin(2 * Math.PI * 6000 * t) * Math.exp(-t * 200) * 0.25;
    // Slight spring noise tail
    const spring = Math.sin(2 * Math.PI * 4200 * t + Math.sin(t * 500) * 3) * Math.exp(-t * 40) * 0.15;
    const val = Math.max(-1, Math.min(1, click + tock + thud + shimmer + spring));
    view.setInt16(44 + i * 2, val * 32767, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const POOL_SIZE = 6;
let clickPool = [];
let poolIdx = 0;
let boomAudio = null;

function initAudio() {
  if (clickPool.length > 0) return;
  const clickUrl = createClickWav();
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = new Audio(clickUrl);
    a.volume = 1.0;
    clickPool.push(a);
  }
  boomAudio = new Audio(createCinematicBoom());
  boomAudio.volume = 0.7;
}

function playTypeSound() {
  try {
    const a = clickPool[poolIdx % POOL_SIZE];
    poolIdx++;
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch (_) {}
}

function playCinematicBoom() {
  try {
    if (boomAudio) {
      boomAudio.currentTime = 0;
      boomAudio.play().catch(() => {});
    }
  } catch (_) {}
}

export default function Section1() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const inputRef = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Check if user has visited before
  const hasVisited = useRef(typeof localStorage !== "undefined" && localStorage.getItem("cz_intro_seen") === "1");

  // Intro state — skip intro if returning visitor
  const [entered, setEntered] = useState(hasVisited.current);
  const [introFading, setIntroFading] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [productValue, setProductValue] = useState("");
  const [isNepal, setIsNepal] = useState(null); // null = loading, true/false = detected
  const [introStep, setIntroStep] = useState(null); // set after geo detection

  // Cinematic intro typewriter
  const GREETING = "Hey there, We are a global sourcing agent and We are ready to help you.";
  const [greetTyped, setGreetTyped] = useState(0);
  const [greetDone, setGreetDone] = useState(false);
  const [greetFading, setGreetFading] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);
  const [showInput, setShowInput] = useState(false);

  // Typewriter (hero)
  const [typedCount, setTypedCount] = useState(0);
  const [typingDone, setTypingDone] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showCursor, setShowCursor] = useState(true);

  // Detect user country via IP geolocation
  useEffect(() => {
    if (entered) return;
    fetch("https://ipapi.co/json/")
      .then((res) => res.json())
      .then((data) => {
        const nepal = data.country_code === "NP";
        setIsNepal(nepal);
        setIntroStep(nepal ? "email" : "product");
      })
      .catch(() => {
        // Fallback: treat as non-Nepal (show only product)
        setIsNepal(false);
        setIntroStep("product");
      });
  }, [entered]);

  // Logo reveal after short delay
  useEffect(() => {
    const t = setTimeout(() => setLogoVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Greeting typewriter — starts after logo appears
  useEffect(() => {
    if (entered || !logoVisible) return;
    if (greetDone) return;

    if (greetTyped < GREETING.length) {
      // Pause at commas and periods for dramatic effect
      const lastChar = GREETING[greetTyped - 1];
      const delay = lastChar === "," ? 400 : lastChar === "." ? 600 : 45;
      const t = setTimeout(() => setGreetTyped((c) => c + 1), delay);
      return () => clearTimeout(t);
    }

    // Greeting finished — hold briefly, then fade out
    const t = setTimeout(() => {
      setGreetDone(true);
      setGreetFading(true);
      setTimeout(() => setShowInput(true), 800);
    }, 600);
    return () => clearTimeout(t);
  }, [entered, logoVisible, greetTyped, greetDone, GREETING.length]);

  function handleEnter() {
    if (introFading) return;
    initAudio();
    playCinematicBoom();

    // Save lead to backend — only include email for Nepal users
    const payload = isNepal
      ? { email: emailValue, product: productValue }
      : { product: productValue };
    api.post("/api/leads", payload).catch(() => {});

    setIntroFading(true);
    setTimeout(() => {
      setEntered(true);
      try { localStorage.setItem("cz_intro_seen", "1"); } catch (_) {}
    }, 800);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (introStep === "email") {
      // Nepal user: validate email, then move to product step
      if (!emailValue.trim()) return;
      setIntroStep("product");
    } else {
      // Product step (final step for everyone)
      handleEnter();
    }
  }

  // Typewriter — starts after entered
  useEffect(() => {
    if (!entered) return;
    if (typedCount < FULL_TEXT.length) {
      const t = setTimeout(() => {
        playTypeSound();
        setTypedCount((c) => c + 1);
      }, TYPE_SPEED);
      return () => clearTimeout(t);
    }
    const blinkInterval = setInterval(() => setCursorVisible((v) => !v), 300);
    const hideTimer = setTimeout(() => {
      clearInterval(blinkInterval);
      setShowCursor(false);
      setTypingDone(true);
      window.dispatchEvent(new CustomEvent("hero-typing-done"));
    }, CURSOR_BLINK_DURATION);
    return () => { clearInterval(blinkInterval); clearTimeout(hideTimer); };
  }, [entered, typedCount]);

  const handleScroll = useCallback(() => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sectionHeight = el.offsetHeight;
    const raw = -rect.top / (sectionHeight - window.innerHeight);
    setScrollProgress(Math.max(0, Math.min(1, raw)));
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Phase calculations — starts immediately, gentle pace
  const titleFade = Math.max(0, Math.min(1, 1 - scrollProgress / 0.20));
  const titleScale = 1 + scrollProgress * 0.06;
  const splitProgress = Math.max(0, Math.min(1, scrollProgress / 0.20));
  const splitDistance = splitProgress * 60;
  const caveProgress = Math.max(0, Math.min(1, (scrollProgress - 0.10) / 0.45));
  const revealProgress = Math.max(0, Math.min(1, (scrollProgress - 0.50) / 0.35));
  const circleRadius = 3 + caveProgress * 115;
  const videoY = (1 - caveProgress) * 20;

  const typed = FULL_TEXT.slice(0, typedCount);
  const leftText = typed.slice(0, 8);
  const rightText = typed.slice(8);

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: "220vh" }}
    >
      {/* ====== INTRO OVERLAY ====== */}
      {!entered && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-all duration-800 ${introFading ? "opacity-0 scale-105" : "opacity-100 scale-100"}`}
          style={{ background: "#2A1740" }}
        >
          {/* Floating orbs */}
          <div className="absolute top-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-cz-secondary-light/5 blur-[120px] animate-pulse-slow" />
          <div className="absolute bottom-[-10%] left-[10%] h-[350px] w-[350px] rounded-full bg-white/3 blur-[100px] animate-pulse-slow" style={{ animationDelay: "3s" }} />

          {/* ── Cinematic greeting typewriter ── */}
          {!showInput && (
            <div className={`relative z-10 flex flex-col items-center max-w-2xl px-6 transition-all duration-1000 ${greetFading ? "opacity-0 scale-95 blur-sm translate-y-[-40px]" : "opacity-100"}`}>
              {/* Logo — fades in with glow */}
              <div className={`transition-all duration-[1200ms] ease-out ${logoVisible ? "opacity-100 scale-100" : "opacity-0 scale-50"}`}>
                <div className="relative">
                      <svg className="relative h-20 w-20 sm:h-24 sm:w-24 mx-auto" viewBox="0 0 180 181" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g clipPath="url(#cz-intro)">
                      <path d="M179.938 104.968C174.068 136.468 157.075 159.321 128.033 172.6C85.7055 192.056 36.8899 176.615 12.791 137.086C1.97741 118.865 -1.7301 99.4095 0.741575 78.4097C5.37597 41.66 33.8003 10.7779 70.8755 2.13091C106.097 -5.89844 144.717 9.23379 165.108 39.8071C172.523 50.9246 177.467 62.9686 179.629 76.248C179.629 76.8656 179.938 77.7921 179.938 78.4097C179.32 78.7185 179.011 78.7185 179.011 78.7185C161.71 79.3362 144.408 78.7185 128.033 74.0862C121.545 72.2333 116.91 66.3657 116.91 59.5716V52.1599C116.91 48.1452 112.585 45.6747 109.186 47.8364L98.6819 54.0128L86.9414 60.4981L66.55 72.2333L49.5572 82.1155L42.7601 86.1302C39.3616 87.9831 39.3616 92.9243 42.7601 95.086L49.5572 99.1007L66.859 108.983L86.9414 120.409L98.9908 127.203L109.495 133.38C112.894 135.233 117.219 132.762 117.219 129.056V121.953C117.219 115.468 121.545 109.601 127.724 107.439C139.156 103.733 151.205 102.189 163.563 102.498H177.467C179.629 101.88 180.247 102.807 179.938 104.968Z" fill="#EAE8E5"/>
                    </g>
                    <defs>
                      <clipPath id="cz-intro"><rect width="180" height="181" fill="white"/></clipPath>
                    </defs>
                  </svg>
                </div>
              </div>


              {/* Typewriter greeting text */}
              <div className="mt-8 text-center min-h-[5rem]">
                <p className="premium-font-galdgdersemi text-base sm:text-lg lg:text-xl leading-relaxed" style={{ color: "#EAE8E5" }}>
                  {greetTyped <= 11
                    ? <span style={{ color: "#B99353" }}>{GREETING.slice(0, greetTyped)}</span>
                    : <><span style={{ color: "#B99353" }}>{GREETING.slice(0, 11)}</span>{GREETING.slice(11, greetTyped)}</>
                  }
                  {!greetDone && (
                    <span
                      className="inline-block w-[2px] ml-1 rounded-sm animate-pulse"
                      style={{ height: "0.85em", backgroundColor: "#B99353", verticalAlign: "baseline" }}
                    />
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ── Input field with logo ── */}
          <div className={`absolute z-10 flex flex-col items-center w-full max-w-md px-6 transition-all duration-1000 ease-out ${showInput ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-16 scale-95 pointer-events-none"}`}>
            {/* Logo above input */}
            <div className="relative mb-6">
              <svg className="relative h-12 w-12" viewBox="0 0 180 181" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g clipPath="url(#cz-input)">
                  <path d="M179.938 104.968C174.068 136.468 157.075 159.321 128.033 172.6C85.7055 192.056 36.8899 176.615 12.791 137.086C1.97741 118.865 -1.7301 99.4095 0.741575 78.4097C5.37597 41.66 33.8003 10.7779 70.8755 2.13091C106.097 -5.89844 144.717 9.23379 165.108 39.8071C172.523 50.9246 177.467 62.9686 179.629 76.248C179.629 76.8656 179.938 77.7921 179.938 78.4097C179.32 78.7185 179.011 78.7185 179.011 78.7185C161.71 79.3362 144.408 78.7185 128.033 74.0862C121.545 72.2333 116.91 66.3657 116.91 59.5716V52.1599C116.91 48.1452 112.585 45.6747 109.186 47.8364L98.6819 54.0128L86.9414 60.4981L66.55 72.2333L49.5572 82.1155L42.7601 86.1302C39.3616 87.9831 39.3616 92.9243 42.7601 95.086L49.5572 99.1007L66.859 108.983L86.9414 120.409L98.9908 127.203L109.495 133.38C112.894 135.233 117.219 132.762 117.219 129.056V121.953C117.219 115.468 121.545 109.601 127.724 107.439C139.156 103.733 151.205 102.189 163.563 102.498H177.467C179.629 101.88 180.247 102.807 179.938 104.968Z" fill="#EAE8E5"/>
                </g>
                <defs>
                  <clipPath id="cz-input"><rect width="180" height="181" fill="white"/></clipPath>
                </defs>
              </svg>
            </div>

            <form onSubmit={handleSubmit} className="w-full">
              <div className="relative group">
                {introStep === "email" ? (
                  <input
                    ref={inputRef}
                    key="email"
                    type="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    placeholder="Your email address"
                    className="w-full rounded-full border border-white/15 bg-white/5 px-6 py-4 pr-14 text-sm text-white placeholder-white/30 backdrop-blur-md outline-none transition-all duration-300 focus:border-cz-secondary-light/50 focus:bg-white/8 focus:shadow-[0_0_20px_rgba(185,147,83,0.15)]"
                    style={{ caretColor: "#B99353" }}
                    autoFocus
                  />
                ) : introStep === "product" ? (
                  <input
                    key="product"
                    type="text"
                    value={productValue}
                    onChange={(e) => setProductValue(e.target.value)}
                    placeholder="What are you sourcing for?"
                    className="w-full rounded-full border border-white/15 bg-white/5 px-6 py-4 pr-14 text-sm text-white placeholder-white/30 backdrop-blur-md outline-none transition-all duration-300 focus:border-cz-secondary-light/50 focus:bg-white/8 focus:shadow-[0_0_20px_rgba(185,147,83,0.15)]"
                    style={{ caretColor: "#B99353" }}
                    autoFocus
                  />
                ) : (
                  <div className="w-full rounded-full border border-white/15 bg-white/5 px-6 py-4 pr-14 text-sm text-white/30 backdrop-blur-md">
                    Loading...
                  </div>
                )}
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-cz-secondary-light text-white transition-all duration-300 hover:bg-cz-secondary-light/90 hover:scale-110 hover:shadow-[0_0_20px_rgba(185,147,83,0.4)] active:scale-95"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sticky container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">

        {/* ====== LAYER 1: Purple bg + title ====== */}
        <div
          className="absolute inset-0 z-30 flex items-center justify-center"
          style={{
            opacity: Math.max(titleFade, caveProgress < 1 ? 0.001 : 0),
            pointerEvents: titleFade < 0.05 ? "none" : "auto",
            background: "#2A1740",
          }}
        >
          <div className="absolute top-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-cz-secondary-light/8 blur-[120px] animate-pulse-slow" />
          <div className="absolute bottom-[-10%] left-[10%] h-[350px] w-[350px] rounded-full bg-white/5 blur-[100px] animate-pulse-slow" style={{ animationDelay: "3s" }} />

          <div className="relative z-10 px-6 w-full flex items-center justify-center overflow-hidden -mt-16">
            {!typingDone ? (
              <span className="premium-font-galdgderbold text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1] whitespace-nowrap">
                <span style={{ color: "#EAE8E5" }}>{leftText}</span>
                {rightText && (
                  <>
                    <span style={{ color: "#EAE8E5" }}>{rightText.startsWith("It") ? rightText.slice(0, 3) : ""}</span>
                    {rightText.length > 3 && (
                      <span className="bg-gradient-to-r from-cz-secondary-light via-yellow-300 to-cz-secondary-light bg-clip-text text-transparent">
                        {rightText.slice(3)}
                      </span>
                    )}
                  </>
                )}
                {showCursor && (
                  <span
                    className="inline-block w-[3px] ml-1 rounded-sm"
                    style={{
                      height: "0.85em",
                      backgroundColor: "#EAE8E5",
                      opacity: cursorVisible ? 1 : 0,
                      verticalAlign: "baseline",
                      transition: "opacity 0.1s",
                    }}
                  />
                )}
              </span>
            ) : (
              <>
                <span
                  className="premium-font-galdgderbold text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1] whitespace-nowrap"
                  style={{
                    transform: `translateX(-${splitDistance}%) scale(${titleScale})`,
                    color: "#EAE8E5",
                  }}
                >
                  We Make{"\u00A0"}
                </span>
                <span
                  className="premium-font-galdgderbold text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1] whitespace-nowrap"
                  style={{
                    transform: `translateX(${splitDistance}%) scale(${titleScale})`,
                  }}
                >
                  <span style={{ color: "#EAE8E5" }}>It </span>
                  <span className="bg-gradient-to-r from-cz-secondary-light via-yellow-300 to-cz-secondary-light bg-clip-text text-transparent">
                    Global.
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* ====== LAYER 2: Cave mask ====== */}
        <div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            background: "#2A1740",
            WebkitMaskImage: `radial-gradient(circle at 50% 50%, transparent ${circleRadius}%, black ${circleRadius + 2}%)`,
            maskImage: `radial-gradient(circle at 50% 50%, transparent ${circleRadius}%, black ${circleRadius + 2}%)`,
            opacity: caveProgress >= 1 ? 0 : 1,
            transition: caveProgress >= 1 ? "opacity 0.5s" : "none",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              WebkitMaskImage: `radial-gradient(ellipse at 50% 50%, transparent ${Math.max(0, circleRadius - 4)}%, rgba(0,0,0,0.4) ${circleRadius - 1}%, black ${circleRadius + 5}%)`,
              maskImage: `radial-gradient(ellipse at 50% 50%, transparent ${Math.max(0, circleRadius - 4)}%, rgba(0,0,0,0.4) ${circleRadius - 1}%, black ${circleRadius + 5}%)`,
              background: "linear-gradient(135deg, #1a0a2e 0%, #0d0519 100%)",
            }}
          />
        </div>

        {/* ====== LAYER 3: Video ====== */}
        <div className="absolute inset-0 z-10">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: `translateY(${videoY}px) scale(1.1)` }}
            autoPlay muted loop playsInline
          >
            <source src="https://assets.mixkit.co/videos/35869/35869-720.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* ====== LAYER 4: Revealed content ====== */}
        <div
          className="absolute inset-0 z-40 flex items-end justify-center pb-16 sm:pb-20 pointer-events-none"
          style={{
            opacity: revealProgress,
            transform: `translateY(${(1 - revealProgress) * 80}px)`,
          }}
        >
          <div className="text-center px-6 pointer-events-auto">
            <h2 className="premium-font-galdgderbold text-3xl text-white sm:text-4xl md:text-5xl lg:text-6xl leading-tight">
              Connecting Global Markets
            </h2>
            <p className="mt-4 mx-auto max-w-xl text-sm text-white/60 sm:text-base leading-relaxed">
              Your trusted bridge between China's manufacturers and businesses in Australia & Nepal —
              from sourcing to delivery.
            </p>
            <div
              className="mt-8 flex flex-wrap items-center justify-center gap-4"
              style={{
                opacity: Math.max(0, (revealProgress - 0.3) / 0.7),
                transform: `translateY(${Math.max(0, (1 - revealProgress) * 30)}px)`,
              }}
            >
              <a href="#how-it-works" className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-cz-secondary-light px-8 py-4 text-sm font-bold text-white transition-all duration-300 hover:shadow-[0_0_40px_rgba(185,147,83,0.5)] hover:scale-105">
                <span className="relative z-10">Start Sourcing</span>
                <svg className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
              </a>
              <Link to="/contact" className="group inline-flex items-center gap-3 rounded-full border border-white/25 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:border-white/50 hover:bg-white/15 hover:scale-105">
                <svg className="h-4 w-4 text-cz-secondary-light transition-transform duration-300 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Us
              </Link>
            </div>
          </div>
        </div>

        {/* Vignette */}
        {caveProgress > 0 && caveProgress < 1 && (
          <div className="absolute inset-0 pointer-events-none" style={{
            boxShadow: `inset 0 0 ${100 + (1 - caveProgress) * 200}px ${50 + (1 - caveProgress) * 100}px rgba(26,10,46,${0.8 * (1 - caveProgress)})`,
            zIndex: 25,
          }} />
        )}
      </div>

    </section>
  );
}
