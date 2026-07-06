import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../../contexts/CurrencyContext.jsx";
import { loadInvoices } from "../../../utils/invoiceSync.js";

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

// Grand total of a single invoice in its OWN currency — mirrors the backend's
// calculateInvoiceAmount so the numbers match the invoices page exactly.
function invoiceTotal(inv) {
  const items = inv.items || [];
  const itemsTotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const commission = items.reduce((s, it) => {
    const base = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    return s + base * ((Number(it.commission) || 0) / 100);
  }, 0);
  return itemsTotal + commission
    + (Number(inv.customsDuty) || 0)
    + (Number(inv.documentationCharges) || 0)
    + (Number(inv.otherCharges) || 0)
    + (Number(inv.transportCost) || 0);
}

function invoiceDate(inv) {
  const v = inv.invoiceDate || inv._serverUpdatedAt || inv.generatedAt;
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

const statusBadge = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "sent") return "bg-[#E9F8ED] text-[#1C9B55]";
  if (s === "paid") return "bg-[#E9F8ED] text-[#1C9B55]";
  if (s === "pending") return "bg-[#FFF5E8] text-[#B99353]";
  return "bg-[#412460]/10 text-[#412460]";
};

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { formatCurrency, currency, exchangeRates } = useCurrency();
  const [invoices, setInvoices] = useState([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { invoices: list } = await loadInvoices();
        if (!cancelled) setInvoices(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setInvoices([]);
      }

      try {
        const res = await fetch(`${API_URL}/inventory/auth/users`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("staff_token") || ""}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setCustomerCount((data.data || []).length);
      } catch {
        /* leave customer count at 0 */
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Convert an amount from its own currency into USD using the live rates, so
  // totals across mixed-currency invoices can be summed and displayed.
  const toUSD = (amount, from) => {
    const rates = exchangeRates || {};
    const fromRate = Number(rates[from]) || 1;
    return (Number(amount) || 0) / fromRate;
  };

  const stats = useMemo(() => {
    const now = new Date();
    let totalUSD = 0;
    let monthCount = 0;
    const byStatus = {};

    for (const inv of invoices) {
      const cur = inv.currency || inv.originalCurrency || "USD";
      totalUSD += toUSD(invoiceTotal(inv), cur);

      const d = invoiceDate(inv);
      if (d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) monthCount += 1;

      const s = inv.status || "Generated";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    const recent = [...invoices]
      .sort((a, b) => (invoiceDate(b)?.getTime() || 0) - (invoiceDate(a)?.getTime() || 0))
      .slice(0, 6);

    return { totalUSD, monthCount, byStatus, recent, count: invoices.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, exchangeRates]);

  const cards = [
    { label: "Total Invoices", value: String(stats.count), detail: "Invoices you created", accent: "bg-[#412460]", tone: "text-white" },
    { label: "Total Value", value: formatCurrency(stats.totalUSD), detail: `In ${currency}`, accent: "bg-[#E5E1DA]", tone: "text-[#2D2D2D]" },
    { label: "This Month", value: String(stats.monthCount), detail: "Invoices this month", accent: "border border-[#E1E3EE] bg-white", tone: "text-[#2D2D2D]" },
    { label: "Your Customers", value: String(customerCount), detail: "Customers you enrolled", accent: "bg-[#E5E1DA]", tone: "text-[#2D2D2D]" },
  ];

  const statusEntries = Object.entries(stats.byStatus);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((stat) => (
            <div key={stat.label} className={`${stat.accent} ${stat.tone} rounded-[2rem] p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]`}>
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${stat.tone === "text-white" ? "bg-white/14" : "bg-[#412460] text-white"}`}>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </div>
              </div>
              <p className={`mt-4 text-xs font-medium ${stat.tone === "text-white" ? "text-white/70" : "text-[#2D2D2D]/45"}`}>{stat.label}</p>
              <p className="mt-2 text-3xl font-bold">{loading ? "—" : stat.value}</p>
              <p className={`mt-1 text-[11px] ${stat.tone === "text-white" ? "text-white/55" : "text-[#2D2D2D]/40"}`}>{stat.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent Invoices</h2>
              <p className="text-xs text-[#2D2D2D]/40">Your latest invoices.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/staff-invoices")}
              className="rounded-full bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
            >
              View all invoices
            </button>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-[#2D2D2D]/35">
                <tr>
                  <th className="py-3 font-semibold">Invoice</th>
                  <th className="py-3 font-semibold">Customer</th>
                  <th className="py-3 font-semibold">Amount ({currency})</th>
                  <th className="py-3 font-semibold">Status</th>
                  <th className="py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-10 text-center text-[#2D2D2D]/45">Loading...</td></tr>
                ) : stats.recent.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-[#2D2D2D]/45">No invoices yet. Create your first invoice.</td></tr>
                ) : (
                  stats.recent.map((inv) => {
                    const cur = inv.currency || inv.originalCurrency || "USD";
                    const d = invoiceDate(inv);
                    return (
                      <tr key={inv.invoiceNumber || inv.id} className="border-t border-[#EAE8E5]">
                        <td className="py-3 font-semibold text-[#2D2D2D]/60">{inv.invoiceNumber || "—"}</td>
                        <td className="py-3 font-semibold text-[#2D2D2D]">{inv.customerName || inv.customer || "—"}</td>
                        <td className="py-3 text-[#2D2D2D]/60">{formatCurrency(toUSD(invoiceTotal(inv), cur))}</td>
                        <td className="py-3">
                          <span className={`rounded-full px-2.5 py-1 font-semibold ${statusBadge(inv.status)}`}>{inv.status || "Generated"}</span>
                        </td>
                        <td className="py-3 text-[#2D2D2D]/45">{d ? d.toLocaleDateString() : "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[2rem] bg-[#E5E1DA] p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]">
          <h2 className="text-lg font-semibold">Invoices by Status</h2>
          <p className="text-xs text-[#2D2D2D]/40">A breakdown of your invoices.</p>
          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="text-sm text-[#2D2D2D]/45">Loading...</p>
            ) : statusEntries.length === 0 ? (
              <p className="text-sm text-[#2D2D2D]/45">No invoices yet.</p>
            ) : (
              statusEntries.map(([status, count]) => {
                const pct = stats.count ? Math.round((count / stats.count) * 100) : 0;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#2D2D2D]/65">{status}</span>
                      <span className="font-bold text-[#2D2D2D]">{count}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-[#412460]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_14px_35px_rgba(45,45,45,0.04)]">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => navigate("/staff-invoices/create")}
              className="w-full rounded-2xl bg-[#412460] px-4 py-3 text-left text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
            >
              + Create new invoice
            </button>
            <button
              type="button"
              onClick={() => navigate("/staff-managements")}
              className="w-full rounded-2xl border border-[#E1E3EE] bg-white px-4 py-3 text-left text-sm font-semibold text-[#412460] transition-colors hover:border-[#B99353] hover:text-[#B99353]"
            >
              Manage your customers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
