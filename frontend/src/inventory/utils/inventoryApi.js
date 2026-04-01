// Centralized API call functions used by pages
// These are helper functions that accept an api (axios) instance

const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '' : 'http://localhost:5300');

// Server origin for static files (uploads) — strip /api suffix from API_BASE
const SERVER_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

// Resolve image URLs — converts relative /uploads/... paths to full URLs in development
export const getImageUrl = (url) => {
  if (!url) return null;
  // blob: URLs are ephemeral and invalid after the session that created them
  if (url.startsWith('blob:')) return null;
  if (url.startsWith('http')) return url;
  return `${SERVER_ORIGIN}${url}`;
};

export const productsApi = {
  getAll: (api, search = '') => api.get(`/products${search ? `?search=${search}` : ''}`),
  getById: (api, id) => api.get(`/products/${id}`),
  create: (api, data, imageFile, imageFile2) => {
    if (imageFile || imageFile2) {
      const formData = new FormData();
      if (imageFile) formData.append('image', imageFile);
      if (imageFile2) formData.append('image2', imageFile2);
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined && val !== null && key !== 'image_url' && key !== 'image_url_2') formData.append(key, val);
      });
      return api.post('/products', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    const cleanData = { ...data };
    if (!cleanData.image_url) delete cleanData.image_url;
    if (!cleanData.image_url_2) delete cleanData.image_url_2;
    return api.post('/products', cleanData);
  },
  update: (api, id, data, imageFile, imageFile2) => {
    if (imageFile || imageFile2) {
      const formData = new FormData();
      if (imageFile) formData.append('image', imageFile);
      if (imageFile2) formData.append('image2', imageFile2);
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined && val !== null && key !== 'image_url' && key !== 'image_url_2') formData.append(key, val);
      });
      return api.put(`/products/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    }
    return api.put(`/products/${id}`, data);
  },
  delete: (api, id) => api.delete(`/products/${id}`),
};

export const locationsApi = {
  getAll: (api) => api.get('/locations'),
  create: (api, data) => api.post('/locations', data),
  update: (api, id, data) => api.put(`/locations/${id}`, data),
  delete: (api, id) => api.delete(`/locations/${id}`),
};

export const inventoryApi = {
  getAll: (api, locationId = '') => api.get(`/inventory${locationId ? `?location_id=${locationId}` : ''}`),
  stockIn: (api, data) => api.post('/inventory/stock-in', data),
  transfer: (api, data) => api.post('/inventory/transfer', data),
  sale: (api, data) => api.post('/inventory/sale', data),
};

export const reportsApi = {
  getTransactions: (api, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/reports/transactions${query ? `?${query}` : ''}`);
  },
  getSummary: (api) => api.get('/reports/summary'),
  exportExcel: (api, locationId = '') => {
    return api.get(`/reports/export/excel${locationId ? `?location_id=${locationId}` : ''}`, {
      responseType: 'blob',
    });
  },
  exportQuotation: (api, category = '', priceType = 'retail_price', locationId = '') => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (priceType) params.append('price_type', priceType);
    if (locationId) params.append('location_id', locationId);
    const query = params.toString();
    return api.get(`/reports/export/quotation${query ? `?${query}` : ''}`, {
      responseType: 'blob',
    });
  },
  exportTransfers: (api, locationId = '') => {
    return api.get(`/reports/export/transfers${locationId ? `?location_id=${locationId}` : ''}`, {
      responseType: 'blob',
    });
  },
  exportSales: (api, { locationId, startDate, endDate } = {}) => {
    const params = new URLSearchParams();
    if (locationId) params.append('location_id', locationId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const query = params.toString();
    return api.get(`/reports/export/sales${query ? `?${query}` : ''}`, {
      responseType: 'blob',
    });
  },
};
