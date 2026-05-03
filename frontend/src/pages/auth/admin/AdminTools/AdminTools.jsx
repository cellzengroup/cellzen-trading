import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

const TOOL_CATEGORIES = [
  {
    label: "Documents",
    tools: [
      {
        id: "invoice-gen",
        name: "Invoice Generator",
        desc: "Create and export professional invoices in PDF format.",
        icon: "invoice",
        action: "/admin-invoices/create",
        badge: "PDF",
        badgeColor: "bg-[#412460] text-white",
      },
      {
        id: "pdf-viewer",
        name: "PDF Viewer",
        desc: "Preview product catalogs and supplier documents inline.",
        icon: "pdf",
        action: "/admin-products",
        badge: "Catalog",
        badgeColor: "bg-[#EAE8E5] text-[#2D2D2D]",
      },
      {
        id: "reports",
        name: "Report Builder",
        desc: "Generate monthly and yearly business performance reports.",
        icon: "report",
        action: "/admin-reports",
        badge: "Export",
        badgeColor: "bg-[#E9F8ED] text-[#1C9B55]",
      },
    ],
  },
  {
    label: "Finance",
    tools: [
      {
        id: "currency",
        name: "Currency Converter",
        desc: "Convert between USD, MYR, CNY, and other supported currencies instantly.",
        icon: "currency",
        badge: "Live",
        badgeColor: "bg-[#FFF5E8] text-[#B99353]",
      },
      {
        id: "calculator",
        name: "Shipment Cost Estimator",
        desc: "Estimate total landed cost including freight, duties, and handling.",
        icon: "calculator",
        badge: "Estimator",
        badgeColor: "bg-[#EAE8E5] text-[#2D2D2D]",
      },
      {
        id: "tax",
        name: "Tax & Duty Lookup",
        desc: "Look up import tax rates by product category and destination country.",
        icon: "tax",
        badge: "Lookup",
        badgeColor: "bg-[#ECEBFF] text-[#6B5BD6]",
      },
    ],
  },
  {
    label: "Operations",
    tools: [
      {
        id: "barcode",
        name: "Barcode Generator",
        desc: "Generate and print EAN-13, QR, or Code-128 barcodes for products.",
        icon: "barcode",
        badge: "QR / EAN",
        badgeColor: "bg-[#412460] text-white",
      },
      {
        id: "notes",
        name: "Quick Notes",
        desc: "Capture meeting notes, sourcing reminders, and supplier memos.",
        icon: "notes",
        badge: "Memo",
        badgeColor: "bg-[#EAE8E5] text-[#2D2D2D]",
      },
      {
        id: "export",
        name: "Data Export",
        desc: "Export products, invoices, and customer data to CSV or Excel.",
        icon: "export",
        action: "/admin-reports",
        badge: "CSV / XLSX",
        badgeColor: "bg-[#E9F8ED] text-[#1C9B55]",
      },
    ],
  },
];

const QUICK_STATS = [
  { label: "Tools Available", value: "9", icon: "tools", accent: "bg-[#412460] text-white" },
  { label: "Recent Exports", value: "14", icon: "export", accent: "bg-[#EAE8E5] text-[#2D2D2D]" },
  { label: "Notes Saved", value: "3", icon: "notes", accent: "bg-white border border-[#E1E3EE] text-[#2D2D2D]" },
  { label: "Barcodes Made", value: "27", icon: "barcode", accent: "bg-[#EAE8E5] text-[#2D2D2D]" },
];

function ToolIcon({ icon }) {
  const cls = "h-5 w-5";
  const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" };

  if (icon === "invoice") return <svg className={cls} {...base}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>;
  if (icon === "pdf") return <svg className={cls} {...base}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>;
  if (icon === "report") return <svg className={cls} {...base}><path d="M5 20V4h14v16H5Z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></svg>;
  if (icon === "currency") return <svg className={cls} {...base}><circle cx="12" cy="12" r="9" /><path d="M9 9h6" /><path d="M9 12h6" /><path d="M12 6v12" /></svg>;
  if (icon === "calculator") return <svg className={cls} {...base}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8" /><path d="M8 10h2" /><path d="M12 10h2" /><path d="M16 10h2" /><path d="M8 14h2" /><path d="M12 14h2" /><path d="M16 14h2" /><path d="M8 18h2" /><path d="M12 18h2" /><path d="M16 18h2" /></svg>;
  if (icon === "tax") return <svg className={cls} {...base}><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>;
  if (icon === "barcode") return <svg className={cls} {...base}><path d="M3 5v2" /><path d="M3 11v2" /><path d="M3 17v2" /><path d="M7 5v6" /><path d="M7 15v4" /><path d="M11 5v2" /><path d="M11 11v2" /><path d="M11 17v2" /><path d="M15 5v6" /><path d="M15 15v4" /><path d="M19 5v2" /><path d="M19 11v2" /><path d="M19 17v2" /></svg>;
  if (icon === "notes") return <svg className={cls} {...base}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>;
  if (icon === "export") return <svg className={cls} {...base}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>;
  if (icon === "tools") return <svg className={cls} {...base}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>;
  return <svg className={cls} {...base}><circle cx="12" cy="12" r="3" /></svg>;
}

