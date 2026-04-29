import React, { useEffect, useState } from "react";
import { generateInvoiceExcel } from "../../../utils/generateCellzenInvoice.js";
import { generateInvoicePDF } from "../../../utils/generateCellzenInvoicePDF.js";

const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

const currencySymbols = {
  NPR: "Rs.",
  USD: "$",
  CNY: "¥",
};

const formatAmount = (amount, currency) => {
  const symbol = currencySymbols[currency] || currency || "";
  return `${symbol} ${Number(amount || 0).toFixed(2)}`;
};

const formatDate = (dateValue) => {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const toDownloadInvoice = (invoice) => {
  const rawData = invoice.invoice_data || {};
  return {
    id: invoice.invoice_number,
    customer: invoice.customer_name || rawData.customerName || "Invoice",
    amount: Number(invoice.amount || 0),
    status: invoice.status || "Generated",
    date: invoice.invoice_date || rawData.invoiceDate,
    rawData: {
      ...rawData,
      invoiceNumber: invoice.invoice_number,
      customerName: invoice.customer_name || rawData.customerName,
      customerEmail: invoice.customer_email || rawData.customerEmail,
      currency: invoice.currency || rawData.currency,
    },
  };
};

export default function SharedInvoicesList({ subtitle = "View and manage invoices", allowExcelDownload = false }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [downloadModal, setDownloadModal] = useState({ show: false, invoice: null });
  const [viewMode, setViewMode] = useState("card");

  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      setError("");

      try {
        const token = localStorage.getItem("customer_token") || "";
        const response = await fetch(`${API_BASE}/inventory/invoices/shared`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load invoices");
        }

        setInvoices(data.data || []);
      } catch (invoiceError) {
        setError(invoiceError.message);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  const handleDownloadPDF = async (invoice) => {
    setDownloadModal({ show: false, invoice: null });
    await generateInvoicePDF(toDownloadInvoice(invoice), invoice.currency || invoice.invoice_data?.currency || "USD");
  };

  const handleDownloadExcel = async (invoice) => {
    setDownloadModal({ show: false, invoice: null });
    await generateInvoiceExcel(toDownloadInvoice(invoice), invoice.currency || invoice.invoice_data?.currency || "USD");
  };

  const handlePayNow = (invoice) => {
    window.alert(`Payment for invoice ${invoice.invoice_number} will be available soon.`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#412460]">Invoices</h2>
          <p className="mt-1 text-xs text-[#2D2D2D]/45">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full border border-[#E1E3EE] bg-white p-1">
            {[
              { id: "card", label: "Card View" },
              { id: "list", label: "List View" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setViewMode(option.id)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  viewMode === option.id
                    ? "bg-[#412460] text-white"
                    : "text-[#412460] hover:bg-[#412460]/8"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex-1 rounded-2xl bg-[#FBFAF8] p-8 text-center">
          <p className="text-sm font-semibold text-[#2D2D2D]/70">Loading invoices...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="mt-8 flex-1 rounded-2xl bg-[#FBFAF8] p-8 text-center">
          <p className="text-sm font-semibold text-[#2D2D2D]/70">No invoices yet</p>
          <p className="mt-2 text-xs text-[#2D2D2D]/50">Shared invoices will appear here</p>
        </div>
      ) : viewMode === "card" ? (
        <div className="mt-6 grid w-full max-w-3xl gap-4 md:grid-cols-2">
          {invoices.map((invoice) => {
            const data = invoice.invoice_data || {};
            return (
              <div key={invoice.id} className="w-full max-w-sm rounded-[2rem] border border-[#B99353]/20 bg-[#F7F1E8] p-5 shadow-[0_12px_30px_rgba(65,36,96,0.05)] transition-[box-shadow,border-color,background-color] duration-300 ease-out hover:border-[#B99353]/55 hover:bg-[#FAF0E1] hover:shadow-[0_26px_58px_rgba(65,36,96,0.18)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B6A31]">Invoice Number</p>
                    <h3 className="mt-2 text-lg font-semibold text-[#412460]">{invoice.invoice_number}</h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(invoice)}
                      className="rounded-full border border-[#E1E3EE] px-3 py-1.5 text-xs font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDownloadModal({ show: true, invoice })}
                      className="rounded-full bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
                    >
                      Download
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#412460]/45">Date</p>
                    <p className="mt-1 text-sm font-semibold text-[#2D2D2D]">{formatDate(invoice.invoice_date || data.invoiceDate)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#412460]/45">Sent through:</p>
                    <p className="mt-1 text-sm font-semibold capitalize text-[#2D2D2D]">{data.modeOfDelivery || "-"}</p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-4 border-t border-[#EAE8E5] pt-4">
                  <div className="flex items-center">
                    <p className="text-xl font-bold text-[#412460]">{formatAmount(invoice.amount, invoice.currency)}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handlePayNow(invoice)}
                      className="rounded-full border border-[#B99353] bg-[#B99353] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#412460] hover:border-[#412460]"
                    >
                      Pay Now
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[#2D2D2D]/50">
              <tr>
                <th className="py-3 font-semibold">Invoice Number</th>
                <th className="py-3 font-semibold">Date</th>
                <th className="py-3 font-semibold">Sent through:</th>
                <th className="py-3 font-semibold">Amount</th>
                <th className="py-3 pr-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const data = invoice.invoice_data || {};
                return (
                  <tr key={invoice.id} className="border-t border-[#EAE8E5]">
                    <td className="py-4 font-semibold text-[#412460]">{invoice.invoice_number}</td>
                    <td className="py-4 text-[#2D2D2D]/60">{formatDate(invoice.invoice_date || data.invoiceDate)}</td>
                    <td className="py-4 capitalize text-[#2D2D2D]">{data.modeOfDelivery || "-"}</td>
                    <td className="py-4 font-bold text-[#2D2D2D]">{formatAmount(invoice.amount, invoice.currency)}</td>
                    <td className="py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(invoice)}
                          className="rounded-full border border-[#E1E3EE] px-3 py-1.5 text-xs font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => setDownloadModal({ show: true, invoice })}
                          className="rounded-full bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePayNow(invoice)}
                          className="rounded-full border border-[#B99353] bg-[#B99353] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#412460] hover:border-[#412460]"
                        >
                          Pay Now
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-2xl rounded-[2rem] border border-[#E1E3EE] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#412460]">Invoice Details</h2>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/60 transition-colors hover:bg-[#FFECEC] hover:text-[#E05353]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {(() => {
              const data = selectedInvoice.invoice_data || {};
              return (
                <div className="mt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="border-b border-[#EAE8E5] pb-3">
                      <span className="text-sm text-[#2D2D2D]/60">Invoice Number</span>
                      <p className="font-semibold text-[#412460]">{selectedInvoice.invoice_number}</p>
                    </div>
                    <div className="border-b border-[#EAE8E5] pb-3">
                      <span className="text-sm text-[#2D2D2D]/60">Date</span>
                      <p className="font-semibold text-[#2D2D2D]">{formatDate(selectedInvoice.invoice_date || data.invoiceDate)}</p>
                    </div>
                    <div className="border-b border-[#EAE8E5] pb-3">
                      <span className="text-sm text-[#2D2D2D]/60">Sent through:</span>
                      <p className="font-semibold capitalize text-[#2D2D2D]">{data.modeOfDelivery || "-"}</p>
                    </div>
                    <div className="border-b border-[#EAE8E5] pb-3">
                      <span className="text-sm text-[#2D2D2D]/60">Amount</span>
                      <p className="font-bold text-[#412460]">{formatAmount(selectedInvoice.amount, selectedInvoice.currency)}</p>
                    </div>
                  </div>

                  {Array.isArray(data.items) && data.items.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-[#2D2D2D]/60">Items</h3>
                      <div className="overflow-hidden rounded-lg border border-[#E1E3EE]">
                        <table className="w-full text-sm">
                          <thead className="bg-[#F7F6F2]">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold">Product</th>
                              <th className="px-3 py-2 text-center text-xs font-semibold">Qty</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold">Unit Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.items.map((item, index) => (
                              <tr key={`${item.productName || "item"}-${index}`} className="border-t border-[#EAE8E5]">
                                <td className="px-3 py-2">{item.productName || "-"}</td>
                                <td className="px-3 py-2 text-center">{item.quantity || 0}</td>
                                <td className="px-3 py-2 text-right">{formatAmount(item.unitPrice, selectedInvoice.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="flex-1 border border-[#E1E3EE] py-2.5 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPDF(selectedInvoice)}
                className="flex-1 bg-[#412460] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {downloadModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[2rem] border border-[#E1E3EE] bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#ECEBFF] text-[#412460]">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-[#412460]">Download Invoice</h3>
              <p className="mb-6 text-sm text-[#2D2D2D]/60">
                Choose your preferred format to download
              </p>
              <div className="flex flex-col gap-3">
                {allowExcelDownload && (
                  <button
                    type="button"
                    onClick={() => handleDownloadExcel(downloadModal.invoice)}
                    className="w-full rounded-lg bg-[#412460] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
                  >
                    Download as Excel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDownloadPDF(downloadModal.invoice)}
                  className="w-full rounded-lg border border-[#412460] bg-white px-4 py-3 text-sm font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white"
                >
                  Download as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setDownloadModal({ show: false, invoice: null })}
                  className="w-full rounded-lg border border-[#E1E3EE] px-4 py-3 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
