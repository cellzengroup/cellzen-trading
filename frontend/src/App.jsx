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
import CustomersDashboard from './pages/auth/admin/customers/CustomersDashboard';
import CustomersGoodsTracking from './pages/auth/admin/customers/CustomersGoodsTracking';
import CustomersProducts from './pages/auth/admin/customers/CustomersProducts';
import CustomersInvoices from './pages/auth/admin/customers/CustomersInvoices';
import DistributorsDashboard from './pages/auth/admin/distributors/DistributorsDashboard';
import DistributorsManagement from './pages/auth/admin/distributors/DistributorsManagement';
import DistributorsGoodsTracking from './pages/auth/admin/distributors/DistributorsGoodsTracking';
import DistributorsInvoices from './pages/auth/admin/distributors/DistributorsInvoices';
import PartnersDashboard from './pages/auth/admin/partners/PartnersDashboard';
import PartnersManagement from './pages/auth/admin/partners/PartnersManagement';
import PartnersGoodsTracking from './pages/auth/admin/partners/PartnersGoodsTracking';
import PartnersInvoices from './pages/auth/admin/partners/PartnersInvoices';
import CostumersDashboard from './pages/tracking/trackingpage/costumers/costumersdashboard';
import SupplierDashboard from './pages/tracking/trackingpage/suppliers/supplierdashboard';
import LogisticsDashboard from './pages/tracking/trackingpage/logistics/logisticsdashboard';
import DistributorDashboard from './pages/tracking/trackingpage/distributor/distributordashboard';
import PartnersDashboard from './pages/tracking/trackingpage/partners/partnersdashboard';
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

        {/* Customer Admin Panel Routes */}
        <Route path="/admin/customers/dashboard" element={<CustomersDashboard />} />
        <Route path="/admin/customers/goods-tracking" element={<CustomersGoodsTracking />} />
        <Route path="/admin/customers/products" element={<CustomersProducts />} />
        <Route path="/admin/customers/invoices" element={<CustomersInvoices />} />

        {/* Distributor Admin Panel Routes */}
        <Route path="/admin/distributors/dashboard" element={<DistributorsDashboard />} />
        <Route path="/admin/distributors/management" element={<DistributorsManagement />} />
        <Route path="/admin/distributors/goods-tracking" element={<DistributorsGoodsTracking />} />
        <Route path="/admin/distributors/invoices" element={<DistributorsInvoices />} />

        {/* Partners Admin Panel Routes */}
        <Route path="/admin/partners/dashboard" element={<PartnersDashboard />} />
        <Route path="/admin/partners/management" element={<PartnersManagement />} />
        <Route path="/admin/partners/goods-tracking" element={<PartnersGoodsTracking />} />
        <Route path="/admin/partners/invoices" element={<PartnersInvoices />} />

        <Route path="/login" element={<TrackingLogin initialMode="signin" />} />
        <Route path="/reset" element={<ResetPassword />} />
        <Route path="/tracking/login" element={<Navigate to="/login" replace />} />
        <Route path="/tracking/signup" element={<Navigate to="/login" replace />} />
        <Route path="/tracking/trackingpage/costumersdashboard" element={<CostumersDashboard />} />
        <Route path="/tracking/trackingpage/costumerdashboard" element={<Navigate to="/tracking/trackingpage/costumersdashboard" replace />} />
        <Route path="/tracking/trackingpage/supplierdashboard" element={<SupplierDashboard />} />
        <Route path="/tracking/trackingpage/logisticsdashboard" element={<LogisticsDashboard />} />
        <Route path="/tracking/trackingpage/distributordashboard" element={<DistributorDashboard />} />
        <Route path="/tracking/trackingpage/partnersdashboard" element={<PartnersDashboard />} />
        <Route path="/trackingpage/costumersdashboard" element={<Navigate to="/tracking/trackingpage/costumersdashboard" replace />} />
        <Route path="/trackingpage/costumerdashboard" element={<Navigate to="/tracking/trackingpage/costumersdashboard" replace />} />
        <Route path="/trackingpage/supplierdashboard" element={<Navigate to="/tracking/trackingpage/supplierdashboard" replace />} />
        <Route path="/trackingpage/logisticsdashboard" element={<Navigate to="/tracking/trackingpage/logisticsdashboard" replace />} />
        <Route path="/trackingpage/distributordashboard" element={<Navigate to="/tracking/trackingpage/distributordashboard" replace />} />
        <Route path="/trackingpage/partnersdashboard" element={<Navigate to="/tracking/trackingpage/partnersdashboard" replace />} />

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

