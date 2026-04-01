import React, { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { inventoryApi, locationsApi, productsApi, getImageUrl } from '../utils/inventoryApi';
import { useLanguage } from '../context/LanguageContext';

export default function InventoryPage() {
  const api = useApi();
  const { t, td } = useLanguage();
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [showStockIn, setShowStockIn] = useState(false);
  const [products, setProducts] = useState([]);
  const [stockForm, setStockForm] = useState({ product_id: '', location_id: '', quantity: '' });
  const [previewImages, setPreviewImages] = useState(null);
  const [editingInv, setEditingInv] = useState(null);
  const [editQty, setEditQty] = useState(1);
  const [locDropdownOpen, setLocDropdownOpen] = useState(false);
  const locDropdownRef = useRef(null);
  const [filterCategory, setFilterCategory] = useState('');

  const fetchData = async () => {
    try {
      const [invRes, locRes] = await Promise.all([
        inventoryApi.getAll(api, selectedLocation),
        locationsApi.getAll(api),
      ]);
      const locs = locRes.data.data;
      setLocations(locs);
      // Set default location to Guangzhou Warehouse
      if (locs.length > 0 && !stockForm.location_id) {
        const defaultLoc = locs.find((l) => l.name === 'Guangzhou Warehouse') || locs[0];
        setStockForm((prev) => ({ ...prev, location_id: defaultLoc.id }));
        if (!selectedLocation) {
          setSelectedLocation(defaultLoc.id);
          return; // will re-fetch with the selected location
        }
      }
      setInventory(invRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedLocation]);

  // Close location dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (locDropdownRef.current && !locDropdownRef.current.contains(e.target)) {
        setLocDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStockIn = async (e) => {
    e.preventDefault();
    try {
      await inventoryApi.stockIn(api, {
        ...stockForm,
        quantity: parseInt(stockForm.quantity),
      });
      setShowStockIn(false);
      setStockForm({ product_id: '', location_id: '', quantity: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Stock in failed');
    }
  };

  const handleUpdateQty = async () => {
    if (!editingInv) return;
    try {
      const diff = editQty - editingInv.quantity;
      if (diff > 0) {
        await inventoryApi.stockIn(api, {
          product_id: editingInv.product_id,
          location_id: editingInv.location_id,
          quantity: diff,
          notes: 'Manual quantity adjustment',
        });
      } else if (diff < 0) {
        await inventoryApi.sale(api, {
          product_id: editingInv.product_id,
          location_id: editingInv.location_id,
          quantity: Math.abs(diff),
          price_type: 'retail',
          notes: 'Manual quantity adjustment',
        });
      }
      setEditingInv(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update quantity');
    }
  };

  const openStockIn = async () => {
    if (products.length === 0) {
      const res = await productsApi.getAll(api);
      setProducts(res.data.data);
    }
    setShowStockIn(true);
  };

  return (
    <div>
      {/* Header: title centered, location + stock-in on right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex-1" />
        <h1 className="text-2xl font-bold text-gray-800 text-center">{t('inventory')}</h1>
        <div className="flex-1 flex items-center justify-end gap-3">
          {/* Custom Location Dropdown */}
          <div className="relative" ref={locDropdownRef}>
            <button
              type="button"
              onClick={() => setLocDropdownOpen(!locDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-[1.2rem] bg-white hover:bg-gray-50 focus:outline-none min-w-[180px] text-left"
            >
              <span className="flex-1 truncate text-sm text-gray-800">
                {selectedLocation
                  ? (() => {
                      const loc = locations.find((l) => String(l.id) === String(selectedLocation));
                      if (!loc) return t('allLocations');
                      return loc.name === 'Guangzhou Warehouse' ? 'Guangzhou Warehouse' : `${loc.name} (${td(loc.type)})`;
                    })()
                  : t('allLocations')}
              </span>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${locDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {locDropdownOpen && (
              <div className="absolute right-0 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-[1rem] shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                <div
                  onClick={() => { setSelectedLocation(''); setLocDropdownOpen(false); }}
                  className={`px-4 py-2 text-sm cursor-pointer hover:bg-amber-50 ${selectedLocation === '' ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                >
                  {t('allLocations')}
                </div>
                {locations.filter((loc) => loc.name === 'Guangzhou Warehouse').map((loc) => (
                  <div
                    key={loc.id}
                    onClick={() => { setSelectedLocation(loc.id); setLocDropdownOpen(false); }}
                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-amber-50 ${String(selectedLocation) === String(loc.id) ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                  >
                    Guangzhou Warehouse
                  </div>
                ))}
                {locations.filter((loc) => loc.name !== 'Guangzhou Warehouse').map((loc) => (
                  <div
                    key={loc.id}
                    onClick={() => { setSelectedLocation(loc.id); setLocDropdownOpen(false); }}
                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-amber-50 ${String(selectedLocation) === String(loc.id) ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                  >
                    {loc.name} ({td(loc.type)})
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={openStockIn}
            className="px-4 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
          >
            {t('stockIn')}
          </button>
        </div>
      </div>

      {/* Category filter buttons with qty totals */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(() => {
          const cats = ['Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries', 'Others'];
          return cats.map(cat => {
            const isOthers = cat === 'Others';
            const catInv = inventory.filter(inv => {
              const pCat = inv.product?.category;
              if (isOthers) return !pCat || !['Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries'].includes(pCat);
              return pCat === cat;
            });
            const totalQty = catInv.reduce((sum, inv) => sum + inv.quantity, 0);
            if (totalQty === 0 && filterCategory !== cat) return null;
            const isActive = filterCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(isActive ? '' : cat)}
                className={`px-3 py-1.5 rounded-[1.2rem] text-sm font-medium transition-all border ${
                  isActive
                    ? 'bg-amber-800 text-white border-amber-800'
                    : 'bg-white text-amber-800 border-gray-200 hover:border-amber-300'
                }`}
              >
                {td(cat)} <span className="font-bold ml-1">| &nbsp;{totalQty} QTY</span>
              </button>
            );
          });
        })()}
      </div>

      {/* Stock In Modal */}
      {showStockIn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('stockInLabel')}</h2>
            <form onSubmit={handleStockIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('product')}</label>
                <select
                  value={stockForm.product_id}
                  onChange={(e) => setStockForm({ ...stockForm, product_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                >
                  <option value="">{t('selectProduct')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.barcode ? `(${p.barcode})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('location')}</label>
                <select
                  value={stockForm.location_id}
                  onChange={(e) => setStockForm({ ...stockForm, location_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                >
                  <option value="">{t('selectLocation')}</option>
                  {locations.filter((l) => l.name === 'Guangzhou Warehouse').map((l) => (
                    <option key={l.id} value={l.id}>Guangzhou Warehouse</option>
                  ))}
                  {locations.filter((l) => l.name !== 'Guangzhou Warehouse').map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({td(l.type)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium">
                  {t('addStock')}
                </button>
                <button type="button" onClick={() => setShowStockIn(false)} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium">
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('image')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('product')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('barcode')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('location')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('quantity')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('status')}</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {inventory.filter(inv => {
                if (!filterCategory) return true;
                const pCat = inv.product?.category;
                if (filterCategory === 'Others') return !pCat || !['Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries'].includes(pCat);
                return pCat === filterCategory;
              }).map((inv) => (
                <tr key={inv.id} className="transition-colors hover:bg-amber-50/60">
                  <td className="px-5 py-4 border-b border-gray-100">
                    {(() => {
                      const imgs = [getImageUrl(inv.product?.image_url), getImageUrl(inv.product?.image_url_2)].filter(Boolean);
                      return imgs.length > 0 ? (
                        <div className="relative w-10 h-10">
                          <img
                            src={imgs[0]}
                            alt={inv.product?.name}
                            className="w-10 h-10 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setPreviewImages({ images: imgs, index: 0 })}
                          />
                          {imgs.length > 1 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{imgs.length}</span>
                          )}
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">N/A</div>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm font-medium text-gray-800">{inv.product?.name || '-'}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{inv.product?.barcode || '-'}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{inv.location?.name || '-'}</td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm font-semibold text-gray-800">{inv.quantity}</td>
                  <td className="px-5 py-4 border-b border-gray-100">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      inv.quantity === 0 ? 'bg-red-50 text-red-700' :
                      inv.quantity <= 5 ? 'bg-yellow-50 text-yellow-700' :
                      'bg-green-50 text-green-700'
                    }`}>
                      {inv.quantity === 0 ? t('outOfStockLabel') : inv.quantity <= 5 ? t('lowStockLabel') : t('inStock')}
                    </span>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-100 text-sm">
                    <button
                      onClick={() => { setEditingInv(inv); setEditQty(inv.quantity); }}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {t('manage')}
                    </button>
                  </td>
                </tr>
              ))}
              {inventory.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                    {t('noInventoryRecords')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {/* Manage Quantity Popup */}
      {editingInv && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.2rem] shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-2">{t('manageQuantity')}</h3>
            <p className="text-gray-600 mb-4">
              <span className="font-semibold">{editingInv.product?.name}</span> at {editingInv.location?.name}
            </p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditQty(Math.max(0, editQty - 1))}
                  className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-[1.2rem] text-lg font-bold text-gray-600 hover:bg-gray-100"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  value={editQty}
                  onChange={(e) => setEditQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-[1.2rem] text-center focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setEditQty(editQty + 1)}
                  className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-[1.2rem] text-lg font-bold text-gray-600 hover:bg-gray-100"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleUpdateQty}
                className="flex-1 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
              >
                {t('update')}
              </button>
              <button
                onClick={() => setEditingInv(null)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Popup with prev/next */}
      {previewImages && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImages(null)}
        >
          <div className="relative max-w-lg max-h-[80vh] flex items-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImages(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {previewImages.images.length > 1 && (
              <button
                onClick={() => setPreviewImages({ ...previewImages, index: (previewImages.index - 1 + previewImages.images.length) % previewImages.images.length })}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 rounded-full shadow-lg flex items-center justify-center text-white hover:bg-black/60 transition-colors z-10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <img src={previewImages.images[previewImages.index]} alt="Product" className="max-w-full max-h-[80vh] object-contain rounded-[1.2rem]" />
            {previewImages.images.length > 1 && (
              <button
                onClick={() => setPreviewImages({ ...previewImages, index: (previewImages.index + 1) % previewImages.images.length })}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 rounded-full shadow-lg flex items-center justify-center text-white hover:bg-black/60 transition-colors z-10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {previewImages.images.length > 1 && (
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                {previewImages.images.map((_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full transition-colors ${i === previewImages.index ? 'bg-white' : 'bg-white/40'}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
