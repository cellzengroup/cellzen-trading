import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Header from '../components/Header';
import Footer from '../components/ui/Footer';
import useBreakpoint from '../hooks/useBreakpoint';

/* ── Reusable hook: triggers once when element enters viewport ── */
const useScrollReveal = (threshold = 0.2) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
};

/* ── Animated counter ── */
const AnimatedNumber = ({ target, duration = 2000, suffix = '' }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const animate = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setCount(Math.round(eased * target));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
};

const About = () => {
  const { t } = useTranslation();

  const { isMobile } = useBreakpoint();

  /* ── Scroll-driven progress bar ── */
  const [scrollProgress, setScrollProgress] = useState(0);
  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    setScrollProgress(docHeight > 0 ? scrollTop / docHeight : 0);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  /* ── Section reveal hooks ── */
  const [storyRef, storyVisible] = useScrollReveal(0.15);
  const [valuesRef, valuesVisible] = useScrollReveal(0.1);
  const [statsRef, statsVisible] = useScrollReveal(0.3);


  const values = [
    { key: 'art', image: `${import.meta.env.BASE_URL}gallery/WhiteTara.jpg` },
    { key: 'sound', image: `${import.meta.env.BASE_URL}gallery/Singingbowl.jpg` },
    { key: 'spirituality', image: `${import.meta.env.BASE_URL}gallery/Beads.jpg` },
  ];

  const stats = [
    { number: 200, suffix: '+', labelKey: 'about.stats.artisans' },
    { number: 15, suffix: '+', labelKey: 'about.stats.years' },
    { number: 5000, suffix: '+', labelKey: 'about.stats.pieces' },
    { number: 30, suffix: '+', labelKey: 'about.stats.countries' },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#FFFBE9' }}>
      <Header />

      {/* ── Scroll progress bar ── */}
      <div
        className="fixed top-0 left-0 h-[3px] z-[100] transition-none"
        style={{
          width: `${scrollProgress * 100}%`,
          background: 'linear-gradient(90deg, #A53223, #d4654a)',
        }}
      />

      {/* ═══════ Section 2: Story — Split-screen with sliding reveals ═══════ */}
      <section ref={storyRef} className="w-full py-24 md:py-36" style={{ backgroundColor: '#FFFBE9' }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          {/* Top: Large quote-style heading */}
          <div
            className={`mb-20 transition-all duration-1000 ease-out ${
              storyVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-16'
            }`}
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-[2px] bg-[#A53223] mt-4 flex-shrink-0" />
              <p className="text-xs tracking-[0.4em] uppercase text-[#A53223] font-medium">
                {t('about.story.label')}
              </p>
            </div>
            <h2 className={`h1-heading font-bold text-gray-900 leading-[1.15] ${
              isMobile ? 'text-3xl' : 'text-4xl md:text-6xl lg:text-7xl'
            }`}>
              {t('about.story.title')}
            </h2>
          </div>

          {/* Split layout: text left, image right with offset */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-start">
            {/* Text column — slides from left */}
            <div
              className={`lg:col-span-5 space-y-8 transition-all duration-1000 delay-300 ease-out ${
                storyVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
            >
              <p className="text-gray-600 leading-[1.9] text-base md:text-[1.05rem] font-[300]">
                {t('about.story.text1')}
              </p>
              <p className="text-gray-600 leading-[1.9] text-base md:text-[1.05rem] font-[300]">
                {t('about.story.text2')}
              </p>
              <blockquote className="border-l-2 border-[#A53223] pl-6 py-2">
                <p className="text-gray-800 leading-[1.8] text-base md:text-lg font-[400] italic">
                  {t('about.story.text3')}
                </p>
              </blockquote>
            </div>

            {/* Image column — slides from right with vertical offset */}
            <div
              className={`lg:col-span-6 lg:col-start-7 transition-all duration-1200 delay-500 ease-out ${
                storyVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
              }`}
            >
              <div className="relative lg:mt-[-40px]">
                {/* Decorative frame offset */}
                <div
                  className="absolute top-4 left-4 right-[-8px] bottom-[-8px] border border-[#A53223]/30 rounded-sm pointer-events-none"
                />
                <div className="relative overflow-hidden rounded-sm">
                  <img
                    src={`${import.meta.env.BASE_URL}gallery/WhiteTara.jpg`}
                    alt="Sacred Thangka Art"
                    className="w-full h-[450px] md:h-[580px] object-cover"
                    style={{ filter: 'saturate(0.9)' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ Section 3: Stats Counter Bar ═══════ */}
      <section
        ref={statsRef}
        className="w-full py-16 md:py-20 relative overflow-hidden"
        style={{ backgroundColor: '#1a1210' }}
      >
        {/* Subtle background texture */}
        <div className="absolute inset-0 opacity-5">
          <img
            src={`${import.meta.env.BASE_URL}Homebg.jpg`}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        <div
          className={`relative z-10 max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 transition-all duration-1000 ${
            statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {stats.map((stat, idx) => (
            <div
              key={stat.labelKey}
              className="text-center"
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              <div className="h2-text text-4xl md:text-5xl lg:text-6xl font-bold text-[#FFFBE9] mb-2 tabular-nums">
                {statsVisible && <AnimatedNumber target={stat.number} suffix={stat.suffix} />}
              </div>
              <div className="text-white/50 text-xs sm:text-sm tracking-[0.2em] uppercase font-[300]">
                {t(stat.labelKey)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ Section 4: Values — Full-width stacked panels ═══════ */}
      <section ref={valuesRef} className="w-full" style={{ backgroundColor: '#FFFBE9' }}>
        {/* Section header */}
        <div className={`py-20 md:py-28 text-center px-6 transition-all duration-1000 ${
          valuesVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}>
          <p className="text-xs tracking-[0.4em] uppercase text-[#A53223] font-medium mb-4">
            {t('about.values.label')}
          </p>
          <h2 className={`h2-text font-bold text-gray-900 ${isMobile ? 'text-3xl' : 'text-4xl md:text-5xl'}`}>
            {t('about.values.title')}
          </h2>
        </div>

        {/* Alternating full-width panels */}
        {values.map((item, idx) => {
          const isEven = idx % 2 === 0;
          return (
            <ValuePanel
              key={item.key}
              item={item}
              index={idx}
              isEven={isEven}
              isMobile={isMobile}
              t={t}
            />
          );
        })}
      </section>

      <Footer />

    </div>
  );
};

/* ── Value Panel: alternating image/text full-width rows ── */
const ValuePanel = ({ item, index, isEven, isMobile, t }) => {
  const [ref, visible] = useScrollReveal(0.15);

  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 lg:grid-cols-2 min-h-[70vh] ${
        visible ? 'opacity-100' : 'opacity-0'
      } transition-opacity duration-1000`}
    >
      {/* Image side */}
      <div
        className={`relative overflow-hidden ${
          isEven ? 'lg:order-1' : 'lg:order-2'
        } ${visible ? (isEven ? 'animate-[slideFromLeft_1s_ease-out_forwards]' : 'animate-[slideFromRight_1s_ease-out_forwards]') : ''}`}
        style={{ minHeight: isMobile ? '50vh' : undefined }}
      >
        <img
          src={item.image}
          alt={t(`about.values.${item.key}.title`)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-[8s] ease-out hover:scale-105"
        />
        {/* Number overlay */}
        <div className="absolute bottom-6 left-6 z-10">
          <span
            className="h1-heading text-[8rem] md:text-[12rem] font-bold leading-none text-white/10 select-none"
          >
            0{index + 1}
          </span>
        </div>
      </div>

      {/* Text side */}
      <div
        className={`flex items-center ${
          isEven ? 'lg:order-2' : 'lg:order-1'
        } ${isEven ? 'bg-[#FFFBE9]' : 'bg-[#FFFDF2]'}`}
      >
        <div
          className={`px-8 md:px-16 lg:px-20 py-16 md:py-20 max-w-xl transition-all duration-1000 delay-300 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="w-10 h-[2px] bg-[#A53223] mb-6" />
          <h3 className={`h2-text font-bold text-gray-900 mb-6 ${
            isMobile ? 'text-2xl' : 'text-3xl md:text-4xl'
          }`}>
            {t(`about.values.${item.key}.title`)}
          </h3>
          <p className="text-gray-600 leading-[1.9] text-base md:text-[1.05rem] font-[300]">
            {t(`about.values.${item.key}.description`)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default About;
