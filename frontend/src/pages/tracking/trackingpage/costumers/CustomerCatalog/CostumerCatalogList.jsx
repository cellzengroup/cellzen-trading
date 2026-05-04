import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CostumersPortal from "../CostumersPortal";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

function downloadFile(url, filename) {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Check if category should use catalog preview mode (Hardware and Sanitaries)
const isCatalogPreviewCategory = (category) => {
  if (!category) return false;
  const previewCategories = ["hardware", "sanitaries"];
  return previewCategories.includes(category.toLowerCase());
};

// Catalog Card Component with PDF Preview - Uses object/embed for better compatibility
function CatalogCard({ file, onDownload, onOpen }) {
  // Helper to decode and clean filename
  const getDisplayName = (name) => {
    if (!name) return "Catalog";
    try {
      // Try to decode if URI encoded
      let decoded = name;
      if (/%[0-9A-Fa-f]{2}/.test(name)) {
        try {
          decoded = decodeURIComponent(name);
        } catch (e) {
          // Use original if decoding fails
        }
      }
      // Remove .pdf extension
      return decoded.replace(/\.pdf$/i, "");
    } catch (e) {
      return name.replace(/\.pdf$/i, "");
    }
  };
  const displayName = getDisplayName(file?.name);

  return (
    <div className="group flex flex-col rounded-2xl border border-[#E1D9EA] bg-white overflow-hidden transition hover:border-[#412460]/30 hover:shadow-[0_4px_20px_rgba(65,36,96,0.08)]">
      {/* PDF Preview Area - Click to open in new window */}
      <div
        onClick={() => onOpen(file?.url)}
        className="relative w-full cursor-pointer bg-[#F4F2EF] overflow-hidden"
        style={{ aspectRatio: '4/3' }}
        title="Click to view catalog"
      >
        {/* PDF Preview - First page only, no scrollbars */}
        {file?.url ? (
          <div className="h-full w-full overflow-hidden bg-white relative">
            <iframe
              src={`${file.url}#page=1&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0`}
              className="absolute inset-0 h-full w-full border-0"
              style={{
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
              scrolling="no"
              title={displayName}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#412460]/10 text-[#412460]">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 3v5a2 2 0 0 0 2 2h5" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l7 7v9a2 2 0 0 1-2 2Z" />
              </svg>
            </div>
            <p className="mt-3 text-xs text-[#2D2D2D]/50 text-center">Click to view PDF</p>
          </div>
        )}

        {/* Hover overlay with view hint */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#412460]/0 transition group-hover:bg-[#412460]/10 pointer-events-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[#412460] opacity-0 shadow-lg transition group-hover:opacity-100 scale-90 group-hover:scale-100">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Catalog Info - Name and Download Only */}
      <div className="flex items-center justify-between p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#2D2D2D] chinese-font">
            {displayName}
          </h3>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file?.url, file?.name);
          }}
          disabled={!file?.url}
          className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#412460] text-white transition hover:bg-[#B99353] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Download"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Simple Catalog Card for all categories - Shows first page only, no scroll
function SimpleCatalogCard({ file, onDownload, onOpen }) {
  // Helper to decode and clean filename
  const getDisplayName = (name) => {
    if (!name) return "Catalog";
    try {
      // Try to decode if URI encoded
      let decoded = name;
      if (/%[0-9A-Fa-f]{2}/.test(name)) {
        try {
          decoded = decodeURIComponent(name);
        } catch (e) {
          // Use original if decoding fails
        }
      }
      // Remove .pdf extension
      return decoded.replace(/\.pdf$/i, "");
    } catch (e) {
      return name.replace(/\.pdf$/i, "");
    }
  };
  const displayName = getDisplayName(file?.name);

  return (
    <div className="group flex flex-col rounded-2xl border border-[#E1D9EA] bg-white overflow-hidden transition hover:border-[#412460]/30 hover:shadow-[0_4px_20px_rgba(65,36,96,0.08)]">
      {/* PDF Preview Area - Click to open in new window */}
      <div
        onClick={() => onOpen(file?.url)}
        className="relative w-full cursor-pointer bg-[#F4F2EF] overflow-hidden"
        style={{ aspectRatio: '4/3' }}
        title="Click to view catalog"
      >
        {/* PDF Preview - First page only, no scrollbars */}
        {file?.url ? (
          <div className="h-full w-full overflow-hidden bg-white relative">
            <iframe
              src={`${file.url}#page=1&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0`}
              className="absolute inset-0 h-full w-full border-0"
              style={{
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
              scrolling="no"
              title={displayName}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#412460]/10 text-[#412460]">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 3v5a2 2 0 0 0 2 2h5" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l7 7v9a2 2 0 0 1-2 2Z" />
              </svg>
            </div>
            <p className="mt-2 text-xs text-[#2D2D2D]/50 text-center">Click to view PDF</p>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#412460]/0 transition group-hover:bg-[#412460]/10 pointer-events-none">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#412460] opacity-0 shadow-lg transition group-hover:opacity-100 scale-90 group-hover:scale-100">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Catalog Info - Name and Download Only */}
      <div className="flex items-center justify-between p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#2D2D2D] chinese-font">
            {displayName}
          </h3>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file?.url, file?.name);
          }}
          disabled={!file?.url}
          className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#412460] text-white transition hover:bg-[#B99353] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Download"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function CostumerCatalogList() {
  const navigate = useNavigate();
  const location = useLocation();
  const category = location.state?.category;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Check if this is a catalog preview category
  const isPreviewMode = isCatalogPreviewCategory(category);

  useEffect(() => {
    const loadSharedProducts = async () => {
      try {
        const response = await fetch(`${API_BASE}/inventory/products?sharedWith=customers`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("customer_token") || ""}`,
          },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to load catalogs");
        }
        // Filter products that are actually shared with customers
        const sharedProducts = (result.data || []).filter(p =>
          p.share_to && p.share_to.customers === true
        );
        setProducts(sharedProducts);
      } catch (err) {
        setError(err.message || "Failed to load catalogs");
      } finally {
        setLoading(false);
      }
    };

    loadSharedProducts();
  }, []);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Filter by category if provided
    if (category) {
      filtered = filtered.filter(p => (p.category || "Uncategorized") === category);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.supplier_name || "").toLowerCase().includes(query) ||
          (p.category || "").toLowerCase().includes(query) ||
          (p.factory_location || "").toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [products, category, searchQuery]);

  // Extract all PDF files from products for preview mode
  const catalogFiles = useMemo(() => {
    if (!isPreviewMode) return [];

    const files = [];
    filteredProducts.forEach((product) => {
      const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files : [];
      pdfFiles.forEach((file) => {
        if (file?.url) {
          files.push({
            ...file,
            productId: product.id,
            productName: product.name,
          });
        }
      });
    });
    return files;
  }, [filteredProducts, isPreviewMode]);

  // Open PDF in new window
  const openPdfInNewWindow = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <CostumersPortal activePage="Catalogs">
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">
        {/* Header with Back Button */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/tracking/trackingpage/costumers/catalogs")}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4F2EF] text-[#412460] transition hover:bg-[#412460] hover:text-white"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-[#412460]">
                {category || "All Products"}
              </h2>
              <p className="mt-1 text-xs text-[#2D2D2D]/45">
                {isPreviewMode
                  ? `${catalogFiles.length} catalog${catalogFiles.length !== 1 ? "s" : ""} available`
                  : `${filteredProducts.length} product${filteredProducts.length !== 1 ? "s" : ""} available`
                }
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-2xl border border-[#E1D9EA] bg-white px-4 py-2.5 pl-10 text-sm font-semibold text-[#2D2D2D] outline-none transition placeholder:text-[#2D2D2D]/40 focus:border-[#412460]/50"
            />
            <svg
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2D2D2D]/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2D2D2D]/40 hover:text-[#2D2D2D]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="mt-8 flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-[#2D2D2D]/60">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E1D9EA] border-t-[#412460]" />
              Loading products...
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="mt-8 rounded-2xl bg-[#FEE2E2] p-4 text-sm text-[#E05353]">
            {error}
          </div>
        )}

        {!loading && !error && filteredProducts.length === 0 && (
          <div className="mt-8 flex flex-1 items-center justify-center rounded-2xl bg-[#FBFAF8] p-8">
            <div className="text-center">
              <p className="text-sm font-semibold text-[#2D2D2D]/70">No products available</p>
              <p className="mt-2 text-xs text-[#2D2D2D]/50">
                {searchQuery ? "No results match your search" : "No products in this category"}
              </p>
            </div>
          </div>
        )}

        {/* Catalog Preview Mode for Hardware and Sanitaries */}
        {isPreviewMode && !loading && !error && catalogFiles.length > 0 && (
          <div className="mt-6 flex-1 overflow-auto">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {catalogFiles.map((file, idx) => (
                <CatalogCard
                  key={`${file.productId}-${idx}`}
                  file={file}
                  onDownload={downloadFile}
                  onOpen={openPdfInNewWindow}
                />
              ))}
            </div>
          </div>
        )}

        {/* Standard Product List Mode for other categories - Shows PDF preview */}
        {!isPreviewMode && !loading && !error && filteredProducts.length > 0 && (
          <div className="mt-6 flex-1 overflow-auto">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files : [];
                return pdfFiles.map((file, idx) => (
                  <SimpleCatalogCard
                    key={`${product.id}-${idx}`}
                    file={file}
                    onDownload={downloadFile}
                    onOpen={openPdfInNewWindow}
                  />
                ));
              })}
            </div>
          </div>
        )}
      </div>
    </CostumersPortal>
  );
}
