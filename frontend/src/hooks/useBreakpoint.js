import { useState, useEffect } from 'react';
import { BREAKPOINTS } from '../utils/breakpoint';

export default function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState(() => {
    if (typeof window === 'undefined') return 'desktopLarge';
    
    const width = window.innerWidth;
    
    if (width >= BREAKPOINTS.desktopLarge.min) return 'desktopLarge';
    if (width >= BREAKPOINTS.desktopLaptop.min && width <= BREAKPOINTS.desktopLaptop.max) return 'desktopLaptop';
    if (width >= BREAKPOINTS.tabletLandscapeSmallDesktop.min && width <= BREAKPOINTS.tabletLandscapeSmallDesktop.max) return 'tabletLandscapeSmallDesktop';
    if (width >= BREAKPOINTS.tabletPortrait.min && width <= BREAKPOINTS.tabletPortrait.max) return 'tabletPortrait';
    if (width >= BREAKPOINTS.largeMobile.min && width <= BREAKPOINTS.largeMobile.max) return 'largeMobile';
    if (width >= BREAKPOINTS.smallMobile.min && width <= BREAKPOINTS.smallMobile.max) return 'smallMobile';
    return 'desktopLarge';
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      
      if (width >= BREAKPOINTS.desktopLarge.min) {
        setBreakpoint('desktopLarge');
      } else if (width >= BREAKPOINTS.desktopLaptop.min && width <= BREAKPOINTS.desktopLaptop.max) {
        setBreakpoint('desktopLaptop');
      } else if (width >= BREAKPOINTS.tabletLandscapeSmallDesktop.min && width <= BREAKPOINTS.tabletLandscapeSmallDesktop.max) {
        setBreakpoint('tabletLandscapeSmallDesktop');
      } else if (width >= BREAKPOINTS.tabletPortrait.min && width <= BREAKPOINTS.tabletPortrait.max) {
        setBreakpoint('tabletPortrait');
      } else if (width >= BREAKPOINTS.largeMobile.min && width <= BREAKPOINTS.largeMobile.max) {
        setBreakpoint('largeMobile');
      } else if (width >= BREAKPOINTS.smallMobile.min && width <= BREAKPOINTS.smallMobile.max) {
        setBreakpoint('smallMobile');
      } else {
        setBreakpoint('desktopLarge');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    breakpoint,
    isSmallMobile: breakpoint === 'smallMobile',
    isLargeMobile: breakpoint === 'largeMobile',
    isTabletPortrait: breakpoint === 'tabletPortrait',
    isTabletLandscapeSmallDesktop: breakpoint === 'tabletLandscapeSmallDesktop',
    isDesktopLaptop: breakpoint === 'desktopLaptop',
    isDesktopLarge: breakpoint === 'desktopLarge',
    isMobile: breakpoint === 'smallMobile' || breakpoint === 'largeMobile',
    isTablet: breakpoint === 'tabletPortrait' || breakpoint === 'tabletLandscapeSmallDesktop',
    isDesktop: breakpoint === 'desktopLaptop' || breakpoint === 'desktopLarge',
  };
}








