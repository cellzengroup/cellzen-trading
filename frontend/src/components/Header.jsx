import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, Link } from 'react-router-dom';
import useBreakpoint from '../hooks/useBreakpoint';

// Flag Component - Circular flag display
const FlagIcon = ({ flagSrc, className = "h-5 w-5" }) => (
  <div className={`${className} rounded-full overflow-hidden flex items-center justify-center`}>
    <img
      src={flagSrc}
      alt="Flag"
      className="w-full h-full object-cover rounded-full"
    />
  </div>
);

const Header = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [forceHidden, setForceHidden] = useState(false);

  const {
    isSmallMobile,
    isLargeMobile,
    isTabletPortrait,
    isTabletLandscapeSmallDesktop,
    isDesktopLaptop,
    isDesktopLarge,
    isMobile,
    isTablet,
    isDesktop,
  } = useBreakpoint();

  const navigation = [
    { name: t('navigation.home'), path: '/' },
    { name: t('navigation.about'), path: '/about' },
    { name: t('navigation.products'), path: '/products' },
    { name: t('navigation.gallery'), path: '/gallery' },
    // Reuse existing /exhibition route for "New and Notices"
    { name: t('navigation.newsNotices'), path: '/exhibition' },
  ];

  // Allow sections to force-hide the header (e.g., Section 2).
  useEffect(() => {
    // Keep track of which sections want to hide the header
    const hiddenSections = new Set();

    const onForceHidden = (e) => {
      const { id, hidden } = e.detail || {};
      
      // Handle legacy events (no ID) - though we updated S2/S3, safeguard just in case
      if (!id) {
        setForceHidden(Boolean(hidden));
        if (Boolean(hidden)) setIsMobileMenuOpen(false);
        return;
      }

      if (hidden) {
        hiddenSections.add(id);
      } else {
        hiddenSections.delete(id);
      }

      const shouldHide = hiddenSections.size > 0;
      setForceHidden(shouldHide);
      if (shouldHide) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('header:forceHidden', onForceHidden);
    return () => window.removeEventListener('header:forceHidden', onForceHidden);
  }, []);

  // Default header behavior: always visible (no scroll-hide), only changes style on scroll.
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY || 0;
      setIsScrolled(y > 0);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'zh' : 'en';
    localStorage.setItem('i18nextLng', newLang);
    document.documentElement.lang = newLang;
    i18n.changeLanguage(newLang).then(() => {
      localStorage.setItem('i18nextLng', newLang);
      window.dispatchEvent(new StorageEvent('storage', { key: 'i18nextLng', newValue: newLang }));
    });
  };

  // Determine logo size based on breakpoint
  const getLogoSize = () => {
    if (isSmallMobile) return 'h-8';
    if (isLargeMobile) return 'h-9';
    if (isTabletPortrait) return 'h-10';
    if (isTabletLandscapeSmallDesktop) return 'h-11';
    if (isDesktopLaptop) return 'h-12';
    return 'h-12'; // desktopLarge
  };

  // Determine navigation spacing based on breakpoint
  const getNavSpacing = () => {
    if (isTabletPortrait) return 'space-x-6';
    if (isTabletLandscapeSmallDesktop) return 'space-x-7';
    if (isDesktopLaptop) return 'space-x-8';
    return 'space-x-8'; // desktopLarge
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-500 ease-in-out ${
        forceHidden ? 'opacity-0 -translate-y-full pointer-events-none' : 'opacity-100 translate-y-0'
      } ${isScrolled ? 'backdrop-blur-md shadow-lg' : ''}`}
      style={
        isScrolled
          ? { backgroundColor: 'rgba(255, 255, 255, 0.7)' }
          : { backgroundColor: '#FFFBE9' }
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex justify-between items-center ${isMobile ? 'h-14' : isTablet ? 'h-16' : 'h-20'} py-4`}>
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link to="/" className="flex items-center">
              <img
                src={`${import.meta.env.BASE_URL}ColorLogo.png`}
                alt="Yogini Arts"
                className={`${getLogoSize()} w-auto object-contain`}
              />
            </Link>
          </div>

          {/* Navigation - Show on Tablet and Desktop */}
          {(isTablet || isDesktop) && (
            <nav className={`flex items-center ${getNavSpacing()}`}>
              {navigation.map((item) => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`group relative inline-block font-medium transition-colors duration-300 pb-1 ${
                      isTabletPortrait ? 'text-xs' : isTabletLandscapeSmallDesktop ? 'text-sm' : 'text-sm'
                    } ${
                      isActive ? 'text-[#A53223]' : 'text-gray-800 hover:text-[#A53223]'
                    }`}
                  >
                    {item.name}
                    <span
                      className={`absolute bottom-0 left-0 h-0.5 rounded-full transition-all duration-300 nav-underline ${
                        isActive ? 'w-0 opacity-0' : 'w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                      }`}
                      style={{ minHeight: '2px' }}
                    ></span>
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Language Toggle & CTA Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Toggle Button */}
            <button
              onClick={toggleLanguage}
              className={`flex items-center justify-center rounded-lg text-[#1e3a8a] transition-colors duration-200 hover:opacity-80 ${
                isMobile ? 'h-8 w-8' : isTabletPortrait ? 'h-9 w-9' : 'h-10 w-10'
              }`}
            >
              <FlagIcon
                flagSrc={i18n.language === "en" ? `${import.meta.env.BASE_URL}China.svg` : `${import.meta.env.BASE_URL}USA.svg`}
                className={isMobile ? "h-6 w-6" : isTabletPortrait ? "h-6 w-6" : "h-7 w-7"}
              />
            </button>

            {/* Contact Us CTA (maroon rectangle with cream text) */}
            {(isTablet || isDesktop) && (
              <Link
                to="/contact"
                className={`bg-[#A53223] text-[#FFFBE9] rounded-full font-medium hover:opacity-90 transition-opacity ${
                  isTabletPortrait ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
                }`}
              >
                {t('navigation.contactUs')}
              </Link>
            )}

            {/* Mobile Menu Toggle Button */}
            {isMobile && (
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="ml-2 p-2 text-gray-800 hover:text-gray-900"
                aria-label="Toggle menu"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobile && isMobileMenuOpen && (
          <div className="border-t border-gray-300 py-3">
            <div className="px-4 space-y-2">
              {navigation.map((item) => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`group block relative font-medium py-2 pb-3 transition-colors duration-300 ${
                      isActive ? 'text-[#A53223]' : 'text-gray-800 hover:text-[#A53223]'
                    }`}
                  >
                    {item.name}
                    <span
                      className={`absolute bottom-1 left-0 h-0.5 rounded-full transition-all duration-300 nav-underline ${
                        isActive ? 'w-0 opacity-0' : 'w-0 opacity-0 group-hover:w-full group-hover:opacity-100'
                      }`}
                      style={{ minHeight: '2px' }}
                    ></span>
                  </Link>
                );
              })}

              {/* Mobile Contact Us CTA */}
              <Link
                to="/contact"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full text-center bg-[#A53223] text-[#FFFBE9] px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity mt-3"
              >
                {t('navigation.contactUs')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;


