/**
 * Environment variables utility
 * Access environment variables using import.meta.env in Vite
 */

export const env = {
  // Base URL for the website
  baseUrl: import.meta.env.VITE_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3300' : ''),
  
  // API Configuration
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  
  // Asset/CDN Configuration
  assetBaseUrl: import.meta.env.VITE_ASSET_BASE_URL || '',
  
  // App Configuration
  appTitle: import.meta.env.VITE_APP_TITLE || 'Cellzen Trading Platform',
  appDescription: import.meta.env.VITE_APP_DESCRIPTION || 'Modern trading logistics and shipment management platform',
  
  // Contact Information
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL || '',
  contactPhone: import.meta.env.VITE_CONTACT_PHONE || '',
  wechatQrUrl: import.meta.env.VITE_WECHAT_QR_URL || '',
  
  // Analytics
  gaTrackingId: import.meta.env.VITE_GA_TRACKING_ID || '',
  
  // Feature Flags
  enableContactForm: import.meta.env.VITE_ENABLE_CONTACT_FORM === 'true',
  enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  
  // Development mode
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  mode: import.meta.env.MODE,
};

export default env;

