import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { productsApi, inventoryApi, getImageUrl } from '../utils/inventoryApi';
import { useLanguage } from '../context/LanguageContext';
import BarcodeScanner from '../components/BarcodeScanner';

export default function ScanPage() {
  const api = useApi();
  const { t } = useLanguage();
  const [product, setProduct] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [error, setError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [previewImages, setPreviewImages] = useState(null);

  const lookupBarcode = async (barcode) => {
    setError('');
    setProduct(null);
    setInventory([]);

    try {
      const res = await productsApi.getAll(api, barcode);
      const products = res.data.data;
      const found = products.find(
        (p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
      );

      if (!found) {
        setError(`No product found with barcode: ${barcode}`);
        return;
      }

      setProduct(found);

      // Get inventory for this product
      const invRes = await inventoryApi.getAll(api);
      const productInventory = invRes.data.data.filter((inv) => inv.product_id === found.id);
      setInventory(productInventory);
    } catch (err) {
      setError('Failed to lookup barcode');
    }
  };

  const handleScan = (decodedText) => {
    lookupBarcode(decodedText);
  };

  const handleManualSearch = (e) => {
    if (e.key === 'Enter' && manualBarcode.trim()) {
      lookupBarcode(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('barcodeScanner')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner */}
        <div className="bg-white rounded-[1.2rem] shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{t('cameraScanner')}</h2>
          <BarcodeScanner
            onScan={handleScan}
            onError={(msg) => setError(msg)}
          />

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('enterBarcodeManually')}</label>
            <input
              type="text"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={handleManualSearch}
              placeholder={t('typeBarcodeEnter')}
              className="w-full px-4 py-3 border border-gray-300 rounded-[1.2rem] focus:outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-[1.2rem] shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{t('productInfo')}</h2>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-[1.2rem] mb-4">
              {error}
            </div>
          )}

          {product ? (
            <div>
              <div className="space-y-3 mb-6">
                {(() => {
                  const imgs = [getImageUrl(product.image_url), getImageUrl(product.image_url_2)].filter(Boolean);
                  return imgs.length > 0 ? (
                    <div className="relative w-32 h-32 cursor-pointer" onClick={() => setPreviewImages({ images: imgs, index: 0 })}>
                      <img src={imgs[0]} alt={product.name} className="w-32 h-32 object-cover rounded-[1.2rem] hover:opacity-80 transition-opacity" />
                      {imgs.length > 1 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-600 text-white text-xs font-bold rounded-full flex items-center justify-center">{imgs.length}</span>
                      )}
                    </div>
                  ) : null;
                })()}
                <h3 className="text-xl font-bold">{product.name}</h3>
                {product.description && (
                  <p className="text-gray-600">{product.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-gray-50 rounded">
                    <span className="text-gray-500">{t('barcode')}:</span>
                    <br />
                    <strong>{product.barcode}</strong>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <span className="text-gray-500">{t('cost')}:</span>
                    <br />
                    <strong>{parseFloat(product.cost_price || 0).toFixed(2)}</strong>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <span className="text-gray-500">{t('retail')}:</span>
                    <br />
                    <strong>{parseFloat(product.retail_price || 0).toFixed(2)}</strong>
                  </div>
                  <div className="p-2 bg-gray-50 rounded">
                    <span className="text-gray-500">{t('wholesale')}:</span>
                    <br />
                    <strong>{parseFloat(product.wholesale_price || 0).toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Stock Levels */}
              <h4 className="font-semibold mb-2">{t('stockLevels')}</h4>
              {inventory.length > 0 ? (
                <div className="space-y-2">
                  {inventory.map((inv) => (
                    <div key={inv.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-[1.2rem]">
                      <span>{inv.location?.name || 'Unknown'}</span>
                      <span className={`font-bold ${
                        inv.quantity === 0 ? 'text-red-600' :
                        inv.quantity <= 5 ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {inv.quantity} {t('units')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">{t('noStockRecords')}</p>
              )}
            </div>
          ) : !error ? (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <p>{t('scanBarcodeToSee')}</p>
            </div>
          ) : null}
        </div>
      </div>
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
