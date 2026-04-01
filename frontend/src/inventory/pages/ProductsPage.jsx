import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Quagga from '@ericblade/quagga2';
import { useApi } from '../hooks/useApi';
import { productsApi, reportsApi, locationsApi, getImageUrl } from '../utils/inventoryApi';
import { useLanguage } from '../context/LanguageContext';

export default function ProductsPage() {
  const api = useApi();
  const { t, td } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scanStatus, setScanStatus] = useState('waiting'); // waiting | scanning | done
  const [scanMode, setScanMode] = useState('device'); // device | upload
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', image_url: '', image_url_2: '', barcode: '',
    cost_price: '', retail_price: '', wholesale_price: '',
    category: '', weight: '', size: '', quantity: 1,
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [imagePreview2, setImagePreview2] = useState(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [previewImages, setPreviewImages] = useState(null); // { images: [url, ...], index: 0 }
  const [deleteProduct, setDeleteProduct] = useState(null);

  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const ROWS_PER_PAGE = 20;
  const [visibleRows, setVisibleRows] = useState({}); // { 'Singing Bowl': 20, ... }

  // Quotation download
  const [showQuotation, setShowQuotation] = useState(false);
  const [quotationCategory, setQuotationCategory] = useState('');
  const [quotationPriceType, setQuotationPriceType] = useState('retail_price');
  const [quotationCatOpen, setQuotationCatOpen] = useState(false);
  const [quotationPriceOpen, setQuotationPriceOpen] = useState(false);
  const quotationCatRef = useRef(null);
  const quotationPriceRef = useRef(null);
  const [duplicateProduct, setDuplicateProduct] = useState(null);
  const [duplicateQty, setDuplicateQty] = useState(1);
  const categoryOptions = ['Singing Bowl', 'Thanka', 'Jewelleries', 'Thanka Locket'];
  const productImageRef = useRef(null);
  const productImageRef2 = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageFile2, setImageFile2] = useState(null);

  const [locations, setLocations] = useState([]);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterLocationOpen, setFilterLocationOpen] = useState(false);
  const filterLocationRef = useRef(null);

  // Quotation location
  const [quotationLocation, setQuotationLocation] = useState('');
  const [quotationLocOpen, setQuotationLocOpen] = useState(false);
  const quotationLocRef = useRef(null);

  const [descriptionPopup, setDescriptionPopup] = useState(null); // { name, description }
  const [batchScanned, setBatchScanned] = useState([]); // [{ barcode, name, category, matched }]
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [batchEditIndex, setBatchEditIndex] = useState(null); // index being edited, or null

  const scanInputRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef(null);
  const lastKeyTimeRef = useRef(0);
  const fileInputRef = useRef(null);
  const globalScanBufferRef = useRef('');
  const globalLastKeyTimeRef = useRef(0);
  const globalScanTimerRef = useRef(null);

  // Debounce search input — wait 400ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProducts = async () => {
    try {
      const res = await productsApi.getAll(api, debouncedSearch);
      let data = res.data.data;
      if (filterLocation) {
        const invRes = await api.get(`/inventory?location_id=${filterLocation}`);
        const invData = invRes.data.data || [];
        const productIdsAtLocation = new Set(
          invData.filter(inv => inv.quantity > 0).map(inv => inv.product_id)
        );
        data = data.filter(p => productIdsAtLocation.has(p.id));
      }
      setProducts(data);
      setVisibleRows({});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [debouncedSearch, filterLocation]);

  useEffect(() => {
    locationsApi.getAll(api).then(res => setLocations(res.data.data || [])).catch(() => {});
  }, []);

  const resetForm = () => {
    setForm({ name: '', description: '', image_url: '', image_url_2: '', barcode: '', cost_price: '', retail_price: '', wholesale_price: '', category: '', weight: '', size: '', quantity: 1 });
    setImagePreview(null);
    setImagePreview2(null);
    setImageFile(null);
    setImageFile2(null);
    setEditingProduct(null);
    setBatchEditIndex(null);
    setShowForm(false);
  };

  const handleEdit = async (product) => {
    // Fetch current inventory quantity for this product
    let qty = 1;
    try {
      const invRes = await api.get('/inventory');
      const invData = invRes.data.data || [];
      const totalQty = invData
        .filter(inv => inv.product_id === product.id || inv.product?.id === product.id)
        .reduce((sum, inv) => sum + inv.quantity, 0);
      if (totalQty > 0) qty = totalQty;
    } catch { /* default to 1 */ }

    setForm({
      name: product.name || '',
      description: product.description || '',
      image_url: product.image_url || '',
      image_url_2: product.image_url_2 || '',
      barcode: product.barcode || '',
      cost_price: product.cost_price || '',
      retail_price: product.retail_price || '',
      wholesale_price: product.wholesale_price || '',
      category: product.category || '',
      weight: product.weight || '',
      size: product.size || '',
      quantity: qty,
    });
    setImagePreview(getImageUrl(product.image_url) || null);
    setImagePreview2(getImageUrl(product.image_url_2) || null);
    setImageFile(null);
    setImageFile2(null);
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // If editing from batch scan, update the batch item and go back
    if (batchEditIndex !== null) {
      setBatchScanned(prev => prev.map((item, i) =>
        i === batchEditIndex
          ? {
              ...item,
              barcode: form.barcode,
              name: form.name,
              category: form.category,
              description: form.description,
              cost_price: form.cost_price,
              retail_price: form.retail_price,
              wholesale_price: form.wholesale_price,
              weight: form.weight,
              size: form.size,
              quantity: form.quantity,
              imageFile: imageFile || item.imageFile || null,
              imageFile2: imageFile2 || item.imageFile2 || null,
              imagePreview: imagePreview || item.imagePreview || null,
              imagePreview2: imagePreview2 || item.imagePreview2 || null,
            }
          : item
      ));
      setBatchEditIndex(null);
      setShowForm(false);
      setShowScanner(true);
      setScanMode('upload');
      return;
    }
    try {
      const submitData = { ...form, quantity: Math.max(1, parseInt(form.quantity) || 1) };
      if (editingProduct) {
        await productsApi.update(api, editingProduct.id, submitData, imageFile, imageFile2);
      } else {
        await productsApi.create(api, submitData, imageFile, imageFile2);
      }
      resetForm();
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save product');
    }
  };

  const handleDelete = async () => {
    if (!deleteProduct) return;
    try {
      await productsApi.delete(api, deleteProduct.id);
      setDeleteProduct(null);
      fetchProducts();
    } catch (err) {
      alert('Failed to delete product');
    }
  };

  const productsRef = useRef(products);
  productsRef.current = products;

  const lookupBarcode = useCallback((barcode) => {
    return productsRef.current.find(
      (p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
    ) || null;
  }, []);

  const getCategoryFromBarcode = (barcode) => {
    if (!barcode) return '';
    const upper = barcode.toUpperCase();
    if (upper.startsWith('SB')) return 'Singing Bowl';
    if (upper.startsWith('YA')) return 'Thanka';
    if (upper.startsWith('MA')) return 'Jewelleries';
    if (upper.startsWith('TL')) return 'Thanka Locket';
    return '';
  };

  // Helper: add a barcode to the batch table
  const addBarcodeToBatch = useCallback((barcode) => {
    const matched = lookupBarcode(barcode);
    const cat = getCategoryFromBarcode(barcode);
    setBatchScanned(prev => {
      if (prev.find(r => r.barcode === barcode)) return prev; // skip duplicates
      return [...prev, {
        barcode,
        name: matched?.name || (cat === 'Singing Bowl' ? barcode : ''),
        category: matched?.category || cat,
        matched: !!matched,
      }];
    });
  }, [lookupBarcode]);

  // Barcode scanner handler — detects rapid keystrokes from USB/Bluetooth scanner
  const handleScanKeyDown = useCallback((e) => {
    const now = Date.now();

    // Enter key = scanner finished — add to batch
    if (e.key === 'Enter') {
      e.preventDefault();
      const barcode = (scanBufferRef.current || scannedBarcode).trim().toUpperCase();
      if (barcode.length >= 3) {
        addBarcodeToBatch(barcode);
      }
      scanBufferRef.current = '';
      lastKeyTimeRef.current = 0;
      setScannedBarcode('');
      // Re-focus the input for next scan
      setTimeout(() => scanInputRef.current?.focus(), 50);
      return;
    }

    // Only accept printable characters
    if (e.key.length !== 1) return;

    const timeDiff = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    // If gap > 150ms, this is a new scan — reset buffer
    if (timeDiff > 150) {
      scanBufferRef.current = '';
    }

    scanBufferRef.current += e.key;

    // Reset scanning status after idle
    clearTimeout(scanTimerRef.current);
    scanTimerRef.current = setTimeout(() => {
      if (scanBufferRef.current.length < 3) {
        scanBufferRef.current = '';
      }
    }, 500);
  }, [scannedBarcode, addBarcodeToBatch]);

  const openScanner = () => {
    setShowAddChoice(false);
    setScannedBarcode('');
    setScanStatus('waiting');
    setScanMode('device');
    setUploadPreview(null);
    setUploadError('');
    setMatchedProduct(null);
    setBatchScanned([]);
    setBatchScanning(false);
    setBatchProgress({ done: 0, total: 0 });
    setBatchAdding(false);
    setBatchEditIndex(null);
    scanBufferRef.current = '';
    setShowScanner(true);
  };

  // Global barcode scanner listener — auto-opens scanner modal with batch table
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Skip if any modal is open or user is typing in an input/textarea
      if (showForm || showScanner || showAddChoice) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const now = Date.now();

      if (e.key === 'Enter') {
        e.preventDefault();
        const barcode = globalScanBufferRef.current.trim();
        if (barcode.length >= 3) {
          const matched = lookupBarcode(barcode);
          if (matched) {
            // Existing product — open duplicate stock-in dialog
            setDuplicateProduct(matched);
            setDuplicateQty(1);
          } else {
            // New barcode — open scanner modal with batch table
            if (!showScanner) {
              setShowScanner(true);
              setScanMode('device');
              setScanStatus('waiting');
              setScannedBarcode('');
            }
            addBarcodeToBatch(barcode);
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
  }, [showForm, showScanner, showAddChoice]);

  // Auto-focus scanner input when modal opens
  useEffect(() => {
    if (showScanner && scanMode === 'device' && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [showScanner, scanMode]);


  // All 1D barcode readers for Quagga2
  const quaggaReaders = [
    'code_128_reader',
    'ean_reader',
    'ean_8_reader',
    'upc_reader',
    'upc_e_reader',
    'code_39_reader',
    'code_93_reader',
    'codabar_reader',
    'i2of5_reader',
  ];

  // Scan using Quagga2 with a specific image URL and size
  const tryQuagga = (imageUrl, size, patchSize) => {
    return new Promise((resolve) => {
      Quagga.decodeSingle({
        src: imageUrl,
        numOfWorkers: 0,
        locate: true,
        inputStream: {
          size,
          singleChannel: false,
        },
        locator: {
          patchSize,
          halfSample: true,
        },
        decoder: {
          readers: quaggaReaders,
          multiple: false,
        },
      }, (result) => {
        if (result && result.codeResult && result.codeResult.code) {
          resolve(result.codeResult.code);
        } else {
          resolve(null);
        }
      });
    });
  };

  // Create preprocessed image URL variants for better detection
  const createImageUrls = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const urls = [URL.createObjectURL(file)]; // original

        // Create B&W high contrast version
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
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
        canvas2.width = img.width * 2;
        canvas2.height = img.height * 2;
        const ctx2 = canvas2.getContext('2d');
        ctx2.imageSmoothingEnabled = false;
        ctx2.drawImage(img, 0, 0, canvas2.width, canvas2.height);
        urls.push(canvas2.toDataURL('image/png'));

        // Scaled up 2x + B&W
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

  // Try native BarcodeDetector API (Chrome/Edge built-in)
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

  const processImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;

    setUploadError('');
    setMatchedProduct(null);
    setUploadPreview(URL.createObjectURL(file));
    setScanStatus('scanning');

    let result = null;

    // 1. Try native BarcodeDetector (best for real-world photos in Chrome/Edge)
    result = await tryNativeDetector(file);

    // 2. Try Quagga2 with multiple image variants and settings
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
      setScannedBarcode(result);
      setScanStatus('done');
      setMatchedProduct(lookupBarcode(result));
    } else {
      setScanStatus('waiting');
      setUploadError('Could not detect barcode. Try cropping the image closer to the barcode label.');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageUpload = (e) => {
    processImageFile(e.target.files?.[0]);
  };

  // Batch scan multiple barcode images
  const processBatchImages = async (files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 15);
    if (imageFiles.length === 0) return;

    setBatchScanning(true);
    setBatchProgress({ done: 0, total: imageFiles.length });

    const results = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      let barcode = null;

      // Try native detector first
      barcode = await tryNativeDetector(file);

      // Try Quagga2
      if (!barcode) {
        try {
          const imageUrls = await createImageUrls(file);
          const sizes = [800, 1280, 1920];
          const patchSizes = ['medium', 'large', 'small', 'x-large'];
          for (const url of imageUrls) {
            for (const size of sizes) {
              for (const patchSize of patchSizes) {
                barcode = await tryQuagga(url, size, patchSize);
                if (barcode) break;
              }
              if (barcode) break;
            }
            if (barcode) break;
          }
        } catch { /* skip */ }
      }

      if (barcode) {
        const matched = lookupBarcode(barcode);
        const cat = getCategoryFromBarcode(barcode);
        // Don't add duplicates within same batch
        if (!results.find(r => r.barcode === barcode)) {
          results.push({
            barcode,
            name: matched?.name || (cat === 'Singing Bowl' ? barcode : ''),
            category: matched?.category || cat,
            matched: !!matched,
          });
        }
      }

      setBatchProgress({ done: i + 1, total: imageFiles.length });
    }

    setBatchScanned(prev => {
      const existing = prev.map(p => p.barcode);
      const newItems = results.filter(r => !existing.includes(r.barcode));
      return [...prev, ...newItems];
    });
    setBatchScanning(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [batchAdding, setBatchAdding] = useState(false);
  const [batchAddProgress, setBatchAddProgress] = useState({ done: 0, total: 0 });

  const handleBatchAddAll = async () => {
    const newItems = batchScanned.filter(item => !item.matched);
    if (newItems.length === 0) return;

    setBatchAdding(true);
    setBatchAddProgress({ done: 0, total: newItems.length });

    let added = 0;
    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      try {
        await productsApi.create(api, {
          name: item.name || item.barcode,
          barcode: item.barcode,
          category: item.category || null,
          description: item.description || '',
          cost_price: item.cost_price || '',
          retail_price: item.retail_price || '',
          wholesale_price: item.wholesale_price || '',
          weight: item.weight || '',
          size: item.size || '',
          quantity: Math.max(1, parseInt(item.quantity) || 1),
        }, item.imageFile || null, item.imageFile2 || null);
        added++;
      } catch {
        // Skip items that fail (e.g. barcode already exists)
      }
      setBatchAddProgress({ done: i + 1, total: newItems.length });
    }

    setBatchAdding(false);
    setBatchScanned([]);
    setShowScanner(false);
    fetchProducts();
  };

  const handleBatchEdit = (index) => {
    const item = batchScanned[index];
    const cat = item.category || getCategoryFromBarcode(item.barcode);
    setForm({
      name: item.name || (cat === 'Singing Bowl' ? item.barcode : ''),
      description: item.description || '',
      image_url: '',
      image_url_2: '',
      barcode: item.barcode,
      cost_price: item.cost_price || '',
      retail_price: item.retail_price || '',
      wholesale_price: item.wholesale_price || '',
      category: cat,
      weight: item.weight || '',
      size: item.size || '',
      quantity: item.quantity || 1,
    });
    setImagePreview(item.imagePreview || null);
    setImagePreview2(item.imagePreview2 || null);
    setImageFile(item.imageFile || null);
    setImageFile2(item.imageFile2 || null);
    setEditingProduct(null);
    setBatchEditIndex(index);
    setShowScanner(false);
    setShowForm(true);
  };

  const handleBatchBack = () => {
    setBatchEditIndex(null);
    setShowForm(false);
    setShowScanner(true);
    setScanMode('upload');
  };

  const handleBatchDelete = (index) => {
    setBatchScanned(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 1 && scanMode === 'upload') {
      processBatchImages(files);
    } else if (files[0]) {
      processImageFile(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleScanComplete = () => {
    setShowScanner(false);
    if (matchedProduct) {
      setDuplicateProduct(matchedProduct);
      setDuplicateQty(1);
    } else {
      const cat = getCategoryFromBarcode(scannedBarcode);
      setForm({
        ...form,
        barcode: scannedBarcode,
        name: scannedBarcode,
        category: cat,
      });
      setShowForm(true);
    }
  };

  const handleDuplicateStockIn = async () => {
    if (!duplicateProduct) return;
    try {
      const locsRes = await api.get('/locations');
      const locs = locsRes.data.data;
      const guangzhou = locs.find((l) => l.name === 'Guangzhou Warehouse') || locs[0];
      await api.post('/inventory/stock-in', {
        product_id: duplicateProduct.id,
        location_id: guangzhou.id,
        quantity: duplicateQty,
      });
      setDuplicateProduct(null);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.message || 'Stock in failed');
    }
  };


  // Close location filter dropdown on outside click
  useEffect(() => {
    if (!filterLocationOpen) return;
    const handleClick = (e) => {
      if (filterLocationRef.current && !filterLocationRef.current.contains(e.target)) {
        setFilterLocationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterLocationOpen]);

  // Close quotation dropdowns on outside click
  useEffect(() => {
    if (!quotationCatOpen && !quotationPriceOpen && !quotationLocOpen) return;
    const handleClick = (e) => {
      if (quotationCatOpen && quotationCatRef.current && !quotationCatRef.current.contains(e.target)) {
        setQuotationCatOpen(false);
      }
      if (quotationPriceOpen && quotationPriceRef.current && !quotationPriceRef.current.contains(e.target)) {
        setQuotationPriceOpen(false);
      }
      if (quotationLocOpen && quotationLocRef.current && !quotationLocRef.current.contains(e.target)) {
        setQuotationLocOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [quotationCatOpen, quotationPriceOpen, quotationLocOpen]);

  const handleDownloadQuotation = async () => {
    try {
      const res = await reportsApi.exportQuotation(api, quotationCategory, quotationPriceType, quotationLocation);
      const catName = (quotationCategory || 'All_Products').replace(/\s+/g, '_');
      const locName = quotationLocation ? (locations.find(l => l.id === quotationLocation)?.name?.replace(/\s+/g, '_') || 'Location') : '';
      const priceLabels = { cost_price: 'Cost_Price', retail_price: 'Retail_Price', wholesale_price: 'Wholesale_Price' };
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `${catName}${locName ? '_' + locName : ''}_${priceLabels[quotationPriceType] || 'Price'}_${dateStr}_quotation.xlsx`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setShowQuotation(false);
    } catch (err) {
      console.error('Quotation download error:', err);
      alert('Failed to download quotation');
    }
  };

  const handleManualBarcodeSubmit = () => {
    if (scannedBarcode.trim().length >= 1) {
      addBarcodeToBatch(scannedBarcode.trim());
      setScannedBarcode('');
    }
  };

  // Memoize product grouping by category to avoid recalculation on every render
  const allCats = ['Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries'];
  const productsByCategory = useMemo(() => {
    const map = {};
    for (const cat of allCats) map[cat] = [];
    const uncategorized = [];
    for (const p of products) {
      if (p.category && map[p.category]) map[p.category].push(p);
      else uncategorized.push(p);
    }
    map['Others'] = uncategorized;
    return map;
  }, [products]);

  // Memoize category counts for tabs
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const cat of [...allCats, 'Others']) {
      counts[cat] = (productsByCategory[cat] || []).length;
    }
    return counts;
  }, [productsByCategory]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('products')}</h1>
        <div className="flex items-center gap-2">
          {/* Search toggle + slide-in input */}
          <div className="relative flex items-center">
            <button
              onClick={() => {
                const next = !showSearch;
                setShowSearch(next);
                if (next) {
                  setTimeout(() => searchInputRef.current?.focus(), 310);
                } else {
                  setSearch('');
                }
              }}
              className="w-10 h-10 flex items-center justify-center rounded-[1.2rem] bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors flex-shrink-0"
            >
              {showSearch ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${showSearch ? 'w-64 opacity-100 ml-1' : 'w-0 opacity-0'}`}
            >
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('searchByNameBarcode')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none text-sm"
              />
            </div>
          </div>
          {/* Location filter dropdown */}
          <div className="relative" ref={filterLocationRef}>
            <button
              onClick={() => setFilterLocationOpen(!filterLocationOpen)}
              className={`px-4 py-2 rounded-[1.2rem] font-medium flex items-center gap-1.5 transition-colors ${filterLocation ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm">{filterLocation ? locations.find(l => l.id === filterLocation)?.name || t('location') : t('allLocations')}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${filterLocationOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {filterLocationOpen && (
              <ul className="absolute z-20 mt-1 right-0 w-56 bg-white border border-gray-300 rounded-[1.2rem] shadow-lg overflow-hidden">
                <li
                  onClick={() => { setFilterLocation(''); setFilterLocationOpen(false); }}
                  className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors text-sm ${!filterLocation ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                >
                  {t('allLocations')}
                </li>
                {locations.map(loc => (
                  <li
                    key={loc.id}
                    onClick={() => { setFilterLocation(loc.id); setFilterLocationOpen(false); }}
                    className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors text-sm ${filterLocation === loc.id ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                  >
                    {loc.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => { resetForm(); setShowAddChoice(true); }}
            className="px-4 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
          >
            {t('addProduct')}
          </button>
          <button
            onClick={() => { setQuotationCategory(''); setQuotationPriceType('retail_price'); setQuotationLocation(''); setShowQuotation(true); }}
            className="px-4 py-2 bg-green-700 text-white rounded-[1.2rem] hover:bg-green-800 font-medium"
          >
            {t('downloadQuotation')}
          </button>
        </div>
      </div>

      {/* Add Product Choice Modal */}
      {showAddChoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-2">{t('addNewProduct')}</h2>
            <p className="text-gray-500 text-sm mb-6">{t('chooseHowToAdd')}</p>
            <div className="space-y-3">
              <button
                onClick={() => { setShowAddChoice(false); setShowForm(true); }}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-[1.2rem] border-2 border-gray-200 hover:border-amber-700 hover:bg-amber-50 transition-all duration-200 group"
              >
                <span className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 group-hover:bg-amber-700 group-hover:text-white transition-all duration-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </span>
                <div className="text-left">
                  <span className="block font-semibold text-gray-800">{t('addManually')}</span>
                  <span className="block text-xs text-gray-500">{t('fillByHand')}</span>
                </div>
              </button>
              <button
                onClick={openScanner}
                className="w-full flex items-center gap-3 px-5 py-4 rounded-[1.2rem] border-2 border-gray-200 hover:border-amber-700 hover:bg-amber-50 transition-all duration-200 group"
              >
                <span className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 group-hover:bg-amber-700 group-hover:text-white transition-all duration-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="6" y1="8" x2="6" y2="16" />
                    <line x1="9" y1="8" x2="9" y2="16" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="15" y1="8" x2="15" y2="16" />
                    <line x1="18" y1="8" x2="18" y2="16" />
                  </svg>
                </span>
                <div className="text-left">
                  <span className="block font-semibold text-gray-800">{t('scanBarcode')}</span>
                  <span className="block text-xs text-gray-500">{t('useScanner')}</span>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowAddChoice(false)}
              className="mt-5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`bg-white rounded-2xl shadow-xl p-8 w-full ${batchScanned.length > 0 ? 'max-w-lg' : 'max-w-md'} transition-all`}>
            {/* Status Icon — hide when batch results showing */}
            {batchScanned.length === 0 && (
              <div className="text-center mb-5">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center transition-all duration-300 ${
                  scanStatus === 'done' ? 'bg-green-100' :
                  scanStatus === 'scanning' ? 'bg-amber-100 animate-pulse' :
                  'bg-gray-100'
                }`}>
                  {scanStatus === 'done' ? (
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className={`w-8 h-8 ${scanStatus === 'scanning' ? 'text-amber-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <line x1="6" y1="8" x2="6" y2="16" />
                      <line x1="9" y1="8" x2="9" y2="16" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="15" y1="8" x2="15" y2="16" />
                      <line x1="18" y1="8" x2="18" y2="16" />
                    </svg>
                  )}
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-1">
                  {scanStatus === 'done' ? 'Barcode Scanned!' :
                   scanStatus === 'scanning' ? 'Scanning...' :
                   'Scan Barcode'}
                </h2>
              </div>
            )}

            {/* Tabs: Device / Upload Image */}
            {!(batchScanned.length > 0 && !batchScanning) && (
              <div className="flex mb-5 bg-gray-100 rounded-[1.2rem] p-1">
                <button
                  onClick={() => { setScanMode('device'); setUploadPreview(null); setUploadError(''); }}
                  className={`flex-1 py-2 rounded-[1.2rem] text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
                    scanMode === 'device' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="6" y1="8" x2="6" y2="16" />
                    <line x1="10" y1="8" x2="10" y2="16" />
                    <line x1="14" y1="8" x2="14" y2="16" />
                    <line x1="18" y1="8" x2="18" y2="16" />
                  </svg>
                  Scan Device
                </button>
                <button
                  onClick={() => { setScanMode('upload'); }}
                  className={`flex-1 py-2 rounded-[1.2rem] text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
                    scanMode === 'upload' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upload Image
                </button>
              </div>
            )}

            {/* Device Scan Mode */}
            {scanMode === 'device' && (
              <div>
                <div className="mb-4">
                  <p className="text-gray-500 text-sm mb-2 text-center">
                    {batchScanned.length > 0 ? 'Keep scanning or type barcode manually' : 'Point your barcode scanner at the product or type manually'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      ref={scanInputRef}
                      type="text"
                      defaultValue=""
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = scanInputRef.current?.value?.trim().toUpperCase();
                          if (val && val.length >= 1) {
                            const matched = lookupBarcode(val);
                            if (matched) {
                              setShowScanner(false);
                              setDuplicateProduct(matched);
                              setDuplicateQty(1);
                            } else {
                              addBarcodeToBatch(val);
                            }
                            if (scanInputRef.current) scanInputRef.current.value = '';
                          }
                          scanBufferRef.current = '';
                          lastKeyTimeRef.current = 0;
                          return;
                        }
                      }}
                      className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-[1.2rem] text-center text-sm font-mono tracking-wider focus:outline-none transition-colors uppercase"
                      placeholder="Waiting for scan..."
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = scanInputRef.current?.value?.trim().toUpperCase();
                        if (val && val.length >= 1) {
                          const matched = lookupBarcode(val);
                          if (matched) {
                            setShowScanner(false);
                            setDuplicateProduct(matched);
                            setDuplicateQty(1);
                          } else {
                            addBarcodeToBatch(val);
                          }
                          if (scanInputRef.current) scanInputRef.current.value = '';
                        }
                      }}
                      className="px-4 py-2.5 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium text-sm transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Batch results table — same as upload mode */}
                {batchScanned.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">{batchScanned.length} barcode{batchScanned.length > 1 ? 's' : ''} scanned</p>
                    </div>
                    <div className="overflow-y-auto max-h-[280px] rounded-xl border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 sticky top-0">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Product</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Barcode</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Category</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchScanned.map((item, idx) => (
                            <tr key={idx} className="border-t border-gray-100 hover:bg-amber-50/40">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  {item.matched && (
                                    <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" title="Exists"></span>
                                  )}
                                  <span className={`truncate max-w-[100px] ${item.matched ? 'text-blue-700' : 'text-gray-800'}`}>
                                    {item.name || '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.barcode}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{item.category || '-'}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleBatchEdit(idx)}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleBatchDelete(idx)}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {batchScanned.some(i => i.matched) && (
                      <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                        Already exists in products
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Upload Image Mode — Batch scanning */}
            {scanMode === 'upload' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) processBatchImages(files);
                  }}
                  className="hidden"
                />

                {/* Drop zone / upload area */}
                {!batchScanning && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); processBatchImages(e.dataTransfer.files); }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`border-2 border-dashed rounded-[1.2rem] p-6 cursor-pointer transition-all duration-200 mb-4 ${
                      isDragging
                        ? 'border-amber-500 bg-amber-50 scale-[1.02]'
                        : 'border-gray-300 hover:border-amber-500 hover:bg-amber-50'
                    }`}
                  >
                    <svg className={`w-8 h-8 mx-auto mb-2 transition-colors ${isDragging ? 'text-amber-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600 font-medium text-center">
                      {isDragging ? 'Drop images here' : 'Select or drag up to 15 barcode images'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1 text-center">Upload photos of barcodes to scan in batch</p>
                  </div>
                )}

                {/* Scanning progress */}
                {batchScanning && (
                  <div className="text-center py-6 mb-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-700 mx-auto mb-3"></div>
                    <p className="text-sm text-gray-600 font-medium">Scanning {batchProgress.done} / {batchProgress.total}...</p>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-3 mx-auto max-w-[200px]">
                      <div className="bg-amber-600 h-1.5 rounded-full transition-all" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}></div>
                    </div>
                  </div>
                )}

                {/* Batch results table */}
                {batchScanned.length > 0 && !batchScanning && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">{batchScanned.length} barcode{batchScanned.length > 1 ? 's' : ''} detected</p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-amber-700 hover:text-amber-800 font-medium"
                      >
                        + Scan More
                      </button>
                    </div>
                    <div className="overflow-y-auto max-h-[280px] rounded-xl border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 sticky top-0">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Product</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Barcode</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Category</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchScanned.map((item, idx) => (
                            <tr key={idx} className="border-t border-gray-100 hover:bg-amber-50/40">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  {item.matched && (
                                    <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" title="Exists"></span>
                                  )}
                                  <span className={`truncate max-w-[100px] ${item.matched ? 'text-blue-700' : 'text-gray-800'}`}>
                                    {item.name || '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-600">{item.barcode}</td>
                              <td className="px-3 py-2 text-xs text-gray-500">{item.category || '-'}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleBatchEdit(idx)}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleBatchDelete(idx)}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {batchScanned.some(i => i.matched) && (
                      <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                        Already exists in products
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons — unified for both modes */}
            <div className="flex gap-3 mt-5">
              {batchAdding ? (
                <div className="flex-1 py-2.5 bg-amber-700 text-white rounded-[1.2rem] font-medium text-center flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Adding {batchAddProgress.done}/{batchAddProgress.total}...
                </div>
              ) : (
                <>
                  {batchScanned.filter(i => !i.matched).length > 0 && !batchScanning && (
                    <button
                      onClick={handleBatchAddAll}
                      className="flex-1 py-2.5 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium transition-colors"
                    >
                      Add {batchScanned.filter(i => !i.matched).length} Item{batchScanned.filter(i => !i.matched).length > 1 ? 's' : ''}
                    </button>
                  )}
                  <button
                    onClick={() => { setShowScanner(false); setUploadPreview(null); setBatchScanned([]); }}
                    className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium transition-colors"
                  >
                    {t('cancel')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingProduct ? t('edit') : t('addNewProduct')}
            </h2>
            {form.barcode && !editingProduct && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-[1.2rem] text-sm text-amber-800 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="6" y1="8" x2="6" y2="16" />
                  <line x1="9" y1="8" x2="9" y2="16" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                </svg>
                {t('barcodePrefilled')}: <span className="font-mono font-semibold">{form.barcode}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Row 1: Name + Upload Picture */}
              <div className="flex justify-between items-start">
                <div className="flex-1 max-w-[55%]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('nameRequired')}</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      const autoCat = getCategoryFromBarcode(val);
                      setForm((prev) => ({
                        ...prev,
                        name: val,
                        ...(autoCat && !prev.category ? { category: autoCat } : {}),
                      }));
                    }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={productImageRef}
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      // If no image yet, fill slot 1 first, then slot 2
                      if (!imagePreview && !imageFile) {
                        setImagePreview(URL.createObjectURL(files[0]));
                        setImageFile(files[0]);
                        if (files[1]) {
                          setImagePreview2(URL.createObjectURL(files[1]));
                          setImageFile2(files[1]);
                        }
                      } else if (!imagePreview2 && !imageFile2) {
                        // Slot 1 filled, fill slot 2
                        setImagePreview2(URL.createObjectURL(files[0]));
                        setImageFile2(files[0]);
                      } else {
                        // Both filled — replace both
                        setImagePreview(URL.createObjectURL(files[0]));
                        setImageFile(files[0]);
                        if (files[1]) {
                          setImagePreview2(URL.createObjectURL(files[1]));
                          setImageFile2(files[1]);
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                  {!imagePreview && !imagePreview2 ? (
                    /* No images — single upload button */
                    <button
                      type="button"
                      onClick={() => productImageRef.current?.click()}
                      className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-[1.2rem] flex items-center justify-center hover:border-amber-500 hover:bg-amber-50 transition-colors"
                    >
                      <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 15V3" />
                        <path d="M7 7l5-5 5 5" />
                        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                      </svg>
                    </button>
                  ) : (
                    /* At least one image — show thumbnails */
                    <>
                      <button
                        type="button"
                        onClick={() => productImageRef.current?.click()}
                        className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-[1.2rem] flex items-center justify-center hover:border-amber-500 hover:bg-amber-50 transition-colors overflow-hidden"
                      >
                        {imagePreview ? (
                          <img src={imagePreview} alt="Preview 1" className="w-full h-full object-cover rounded-[1.2rem]" />
                        ) : (
                          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 15V3" />
                            <path d="M7 7l5-5 5 5" />
                            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                          </svg>
                        )}
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        ref={productImageRef2}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setImagePreview2(URL.createObjectURL(file));
                            setImageFile2(file);
                          }
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => productImageRef2.current?.click()}
                        className={`${imagePreview2 ? 'w-20' : 'w-10'} h-20 border-2 border-dashed border-gray-300 rounded-[1.2rem] flex items-center justify-center hover:border-amber-500 hover:bg-amber-50 transition-all overflow-hidden`}
                      >
                        {imagePreview2 ? (
                          <img src={imagePreview2} alt="Preview 2" className="w-full h-full object-cover rounded-[1.2rem]" />
                        ) : (
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                          </svg>
                        )}
                      </button>
                    </>
                  )}
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
                    <span className={form.category ? 'text-gray-900' : 'text-gray-400'}>
                      {td(form.category) || t('selectCategory')}
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
                            setForm((prev) => ({ ...prev, category: option, ...(option === 'Singing Bowl' ? { name: prev.barcode } : {}) }));
                            setShowCategoryDropdown(false);
                          }}
                          className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors ${form.category === option ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
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
                    value={form.barcode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      const autoCat = getCategoryFromBarcode(val);
                      setForm((prev) => ({
                        ...prev,
                        barcode: val,
                        name: val,
                        ...(autoCat ? { category: autoCat } : {}),
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none font-mono uppercase"
                  />
                </div>
              </div>

              {/* Row 3: Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('description')}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                />
              </div>

              {/* Row 4: Weight, Size, Qty */}
              <div className={`grid ${form.category === 'Thanka' || form.category === 'Thanka Locket' || form.category === 'Jewelleries' ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                {form.category !== 'Thanka' && form.category !== 'Thanka Locket' && form.category !== 'Jewelleries' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('weight')}</label>
                  <input
                    type="text"
                    value={form.weight}
                    onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('size')}</label>
                  <input
                    type="text"
                    value={form.size}
                    onChange={(e) => setForm((prev) => ({ ...prev, size: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, quantity: Math.max(1, (parseInt(prev.quantity) || 1) - 1) }))}
                      className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 text-lg font-bold"
                    >-</button>
                    <input
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                      onBlur={() => setForm((prev) => ({ ...prev, quantity: Math.max(1, parseInt(prev.quantity) || 1) }))}
                      className="w-full px-2 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none text-center font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, quantity: (parseInt(prev.quantity) || 1) + 1 }))}
                      className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 text-lg font-bold"
                    >+</button>
                  </div>
                </div>
              </div>

              {/* Row 5: Cost Price, Wholesale Price, Retail Price */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('costPrice')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('wholesale')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.wholesale_price}
                    onChange={(e) => setForm((prev) => ({ ...prev, wholesale_price: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('retailPrice')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.retail_price}
                    onChange={(e) => setForm((prev) => ({ ...prev, retail_price: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[1.2rem] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                {batchEditIndex !== null ? (
                  <>
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
                    >
                      Save & Back
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchBack}
                      className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
                    >
                      Back
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
                    >
                      {editingProduct ? t('update') : t('create')}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
                    >
                      {t('cancel')}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[...allCats, 'Others'].map(cat => {
          const totalQty = categoryCounts[cat];
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
        })}
      </div>

      {/* Products Tables — grouped by category */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {allCats
            .filter((cat) => !filterCategory || filterCategory === cat)
            .map((cat) => {
              const catProducts = productsByCategory[cat];
              if (catProducts.length === 0) return null;
              const limit = visibleRows[cat] || ROWS_PER_PAGE;
              const visibleProducts = catProducts.slice(0, limit);
              const hasMore = catProducts.length > limit;
              return (
                <div key={cat}>
                  <h2 className="text-lg font-bold text-gray-800 mb-3">
                    {td(cat)} <span className="text-sm font-bold text-gray-400 ml-2">&nbsp;| &nbsp; {catProducts.length} QTY</span>
                  </h2>
                  <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('image')}</th>
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('name')}</th>
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('barcode')}</th>
                          {(cat === 'Thanka' || cat === 'Thanka Locket') && <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('description')}</th>}
                          {cat !== 'Thanka' && cat !== 'Thanka Locket' && cat !== 'Jewelleries' && <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('weight')}</th>}
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('size')}</th>
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('cost')}</th>
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('wholesale')}</th>
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('retail')}</th>
                          <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProducts.map((p) => (
                          <tr key={p.id} className="transition-colors hover:bg-amber-50/60">
                            <td className="px-5 py-4 border-b border-gray-100">
                              {(() => {
                                const imgs = [getImageUrl(p.image_url), getImageUrl(p.image_url_2)].filter(Boolean);
                                return imgs.length > 0 ? (
                                  <div className="relative w-10 h-10">
                                    <img
                                      src={imgs[0]}
                                      alt={p.name}
                                      loading="lazy"
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
                            <td className="px-5 py-4 border-b border-gray-100 text-sm font-medium text-gray-800">{p.name}</td>
                            <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600 font-mono">{p.barcode || '-'}</td>
                            {(cat === 'Thanka' || cat === 'Thanka Locket') && (
                              <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">
                                {p.description ? (
                                  <button
                                    onClick={() => setDescriptionPopup({ name: p.name, description: p.description })}
                                    className="text-amber-700 hover:text-amber-900 underline underline-offset-2 text-left truncate max-w-[150px] block"
                                    title={p.description}
                                  >
                                    {p.description.length > 20 ? p.description.slice(0, 20) + '...' : p.description}
                                  </button>
                                ) : '-'}
                              </td>
                            )}
                            {cat !== 'Thanka' && cat !== 'Thanka Locket' && cat !== 'Jewelleries' && <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{p.weight || '-'}</td>}
                            <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{p.size || '-'}</td>
                            <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{parseFloat(p.cost_price || 0).toFixed(2)}</td>
                            <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{parseFloat(p.wholesale_price || 0).toFixed(2)}</td>
                            <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{parseFloat(p.retail_price || 0).toFixed(2)}</td>
                            <td className="px-5 py-4 border-b border-gray-100 text-sm">
                              <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                              <button onClick={() => setDeleteProduct(p)} className="text-red-600 hover:text-red-800">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hasMore && (
                    <button
                      onClick={() => setVisibleRows(prev => ({ ...prev, [cat]: limit + ROWS_PER_PAGE }))}
                      className="w-full mt-2 py-2 text-sm font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-[1.2rem] transition-colors"
                    >
                      Show More ({catProducts.length - limit} remaining)
                    </button>
                  )}
                </div>
              );
            })}
          {/* Uncategorized products */}
          {(() => {
            const uncategorized = productsByCategory['Others'];
            if ((filterCategory && filterCategory !== 'Others') || uncategorized.length === 0) return null;
            const othersLimit = visibleRows['Others'] || ROWS_PER_PAGE;
            const visibleOthers = uncategorized.slice(0, othersLimit);
            const othersHasMore = uncategorized.length > othersLimit;
            return (
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-3">
                  {t('other')} <span className="text-sm font-bold text-gray-400 ml-2">&nbsp;| &nbsp; {uncategorized.length} QTY</span>
                </h2>
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-gray-50/80">
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('image')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('name')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('barcode')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('weight')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('size')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('cost')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('wholesale')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('retail')}</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOthers.map((p) => (
                        <tr key={p.id} className="transition-colors hover:bg-amber-50/60">
                          <td className="px-5 py-4 border-b border-gray-100">
                            {(() => {
                              const imgs = [getImageUrl(p.image_url), getImageUrl(p.image_url_2)].filter(Boolean);
                              return imgs.length > 0 ? (
                                <div className="relative w-10 h-10">
                                  <img
                                    src={imgs[0]}
                                    alt={p.name}
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
                          <td className="px-5 py-4 border-b border-gray-100 text-sm font-medium text-gray-800">{p.name}</td>
                          <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600 font-mono">{p.barcode || '-'}</td>
                          <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{p.weight || '-'}</td>
                          <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{p.size || '-'}</td>
                          <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{parseFloat(p.cost_price || 0).toFixed(2)}</td>
                          <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{parseFloat(p.wholesale_price || 0).toFixed(2)}</td>
                          <td className="px-5 py-4 border-b border-gray-100 text-sm text-gray-600">{parseFloat(p.retail_price || 0).toFixed(2)}</td>
                          <td className="px-5 py-4 border-b border-gray-100 text-sm">
                            <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                            <button onClick={() => setDeleteProduct(p)} className="text-red-600 hover:text-red-800">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {othersHasMore && (
                  <button
                    onClick={() => setVisibleRows(prev => ({ ...prev, Others: othersLimit + ROWS_PER_PAGE }))}
                    className="w-full mt-2 py-2 text-sm font-medium text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-[1.2rem] transition-colors"
                  >
                    Show More ({uncategorized.length - othersLimit} remaining)
                  </button>
                )}
              </div>
            );
          })()}
          {products.length === 0 && (
            <div className="bg-white rounded-[1.2rem] shadow p-8 text-center text-gray-500">
              {t('noProductsFound')}
            </div>
          )}
        </div>
      )}
      {/* Duplicate Product Popup */}
      {duplicateProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.2rem] shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-2">{t('productAlreadyExists')}</h3>
            <p className="text-gray-600 mb-4">
              Do you want to add <span className="font-semibold">{duplicateProduct.name}</span> again?
            </p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('quantity')}</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateQty(Math.max(1, duplicateQty - 1))}
                  className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-[1.2rem] text-lg font-bold text-gray-600 hover:bg-gray-100"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  value={duplicateQty}
                  onChange={(e) => setDuplicateQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-[1.2rem] text-center focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDuplicateQty(duplicateQty + 1)}
                  className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-[1.2rem] text-lg font-bold text-gray-600 hover:bg-gray-100"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDuplicateStockIn}
                className="flex-1 py-2 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium"
              >
                {t('addStock')}
              </button>
              <button
                onClick={() => setDuplicateProduct(null)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Popup */}
      {deleteProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.2rem] shadow-xl p-6 w-full max-w-sm text-center">
            <h3 className="text-lg font-bold text-gray-800 mb-2">{t('deleteProduct')}</h3>
            <p className="text-gray-600 mb-5">
              Are you sure you want to delete <span className="font-semibold">{deleteProduct.name}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                className="flex-1 py-2 bg-red-600 text-white rounded-[1.2rem] hover:bg-red-700 font-medium"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteProduct(null)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Quotation Popup */}
      {showQuotation && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowQuotation(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 mb-2">{t('downloadQuotation')}</h2>
            <p className="text-gray-500 text-sm mb-5">{t('whichQuotation')}</p>

            {/* Category Dropdown */}
            <div className="mb-4 relative" ref={quotationCatRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('category')}</label>
              <button
                type="button"
                onClick={() => { setQuotationCatOpen(!quotationCatOpen); setQuotationPriceOpen(false); }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-[1.2rem] bg-white text-left flex items-center justify-between focus:outline-none"
              >
                <span className={quotationCategory ? 'text-gray-900' : 'text-gray-400'}>
                  {td(quotationCategory) || t('allCategories')}
                </span>
                <svg className={`w-4 h-4 text-gray-500 transition-transform ${quotationCatOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {quotationCatOpen && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-[1.2rem] shadow-lg overflow-hidden">
                  <li
                    onClick={() => { setQuotationCategory(''); setQuotationCatOpen(false); }}
                    className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors text-sm ${!quotationCategory ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                  >
                    {t('allCategories')}
                  </li>
                  {['Singing Bowl', 'Thanka', 'Thanka Locket', 'Jewelleries'].map((cat) => (
                    <li
                      key={cat}
                      onClick={() => { setQuotationCategory(cat); setQuotationCatOpen(false); }}
                      className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors text-sm ${quotationCategory === cat ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                    >
                      {td(cat)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Location Dropdown */}
            <div className="mb-4 relative" ref={quotationLocRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('location')}</label>
              <button
                type="button"
                onClick={() => { setQuotationLocOpen(!quotationLocOpen); setQuotationCatOpen(false); setQuotationPriceOpen(false); }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-[1.2rem] bg-white text-left flex items-center justify-between focus:outline-none"
              >
                <span className={quotationLocation ? 'text-gray-900' : 'text-gray-400'}>
                  {quotationLocation ? locations.find(l => l.id === quotationLocation)?.name || t('allLocations') : t('allLocations')}
                </span>
                <svg className={`w-4 h-4 text-gray-500 transition-transform ${quotationLocOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {quotationLocOpen && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-[1.2rem] shadow-lg overflow-hidden">
                  <li
                    onClick={() => { setQuotationLocation(''); setQuotationLocOpen(false); }}
                    className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors text-sm ${!quotationLocation ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                  >
                    {t('allLocations')}
                  </li>
                  {locations.map(loc => (
                    <li
                      key={loc.id}
                      onClick={() => { setQuotationLocation(loc.id); setQuotationLocOpen(false); }}
                      className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors text-sm ${quotationLocation === loc.id ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                    >
                      {loc.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Price List Dropdown */}
            <div className="mb-5 relative" ref={quotationPriceRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('priceList')}</label>
              <button
                type="button"
                onClick={() => { setQuotationPriceOpen(!quotationPriceOpen); setQuotationCatOpen(false); }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-[1.2rem] bg-white text-left flex items-center justify-between focus:outline-none"
              >
                <span className="text-gray-900">
                  {{ cost_price: t('costPriceList'), retail_price: t('retailPriceList'), wholesale_price: t('wholesalePriceList') }[quotationPriceType]}
                </span>
                <svg className={`w-4 h-4 text-gray-500 transition-transform ${quotationPriceOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {quotationPriceOpen && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-[1.2rem] shadow-lg overflow-hidden">
                  {[
                    { key: 'cost_price', label: t('costPriceList') },
                    { key: 'retail_price', label: t('retailPriceList') },
                    { key: 'wholesale_price', label: t('wholesalePriceList') },
                  ].map((opt) => (
                    <li
                      key={opt.key}
                      onClick={() => { setQuotationPriceType(opt.key); setQuotationPriceOpen(false); }}
                      className={`px-4 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors text-sm ${quotationPriceType === opt.key ? 'bg-amber-100 text-amber-800 font-medium' : 'text-gray-700'}`}
                    >
                      {opt.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={handleDownloadQuotation}
              className="w-full py-2.5 bg-green-700 text-white rounded-[1.2rem] hover:bg-green-800 font-medium transition-colors flex items-center justify-center gap-2 mb-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t('downloadExcel')}
            </button>
            <button
              onClick={() => setShowQuotation(false)}
              className="w-full py-2.5 bg-gray-200 text-gray-700 rounded-[1.2rem] hover:bg-gray-300 font-medium transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Description Popup */}
      {descriptionPopup && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setDescriptionPopup(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">{descriptionPopup.name}</h3>
              <button
                onClick={() => setDescriptionPopup(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{descriptionPopup.description}</p>
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
            {/* Previous button */}
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
            {/* Next button */}
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
            {/* Dot indicators */}
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
