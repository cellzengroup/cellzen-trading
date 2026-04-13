import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../Header';

const Layout = ({ children }) => {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  const isContact = location.pathname === '/contact';
  const [heroTypingDone, setHeroTypingDone] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(!isLanding);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Track whether the hero typing animation has ever completed this session
  const [heroEverCompleted, setHeroEverCompleted] = useState(false);

  // Listen for the hero typing completion event from Section1
  useEffect(() => {
    if (!isLanding) {
      setHeroTypingDone(true);
      setHeaderVisible(true);
      return;
    }

    // If hero animation already played before, show header immediately
    if (heroEverCompleted) {
      setHeroTypingDone(true);
      setHeaderVisible(true);
      return;
    }

    setHeroTypingDone(false);
    setHeaderVisible(false);

    const onTypingDone = () => {
      setHeroTypingDone(true);
      setHeroEverCompleted(true);
      setHeaderVisible(true);
    };
    window.addEventListener('hero-typing-done', onTypingDone);
    return () => window.removeEventListener('hero-typing-done', onTypingDone);
  }, [isLanding, heroEverCompleted]);

  const handleScroll = useCallback(() => {
    if (!heroTypingDone) return;
    if (isContact) { setHeaderVisible(true); return; }
    const currentY = window.scrollY;
    if (isLanding) {
      setHeaderVisible(currentY <= 50 || currentY < lastScrollY);
    } else {
      setHeaderVisible(currentY <= 50 || currentY < lastScrollY);
    }
    setLastScrollY(currentY);
  }, [isLanding, isContact, lastScrollY, heroTypingDone]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: isContact ? '#FFFFFF' : '#2A1740' }}>
      <Header visible={headerVisible} />

      {/* Main content */}
      <main className="w-full flex-1">
        {children}
      </main>
    </div>
  );
};

export default Layout;

