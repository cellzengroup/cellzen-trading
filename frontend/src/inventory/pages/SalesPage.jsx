import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Quagga from '@ericblade/quagga2';
import { useApi } from '../hooks/useApi';
import { productsApi, locationsApi, inventoryApi, getImageUrl } from '../utils/inventoryApi';
import { useLanguage } from '../context/LanguageContext';

export default function SalesPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { t, td } = useLanguage();
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [inventoryData, setInventoryData] = useState([]);
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState({ location_id: '', price_type: 'retail' });
  const [message, setMessage] = useState(null);
  const [locDropdownOpen, setLocDropdownOpen] = useState(false);
  const locDropdownRef = useRef(null);

  const [previewImages, setPreviewImages] = useState(null);

  // Product not found popup
  const [showNotFound, setShowNotFound] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState('');

  // No stock popup
  const [showNoStock, setShowNoStock] = useState(false);
  const [noStockProduct, setNoStockProduct] = useState(null);

  // Add Product form (same as ProductsPage)
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '', description: '', image_url: '', barcode: '',
    cost_price: '', retail_price: '', wholesale_price: '',
    category: '', weight: '', size: '',
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryOptions = ['Singing Bowl', 'Thanka', 'Jewelleries', 'Thanka Locket'];
  const productImageRef = useRef(null);

  // Sell Items modal
  const [showSellItems, setShowSellItems] = useState(false);
  const [sellMode, setSellMode] = useState(''); // 'upload' or 'manual'

  // Header search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef(null);
  const searchDropdownRef = useRef(null);

  // Editable prices in cart (keyed by product id)
  const [editedPrices, setEditedPrices] = useState({});

  // Upload image scan state
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [scanStatus, setScanStatus] = useState('waiting'); // waiting | scanning | done
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Product category filter
  const [categoryFilter, setCategoryFilter] = useState('Singing Bowl');

  // Image orientation tracking (keyed by product id: 'portrait' | 'landscape')
  const [imgOrientations, setImgOrientations] = useState({});

  const handleImgLoad = (productId, e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setImgOrientations((prev) => ({
      ...prev,
      [productId]: naturalHeight >= naturalWidth ? 'portrait' : 'landscape',
    }));
  };

  // Barcode scanner device refs (same as TransfersPage)
  const globalScanBufferRef = useRef('');
  const globalLastKeyTimeRef = useRef(0);
  const globalScanTimerRef = useRef(null);

  const fetchSalesData = () => {
    Promise.all([productsApi.getAll(api), locationsApi.getAll(api), inventoryApi.getAll(api)])
      .then(([prodRes, locRes, invRes]) => {
        setProducts(prodRes.data.data);
        const locs = locRes.data.data;
        setLocations(locs);
        setInventoryData(invRes.data.data);
        const defaultLoc = locs.find((l) => l.name === 'Guangzhou Warehouse');
        if (defaultLoc) setForm((prev) => ({ ...prev, location_id: prev.location_id || defaultLoc.id }));
      });
  };

  const getStock = (productId, locationId) => {
    const inv = inventoryData.find(
      (i) => i.product_id === productId && i.location_id === locationId
    );
    return inv ? inv.quantity : 0;
  };

  const resetProductForm = () => {
    setProductForm({ name: '', description: '', image_url: '', barcode: '', cost_price: '', retail_price: '', wholesale_price: '', category: '', weight: '', size: '' });
    setImagePreview(null);
    setImageFile(null);
    setShowProductForm(false);
    setShowCategoryDropdown(false);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      await productsApi.create(api, productForm, imageFile);
      resetProductForm();
      fetchSalesData();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSalesData();
    const interval = setInterval(fetchSalesData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close location dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (locDropdownRef.current && !locDropdownRef.current.contains(e.target)) {
        setLocDropdownOpen(false);
      }
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPrice = (product) => {
    if (editedPrices[product.id] !== undefined) {
      return parseFloat(editedPrices[product.id]) || 0;
    }
    return form.price_type === 'retail'
      ? parseFloat(product.retail_price || 0)
      : parseFloat(product.wholesale_price || 0);
  };

  const addToCart = (product) => {
    // Check stock at selected location
    const stock = getStock(product.id, form.location_id);
    if (stock <= 0) {
      setNoStockProduct(product);
      setShowNoStock(true);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        // Unselect — remove from cart
        setEditedPrices((p) => { const n = { ...p }; delete n[product.id]; return n; });
        return prev.filter((item) => item.product.id !== product.id);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQty = (productId, qty) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
      setEditedPrices((prev) => { const n = { ...prev }; delete n[productId]; return n; });
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId ? { ...item, quantity: qty } : item
        )
      );
    }
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    setEditedPrices((prev) => { const n = { ...prev }; delete n[productId]; return n; });
  };

  // Global barcode scanner device listener (same as TransfersPage)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const now = Date.now();

      if (e.key === 'Enter') {
        e.preventDefault();
        const barcode = globalScanBufferRef.current.trim();
        if (barcode.length >= 3) {
          const product = products.find(
            (p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
          );
          if (product) {
            addToCart(product);
          } else {
            setNotFoundBarcode(barcode);
            setShowNotFound(true);
          }
        }
        globalScanBufferRef.current = '';
        return;
      }

      if (e.key.length !== 1) return;

      const timeDiff = now - globalLastKeyTimeRef.current;
      globalLastKeyTimeRef.current = now;

      if (timeDiff > 100) {
        globalScanBufferRef.current = '';
      }

      globalScanBufferRef.current += e.key;

      clearTimeout(globalScanTimerRef.current);
      globalScanTimerRef.current = setTimeout(() => {
        if (globalScanBufferRef.current.length < 3) {
          globalScanBufferRef.current = '';
        }
      }, 300);
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [products, cart, form.price_type, form.location_id, inventoryData]);

  // Barcode lookup
  const lookupBarcode = (barcode) => {
    return products.find(
      (p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
    ) || null;
  };

  // Quagga readers
  const quaggaReaders = [
    'code_128_reader', 'ean_reader', 'ean_8_reader', 'upc_reader',
    'upc_e_reader', 'code_39_reader', 'code_93_reader', 'codabar_reader', 'i2of5_reader',
  ];

  const tryQuagga = (imageUrl, size, patchSize) => {
    return new Promise((resolve) => {
      Quagga.decodeSingle({
        src: imageUrl, numOfWorkers: 0, locate: true,
        inputStream: { size, singleChannel: false },
        locator: { patchSize, halfSample: true },
        decoder: { readers: quaggaReaders, multiple: false },
      }, (result) => {
        resolve(result?.codeResult?.code || null);
      });
    });
  };

  const tryNativeDetector = async (file) => {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const img = new Image();
      await new Promise((resolve) => { img.onload = resolve; img.src = URL.createObjectURL(file); });
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93',
                  'codabar', 'itf', 'qr_code', 'data_matrix', 'aztec', 'pdf417'],
      });
      const results = await detector.detect(img);
      if (results.length > 0 && results[0].rawValue) return results[0].rawValue;
    } catch (e) { /* not supported */ }
    return null;
  };

  const createImageUrls = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const urls = [URL.createObjectURL(file)];
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        // B&W high contrast
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const bw = gray < 140 ? 0 : 255;
          d[i] = bw; d[i + 1] = bw; d[i + 2] = bw;
        }
        ctx.putImageData(imgData, 0, 0);
        urls.push(canvas.toDataURL('image/png'));
        // Contrast boosted grayscale
        ctx.drawImage(img, 0, 0);
        const imgData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d2 = imgData2.data;
        for (let i = 0; i < d2.length; i += 4) {
          let gray = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
          gray = Math.max(0, Math.min(255, ((gray - 128) * 2.0) + 128));
          d2[i] = gray; d2[i + 1] = gray; d2[i + 2] = gray;
        }
        ctx.putImageData(imgData2, 0, 0);
        urls.push(canvas.toDataURL('image/png'));
        // Scaled up 2x
        const canvas2 = document.createElement('canvas');
        canvas2.width = img.width * 2; canvas2.height = img.height * 2;
        const ctx2 = canvas2.getContext('2d');
        ctx2.imageSmoothingEnabled = false;
        ctx2.drawImage(img, 0, 0, canvas2.width, canvas2.height);
        urls.push(canvas2.toDataURL('image/png'));
        // Scaled 2x + B&W
        const imgData3 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
        const d3 = imgData3.data;
        for (let i = 0; i < d3.length; i += 4) {
          const gray = 0.299 * d3[i] + 0.587 * d3[i + 1] + 0.114 * d3[i + 2];
          const bw = gray < 140 ? 0 : 255;
          d3[i] = bw; d3[i + 1] = bw; d3[i + 2] = bw;
        }
        ctx2.putImageData(imgData3, 0, 0);
        urls.push(canvas2.toDataURL('image/png'));
        resolve(urls);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const processImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadError('');
    setUploadPreview(URL.createObjectURL(file));
    setScanStatus('scanning');

    let result = null;
    result = await tryNativeDetector(file);

    if (!result) {
      try {
        const imageUrls = await createImageUrls(file);
        const sizes = [800, 1280, 1920];
        const patchSizes = ['medium', 'large', 'small', 'x-large'];
        for (const url of imageUrls) {
          for (const size of sizes) {
            for (const patchSize of patchSizes) {
              result = await tryQuagga(url, size, patchSize);
              if (result) break;
            }
            if (result) break;
          }
          if (result) break;
        }
      } catch (e) { /* failed */ }
    }

    if (result) {
      setScanStatus('done');
      const matched = lookupBarcode(result);
      if (matched) {
        addToCart(matched);
      } else {
        setNotFoundBarcode(result);
        setShowNotFound(true);
      }
      // Reset for next scan
      setTimeout(() => { setScanStatus('waiting'); setUploadPreview(null); }, 1500);
    } else {
      setScanStatus('waiting');
      setUploadError('Could not detect barcode. Try cropping the image closer to the barcode label.');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = (e) => processImageFile(e.target.files?.[0]);
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); processImageFile(e.dataTransfer.files?.[0]); };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };

  // Filter products for manual search
  const filteredProducts = searchQuery.trim()
    ? products.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
        );
      })
    : [];

  const handleSearchSelect = (product) => {
    // Always add (not toggle) when selecting from search
    const stock = getStock(product.id, form.location_id);
    if (stock <= 0) {
      setNoStockProduct(product);
      setShowNoStock(true);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearchQuery('');
    setShowSearchResults(false);
    setShowSearch(false);
  };

  const cartTotal = cart.reduce((sum, item) => sum + getPrice(item.product) * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleConfirmPayment = async () => {
    if (cart.length === 0 || !form.location_id) return;
    try {
      for (const item of cart) {
        await inventoryApi.sale(api, {
          product_id: item.product.id,
          location_id: form.location_id,
          quantity: item.quantity,
          price_type: form.price_type,
          unit_price: getPrice(item.product),
        });
      }
      setMessage({ type: 'success', text: `${t('completeSale')}! ${t('total')}: ${cartTotal.toFixed(2)}` });
      setCart([]);
      setEditedPrices({});
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Sale failed' });
    }
  };

  const selectedLocName = (() => {
    const loc = locations.find((l) => String(l.id) === String(form.location_id));
    if (!loc) return t('selectLocation');
    return loc.name === 'Guangzhou Warehouse' ? 'Guangzhou Warehouse' : `${loc.name} (${td(loc.type)})`;
  })();

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">{t('pointOfSale')}</h1>
        <div className="flex items-center gap-2">
          {/* Sell Items Button */}
          <button
            onClick={() => { setShowSellItems(true); setSellMode(''); }}
            className="px-4 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
          >
            Sell Items
          </button>

          {/* Location Dropdown */}
          <div className="relative" ref={locDropdownRef}>
            <button
              type="button"
              onClick={() => setLocDropdownOpen(!locDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-[1.2rem] bg-white hover:bg-gray-50 focus:outline-none min-w-[180px] text-left"
            >
              <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="flex-1 truncate text-sm text-gray-800">{selectedLocName}</span>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${locDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {locDropdownOpen && (
              <div className="absolute right-0 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-[1rem] shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                {locations.filter((loc) => loc.name === 'Guangzhou Warehouse').map((loc) => (
                  <div
                    key={loc.id}
                    onClick={() => { setForm({ ...form, location_id: loc.id }); setLocDropdownOpen(false); }}
                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-amber-50 ${String(form.location_id) === String(loc.id) ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                  >
                    Guangzhou Warehouse
                  </div>
                ))}
                {locations.filter((loc) => loc.name !== 'Guangzhou Warehouse').map((loc) => (
                  <div
                    key={loc.id}
                    onClick={() => { setForm({ ...form, location_id: loc.id }); setLocDropdownOpen(false); }}
                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-amber-50 ${String(form.location_id) === String(loc.id) ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                  >
                    {loc.name} ({td(loc.type)})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-3 px-4 py-2.5 rounded-[1.2rem] text-sm font-medium ${
          message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
          'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* Main POS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT PANEL - Cart (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Category Filter Buttons + Search */}
          <div className="flex items-center gap-2">
            <div className="flex gap-2 flex-wrap flex-1">
              {['All', 'Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries', 'Others'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat === 'All' ? '' : cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    (cat === 'All' && !categoryFilter) || categoryFilter === cat
                      ? 'bg-amber-700 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* Search toggle + slide-in input */}
            <div className="relative flex items-center">
              <button
                onClick={() => {
                  const next = !showSearch;
                  setShowSearch(next);
                  if (next) {
                    setTimeout(() => searchInputRef.current?.focus(), 310);
                  } else {
                    setSearchQuery('');
                    setShowSearchResults(false);
                  }
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors flex-shrink-0"
              >
                {showSearch ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </button>
              {showSearch && (
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={t('searchProducts')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-52 ml-1 px-3 py-1.5 border border-gray-300 rounded-full focus:outline-none text-sm"
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* All Products Grid */}
          <div className="overflow-y-auto overflow-x-hidden" style={{ height: '540px' }}>
              {(() => {
                const displayProducts = products.filter((p) => {
                  if (form.location_id && getStock(p.id, form.location_id) <= 0) return false;
                  if (categoryFilter) {
                    if (categoryFilter === 'Others') {
                      if (['Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries'].includes(p.category)) return false;
                    } else if (p.category !== categoryFilter) return false;
                  }
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    return (
                      (p.name && p.name.toLowerCase().includes(q)) ||
                      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
                      (p.category && p.category.toLowerCase().includes(q))
                    );
                  }
                  return true;
                });

                if (displayProducts.length === 0) return (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <div className="w-16 h-16 rounded-full bg-white shadow-md flex items-center justify-center mb-5">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <p className="text-lg font-bold text-gray-800 mb-4">No Products Found</p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => navigate('/inventorymanagement/inventory')}
                        className="px-5 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium text-sm"
                      >
                        Go to Inventory
                      </button>
                      <button
                        onClick={() => { setProductForm({ name: '', description: '', image_url: '', barcode: '', cost_price: '', retail_price: '', wholesale_price: '', category: '', weight: '', size: '' }); setShowProductForm(true); }}
                        className="px-5 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium text-sm"
                      >
                        {t('addProduct')}
                      </button>
                    </div>
                  </div>
                );

                return (
                <div className="grid grid-cols-3 gap-3">
                  {displayProducts.map((product) => {
                    const orientation = imgOrientations[product.id] || 'portrait';
                    const isPortrait = orientation === 'portrait';
                    const inCart = cart.find((item) => item.product.id === product.id);

                    return (
                      <div
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className={`relative bg-gray-100 rounded-[1rem] overflow-hidden flex cursor-pointer transition-all duration-200 hover:shadow-md ${
                          inCart ? 'ring-2 ring-amber-500' : ''
                        } ${isPortrait ? 'flex-row' : 'flex-col'}`}
                        style={{ height: '170px' }}
                      >
                        {/* In-cart badge */}
                        {inCart && (
                          <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold">
                            {inCart.quantity}
                          </div>
                        )}

                        {/* Product Image */}
                        {isPortrait ? (
                          <div className="w-[40%] h-full bg-gray-200 shrink-0 overflow-hidden cursor-pointer" onClick={(e) => { const imgs = [getImageUrl(product.image_url), getImageUrl(product.image_url_2)].filter(Boolean); if (imgs.length) { e.stopPropagation(); setPreviewImages({ images: imgs, index: 0 }); } }}>
                            {product.image_url ? (
                              <img
                                src={getImageUrl(product.image_url)}
                                alt=""
                                className="w-full h-full object-cover"
                                onLoad={(e) => handleImgLoad(product.id, e)}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">N/A</div>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-[45%] bg-gray-200 shrink-0 overflow-hidden cursor-pointer" onClick={(e) => { const imgs = [getImageUrl(product.image_url), getImageUrl(product.image_url_2)].filter(Boolean); if (imgs.length) { e.stopPropagation(); setPreviewImages({ images: imgs, index: 0 }); } }}>
                            {product.image_url ? (
                              <img
                                src={getImageUrl(product.image_url)}
                                alt=""
                                className="w-full h-full object-cover"
                                onLoad={(e) => handleImgLoad(product.id, e)}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">N/A</div>
                            )}
                          </div>
                        )}

                        {/* Product Details */}
                        <div className="flex flex-col justify-center p-2.5 overflow-hidden flex-1">
                          <p className="text-sm font-bold text-gray-800 truncate leading-tight">{product.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{product.category || '-'}</p>
                          <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-500">
                            <p>{t('weight')}: {product.weight || '-'}</p>
                            <p>{t('size')}: {product.size || '-'}</p>
                            <p>Code: {product.barcode || '-'}</p>
                            <p>{t('location')}: {(() => {
                              const locs = inventoryData
                                .filter((i) => i.product_id === product.id && i.quantity > 0)
                                .map((i) => {
                                  const loc = locations.find((l) => l.id === i.location_id);
                                  return loc ? `${loc.name} (${i.quantity})` : '';
                                })
                                .filter(Boolean);
                              return locs.length > 0 ? locs.join(', ') : '-';
                            })()}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>

          {/* Transfer Cart Table */}
          <div className="bg-white rounded-[1.2rem] shadow overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <span className="font-semibold text-gray-700">
                {t('transferCart')} ({cartItemCount} {t('items')})
              </span>
              {cart.length > 0 && (
                <button
                  onClick={() => { setCart([]); setEditedPrices({}); }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  {t('clearCart')}
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                <p className="text-sm">{t('emptyCart')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('image')}</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('productName')}</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('category')}</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('barcode')}</th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('location')}</th>
                      <th className="px-5 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('qty')}</th>
                      <th className="px-5 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('unitPrice')}</th>
                      <th className="px-5 py-4 border-b border-gray-200"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.product.id} className="transition-colors hover:bg-amber-50/60">
                        <td className="px-5 py-4 border-b border-gray-100">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 cursor-pointer" onClick={() => { const imgs = [getImageUrl(item.product.image_url), getImageUrl(item.product.image_url_2)].filter(Boolean); if (imgs.length) setPreviewImages({ images: imgs, index: 0 }); }}>
                            {item.product.image_url ? (
                              <img src={getImageUrl(item.product.image_url)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">N/A</div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 border-b border-gray-100 font-medium text-gray-800 max-w-[140px] truncate">{item.product.name}</td>
                        <td className="px-5 py-4 border-b border-gray-100 text-gray-600">{item.product.category || '-'}</td>
                        <td className="px-5 py-4 border-b border-gray-100 text-gray-600 font-mono text-xs">{item.product.barcode || '-'}</td>
                        <td className="px-5 py-4 border-b border-gray-100 text-gray-600 text-xs">{selectedLocName}</td>
                        <td className="px-5 py-4 border-b border-gray-100">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 text-sm font-bold"
                            >-</button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateCartQty(item.product.id, Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-10 text-center border border-gray-300 rounded-full py-0.5 text-sm font-bold focus:outline-none"
                            />
                            <button
                              onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 text-sm font-bold"
                            >+</button>
                          </div>
                        </td>
                        <td className="px-5 py-4 border-b border-gray-100 text-right font-semibold text-amber-700">
                          {getPrice(item.product).toFixed(2)}
                        </td>
                        <td className="px-5 py-4 border-b border-gray-100">
                          <button onClick={() => removeFromCart(item.product.id)} className="text-red-400 hover:text-red-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL - Order Summary (1 col) */}
        <div className="lg:col-span-1 flex flex-col">
          <div className="bg-white rounded-[1.2rem] shadow flex flex-col">
            {/* Header */}
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-bold text-lg text-gray-800">{t('orderSummary')}</h2>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-400">{t('date')}</span>
                <span className="text-xs text-gray-600">{new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200 mx-5"></div>

            {/* Selling Method */}
            <div className="px-5 py-3">
              <p className="text-xs text-gray-400 mb-2">{t('priceType')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setForm({ ...form, price_type: 'retail' }); setEditedPrices({}); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-[1rem] transition-colors ${form.price_type === 'retail' ? 'bg-amber-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {t('retail')}
                </button>
                <button
                  type="button"
                  onClick={() => { setForm({ ...form, price_type: 'wholesale' }); setEditedPrices({}); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-[1rem] transition-colors ${form.price_type === 'wholesale' ? 'bg-amber-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {t('wholesale')}
                </button>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200 mx-5"></div>

            {/* Product Details */}
            <div className="max-h-[420px] overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-gray-300">
                  <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm">{t('emptyCart')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.product.id} className="bg-gray-50 rounded-[1rem] p-3">
                      {/* Product Image & Name */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-14 h-14 rounded-[0.8rem] overflow-hidden bg-white border border-gray-200 shrink-0 cursor-pointer" onClick={() => { const imgs = [getImageUrl(item.product.image_url), getImageUrl(item.product.image_url_2)].filter(Boolean); if (imgs.length) setPreviewImages({ images: imgs, index: 0 }); }}>
                          {item.product.image_url ? (
                            <img src={getImageUrl(item.product.image_url)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">N/A</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{item.product.name}</p>
                          <p className="text-amber-700 font-bold text-sm">{getPrice(item.product).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-400 hover:bg-white text-sm"
                          >-</button>
                          <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-700 text-white text-sm"
                          >+</button>
                        </div>
                      </div>

                      {/* Product Info Fields */}
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-400">{t('category')}</span>
                          <span className="text-gray-700 font-medium">{item.product.category || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{t('barcode')}</span>
                          <span className="text-gray-700 font-medium">{item.product.barcode || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{t('weight')}</span>
                          <span className="text-gray-700 font-medium">{item.product.weight || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">{t('size')}</span>
                          <span className="text-gray-700 font-medium">{item.product.size || '-'}</span>
                        </div>
                        <div className="border-t border-dashed border-gray-200 my-2"></div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 font-semibold text-sm">{t('total')}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editedPrices[item.product.id] !== undefined ? editedPrices[item.product.id] : (form.price_type === 'retail' ? parseFloat(item.product.retail_price || 0) : parseFloat(item.product.wholesale_price || 0)).toFixed(2)}
                            onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setEditedPrices((prev) => ({ ...prev, [item.product.id]: v })); }}
                            className="w-32 text-amber-700 font-bold text-base bg-white border-2 border-amber-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-500 text-right"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="px-5 pb-5 pt-2">
              <div className="border-t border-dashed border-gray-200 mb-3"></div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>{t('total')} {t('items')}</span>
                  <span>{cartItemCount} {t('items')}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>{t('subtotal')}</span>
                  <span>{cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>{t('priceType')}</span>
                  <span className="font-medium text-gray-700">{form.price_type === 'retail' ? t('retail') : t('wholesale')}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>{t('location')}</span>
                  <span className="font-medium text-gray-700">{selectedLocName}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-200 my-3"></div>

              <div className="flex justify-between items-center mb-4">
                <span className="text-base font-bold text-gray-800">{t('total')}</span>
                <span className="text-xl font-bold text-amber-700">{cartTotal.toFixed(2)}</span>
              </div>

              <button
                onClick={handleConfirmPayment}
                disabled={cart.length === 0 || !form.location_id}
                className="w-full py-3.5 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('completeSale')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sell Items Modal */}
      {showSellItems && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
            {/* Choice View */}
            {!sellMode && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">Sell Items</h2>
                <p className="text-gray-500 text-sm mb-6 text-center">Choose how to add products</p>
                <div className="space-y-3">
                  <button
                    onClick={() => setSellMode('upload')}
                    className="w-full flex items-center gap-3 px-5 py-4 rounded-[1.2rem] border-2 border-gray-200 hover:border-amber-700 hover:bg-amber-50 transition-all duration-200 group"
                  >
                    <span className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 group-hover:bg-amber-700 group-hover:text-white transition-all duration-200">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </span>
                    <div className="text-left">
                      <span className="block font-semibold text-gray-800">Upload Image</span>
                      <span className="block text-xs text-gray-500">Upload a photo of barcode or QR code</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setSellMode('manual')}
                    className="w-full flex items-center gap-3 px-5 py-4 rounded-[1.2rem] border-2 border-gray-200 hover:border-amber-700 hover:bg-amber-50 transition-all duration-200 group"
                  >
                    <span className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 group-hover:bg-amber-700 group-hover:text-white transition-all duration-200">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <div className="text-left">
                      <span className="block font-semibold text-gray-800">{t('manualSale')}</span>
                      <span className="block text-xs text-gray-500">{t('manualSaleDesc')}</span>
                    </div>
                  </button>
                </div>
                <button
                  onClick={() => setShowSellItems(false)}
                  className="mt-5 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors text-center"
                >
                  {t('cancel')}
                </button>
              </>
            )}

            {/* Upload Image Mode */}
            {sellMode === 'upload' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <button onClick={() => setSellMode('')} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-bold text-gray-800">Upload Image</h2>
                  <button onClick={() => { setShowSellItems(false); setSellMode(''); setUploadPreview(null); setUploadError(''); setScanStatus('waiting'); }} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                {scanStatus === 'scanning' && (
                  <div className="py-8">
                    <div className="w-12 h-12 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm text-gray-500 text-center">Scanning barcode...</p>
                  </div>
                )}

                {scanStatus !== 'scanning' && (
                  <>
                    {uploadPreview ? (
                      <div className="mb-4 text-center">
                        <img
                          src={uploadPreview}
                          alt="Uploaded barcode"
                          className="max-h-48 mx-auto rounded-[1.2rem] border border-gray-200 object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`border-2 border-dashed rounded-[1.2rem] p-8 cursor-pointer transition-all duration-200 mb-4 ${
                          isDragging
                            ? 'border-amber-500 bg-amber-50 scale-[1.02]'
                            : 'border-gray-300 hover:border-amber-500 hover:bg-amber-50'
                        }`}
                      >
                        <svg className={`w-10 h-10 mx-auto mb-3 transition-colors ${isDragging ? 'text-amber-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm text-gray-600 font-medium text-center">
                          {isDragging ? 'Drop image here' : 'Drag & drop or click to upload'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 text-center">Upload a photo of barcode or QR code</p>
                      </div>
                    )}

                    {uploadError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-[1.2rem] text-sm text-red-600 mb-3">
                        {uploadError}
                      </div>
                    )}

                    {uploadPreview && (
                      <div className="text-center">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-sm text-amber-700 hover:text-amber-800 font-medium"
                        >
                          Try a different image
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Manual Sale Mode */}
            {sellMode === 'manual' && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <button onClick={() => setSellMode('')} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-bold text-gray-800">{t('manualSale')}</h2>
                  <button onClick={() => { setShowSellItems(false); setSellMode(''); setSearchQuery(''); setShowSearchResults(false); }} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setShowSearchResults(true); }}
                    placeholder={t('searchProducts')}
                    className="w-full pl-11 pr-4 py-3 border-2 border-amber-300 rounded-[1.2rem] focus:outline-none focus:border-amber-500 text-base"
                    autoFocus
                  />
                </div>

                {/* Search Results */}
                <div className="mt-3 max-h-72 overflow-y-auto">
                  {searchQuery.trim() && filteredProducts.length > 0 && (
                    <div className="border border-gray-200 rounded-[1rem] overflow-hidden">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          onClick={() => {
                            addToCart(product);
                            setSearchQuery('');
                          }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50 cursor-pointer border-b border-gray-50 last:border-b-0"
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                            {product.image_url ? (
                              <img src={getImageUrl(product.image_url)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">N/A</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.barcode || '-'} &middot; {product.category || '-'}</p>
                          </div>
                          <p className="text-sm font-bold text-amber-700">
                            {(form.price_type === 'retail' ? parseFloat(product.retail_price || 0) : parseFloat(product.wholesale_price || 0)).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchQuery.trim() && filteredProducts.length === 0 && (
                    <div className="py-6 text-center text-gray-400 text-sm">
                      {t('productNotFound')}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Product Not Found Popup */}
      {showNotFound && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">{t('productNotFound')}</h3>
            <p className="text-sm text-gray-500 mb-2">
              {t('barcode')}: <span className="font-mono font-semibold text-gray-700">{notFoundBarcode}</span>
            </p>
            <p className="text-sm text-gray-500 mb-6">Would you like to add the product?</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNotFound(false);
                  setProductForm((prev) => ({ ...prev, barcode: notFoundBarcode }));
                  setShowProductForm(true);
                }}
                className="flex-1 py-2.5 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
              >
                {t('addProduct')}
              </button>
              <button
                onClick={() => setShowNotFound(false)}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Stock Popup */}
      {showNoStock && noStockProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
            <div className="w-16 h-16 rounded-full bg-orange-100 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">No Stock Found</h3>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-semibold text-gray-700">{noStockProduct.name}</span>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              is not available at <span className="font-semibold text-gray-700">{selectedLocName}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNoStock(false);
                  setNoStockProduct(null);
                  navigate('/inventorymanagement/inventory');
                }}
                className="flex-1 py-2.5 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
              >
                Go to Inventory
              </button>
              <button
                onClick={() => { setShowNoStock(false); setNoStockProduct(null); }}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Form (same as ProductsPage) */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{t('addNewProduct')}</h2>
            {productForm.barcode && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-[1.2rem] text-sm text-amber-800 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="6" y1="8" x2="6" y2="16" />
                  <line x1="9" y1="8" x2="9" y2="16" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                </svg>
                {t('barcodePrefilled')}: <span className="font-mono font-semibold">{productForm.barcode}</span>
              </div>
            )}
            <form onSubmit={handleProductSubmit} className="space-y-3">
              {/* Row 1: Name + Upload Picture */}
              <div className="flex justify-between items-start">
                <div className="flex-1 max-w-[65%]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('nameRequired')}</label>
                  <input
                    type="text"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    readOnly={productForm.category === 'Singing Bowl'}
                    required
                    className={`w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none ${productForm.category === 'Singing Bowl' ? 'bg-gray-100 text-gray-500' : ''}`}
                    autoFocus
                  />
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    ref={productImageRef}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setImagePreview(URL.createObjectURL(file));
                        setImageFile(file);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => productImageRef.current?.click()}
                    className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-[1.2rem] flex items-center justify-center hover:border-amber-500 hover:bg-amber-50 transition-colors overflow-hidden"
                  >
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-[1.2rem]" />
                    ) : (
                      <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 15V3" />
                        <path d="M7 7l5-5 5 5" />
                        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Row 2: Category + Barcode */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('category')}</label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none bg-white text-left flex items-center justify-between"
                  >
                    <span className={productForm.category ? 'text-gray-900' : 'text-gray-400'}>
                      {td(productForm.category) || t('selectCategory')}
                    </span>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showCategoryDropdown && (
                    <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-[1.2rem] shadow-lg overflow-hidden">
                      {categoryOptions.map((option) => (
                        <li
                          key={option}
                          onClick={() => {
                            setProductForm({ ...productForm, category: option, ...(option === 'Singing Bowl' ? { name: productForm.barcode } : {}) });
                            setShowCategoryDropdown(false);
                          }}
                          className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors ${productForm.category === option ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                        >
                          {option}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('barcode')}</label>
                  <input
                    type="text"
                    value={productForm.barcode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProductForm((prev) => ({ ...prev, barcode: val, ...(prev.category === 'Singing Bowl' ? { name: val } : {}) }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Row 3: Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('description')}</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                />
              </div>

              {/* Row 4: Weight, Size */}
              <div className={`grid ${productForm.category === 'Thanka' || productForm.category === 'Thanka Locket' ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                {productForm.category !== 'Thanka' && productForm.category !== 'Thanka Locket' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('weight')}</label>
                    <input
                      type="text"
                      value={productForm.weight}
                      onChange={(e) => setProductForm({ ...productForm, weight: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('size')}</label>
                  <input
                    type="text"
                    value={productForm.size}
                    onChange={(e) => setProductForm({ ...productForm, size: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 5: Cost Price, Wholesale Price, Retail Price */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('costPrice')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.cost_price}
                    onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('wholesale')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.wholesale_price}
                    onChange={(e) => setProductForm({ ...productForm, wholesale_price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('retailPrice')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.retail_price}
                    onChange={(e) => setProductForm({ ...productForm, retail_price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
                >
                  {t('create')}
                </button>
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
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
