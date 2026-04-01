import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { locationsApi } from '../utils/inventoryApi';
import { useLanguage } from '../context/LanguageContext';

const typeConfig = {
  warehouse: { key: 'warehouse', color: 'bg-blue-100 text-blue-800', icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z' },
  shop: { key: 'shop', color: 'bg-green-100 text-green-800', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  exhibition: { key: 'exhibition', color: 'bg-purple-100 text-purple-800', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
};

export default function LocationsPage() {
  const api = useApi();
  const { t } = useLanguage();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'warehouse' });
  const [error, setError] = useState('');

  const fetchLocations = async () => {
    try {
      const res = await locationsApi.getAll(api);
      setLocations(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const resetForm = () => {
    setForm({ name: '', type: 'warehouse' });
    setEditingLocation(null);
    setShowForm(false);
    setError('');
  };

  const handleEdit = (location) => {
    setForm({ name: location.name, type: location.type });
    setEditingLocation(location);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingLocation) {
        await locationsApi.update(api, editingLocation.id, form);
      } else {
        await locationsApi.create(api, form);
      }
      resetForm();
      fetchLocations();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save location');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('deleteLocationConfirm'))) return;
    try {
      await locationsApi.delete(api, id);
      fetchLocations();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete location');
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('locations')}</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-amber-700 text-white rounded-[2.2rem] hover:bg-amber-800 font-medium"
        >
          {t('addLocation')}
        </button>
      </div>

      {/* Location Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.2rem] shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingLocation ? t('editLocation') : t('addNewLocation')}
            </h2>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-[2.2rem] text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('name')} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="e.g. Guangzhou Warehouse"
                  className="w-full px-3 py-2 border border-gray-300 rounded-[2.2rem] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('type')} *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(typeConfig).map(([key, config]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm({ ...form, type: key })}
                      className={`flex flex-col items-center gap-1 p-3 rounded-[2.2rem] border-2 transition-all duration-200 ${
                        form.type === key
                          ? 'border-amber-700 bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <svg className={`w-6 h-6 ${form.type === key ? 'text-amber-700' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                      </svg>
                      <span className={`text-xs font-medium ${form.type === key ? 'text-amber-700' : 'text-gray-500'}`}>
                        {t(config.key)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-700 text-white rounded-[2.2rem] hover:bg-amber-800 font-medium"
                >
                  {editingLocation ? t('update') : t('create')}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-[2.2rem] hover:bg-gray-300 font-medium"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Locations Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-700"></div>
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {t('noLocationsYet')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => {
            const config = typeConfig[loc.type] || typeConfig.warehouse;
            return (
              <div key={loc.id} className="bg-white rounded-[2.2rem] shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-[2.2rem] flex items-center justify-center ${config.color}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">{loc.name}</h3>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mt-1 ${config.color}`}>
                        {t(config.key)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleEdit(loc)}
                    className="flex-1 text-sm py-1.5 text-blue-600 bg-blue-50 rounded-[2.2rem] hover:bg-blue-100 font-medium transition-colors"
                  >
                    {t('edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(loc.id)}
                    className="flex-1 text-sm py-1.5 text-red-600 bg-red-50 rounded-[2.2rem] hover:bg-red-100 font-medium transition-colors"
                  >
                    {t('delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
