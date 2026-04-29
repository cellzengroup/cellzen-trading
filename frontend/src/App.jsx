import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

const InventoryApp = lazy(() => import('./inventory/InventoryApp'));
import { useTranslation } from 'react-i18next';
import Layout from './components/ui/Layout';
import ScrollToTop from './components/ScrollToTop';
import Landingpage from './pages/Landing/Landingpage';
import Contact from './pages/Contact';
import About from './pages/about';
import Shipments from './pages/Shipments';
import Tracking from './pages/tracking/Tracking';
import TrackingLogin from './pages/tracking/login';
import ResetPassword from './pages/tracking/reset';
import AdminLogin from './pages/auth/admin/AdminLogin';
import AdminPortal from './pages/auth/admin/adminPortal';
import AdminDashboard from './pages/auth/admin/adminDashboard';
import AdminManagements from './pages/auth/admin/adminmanagements';
import AdminInventory from './pages/auth/admin/admininventory';
import AdminProducts from './pages/auth/admin/adminProducts/adminproducts';
import AdminSuppliers from './pages/auth/admin/adminProducts/adminSuppliers';
import AdminSuppliersProduct from './pages/auth/admin/adminProducts/adminSuppliersProduct';
import AddProducts from './pages/auth/admin/adminProducts/AddProducts';
import AdminCustomers from './pages/auth/admin/admincustomers';
import AdminReports from './pages/auth/admin/adminreports';
import AdminNotifications from './pages/auth/admin/adminnotifications';
import AdminSettings from './pages/auth/admin/adminsettings';
import CostumersDashboard from './pages/tracking/trackingpage/costumers/costumersdashboard';
import CostumersGoodsTracking from './pages/tracking/trackingpage/costumers/CostumersGoodsTracking';
import CostumersInvoices from './pages/tracking/trackingpage/costumers/CostumersInvoices';
import CostumerCatalog from './pages/tracking/trackingpage/costumers/CustomerCatalog/CostumerCatalog';
import CostumerCatalogList from './pages/tracking/trackingpage/costumers/CustomerCatalog/CostumerCatalogList';
import DistributorCatalog from './pages/tracking/trackingpage/distributor/DistributorCatalog/DistributorCatalog';
import DistributorCatalogList from './pages/tracking/trackingpage/distributor/DistributorCatalog/DistributorCatalogList';
import PartnerCatalog from './pages/tracking/trackingpage/partners/PartnerCatalog';
import PartnerCatalogList from './pages/tracking/trackingpage/partners/PartnerCatalogList';
import SupplierDashboard from './pages/tracking/trackingpage/suppliers/supplierdashboard';
import LogisticsDashboard from './pages/tracking/trackingpage/logistics/logisticsdashboard';
import DistributorDashboard from './pages/tracking/trackingpage/distributor/distributordashboard';
import DistributorManagement from './pages/tracking/trackingpage/distributor/DistributorManagement';
import DistributorGoodsTracking from './pages/tracking/trackingpage/distributor/DistributorGoodsTracking';
import DistributorInvoices from './pages/tracking/trackingpage/distributor/DistributorInvoices';
import PartnersDashboard from './pages/tracking/trackingpage/partners/partnersdashboard';
import PartnersManagement from './pages/tracking/trackingpage/partners/PartnersManagement';
import PartnersGoodsTracking from './pages/tracking/trackingpage/partners/PartnersGoodsTracking';
import PartnersInvoices from './pages/tracking/trackingpage/partners/PartnersInvoices';
import Portfolio from './pages/portfolio';
import Notices from './pages/notices';
import FAQ from './components/FAQ';
import HelpCenter from './components/HelpCenter';
import Support from './components/Support';
import Privacy from './components/Privacy';
import Terms from './components/Terms';