function CurrencyConverterWidget() {
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("MYR");
  const RATES = { USD: 1, MYR: 4.71, CNY: 7.24, SGD: 1.35, EUR: 0.92, GBP: 0.79, AUD: 1.53 };
  const currencies = Object.keys(RATES);
  const result = amount ? ((parseFloat(amount) / RATES[from]) * RATES[to]).toFixed(2) : "";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="block">
          <span className="text-[10px] font-semibold text-[#2D2D2D]/45">Amount</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded-xl border border-[#E1D9EA] px-3 py-2.5 text-sm font-semibold text-[#2D2D2D] outline-none placeholder:text-[#2D2D2D]/25 focus:border-[#412460]"
          />
        </label>
        <button
          type="button"
          onClick={() => { setFrom(to); setTo(from); }}
          className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F2EF] text-[#412460] transition hover:bg-[#412460] hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16V4m0 0L3 8m4-4 4 4" />
            <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
          </svg>
        </button>
        <label className="block">
          <span className="text-[10px] font-semibold text-[#2D2D2D]/45">Result</span>
          <div className="mt-1 w-full rounded-xl border border-[#E1D9EA] bg-[#F7F6F2] px-3 py-2.5 text-sm font-bold text-[#412460]">
            {result || "—"}
          </div>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-[#E1D9EA] px-3 py-2 text-xs font-semibold text-[#2D2D2D] outline-none focus:border-[#412460]">
          {currencies.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-[#E1D9EA] px-3 py-2 text-xs font-semibold text-[#2D2D2D] outline-none focus:border-[#412460]">
          {currencies.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
}

function QuickNotesWidget() {
  const [notes, setNotes] = useState([
    { id: 1, text: "Follow up with supplier on MOQ for Q3.", color: "#412460" },
    { id: 2, text: "Check customs clearance docs for Air Freight batch.", color: "#B99353" },
    { id: 3, text: "Update product catalog PDFs for distributors.", color: "#1C9B55" },
  ]);
  const [input, setInput] = useState("");

  const addNote = () => {
    if (!input.trim()) return;
    const colors = ["#412460", "#B99353", "#1C9B55", "#6B5BD6", "#E05353"];
    setNotes((prev) => [{ id: Date.now(), text: input.trim(), color: colors[prev.length % colors.length] }, ...prev]);
    setInput("");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addNote()}
          placeholder="Type a note and press Enter…"
          className="flex-1 rounded-xl border border-[#E1D9EA] px-3 py-2.5 text-xs font-semibold text-[#2D2D2D] outline-none placeholder:text-[#2D2D2D]/30 focus:border-[#412460]"
        />
        <button
          type="button"
          onClick={addNote}
          className="rounded-xl bg-[#412460] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#B99353]"
        >
          Add
        </button>
      </div>
      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
        {notes.map((note) => (
          <div key={note.id} className="flex items-start gap-2 rounded-xl bg-[#F7F6F2] px-3 py-2.5">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: note.color }} />
            <p className="text-xs text-[#2D2D2D]/70">{note.text}</p>
            <button type="button" onClick={() => setNotes((n) => n.filter((x) => x.id !== note.id))} className="ml-auto shrink-0 text-[10px] text-[#2D2D2D]/30 hover:text-[#E05353]">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminTools() {
  const navigate = useNavigate();
  const [activeWidget, setActiveWidget] = useState(null);

  return (
    <AdminPageShell activePage="Tools" title="Admin Tools" eyebrow="Utility tools for Cellzen operations">
      <div className="flex h-full flex-col gap-5 overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">

        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">Admin Tools</h2>
            <p className="mt-0.5 text-xs text-[#2D2D2D]/45">Quick-access utilities for documents, finance, and operations.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F2EF] px-4 py-2 text-xs font-semibold text-[#412460]">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            9 Tools
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {QUICK_STATS.map((stat) => (
              <div key={stat.label} className={`${stat.accent} rounded-[1.5rem] p-5 shadow-[0_14px_35px_rgba(45,45,45,0.04)]`}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${stat.accent.includes("bg-[#412460]") ? "bg-white/14" : "bg-[#412460]/8"}`}>
                  <ToolIcon icon={stat.icon} />
                </div>
                <p className={`mt-3 text-2xl font-bold ${stat.accent.includes("text-white") ? "" : "text-[#2D2D2D]"}`}>{stat.value}</p>
                <p className={`mt-0.5 text-[11px] ${stat.accent.includes("text-white") ? "text-white/60" : "text-[#2D2D2D]/45"}`}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Live Widgets */}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* Currency Converter */}
            <div className="rounded-[1.5rem] border border-[#E1D9EA] bg-[#FBFAF8] p-5 shadow-[0_14px_35px_rgba(45,45,45,0.03)]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#412460] text-white">
                    <ToolIcon icon="currency" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#412460]">Currency Converter</p>
                    <p className="text-[10px] text-[#2D2D2D]/40">Convert between supported currencies</p>
                  </div>
                </div>
                <span className="rounded-full bg-[#FFF5E8] px-2.5 py-1 text-[10px] font-semibold text-[#B99353]">Live</span>
              </div>
              <CurrencyConverterWidget />
            </div>

            {/* Quick Notes */}
            <div className="rounded-[1.5rem] border border-[#E1D9EA] bg-[#FBFAF8] p-5 shadow-[0_14px_35px_rgba(45,45,45,0.03)]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B99353] text-white">
                    <ToolIcon icon="notes" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#412460]">Quick Notes</p>
                    <p className="text-[10px] text-[#2D2D2D]/40">Jot down memos and reminders</p>
                  </div>
                </div>
                <span className="rounded-full bg-[#EAE8E5] px-2.5 py-1 text-[10px] font-semibold text-[#2D2D2D]">Memo</span>
              </div>
              <QuickNotesWidget />
            </div>
          </div>

          {/* Products Gallery Featured Card */}
          <div className="mt-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#B99353]">Gallery</p>
            <button
              type="button"
              onClick={() => navigate("/admin-tools/product-gallery")}
              className="group w-full overflow-hidden rounded-[1.5rem] bg-[#2A1740] p-6 text-left shadow-[0_18px_45px_rgba(42,23,64,0.30)] transition hover:shadow-[0_24px_55px_rgba(42,23,64,0.40)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white transition group-hover:bg-[#B99353]">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </div>
                <span className="rounded-full bg-[#B99353] px-3 py-1 text-[10px] font-semibold text-white">Open Gallery</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-white">Products Gallery</h3>
              <p className="mt-2 max-w-lg text-xs leading-relaxed text-white/55">
                Upload and organise supplier product images. Browse by supplier folder, add product names, descriptions, factory locations, and contact details — all in one place.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#B99353]">
                Open Product Gallery
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>

          {/* Tool Category Sections */}
          {TOOL_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mt-8">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#B99353]">{cat.label}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cat.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="group relative flex flex-col justify-between rounded-[1.5rem] border border-[#E8E1EE] bg-white p-5 shadow-[0_10px_28px_rgba(45,45,45,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#412460]/30 hover:shadow-[0_18px_40px_rgba(65,36,96,0.10)]"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#412460]/8 text-[#412460] transition group-hover:bg-[#412460] group-hover:text-white">
                          <ToolIcon icon={tool.icon} />
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tool.badgeColor}`}>
                          {tool.badge}
                        </span>
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-[#412460]">{tool.name}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#2D2D2D]/50">{tool.desc}</p>
                    </div>
                    <div className="mt-4">
                      {tool.action ? (
                        <a
                          href={tool.action}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#B99353]"
                        >
                          Open
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveWidget(activeWidget === tool.id ? null : tool.id)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F2EF] px-4 py-2 text-xs font-semibold text-[#412460] transition hover:bg-[#412460] hover:text-white"
                        >
                          {activeWidget === tool.id ? "Close" : "Use Tool"}
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </AdminPageShell>
  );
}
