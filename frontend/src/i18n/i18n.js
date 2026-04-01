import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import English translations
import enCommon from '../locales/en/common.json';
import enHomepage from '../locales/en/homepage.json';
import enAbout from '../locales/en/about.json';
import enProducts from '../locales/en/products.json';
import enGallery from '../locales/en/gallery.json';
import enExhibition from '../locales/en/exhibition.json';

// Import Chinese translations
import zhCommon from '../locales/zh/common.json';
import zhHomepage from '../locales/zh/homepage.json';
import zhAbout from '../locales/zh/about.json';
import zhProducts from '../locales/zh/products.json';
import zhGallery from '../locales/zh/gallery.json';
import zhExhibition from '../locales/zh/exhibition.json';

const resources = {
  en: {
    translation: {
      ...enCommon,
      homepage: enHomepage,
      about: enAbout,
      products: enProducts,
      gallery: enGallery,
      exhibition: enExhibition,
    },
  },
  zh: {
    translation: {
      ...zhCommon,
      homepage: zhHomepage,
      about: zhAbout,
      products: zhProducts,
      gallery: zhGallery,
      exhibition: zhExhibition,
    },
  },
};

// Read language from localStorage BEFORE initializing i18n
let initialLanguage = 'zh'; // Default to Chinese
if (typeof window !== 'undefined') {
  const savedLang = localStorage.getItem('i18nextLng');
  if (savedLang === 'en' || savedLang === 'zh') {
    initialLanguage = savedLang;
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage, // Use the language from localStorage or default
    fallbackLng: 'zh', // Fallback to Chinese if language not found
    debug: false,
    
    detection: {
      // ONLY use localStorage - don't check browser or HTML tag
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      // Don't check browser language - only use saved preference
      checkWhitelist: false,
    },

    interpolation: {
      escapeValue: false,
    },

    // Ensure language changes are applied globally
    react: {
      useSuspense: false,
    },
  });

// Set HTML lang attribute on initialization
if (typeof window !== 'undefined') {
  document.documentElement.lang = initialLanguage;
}

// Listen for language changes and update HTML lang attribute
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  // Force localStorage update to ensure persistence
  localStorage.setItem('i18nextLng', lng);
});

export default i18n;

