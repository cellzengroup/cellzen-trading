import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

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

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState('USD');
  const [exchangeRates, setExchangeRates] = useState(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('cellzen_exchange_rates');
    return saved ? JSON.parse(saved) : DEFAULT_RATES;
  });

  // Save to localStorage whenever rates change
  useEffect(() => {
    localStorage.setItem('cellzen_exchange_rates', JSON.stringify(exchangeRates));
  }, [exchangeRates]);

  const updateExchangeRates = useCallback((newRates) => {
    setExchangeRates(prev => ({ ...prev, ...newRates }));
  }, []);

  // Convert from any currency to USD (for storage)
  const convertToUSD = useCallback((amount, fromCurrency = 'USD') => {
    if (!amount || isNaN(amount)) return 0;
    const amountInUSD = parseFloat(amount) / exchangeRates[fromCurrency];
    return amountInUSD.toFixed(2);
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
