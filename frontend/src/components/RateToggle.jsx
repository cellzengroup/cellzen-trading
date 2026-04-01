import React from "react";

export default function RateToggle({ currency, setCurrency, className = "" }) {
  return (
    <button
      type="button"
      className={`rounded-full border border-white/20 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/10 ${className}`}
      onClick={() => setCurrency(currency === "USD" ? "CNY" : "USD")}
    >
      {currency === "USD" ? "USD $" : "CNY ¥"}
    </button>
  );
}
