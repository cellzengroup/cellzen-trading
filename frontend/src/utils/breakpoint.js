// Centralized responsive breakpoint definitions (no UI styles)

export const BREAKPOINTS = {
  smallMobile: { min: 320, max: 480 },
  largeMobile: { min: 481, max: 767 },
  tabletPortrait: { min: 768, max: 1024 }, // iPad Pro portrait (1024x1366) included here
  tabletLandscapeSmallDesktop: { min: 1025, max: 1366 }, // includes iPad Pro landscape (1366)
  desktopLaptop: { min: 1367, max: 1919 }, // general desktops/laptops
  desktopLarge: { min: 1920 }, // optional larger screens
}

export const media = {
  smallMobile: `(min-width: ${BREAKPOINTS.smallMobile.min}px) and (max-width: ${BREAKPOINTS.smallMobile.max}px)`,
  largeMobile: `(min-width: ${BREAKPOINTS.largeMobile.min}px) and (max-width: ${BREAKPOINTS.largeMobile.max}px)`,
  tabletPortrait: `(min-width: ${BREAKPOINTS.tabletPortrait.min}px) and (max-width: ${BREAKPOINTS.tabletPortrait.max}px)`,
  tabletLandscapeSmallDesktop: `(min-width: ${BREAKPOINTS.tabletLandscapeSmallDesktop.min}px) and (max-width: ${BREAKPOINTS.tabletLandscapeSmallDesktop.max}px)`,
  desktopLaptop: `(min-width: ${BREAKPOINTS.desktopLaptop.min}px) and (max-width: ${BREAKPOINTS.desktopLaptop.max}px)`,
  desktopLarge: `(min-width: ${BREAKPOINTS.desktopLarge.min}px)`,
}

export const makeQuery = {
  between: (min, max) => `(min-width: ${min}px) and (max-width: ${max}px)`,
  min: (min) => `(min-width: ${min}px)`,
  max: (max) => `(max-width: ${max}px)`,
}

// Tailwind-like mobile-first breakpoint values
export const TW_MIN = {
  xs: 475,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  x2l: 1536, // 2xl
}

export const mediaMin = {
  xs: `(min-width: ${TW_MIN.xs}px)`,
  sm: `(min-width: ${TW_MIN.sm}px)`,
  md: `(min-width: ${TW_MIN.md}px)`,
  lg: `(min-width: ${TW_MIN.lg}px)`,
  xl: `(min-width: ${TW_MIN.xl}px)`,
  x2l: `(min-width: ${TW_MIN.x2l}px)`,
}

// Desktop-first (max-width) queries
export const TW_MAX = {
  x2l: 1536,
  xl: 1280,
  lg: 1024,
  md: 768,
  sm: 640,
  xs: 475,
}

export const mediaMax = {
  x2l: `(max-width: ${TW_MAX.x2l}px)`,
  xl: `(max-width: ${TW_MAX.xl}px)`,
  lg: `(max-width: ${TW_MAX.lg}px)`,
  md: `(max-width: ${TW_MAX.md}px)`,
  sm: `(max-width: ${TW_MAX.sm}px)`,
  xs: `(max-width: ${TW_MAX.xs}px)`,
}

// Container max-width maps (no CSS emitted here)
export const containerMaxWidthsMobileFirst = {
  base: '100%',
  xs: 475,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  x2l: 1536, // 2xl
}

export const containerMaxWidthsDesktopFirst = {
  base: 1536,
  x2l: 1280,
  xl: 1024,
  lg: 768,
  md: 640,
  sm: 475,
  xs: '100%',
}








