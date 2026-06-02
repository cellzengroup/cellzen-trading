import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";
import { useCurrency } from "../../../../contexts/CurrencyContext.jsx";
import { generateInvoiceExcel } from "../../../../utils/generateCellzenInvoice.js";
import { generateInvoicePDF } from "../../../../utils/generateCellzenInvoicePDF.js";
import { loadInvoices, deleteInvoice as deleteInvoiceRemote, readLocalDrafts } from "../../../../utils/invoiceSync.js";
import { authJson } from "../../../../utils/apiBase.js";

// Convert an amount between currencies. Prefers the explicit `rates` map (the
// live CurrencyContext rates / DB source of truth); only falls back to the
// localStorage cache when no map is supplied (e.g. the synchronous useState
// initializer before the context is read). This keeps every part of the page
// — list, message total, PDF — on the SAME saved exchange rate.
function convertCurrency(amount, fromCurrency, toCurrency, ratesOverride) {
  if (!amount || isNaN(amount)) return 0;
  if (fromCurrency === toCurrency) return parseFloat(amount);
  let rates = ratesOverride;
  if (!rates) {
    rates = { USD: 1, CNY: 7.24, NPR: 135.50 };
    try {
      const saved = localStorage.getItem('cellzen_exchange_rates');
      if (saved) Object.assign(rates, JSON.parse(saved));
    } catch { /* ignore */ }
  }
  const from = rates[fromCurrency];
  const to = rates[toCurrency];
  if (!from || !to) return parseFloat(amount);
  const amountInUSD = parseFloat(amount) / from;
  return amountInUSD * to;
}

// Convert raw drafts (from localStorage or backend) into the row shape the
// dashboard table expects. Lifted out so the useState initializer can run it
// synchronously for instant first paint. `rates` is the live context rate map.
function mapDrafts(drafts, currency, rates) {
  return (drafts || []).map((draft) => {
    const itemsTotal = draft.items?.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0) || 0;
    const commissionTotal = draft.items?.reduce((sum, item) => {
      const baseTotal = item.quantity * item.unitPrice;
      const commissionPercent = item.commission || 0;
      return sum + (baseTotal * (commissionPercent / 100));
    }, 0) || 0;
    const customsDuty = parseFloat(draft.customsDuty || 0) > 0 ? parseFloat(draft.customsDuty) : 0;
    const documentationCharges = parseFloat(draft.documentationCharges || 0) > 0 ? parseFloat(draft.documentationCharges) : 0;
    const otherCharges = parseFloat(draft.otherCharges || 0) > 0 ? parseFloat(draft.otherCharges) : 0;
    const transportCost = parseFloat(draft.transportCost || 0) > 0 ? parseFloat(draft.transportCost) : 0;
    const grandTotal = itemsTotal + commissionTotal + customsDuty + documentationCharges + otherCharges + transportCost;

    const originalCurrency = draft.currency || draft.originalCurrency || "USD";
    const convertedAmount = convertCurrency(grandTotal, originalCurrency, currency, rates);

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
      },
    };
  });
}

