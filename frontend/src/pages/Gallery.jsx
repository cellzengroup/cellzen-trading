import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import Footer from '../components/ui/Footer';

const CARD_COUNT = 16;
const ANGLE_STEP = 360 / CARD_COUNT;
const RADIUS = 880;

const Gallery = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const sectionRef = useRef(null);
  const ringRef = useRef(null);
  const animRef = useRef(null);
  const lastRef = useRef(null);
  const rotationRef = useRef(0);

  const products = [
    { id: 'p1', image: '/gallery/WhiteTara.jpg' },
    { id: 'p2', image: '/gallery/singingBowls/HimalayanBowls/Himalaya1.png' },
    { id: 'p3', image: '/gallery/Section3_1.png' },
    { id: 'p4', image: '/gallery/Singingbowl.jpg' },
    { id: 'p5', image: '/gallery/singingBowls/PrintedBowls/Printed1.png' },
    { id: 'p6', image: '/gallery/Section3_2.png' },
    { id: 'p7', image: '/gallery/Beads.jpg' },
    { id: 'p8', image: '/gallery/singingBowls/FullMoon/FullMoon1.png' },
    { id: 'p9', image: '/gallery/Section3_3.png' },
    { id: 'p10', image: '/gallery/singingBowls/HimalayanBowls/Himalaya2.png' },
    { id: 'p11', image: '/Section2.png' },
    { id: 'p12', image: '/gallery/singingBowls/PrintedBowls/Printed2.png' },
    { id: 'p13', image: '/gallery/singingBowls/HimalayanBowls/Himalaya3.png' },
    { id: 'p14', image: '/gallery/singingBowls/PrintedBowls/Printed3.png' },
    { id: 'p15', image: '/gallery/singingBowls/HimalayanBowls/Himalaya4.png' },
    { id: 'p16', image: '/download.jpeg' },
  ];

  const categories = [
    { number: '01', label: t('products.thangka.title') },
    { number: '02', label: t('products.soundBowls.title') },
    { number: '03', label: t('products.sacredItems.title') },
    { number: '04', label: t('products.category4', { defaultValue: 'Custom Orders' }) },
  ];

  const animate = useCallback((ts) => {
    if (!lastRef.current) lastRef.current = ts;
    const dt = ts - lastRef.current;
    lastRef.current = ts;
    rotationRef.current -= dt * 0.015;
    if (ringRef.current) {
      ringRef.current.style.transform = `rotateY(${rotationRef.current}deg)`;
    }
    animRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (isHovered && isVisible) {
      lastRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    } else if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isHovered, isVisible, animate]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#FFFBE9', overflowX: 'clip' }}>
      <Header />

      <section
        ref={sectionRef}
        className="w-full bg-white py-16 md:py-24"
        style={{ minHeight: '100vh', overflow: 'hidden' }}
      >
        {/* Header Text */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-10 md:mb-14">
          <p
            className="inter-600 text-sm md:text-base tracking-widest uppercase mb-4"
            style={{
              color: '#A53223',
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.6s ease-out',
            }}
          >
            {t('products.sectionLabel', { defaultValue: 'Behind the Craft' })}
          </p>
          <h1
            className="h1-heading text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-5 leading-tight"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.6s ease-out 0.1s',
            }}
          >
            {t('products.title')}
          </h1>
          <p
            className="inter-400 text-gray-500 text-sm md:text-base max-w-xl mx-auto mb-8"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.6s ease-out 0.2s',
            }}
          >
            {t('products.subtitle')}
          </p>
          <div
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'all 0.6s ease-out 0.3s',
            }}
          >
            <a
              href="/gallery"
              className="inline-flex items-center gap-3 inter-500 text-sm text-gray-800 group"
              style={{ textDecoration: 'none' }}
            >
              <span className="border-b border-gray-800 pb-0.5 group-hover:border-[#A53223] group-hover:text-[#A53223] transition-colors">
                {t('products.cta', { defaultValue: 'See more Products' })}
              </span>
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-lg transition-transform group-hover:scale-110"
                style={{ backgroundColor: '#A53223' }}
              >
                &rarr;
              </span>
            </a>
          </div>
        </div>

        {/* 3D Outer Carousel */}
        <div
          style={{
            width: '100vw',
            marginLeft: 'calc(-50vw + 50%)',
            height: 'clamp(400px, 48vw, 600px)',
            perspective: '4500px',
            perspectiveOrigin: '50% 32%',
            position: 'relative',
            cursor: 'pointer',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            ref={ringRef}
            style={{
              position: 'absolute',
              left: '50%',
              top: '32%',
              width: 0,
              height: 0,
              transformStyle: 'preserve-3d',
              transform: 'rotateY(0deg)',
              willChange: 'transform',
            }}
          >
            {products.map((product, i) => {
              const angle = i * ANGLE_STEP;
              return (
                <div
                  key={product.id}
                  style={{
                    position: 'absolute',
                    width: 'clamp(220px, 22vw, 300px)',
                    height: 'clamp(300px, 36vw, 420px)',
                    left: '0',
                    top: '0',
                    marginLeft: 'clamp(-110px, -11vw, -150px)',
                    marginTop: 'clamp(-150px, -18vw, -210px)',
                    transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)`,
                    backfaceVisibility: 'hidden',
                    opacity: isVisible ? 1 : 0,
                    transition: `opacity 0.6s ease-out ${0.08 + i * 0.09}s`,
                  }}
                >
                  <div
                    className="w-full h-full overflow-hidden"
                    style={{
                      borderRadius: '22px',
                      padding: '6px',
                      backgroundColor: '#fff',
                      boxShadow:
                        '0 25px 60px rgba(0,0,0,0.16), 0 10px 24px rgba(0,0,0,0.08)',
                    }}
                  >
                    <img
                      src={product.image}
                      alt={product.id}
                      className="w-full h-full object-cover"
                      style={{ borderRadius: '18px', display: 'block' }}
                      loading="lazy"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Labels */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 max-w-3xl mx-auto mt-8 md:mt-12 px-4"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.6s ease-out 0.9s',
          }}
        >
          {categories.map((cat) => (
            <div key={cat.number} className="text-center">
              <p className="inter-700 text-sm md:text-base mb-1" style={{ color: '#A53223' }}>
                #{cat.number}
              </p>
              <p className="inter-500 text-gray-700 text-xs md:text-sm">{cat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product Detail Cards */}
      <section className="py-16 md:py-24" style={{ backgroundColor: '#FFFBE9' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                id: 'thangka',
                title: t('products.thangka.title'),
                description: t('products.thangka.description'),
                image: '/gallery/WhiteTara.jpg',
              },
              {
                id: 'soundBowls',
                title: t('products.soundBowls.title'),
                description: t('products.soundBowls.description'),
                image: '/gallery/Singingbowl.jpg',
              },
              {
                id: 'sacredItems',
                title: t('products.sacredItems.title'),
                description: t('products.sacredItems.description'),
                image: '/gallery/Beads.jpg',
              },
            ].map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 group cursor-pointer"
              >
                <div className="h-56 md:h-64 overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <div className="p-6">
                  <h2 className="h2-text text-xl font-bold text-gray-900 mb-3">{product.title}</h2>
                  <p className="inter-400 text-gray-500 text-sm leading-relaxed">
                    {product.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Gallery;
