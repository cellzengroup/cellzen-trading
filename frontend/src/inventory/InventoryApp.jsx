import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/ProtectedRoute';
import InventoryLayout from './components/InventoryLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import SalesPage from './pages/SalesPage';
import TransfersPage from './pages/TransfersPage';
import ReportsPage from './pages/ReportsPage';
import LocationsPage from './pages/LocationsPage';
import ScanPage from './pages/ScanPage';

export default function InventoryApp() {
  return (
    <LanguageProvider>
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <InventoryLayout>
                <Routes>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="locations" element={<LocationsPage />} />
                  <Route path="sales" element={<SalesPage />} />
                  <Route path="transfers" element={<TransfersPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="scan" element={<ScanPage />} />
                  <Route path="" element={<Navigate to="dashboard" replace />} />
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </InventoryLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
    </LanguageProvider>
  );
}
