import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../Header';

const Layout = ({ children }) => {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const [heroTypingDone, setHeroTypingDone] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(!isLanding);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Listen for the hero typing completion event from Section1
  useEffect(() => {
    if (!isLanding) {
      setHeroTypingDone(true);
      setHeaderVisible(true);
      return;
    }
    setHeroTypingDone(false);
    setHeaderVisible(false);

    const onTypingDone = () => {
      setHeroTypingDone(true);
      setHeaderVisible(true);
    };
    window.addEventListener('hero-typing-done', onTypingDone);
    return () => window.removeEventListener('hero-typing-done', onTypingDone);
  }, [isLanding]);

  const handleScroll = useCallback(() => {
    if (!heroTypingDone) return;
    const currentY = window.scrollY;
    if (isLanding) {
      setHeaderVisible(currentY <= 50 || currentY < lastScrollY);
    } else {
      setHeaderVisible(currentY <= 50 || currentY < lastScrollY);
    }
    setLastScrollY(currentY);
  }, [isLanding, lastScrollY, heroTypingDone]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: isLanding ? '#2A1740' : undefined }}>
      <Header visible={headerVisible} />

      {/* Main content */}
      <main className="w-full flex-1">
        {children}
      </main>
    </div>
  );
};

export default Layout;

