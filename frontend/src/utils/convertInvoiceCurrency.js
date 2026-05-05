// Convert all monetary values on an invoice from its original currency to a
// target currency, using the supplied exchange rate map.
//
// Rates are stored as "1 USD = X currency", so:
//   amountInUSD    = amount / rates[fromCurrency]
//   amountInTarget = amountInUSD * rates[toCurrency]
//
// Five fields hold currency values:
//   - items[].unitPrice     (per-product price; line totals derive from this)
//   - customsDuty
//   - documentationCharges
//   - otherCharges
//   - transportCost
//
// quantity, commission %, weight, and CBM are NOT currencies and are left
// untouched. The grand total / in-words / per-line totals are derived
// downstream and self-correct once the inputs above are converted.

const DEFAULT_RATES = { USD: 1, CNY: 7.24, NPR: 135.5 };

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

export function convertAmount(amount, fromCurrency, toCurrency, rates = DEFAULT_RATES) {
  const value = toNumber(amount);
  if (value === 0) return 0;
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return value;
  const from = rates[fromCurrency];
  const to = rates[toCurrency];
  if (!from || !to) return value;
  return (value / from) * to;
}

// Returns a new invoice object with the 5 monetary fields scaled into the
// target currency. The original invoice is not mutated. Currency metadata on
// the returned invoice is updated so downstream consumers see `currency` as
// the new target.
export function convertInvoiceCurrency(invoice, targetCurrency, rates = DEFAULT_RATES) {
  if (!invoice) return invoice;
  const raw = invoice.rawData || {};
  const fromCurrency =
    raw.originalCurrency || raw.currency || invoice.originalCurrency || invoice.currency || 'USD';

  if (!targetCurrency || fromCurrency === targetCurrency) {
    // Nothing to convert — but still ensure currency metadata is consistent.
    return {
      ...invoice,
      currency: targetCurrency || fromCurrency,
      rawData: {
        ...raw,
        currency: targetCurrency || fromCurrency,
        originalCurrency: fromCurrency,
      },
    };
  }

  const conv = (v) => convertAmount(v, fromCurrency, targetCurrency, rates);

  const convertedItems = (raw.items || []).map((it) => ({
    ...it,
    unitPrice: conv(it.unitPrice),
  }));

  return {
    ...invoice,
    currency: targetCurrency,
    rawData: {
      ...raw,
      items: convertedItems,
      customsDuty: conv(raw.customsDuty),
      documentationCharges: conv(raw.documentationCharges),
      otherCharges: conv(raw.otherCharges),
      transportCost: conv(raw.transportCost),
      currency: targetCurrency,
      // Preserve the original so future re-conversions are still possible.
      originalCurrency: fromCurrency,
    },
  };
}

export default convertInvoiceCurrency;
