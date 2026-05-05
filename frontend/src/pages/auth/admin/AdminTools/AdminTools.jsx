import React from "react";
import { useNavigate } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

export default function AdminTools() {
  const navigate = useNavigate();

  return (
    <AdminPageShell activePage="Tools" title="Admin Tools" eyebrow="Utility tools for Cellzen operations">
      <div className="flex h-full flex-col gap-5 overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">

        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">Admin Tools</h2>
            <p className="mt-0.5 text-xs text-[#2D2D2D]/45">Quick-access utilities for Cellzen operations.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F4F2EF] px-4 py-2 text-xs font-semibold text-[#412460]">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            2 Tools
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-5 lg:grid-cols-2">

            {/* Products Gallery */}
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

            {/* Barcode Generator — placeholder until the generator page is built. */}
            <div className="relative w-full overflow-hidden rounded-[1.5rem] bg-white p-6 text-left border border-[#E8E1EE] shadow-[0_14px_35px_rgba(45,45,45,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#412460] text-white">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 5v14" />
                    <path d="M7 5v14" />
                    <path d="M11 5v14" />
                    <path d="M15 5v14" />
                    <path d="M19 5v14" />
                  </svg>
                </div>
                <span className="rounded-full bg-[#FFF5E8] px-3 py-1 text-[10px] font-semibold text-[#B99353]">Coming Soon</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[#412460]">Barcode Generator</h3>
              <p className="mt-2 max-w-lg text-xs leading-relaxed text-[#2D2D2D]/55">
                Generate and print EAN-13, QR, or Code-128 barcodes for products. Useful for inventory tagging, retail labels, and shipment tracking.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#F4F2EF] px-4 py-2 text-xs font-semibold text-[#2D2D2D]/45">
                Available soon
              </div>
            </div>

          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
