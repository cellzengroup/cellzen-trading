import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../context/LanguageContext';

export default function InventoryLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { lang, toggleLang, t } = useLanguage();

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-[1.2rem] hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {user?.name || user?.email}
            </span>
            <button
              onClick={toggleLang}
              className="px-3 py-1.5 rounded-[1.2rem] bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors flex items-center gap-1.5"
              title={lang === 'en' ? 'Switch to Chinese' : '切换到英文'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {lang === 'en' ? '中文' : 'EN'}
            </button>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              {t('logout')}
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