export default function AdminInvoices() {
  const navigate = useNavigate();
  const { currency, currencySymbols, exchangeRates } = useCurrency();

  // Simple display function for already-converted amounts
  const displayCurrency = (amount) => {
    if (!amount || isNaN(amount)) return `${currencySymbols[currency]} 0.00`;
    return `${currencySymbols[currency]} ${parseFloat(amount).toFixed(2)}`;
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  // Seed from the localStorage cache synchronously so a freshly-saved invoice
  // shows up the instant the user lands on this page — no waiting for the
  // backend round-trip.
  const [invoices, setInvoices] = useState(() => mapDrafts(readLocalDrafts(), currency, exchangeRates));
  const [deleteModal, setDeleteModal] = useState({ show: false, invoiceId: null });
  // Download modal also tracks the chosen target currency. Defaults to the
  // dashboard's display currency but the user can switch per download.
  const [downloadModal, setDownloadModal] = useState({ show: false, invoice: null, currency: "USD" });
  // Send-email compose modal. Only reachable for invoices that have a customer
  // email (the button is hidden otherwise).
  const [emailModal, setEmailModal] = useState({ show: false, invoice: null });
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", message: "", sendCopy: false, currency: "CNY" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: 'success' | 'error', text }
  // Tracks the last auto-generated message so we only regenerate it on a
  // currency switch when the admin hasn't hand-edited the text.
  const autoMsgRef = useRef("");

  const [syncSource, setSyncSource] = useState("local");
  const [syncing, setSyncing] = useState(true);

  // Background sync with backend. The list is already painted from cache (see
  // the useState seed above) — this just reconciles with the server so a peer
  // admin's changes show up too.
  useEffect(() => {
    let alive = true;
    setSyncing(true);
    loadInvoices().then((result) => {
      if (!alive) return;
      setSyncSource(result.source);
      setInvoices(mapDrafts(result.invoices || [], currency, exchangeRates));
      setSyncing(false);
    });
    return () => { alive = false; };
  }, [currency, exchangeRates]);


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
      case "Sent": return "bg-[#F3EEF8] text-[#412460]";
      default: return "bg-[#ECEBFF] text-[#6B5BD6]";
    }
  };

  const handleDelete = async (invoiceId) => {
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    setDeleteModal({ show: false, invoiceId: null });
    try {
      await deleteInvoiceRemote(invoiceId);
    } catch (err) {
      // Local cache already updated; surface a console warning if backend sync failed
      console.warn("Backend delete failed (local cache updated):", err?.message);
    }
  };

  // Edit invoice - navigate to create page with invoice data
  const handleEdit = (invoice) => {
    // Store the invoice data in sessionStorage for editing
    sessionStorage.setItem("edit_invoice_data", JSON.stringify(invoice.rawData));
    navigate("/admin-invoices/edit");
  };

  // Download functions — the invoice's monetary values are converted from
  // its original currency into the target the user picked in the modal.
  const downloadAsPDF = async (invoice, targetCurrency) => {
    const target = targetCurrency || downloadModal.currency || currency;
    setDownloadModal({ show: false, invoice: null, currency: target });
    await generateInvoicePDF(invoice, target, exchangeRates);
  };

  const downloadAsExcel = async (invoice, targetCurrency) => {
    const target = targetCurrency || downloadModal.currency || currency;
    setDownloadModal({ show: false, invoice: null, currency: target });
    await generateInvoiceExcel(invoice, target, exchangeRates);
  };

  // ── Send invoice email ──────────────────────────────────────────────────────
  // Format the invoice grand total in a specific currency (USD/NPR/CNY),
  // converting from the invoice's original currency at today's rates.
  const formatAmountIn = (invoice, code) => {
    const orig = invoice.rawData?.originalCurrency || invoice.rawData?.currency || "USD";
    const base = invoice.rawData?.grandTotal ?? invoice.amount ?? 0;
    // Use the live context rates (same source as the PDF) so the message total
    // and the attached PDF always agree and reflect the saved exchange rate.
    const val = convertCurrency(base, orig, code, exchangeRates);
    const sym = currencySymbols?.[code] || code;
    return `${sym} ${Number(val).toFixed(2)}`;
  };

  const buildEmailMessage = (invoice, code) => {
    // Spell the month out — e.g. "2026-03-22" -> "March 22, 2026".
    const parsed = invoice.date ? new Date(invoice.date) : null;
    const dateInWords = parsed && !isNaN(parsed)
      ? parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : invoice.date || "";
    return (
      `Dear ${invoice.customer || "Customer"},\n\n` +
      `Please find attached invoice ${invoice.id} dated ${dateInWords} ` +
      `for the total value of ${formatAmountIn(invoice, code)}.\n\n` +
      `If you have any question, please feel free to reply.\n\n` +
      `Thank you for your cooperation.\n\n` +
      `Best Regards,\n` +
      `Cellzen Trading\n` +
      `WhatsApp: +9779849956242, +8613073017734\n` +
      `Phone number: +8613073040201\n` +
      `WeChat: subodhpokhrel`
    );
  };

  const openEmailModal = (invoice) => {
    const raw = invoice.rawData || {};
    const defaultCode = "CNY"; // Default the attached PDF + message total to Yuan (RMB)
    const msg = buildEmailMessage(invoice, defaultCode);
    autoMsgRef.current = msg;
    setEmailForm({
      to: raw.customerEmail || "",
      subject: `Invoice ${invoice.id} from Cellzen Trading`,
      message: msg,
      sendCopy: false,
      currency: defaultCode,
    });
    setEmailStatus(null);
    setEmailModal({ show: true, invoice });
  };

  // Switch the PDF/total currency. Regenerate the message's total only if the
  // admin hasn't manually edited the text (so we never wipe their wording).
  // NOTE: compute + update the ref OUTSIDE setEmailForm — the updater must stay
  // pure (React StrictMode invokes it twice, which would corrupt the ref).
  const setEmailCurrency = (code) => {
    const invoice = emailModal.invoice;
    const untouched = emailForm.message === autoMsgRef.current;
    if (untouched) {
      const newMsg = buildEmailMessage(invoice, code);
      autoMsgRef.current = newMsg;
      setEmailForm((prev) => ({ ...prev, currency: code, message: newMsg }));
    } else {
      setEmailForm((prev) => ({ ...prev, currency: code }));
    }
  };

  const handleSendEmail = async () => {
    const invoice = emailModal.invoice;
    if (!invoice) return;

    const to = emailForm.to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setEmailStatus({ type: "error", text: "Please enter a valid recipient email address." });
      return;
    }

    setEmailSending(true);
    setEmailStatus(null);
    try {
      // Generate the PDF in the currency the admin selected, as base64.
      const target = emailForm.currency || invoice.rawData?.originalCurrency || currency;
      const { base64, filename } = await generateInvoicePDF(invoice, target, exchangeRates, { output: "base64" });

      // The server sends the email in the background and responds immediately,
      // so this should return in well under a second. Abort if it somehow
      // stalls so the button can't spin forever.
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 30000);
      let res, data;
      try {
        ({ res, data } = await authJson(
          `/inventory/invoices/${encodeURIComponent(invoice.id)}/send-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              to,
              subject: emailForm.subject,
              message: emailForm.message,
              copyToSelf: emailForm.sendCopy,
              pdfBase64: base64,
              filename,
            }),
          }
        ));
      } catch (abortErr) {
        if (abortErr.name === "AbortError") {
          throw new Error("Timed out waiting for the email server. From this network Gmail SMTP may be unreachable.");
        }
        throw abortErr;
      } finally {
        clearTimeout(abortTimer);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send the email.");
      }

      // Reflect the new "Sent" status in the list immediately.
      setInvoices((prev) => prev.map((inv) => (inv.id === invoice.id ? { ...inv, status: "Sent" } : inv)));
      setEmailStatus({ type: "success", text: `Invoice is being sent to ${to}. It may take a moment to arrive.` });
      setTimeout(() => setEmailModal({ show: false, invoice: null }), 1500);
    } catch (err) {
      setEmailStatus({ type: "error", text: err.message || "Could not send the email." });
    } finally {
      setEmailSending(false);
    }
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
                        onClick={() => setDownloadModal({ show: true, invoice, currency })}
                        className="border border-[#E1E3EE] px-3 py-1.5 text-xs font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF] whitespace-nowrap"
                        title="Download"
                      >
                        Download
                      </button>
                      {invoice.rawData?.customerEmail && (
                        <button
                          onClick={() => openEmailModal(invoice)}
                          className="border border-[#B99353] px-3 py-1.5 text-xs font-semibold text-[#B99353] transition-colors hover:bg-[#B99353] hover:text-white whitespace-nowrap"
                          title="Send Email"
                        >
                          Send Email
                        </button>
                      )}
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
                                {displayCurrency(convertCurrency(item.unitPrice, originalCurrency, currency, exchangeRates))}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold">
                                {displayCurrency(convertCurrency(item.quantity * item.unitPrice, originalCurrency, currency, exchangeRates))}
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
                      <span>{displayCurrency(convertCurrency(itemsTotal, originalCurrency, currency, exchangeRates))}</span>
                    </div>
                    {commissionTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Commission</span>
                        <span>{displayCurrency(convertCurrency(commissionTotal, originalCurrency, currency, exchangeRates))}</span>
                      </div>
                    )}
                    {customsDuty > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Customs Duty</span>
                        <span>{displayCurrency(convertCurrency(customsDuty, originalCurrency, currency, exchangeRates))}</span>
                      </div>
                    )}
                    {docCharges > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Documentation Charges</span>
                        <span>{displayCurrency(convertCurrency(docCharges, originalCurrency, currency, exchangeRates))}</span>
                      </div>
                    )}
                    {transportCost > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Freight Cost</span>
                        <span>{displayCurrency(convertCurrency(transportCost, originalCurrency, currency, exchangeRates))}</span>
                      </div>
                    )}
                    {otherCharges > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#2D2D2D]/60">Other Charges</span>
                        <span>{displayCurrency(convertCurrency(otherCharges, originalCurrency, currency, exchangeRates))}</span>
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
              <p className="mb-4 text-sm text-[#2D2D2D]/60">
                Choose currency and format
              </p>

              {/* Currency picker — converts every monetary value to the chosen
                  currency at today's exchange rate before generating. */}
              <div className="mb-4 text-left">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                  Download in
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["USD", "NPR", "CNY"].map((code) => {
                    const active = downloadModal.currency === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setDownloadModal((prev) => ({ ...prev, currency: code }))}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          active
                            ? "border-[#412460] bg-[#412460] text-white"
                            : "border-[#E1E3EE] bg-white text-[#2D2D2D] hover:border-[#412460]"
                        }`}
                      >
                        {code === "CNY" ? "RMB" : code}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => downloadAsExcel(downloadModal.invoice, downloadModal.currency)}
                  className="w-full rounded-lg bg-[#412460] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
                >
                  Download as Excel
                </button>
                <button
                  onClick={() => downloadAsPDF(downloadModal.invoice, downloadModal.currency)}
                  className="w-full rounded-lg border border-[#412460] bg-white px-4 py-3 text-sm font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white"
                >
                  Download as PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {emailModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-[2rem] border border-[#E1E3EE] bg-white p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#412460]">Send Invoice Email</h2>
              <button
                onClick={() => !emailSending && setEmailModal({ show: false, invoice: null })}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/60 transition-colors hover:bg-[#FFECEC] hover:text-[#E05353]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-sm text-[#2D2D2D]/60">
              Invoice <span className="font-semibold text-[#412460]">{emailModal.invoice?.id}</span> · the PDF is attached automatically.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">To</label>
                <input
                  type="email"
                  value={emailForm.to}
                  onChange={(e) => setEmailForm((p) => ({ ...p, to: e.target.value }))}
                  placeholder="customer@email.com"
                  className="w-full rounded-lg border border-[#E1E3EE] px-3 py-2.5 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Subject</label>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm((p) => ({ ...p, subject: e.target.value }))}
                  className="w-full rounded-lg border border-[#E1E3EE] px-3 py-2.5 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Message</label>
                <textarea
                  rows={8}
                  value={emailForm.message}
                  onChange={(e) => setEmailForm((p) => ({ ...p, message: e.target.value }))}
                  className="w-full resize-y rounded-lg border border-[#E1E3EE] px-3 py-2.5 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-[#2D2D2D]/80">
                  <input
                    type="checkbox"
                    checked={emailForm.sendCopy}
                    onChange={(e) => setEmailForm((p) => ({ ...p, sendCopy: e.target.checked }))}
                    className="h-4 w-4 accent-[#412460]"
                  />
                  Send a copy to our inbox
                </label>

                {/* Currency for the attached PDF + message total */}
                <div className="flex items-center gap-1.5">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/50">PDF in</span>
                  {["USD", "NPR", "CNY"].map((code) => {
                    const active = emailForm.currency === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setEmailCurrency(code)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "border-[#412460] bg-[#412460] text-white"
                            : "border-[#E1E3EE] bg-white text-[#2D2D2D] hover:border-[#412460]"
                        }`}
                      >
                        {code === "CNY" ? "RMB" : code}
                      </button>
                    );
                  })}
                </div>
              </div>

              {emailSending && (
                <div className="rounded-lg bg-[#F4F2EF] px-3 py-2 text-sm text-[#2D2D2D]/70">
                  Preparing the PDF and queuing the email…
                </div>
              )}

              {emailStatus && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    emailStatus.type === "success" ? "bg-[#E9F8ED] text-[#1C9B55]" : "bg-[#FFECEC] text-[#E05353]"
                  }`}
                >
                  {emailStatus.text}
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setEmailModal({ show: false, invoice: null })}
                disabled={emailSending}
                className="flex-1 rounded-lg border border-[#E1E3EE] px-4 py-3 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={emailSending}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#412460] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60"
              >
                {emailSending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending…
                  </>
                ) : (
                  "Send Email"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
