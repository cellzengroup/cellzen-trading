import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './LanguageToggle';

const Layout = ({ children, showNavigation = false }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useTranslation();

  const navigation = [
    { name: t('navigation.home'), href: '/' },
    { name: t('navigation.about'), href: '/about' },
    { name: t('navigation.thangka'), href: '/thangka' },
    { name: t('navigation.soundBowls'), href: '/sound-bowls' },
    { name: t('navigation.sacredItems'), href: '/sacred-items' },
    { name: t('navigation.contact'), href: '/contact' },
  ];

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">
      {/* Navigation - Only show when needed */}
      {showNavigation && (
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo */}
              <div className="flex-shrink-0 flex items-center">
                <h1 className="h1-heading text-xl font-bold text-primary-700">Yogini Arts</h1>
              </div>

              {/* Language Toggle */}
              <div className="flex items-center">
                <LanguageToggle />
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Main content */}
      <main className="w-full flex-1">
        {children}
      </main>
    </div>
  );
};

export default Layout;

