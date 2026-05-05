import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiGetJson, authFetch } from '../utils/apiBase';

const CurrencyContext = createContext();

const DEFAULT_RATES = {
  USD: 1,
  CNY: 7.24,
  NPR: 135.50,
};

const CURRENCY_SYMBOLS = {
  USD: '$',
  CNY: '¥',
  NPR: '₨',
};

const RATES_STORAGE_KEY = 'cellzen_exchange_rates';

function readCachedRates() {
  if (typeof window === 'undefined') return DEFAULT_RATES;
  try {
    const saved = window.localStorage.getItem(RATES_STORAGE_KEY);
    if (!saved) return DEFAULT_RATES;
    const parsed = JSON.parse(saved);
    return { ...DEFAULT_RATES, ...parsed };
  } catch {
    return DEFAULT_RATES;
  }
}

function writeCachedRates(rates) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // localStorage may be disabled (private mode); fall through silently.
  }
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('CNY');
  // Seed from localStorage so existing UI doesn't flash defaults on first render,
  // then reconcile with the database below.
  const [exchangeRates, setExchangeRates] = useState(readCachedRates);

  // Mirror to localStorage so subsequent loads are instant even before the
  // network call resolves.
  useEffect(() => {
    writeCachedRates(exchangeRates);
  }, [exchangeRates]);

  // Pull authoritative rates from the database on mount. The database is the
  // source of truth across browsers/devices; localStorage is only a cache.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { res, data } = await apiGetJson('/inventory/settings/exchange-rates');
        if (cancelled) return;
        if (res.ok && data && data.success && data.data) {
          setExchangeRates((prev) => ({ ...prev, ...data.data }));
        }
      } catch {
        // Network error — keep cached values, no UI disruption.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Update both context and database. Optimistic local update so the UI
  // responds immediately; failures roll back to the previous values.
  const updateExchangeRates = useCallback(async (newRates) => {
    let previous;
    setExchangeRates((prev) => {
      previous = prev;
      return { ...prev, ...newRates };
    });

    try {
      const merged = { ...previous, ...newRates };
      const res = await authFetch('/inventory/settings/exchange-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.success && data.data) {
        setExchangeRates((prev) => ({ ...prev, ...data.data }));
      } else if (!res.ok) {
        setExchangeRates(previous);
        throw new Error(data?.message || 'Failed to save exchange rates');
      }
    } catch (err) {
      setExchangeRates(previous);
      throw err;
    }
  }, []);

  // Convert from any currency to USD (for storage)
  const convertToUSD = useCallback((amount, fromCurrency = 'USD') => {
    if (!amount || isNaN(amount)) return 0;
    return parseFloat(amount) / exchangeRates[fromCurrency];
  }, [exchangeRates]);

  // Convert from USD to any currency (for display)
  const convertFromUSD = useCallback((amount, toCurrency = 'USD') => {
    if (!amount || isNaN(amount)) return 0;
    return (parseFloat(amount) * exchangeRates[toCurrency]).toFixed(2);
  }, [exchangeRates]);

  // Convert and format for display in current currency
  const formatCurrency = useCallback((amountInUSD) => {
    if (!amountInUSD || isNaN(amountInUSD)) return `${CURRENCY_SYMBOLS[currency]} 0.00`;
    const converted = (parseFloat(amountInUSD) * exchangeRates[currency]).toFixed(2);
    return `${CURRENCY_SYMBOLS[currency]} ${converted}`;
  }, [currency, exchangeRates]);

  const value = {
    currency,
    setCurrency,
    convertToUSD,
    convertFromUSD,
    formatCurrency,
    exchangeRates,
    updateExchangeRates,
    currencySymbols: CURRENCY_SYMBOLS,
    availableCurrencies: Object.keys(exchangeRates),
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

export default CurrencyContext;
