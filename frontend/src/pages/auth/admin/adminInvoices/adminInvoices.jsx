import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";
import { useCurrency } from "../../../../contexts/CurrencyContext.jsx";
import { generateInvoiceExcel } from "../../../../utils/generateCellzenInvoice.js";
import { generateInvoicePDF } from "../../../../utils/generateCellzenInvoicePDF.js";

export default function AdminInvoices() {
  const navigate = useNavigate();
  const { currency, currencySymbols } = useCurrency();

  // Simple display function for already-converted amounts
  const displayCurrency = (amount) => {
    if (!amount || isNaN(amount)) return `${currencySymbols[currency]} 0.00`;
    return `${currencySymbols[currency]} ${parseFloat(amount).toFixed(2)}`;
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ show: false, invoiceId: null });
  const [downloadModal, setDownloadModal] = useState({ show: false, invoice: null });


  // Load invoices from localStorage on mount and when currency changes
  useEffect(() => {
    const drafts = JSON.parse(localStorage.getItem("invoice_drafts") || "[]");
    // Transform draft data to invoice format
    const loadedInvoices = drafts.map((draft) => {
      // Calculate total amount from items in the original currency
      const itemsTotal = draft.items?.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0) || 0;
      // Calculate commission from items
      const commissionTotal = draft.items?.reduce((sum, item) => {
        const baseTotal = item.quantity * item.unitPrice;
        const commissionPercent = item.commission || 0;
        return sum + (baseTotal * (commissionPercent / 100));
      }, 0) || 0;
      // Only add customs/transport if checkbox was checked (values exist and > 0)
      const customsDuty = parseFloat(draft.customsDuty || 0) > 0 ? parseFloat(draft.customsDuty) : 0;
      const documentationCharges = parseFloat(draft.documentationCharges || 0) > 0 ? parseFloat(draft.documentationCharges) : 0;
      const otherCharges = parseFloat(draft.otherCharges || 0) > 0 ? parseFloat(draft.otherCharges) : 0;
      const transportCost = parseFloat(draft.transportCost || 0) > 0 ? parseFloat(draft.transportCost) : 0;
      const grandTotal = itemsTotal + commissionTotal + customsDuty + documentationCharges + otherCharges + transportCost;

      // Convert to current currency for display
      const originalCurrency = draft.currency || draft.originalCurrency || "USD";
      const convertedAmount = convertCurrency(grandTotal, originalCurrency, currency);

      return {
        id: draft.invoiceNumber || draft.id,
        customer: draft.customerName || "Unknown",
        amount: convertedAmount,
        status: draft.status || "Pending",
        date: draft.invoiceDate || new Date().toISOString().split("T")[0],
        rawData: {
          ...draft,
          itemsTotal,
          grandTotal,
          originalCurrency,
        }, // Keep full data for viewing
      };
    });
    setInvoices(loadedInvoices);
  }, [currency]);


  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch = inv.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          inv.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "All" || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, statusFilter, invoices]);

  const stats = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const paid = invoices.filter(inv => inv.status === "Paid").reduce((sum, inv) => sum + inv.amount, 0);
    const pending = invoices.filter(inv => inv.status === "Pending").reduce((sum, inv) => sum + inv.amount, 0);
    const overdue = invoices.filter(inv => inv.status === "Overdue").reduce((sum, inv) => sum + inv.amount, 0);
    return { total, paid, pending, overdue, count: invoices.length };
  }, [invoices]);

  const getStatusColor = (status) => {
    switch (status) {
      case "Paid": return "bg-[#E9F8ED] text-[#1C9B55]";
      case "Pending": return "bg-[#FFF5E8] text-[#B99353]";
      case "Overdue": return "bg-[#FFECEC] text-[#E05353]";
      default: return "bg-[#ECEBFF] text-[#6B5BD6]";
    }
  };

  // Delete invoice
  // Convert amount from one currency to another
  const convertCurrency = (amount, fromCurrency, toCurrency) => {
    if (!amount || isNaN(amount)) return 0;
    if (fromCurrency === toCurrency) return parseFloat(amount);

    const rates = { USD: 1, CNY: 7.24, NPR: 135.50 };
    const savedRates = localStorage.getItem('cellzen_exchange_rates');
    if (savedRates) {
      Object.assign(rates, JSON.parse(savedRates));
    }

    // Convert to USD first, then to target currency
    const amountInUSD = parseFloat(amount) / rates[fromCurrency];
    return amountInUSD * rates[toCurrency];
  };

  const handleDelete = (invoiceId) => {
    const drafts = JSON.parse(localStorage.getItem("invoice_drafts") || "[]");
    const updatedDrafts = drafts.filter(d => (d.invoiceNumber || d.id) !== invoiceId);
    localStorage.setItem("invoice_drafts", JSON.stringify(updatedDrafts));
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    setDeleteModal({ show: false, invoiceId: null });
  };

  // Edit invoice - navigate to create page with invoice data
  const handleEdit = (invoice) => {
    // Store the invoice data in sessionStorage for editing
    sessionStorage.setItem("edit_invoice_data", JSON.stringify(invoice.rawData));
    navigate("/admin-invoices/edit");
  };

  // Download functions
  const downloadAsPDF = async (invoice) => {
    setDownloadModal({ show: false, invoice: null });
    await generateInvoicePDF(invoice, currency);
  };

  const downloadAsExcel = async (invoice) => {
    setDownloadModal({ show: false, invoice: null });
    await generateInvoiceExcel(invoice, currency);
  };

  return (
    <AdminPageShell activePage="Invoices" title="Invoices" eyebrow="Create and manage customer invoices">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#412460]">Total Invoices</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">All invoice amounts combined</p>
            </div>
            <span className="bg-[#2A1740] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B99353]">
              {stats.count} items
            </span>
          </div>
          <p className="mt-6 text-2xl font-bold text-[#2D2D2D]">{displayCurrency(stats.total)}</p>
        </div>

        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#412460]">Paid</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">Successfully received payments</p>
            </div>
            <span className="bg-[#2A1740] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B99353]">
              Received
            </span>
          </div>
          <p className="mt-6 text-2xl font-bold text-[#1C9B55]">{displayCurrency(stats.paid)}</p>
        </div>

        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#412460]">Pending</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">Awaiting customer payment</p>
            </div>
            <span className="bg-[#2A1740] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B99353]">
              Open
            </span>
          </div>
          <p className="mt-6 text-2xl font-bold text-[#B99353]">{displayCurrency(stats.pending)}</p>
        </div>

        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#412460]">Overdue</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">Past due date, action needed</p>
            </div>
            <span className="bg-[#2A1740] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B99353]">
              Alert
            </span>
          </div>
          <p className="mt-6 text-2xl font-bold text-[#E05353]">{displayCurrency(stats.overdue)}</p>
        </div>
      </div>

      {/* Invoice List */}
      <div className="mt-6 rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
        {/* Header with Search and Filters */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">All Invoices</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#2D2D2D]/55">Manage and track customer invoices</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex items-center gap-2 rounded-full border border-[#E1E3EE] bg-white px-4 py-2">
              <svg className="h-4 w-4 text-[#2D2D2D]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm text-[#2D2D2D] placeholder:text-[#2D2D2D]/40 focus:outline-none"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-full border border-[#E1E3EE] bg-white px-4 py-2 text-sm text-[#2D2D2D] focus:outline-none focus:ring-2 focus:ring-[#412460]/20"
            >
              <option value="All">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
            </select>

            {/* Create Invoice Button */}
            <button
              onClick={() => navigate("/admin-invoices/create")}
              className="bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
            >
              + Create Invoice
            </button>
          </div>
        </div>

        {/* Invoices Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-[#2D2D2D]/50">
              <tr>
                <th className="py-3 font-semibold">Invoice ID</th>
                <th className="py-3 font-semibold">Customer</th>
                <th className="py-3 font-semibold">Amount</th>
                <th className="py-3 font-semibold">Status</th>
                <th className="py-3 font-semibold">Date</th>
                <th className="py-3 font-semibold text-right pr-4 min-w-[280px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-[#EAE8E5]">
                  <td className="py-4 font-semibold text-[#412460]">{invoice.id}</td>
                  <td className="py-4 font-medium text-[#2D2D2D]">{invoice.customer}</td>
                  <td className="py-4 font-bold text-[#2D2D2D]">{displayCurrency(invoice.amount)}</td>
                  <td className="py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(invoice.status)}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="py-4 text-[#2D2D2D]/60">{invoice.date}</td>
                  <td className="py-4 align-middle">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedInvoice(invoice)}
                        className="bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] whitespace-nowrap"
                        title="View"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleEdit(invoice)}
                        className="border border-[#412460] px-3 py-1.5 text-xs font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white whitespace-nowrap"
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDownloadModal({ show: true, invoice })}
                        className="border border-[#E1E3EE] px-3 py-1.5 text-xs font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF] whitespace-nowrap"
                        title="Download"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => setDeleteModal({ show: true, invoiceId: invoice.id })}
                        className="bg-[#FFECEC] px-3 py-1.5 text-xs font-semibold text-[#E05353] transition-colors hover:bg-[#E05353] hover:text-white whitespace-nowrap"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredInvoices.length === 0 && (
          <div className="mt-8 rounded-[2rem] bg-[#F7F6F2] p-8 text-center">
            <p className="text-sm font-semibold text-[#2D2D2D]/70">No invoices found</p>
            <p className="mt-2 text-xs text-[#2D2D2D]/50">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* View Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-[2rem] border border-[#E1E3EE] bg-white p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#412460]">Invoice Details</h2>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/60 transition-colors hover:bg-[#FFECEC] hover:text-[#E05353]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {/* Invoice Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border-b border-[#EAE8E5] pb-3">
                  <span className="text-sm text-[#2D2D2D]/60">Invoice ID</span>
                  <p className="font-semibold text-[#412460]">{selectedInvoice.id}</p>
                </div>
                <div className="border-b border-[#EAE8E5] pb-3">
                  <span className="text-sm text-[#2D2D2D]/60">Invoice Date</span>
                  <p className="font-semibold text-[#2D2D2D]">{selectedInvoice.date}</p>
                </div>
              </div>

              <div className="border-b border-[#EAE8E5] pb-3">
                <span className="text-sm text-[#2D2D2D]/60">Customer</span>
                <p className="font-semibold text-[#2D2D2D]">{selectedInvoice.customer}</p>
                {selectedInvoice.rawData?.customerEmail && (
                  <p className="text-sm text-[#2D2D2D]/70">{selectedInvoice.rawData.customerEmail}</p>
                )}
              </div>

              {/* Items Table */}
              {selectedInvoice.rawData?.items && selectedInvoice.rawData.items.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-[#2D2D2D]/60 mb-2">Items</h3>
                  <div className="rounded-lg border border-[#E1E3EE] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F7F6F2]">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold">Product</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold">Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold">Unit Price</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const originalCurrency = selectedInvoice.rawData?.originalCurrency || selectedInvoice.rawData?.currency || "USD";
                          return selectedInvoice.rawData.items.map((item, idx) => (
                            <tr key={idx} className="border-t border-[#EAE8E5]">
                              <td className="px-3 py-2">{item.productName || "-"}</td>
                              <td className="px-3 py-2 text-center">{item.quantity}</td>
                              <td className="px-3 py-2 text-right">
                                {displayCurrency(convertCurrency(item.unitPrice, originalCurrency, currency))}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold">
                                {displayCurrency(convertCurrency(item.quantity * item.unitPrice, originalCurrency, currency))}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Totals */}
              {(() => {
                const originalCurrency = selectedInvoice.rawData?.originalCurrency || selectedInvoice.rawData?.currency || "USD";
                const itemsTotal = selectedInvoice.rawData?.items?.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0) || 0;
                const commissionTotal = selectedInvoice.rawData?.items?.reduce((sum, item) => {
                  const baseTotal = item.quantity * item.unitPrice;
                  const commissionPercent = item.commission || 0;
                  return sum + (baseTotal * (commissionPercent / 100));
                }, 0) || 0;
                const customsDuty = selectedInvoice.rawData?.customsDuty || 0;
                const docCharges = selectedInvoice.rawData?.documentationCharges || 0;
                const otherCharges = selectedInvoice.rawData?.otherCharges || 0;
                const transportCost = selectedInvoice.rawData?.transportCost || 0;

                return (
                  <div className="mt-4 space-y-2 border-t border-[#EAE8E5] pt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#2D2D2D]/60">Items Total</span>
                      <span>{displayCurrency(convertCurrency(itemsTotal, originalCurrency, currency))}</span>
                    </div>
                    {commissionTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Commission</span>
                        <span>{displayCurrency(convertCurrency(commissionTotal, originalCurrency, currency))}</span>
                      </div>
                    )}
                    {customsDuty > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Customs Duty</span>
                        <span>{displayCurrency(convertCurrency(customsDuty, originalCurrency, currency))}</span>
                      </div>
                    )}
                    {docCharges > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Documentation Charges</span>
                        <span>{displayCurrency(convertCurrency(docCharges, originalCurrency, currency))}</span>
                      </div>
                    )}
                    {transportCost > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Freight Cost</span>
                        <span>{displayCurrency(convertCurrency(transportCost, originalCurrency, currency))}</span>
                      </div>
                    )}
                    {otherCharges > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Other Charges</span>
                        <span>{displayCurrency(convertCurrency(otherCharges, originalCurrency, currency))}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[#EAE8E5] pt-2">
                      <span className="font-semibold text-[#412460]">Grand Total</span>
                      <span className="font-bold text-[#412460]">{displayCurrency(selectedInvoice.amount)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Status */}
              <div className="flex items-center justify-between border-t border-[#EAE8E5] pt-3">
                <span className="text-sm text-[#2D2D2D]/60">Status</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(selectedInvoice.status)}`}>
                  {selectedInvoice.status}
                </span>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="flex-1 border border-[#E1E3EE] py-2.5 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
              >
                Close
              </button>
              <button
                onClick={() => downloadAsPDF(selectedInvoice)}
                className="flex-1 bg-[#412460] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[2rem] border border-[#E1E3EE] bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFECEC] text-[#E05353]">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-[#412460]">Delete Invoice?</h3>
              <p className="mb-6 text-sm text-[#2D2D2D]/60">
                Are you sure you want to delete this invoice? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal({ show: false, invoiceId: null })}
                  className="flex-1 rounded-lg border border-[#E1E3EE] px-4 py-3 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteModal.invoiceId)}
                  className="flex-1 rounded-lg bg-[#E05353] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C04444]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Download Modal */}
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
                <button
                  onClick={() => downloadAsExcel(downloadModal.invoice)}
                  className="w-full rounded-lg bg-[#412460] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
                >
                  Download as Excel
                </button>
                <button
                  onClick={() => downloadAsPDF(downloadModal.invoice)}
                  className="w-full rounded-lg border border-[#412460] bg-white px-4 py-3 text-sm font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white"
                >
                  Download as PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
