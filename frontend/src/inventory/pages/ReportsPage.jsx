import React, { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { reportsApi, locationsApi } from '../utils/inventoryApi';
import { useLanguage } from '../context/LanguageContext';

export default function ReportsPage() {
  const api = useApi();
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', start_date: '', end_date: '' });

  // Custom filter dropdown state
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!typeDropdownOpen) return;
    const handleClick = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) {
        setTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [typeDropdownOpen]);

  // Report Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportLocation, setReportLocation] = useState('');
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchTransactions = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (filters.type) params.type = filters.type;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;

      const res = await reportsApi.getTransactions(api, params);
      setTransactions(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([fetchTransactions(), locationsApi.getAll(api).then((r) => setLocations(r.data.data))]);
  }, []);

  const updateFilter = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setLoading(true);
    const params = { page: 1, limit: 25 };
    if (newFilters.type) params.type = newFilters.type;
    if (newFilters.start_date) params.start_date = newFilters.start_date;
    if (newFilters.end_date) params.end_date = newFilters.end_date;
    reportsApi.getTransactions(api, params)
      .then((res) => { setTransactions(res.data.data); setPagination(res.data.pagination); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const downloadFile = (blob, filename) => {
    const url = window.URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleReportDownload = async () => {
    if (!reportCategory) return;
    setExporting(true);
    try {
      if (reportCategory === 'sale') {
        const res = await reportsApi.exportSales(api, {
          locationId: reportLocation,
          startDate: reportDateFrom,
          endDate: reportDateTo,
        });
        downloadFile(res.data, 'yogini-arts-sales-report.xlsx');
      } else if (reportCategory === 'stock') {
        const res = await reportsApi.exportExcel(api, reportLocation);
        downloadFile(res.data, 'yogini-arts-stock-report.xlsx');
      } else if (reportCategory === 'transfer') {
        const res = await reportsApi.exportTransfers(api, reportLocation);
        downloadFile(res.data, 'yogini-arts-transfer-report.xlsx');
      }
      setShowDownloadModal(false);
      resetReportForm();
    } catch (err) {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const resetReportForm = () => {
    setReportCategory('');
    setReportLocation('');
    setReportDateFrom('');
    setReportDateTo('');
  };

  const openDownloadModal = () => {
    resetReportForm();
    setShowDownloadModal(true);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('reports')}</h1>
        <button
          onClick={openDownloadModal}
          className="px-5 py-2.5 bg-[#800020] text-white rounded-full hover:bg-[#6b001a] font-medium text-sm flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Report Download
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 items-end">
        {/* Type - Custom Dropdown */}
        <div className="relative" ref={typeDropdownRef}>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('type')}</label>
          <button
            onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
            className="px-4 py-2.5 bg-[#800020] rounded-full text-sm text-left flex items-center gap-6 hover:bg-[#6b001a] transition-colors min-w-[140px] justify-between"
          >
            <span className="text-white font-medium">
              {filters.type === '' ? t('all') : filters.type === 'stock_in' ? t('stockInLabel') : filters.type === 'transfer' ? t('transfer') : t('sale')}
            </span>
            <svg className={`w-4 h-4 text-white/70 transition-transform ${typeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {typeDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-2xl shadow-lg border border-gray-100 z-50 overflow-hidden min-w-[160px]">
              {[
                { value: '', label: t('all') },
                { value: 'stock_in', label: t('stockInLabel') },
                { value: 'transfer', label: t('transfer') },
                { value: 'sale', label: t('sale') },
              ].map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => { updateFilter('type', opt.value); setTypeDropdownOpen(false); }}
                  className={`px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-50 ${
                    filters.type === opt.value ? 'bg-[#800020]/5 text-[#800020] font-medium' : 'text-gray-700'
                  }`}
                >
                  {opt.label}
                  {filters.type === opt.value && (
                    <svg className="w-4 h-4 text-[#800020]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* From Date */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('fromDate')}</label>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => updateFilter('start_date', e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-300 rounded-full text-sm focus:outline-none hover:border-gray-400 transition-colors"
          />
        </div>

        {/* To Date */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('toDate')}</label>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => updateFilter('end_date', e.target.value)}
            className="px-4 py-2.5 bg-white border border-gray-300 rounded-full text-sm focus:outline-none hover:border-gray-400 transition-colors"
          />
        </div>

        {/* Clear filters */}
        {(filters.type || filters.start_date || filters.end_date) && (
          <button
            onClick={() => { setFilters({ type: '', start_date: '', end_date: '' }); fetchTransactions(1); }}
            className="px-3 py-2.5 text-gray-400 hover:text-gray-600 text-sm transition-colors"
            title="Clear filters"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Transactions Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('type')}</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('product')}</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('from')}</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('to')}</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('qty')}</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('priceType')}</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">Sold Price</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('by')}</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('date')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => (
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
                    <td className="px-5 py-4 border-b border-gray-100 text-sm font-semibold text-gray-800">{tx.quantity}</td>
                    <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{tx.price_type ? t(tx.price_type) : '-'}</td>
                    <td className="px-5 py-4 border-b border-gray-100 text-sm font-semibold text-gray-800">{tx.unit_price ? `¥${parseFloat(tx.unit_price).toFixed(2)}` : '-'}</td>
                    <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{tx.createdByUser?.name || '-'}</td>
                    <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-400">
                      {new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-gray-400">{t('noTransactionsFound')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {Array.from({ length: pagination.pages }, (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => fetchTransactions(i + 1)}
                  className={`px-3 py-1 rounded ${
                    pagination.page === i + 1
                      ? 'bg-amber-700 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Report Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDownloadModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">Report Download</h2>
              <button onClick={() => setShowDownloadModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Category Selection */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'sale', label: 'Sale', icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
                  { key: 'stock', label: 'Stock', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
                  { key: 'transfer', label: 'Transfer', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
                ].map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => { setReportCategory(cat.key); setReportLocation(''); setReportDateFrom(''); setReportDateTo(''); }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                      reportCategory === cat.key
                        ? 'border-[#800020] bg-[#800020]/5 text-[#800020]'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.icon} />
                    </svg>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sale Report Options */}
            {reportCategory === 'sale' && (
              <div className="space-y-3 mb-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sale Location</label>
                  <select
                    value={reportLocation}
                    onChange={(e) => setReportLocation(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#800020]"
                  >
                    <option value="">All Locations</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                    <input
                      type="date"
                      value={reportDateFrom}
                      onChange={(e) => setReportDateFrom(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#800020]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                    <input
                      type="date"
                      value={reportDateTo}
                      onChange={(e) => setReportDateTo(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#800020]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Stock Report Options */}
            {reportCategory === 'stock' && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Location</label>
                <select
                  value={reportLocation}
                  onChange={(e) => setReportLocation(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#800020]"
                >
                  <option value="">All Locations</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Transfer Report Options */}
            {reportCategory === 'transfer' && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">Transferred To Location</label>
                <select
                  value={reportLocation}
                  onChange={(e) => setReportLocation(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#800020]"
                >
                  <option value="">All Locations</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Download Button */}
            <button
              onClick={handleReportDownload}
              disabled={!reportCategory || exporting}
              className="w-full py-3 bg-[#800020] text-white rounded-xl hover:bg-[#6b001a] font-semibold text-sm disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Downloading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Report
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
