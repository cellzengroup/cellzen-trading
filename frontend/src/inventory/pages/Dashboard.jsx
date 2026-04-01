import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { reportsApi } from '../utils/inventoryApi';
import { useLanguage } from '../context/LanguageContext';

export default function Dashboard() {
  const api = useApi();
  const { t, td } = useLanguage();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = () => {
      reportsApi.getSummary(api)
        .then((res) => setSummary(res.data.data))
        .catch(console.error)
        .finally(() => setLoading(false));
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [api]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
      </div>
    );
  }

  const cards = [
    { label: t('totalProducts'), value: summary?.totalProducts || 0, color: 'bg-blue-500' },
    { label: t('totalLocations'), value: summary?.totalLocations || 0, color: 'bg-green-500' },
    { label: t('todaySales'), value: summary?.todaySales || 0, color: 'bg-amber-500' },
    { label: t('lowStock'), value: summary?.lowStock || 0, color: 'bg-red-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('dashboard')}</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-[1.2rem] shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{card.value}</p>
              </div>
              <div className={`w-12 h-12 ${card.color} rounded-[1.2rem] flex items-center justify-center`}>
                <span className="text-white text-xl font-bold">{card.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('recentTransactionsTitle')}</h2>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('type')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('product')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('from')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('to')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">Sold</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('qty')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.recentTransactions || []).map((tx) => (
                <tr
                  key={tx.id}
                  className={`transition-colors hover:bg-amber-50/60 ${
                    tx.type === 'sale' ? 'bg-[#800020]/[0.03]' : ''
                  }`}
                >
                  <td className="px-5 py-4 border-b border-gray-100">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      tx.type === 'sale' ? 'bg-[#800020] text-white' :
                      tx.type === 'transfer' ? 'bg-blue-50 text-blue-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>
                      {tx.type === 'stock_in' ? t('stockInLabel') : tx.type === 'transfer' ? t('transfer') : t('sale')}
                    </span>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm font-medium text-gray-800">{tx.product?.name || '-'}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{tx.fromLocation?.name || '-'}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{tx.toLocation?.name || '-'}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm font-semibold text-gray-800">{tx.unit_price ? `¥${parseFloat(tx.unit_price).toFixed(2)}` : '-'}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm font-semibold text-gray-800">{tx.quantity}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-400">
                    {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
