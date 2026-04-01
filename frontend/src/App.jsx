import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const InventoryApp = lazy(() => import('./inventory/InventoryApp'));
import { useTranslation } from 'react-i18next';
import Layout from './components/ui/Layout';
import HomePage from './pages/Landing/HomePage';
import About from './pages/About';
import Products from './pages/Products/Products';
import Gallery from './pages/Gallery';
import Exhibition from './pages/Exhibition';
import Contact from './pages/Contact';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const { i18n } = useTranslation();

  // Update HTML lang attribute when language changes and ensure all components update
  useEffect(() => {
    // Read from localStorage to ensure consistency
    const savedLang = localStorage.getItem('i18nextLng');
    if (savedLang && (savedLang === 'en' || savedLang === 'zh')) {
      if (i18n.language !== savedLang) {
        i18n.changeLanguage(savedLang);
      }
      document.documentElement.lang = savedLang;
    } else {
      document.documentElement.lang = i18n.language;
    }
  }, [i18n.language, i18n]);

  // Listen for storage events to sync language across tabs/windows
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'i18nextLng' && e.newValue && (e.newValue === 'en' || e.newValue === 'zh')) {
        i18n.changeLanguage(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [i18n]);

  const handleCardSelect = (formType) => {
    // Handle navigation to different sections
    console.log('Selected:', formType);
    // You can add routing logic here or state management
  };

  // Keep Router basename aligned with Vite's BASE_URL (prevents /YoginiArts/ being forced on custom domains).
  const basename =
    import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
      ? import.meta.env.BASE_URL.replace(/\/$/, '')
      : '';

  return (
    <Router basename={basename}>
      <Routes>
        {/* Inventory Management - independent layout (no main site nav/footer) */}
        <Route
          path="/inventorymanagement/*"
          element={
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div></div>}>
              <InventoryApp />
            </Suspense>
          }
        />

        {/* Main Website */}
        <Route
          path="/*"
          element={
            <Layout showNavigation={false}>
              <Routes>
                <Route path="/" element={<HomePage onCardSelect={handleCardSelect} />} />
                <Route path="/about" element={<About />} />
                <Route path="/products" element={<Products />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/exhibition" element={<Exhibition />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/*" element={<HomePage onCardSelect={handleCardSelect} />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