function App() {
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

  // Keep Router basename aligned with Vite's BASE_URL (prevents /YoginiArts/ being forced on custom domains).
  const basename =
    import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
      ? import.meta.env.BASE_URL.replace(/\/$/, '')
      : '';

  return (
    <Router basename={basename}>
      <ScrollToTop />
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

        {/* Customer tracking login - standalone page without site header/footer */}
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route
          path="/admin-dashboard"
          element={
            <AdminPortal activePage="Home" title="Welcome to Admin Dashboard" eyebrow="Manage your Cellzen operations, products, reports, and settings">
              <AdminDashboard />
            </AdminPortal>
          }
        />
        <Route path="/admin-managements" element={<AdminManagements />} />
        <Route path="/admin-inventory" element={<AdminInventory />} />
        <Route path="/admin-products" element={<AdminProducts />} />
        <Route path="/admin-suppliers" element={<AdminSuppliers />} />
        <Route path="/admin-suppliers-product" element={<AdminSuppliersProduct />} />
        <Route path="/admin-products/add-products" element={<AddProducts />} />
        <Route path="/admin-products/edit/:productId" element={<AddProducts />} />
        <Route path="/admin-customers" element={<AdminCustomers />} />
        <Route path="/admin-costumers" element={<Navigate to="/admin-customers" replace />} />
        <Route path="/admin-reports" element={<AdminReports />} />
        <Route path="/admin-notifications" element={<AdminNotifications />} />
        <Route path="/admin-settings" element={<AdminSettings />} />

        <Route path="/login" element={<TrackingLogin initialMode="signin" />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/tracking/login" element={<Navigate to="/login" replace />} />
        <Route path="/tracking/signup" element={<Navigate to="/login" replace />} />
        <Route path="/tracking/trackingpage/costumersdashboard" element={<CostumersDashboard />} />
        <Route path="/tracking/trackingpage/costumerdashboard" element={<Navigate to="/tracking/trackingpage/costumersdashboard" replace />} />
        <Route path="/tracking/trackingpage/costumers/dashboard" element={<CostumersDashboard />} />
        <Route path="/tracking/trackingpage/costumers/goods-tracking" element={<CostumersGoodsTracking />} />
        <Route path="/tracking/trackingpage/costumers/products" element={<CostumerCatalog />} />
        <Route path="/tracking/trackingpage/costumers/catalogs" element={<CostumerCatalog />} />
        <Route path="/tracking/trackingpage/costumers/catalog-list" element={<CostumerCatalogList />} />
        <Route path="/tracking/trackingpage/costumers/invoices" element={<CostumersInvoices />} />
        <Route path="/tracking/trackingpage/supplierdashboard" element={<SupplierDashboard />} />
        <Route path="/tracking/trackingpage/logisticsdashboard" element={<LogisticsDashboard />} />
        <Route path="/tracking/trackingpage/distributordashboard" element={<DistributorDashboard />} />
        <Route path="/tracking/trackingpage/distributor/dashboard" element={<DistributorDashboard />} />
        <Route path="/tracking/trackingpage/distributor/management" element={<DistributorManagement />} />
        <Route path="/tracking/trackingpage/distributor/goods-tracking" element={<DistributorGoodsTracking />} />
        <Route path="/tracking/trackingpage/distributor/catalogs" element={<DistributorCatalog />} />
        <Route path="/tracking/trackingpage/distributor/catalog-list" element={<DistributorCatalogList />} />
        <Route path="/tracking/trackingpage/distributor/invoices" element={<DistributorInvoices />} />
        <Route path="/tracking/trackingpage/partnersdashboard" element={<PartnersDashboard />} />
        <Route path="/tracking/trackingpage/partners/dashboard" element={<PartnersDashboard />} />
        <Route path="/tracking/trackingpage/partners/management" element={<PartnersManagement />} />
        <Route path="/tracking/trackingpage/partners/goods-tracking" element={<PartnersGoodsTracking />} />
        <Route path="/tracking/trackingpage/partners/catalogs" element={<PartnerCatalog />} />
        <Route path="/tracking/trackingpage/partners/catalog-list" element={<PartnerCatalogList />} />
        <Route path="/tracking/trackingpage/partners/invoices" element={<PartnersInvoices />} />
        <Route path="/trackingpage/costumersdashboard" element={<Navigate to="/tracking/trackingpage/costumers/dashboard" replace />} />
        <Route path="/trackingpage/costumerdashboard" element={<Navigate to="/tracking/trackingpage/costumers/dashboard" replace />} />
        <Route path="/trackingpage/supplierdashboard" element={<Navigate to="/tracking/trackingpage/supplierdashboard" replace />} />
        <Route path="/trackingpage/logisticsdashboard" element={<Navigate to="/tracking/trackingpage/logisticsdashboard" replace />} />
        <Route path="/trackingpage/distributordashboard" element={<Navigate to="/tracking/trackingpage/distributor/dashboard" replace />} />
        <Route path="/trackingpage/partnersdashboard" element={<Navigate to="/tracking/trackingpage/partners/dashboard" replace />} />

        {/* Main Website */}
        <Route
          path="/*"
          element={
            <Layout showNavigation={false}>
              <Routes>
                <Route path="/" element={<Landingpage />} />
                <Route path="/about" element={<About />} />
                <Route path="/shipments" element={<Shipments />} />
                <Route path="/tracking" element={<Tracking />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/notices" element={<Notices />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/faq" element={<FAQ />} />
                <Route path="/help-center" element={<HelpCenter />} />
                <Route path="/support" element={<Support />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/*" element={<Landingpage />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

