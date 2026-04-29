import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CostumersPortal from "./CostumersPortal";

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

export default function CustomerCatalogList() {
  const navigate = useNavigate();
  const location = useLocation();
  const category = location.state?.category;
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("card"); // "card" or "list"

  useEffect(() => {
    const loadSharedProducts = async () => {
      try {
        const response = await fetch(`${API_BASE}/inventory/products?sharedWith=customers`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}`,
          },
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
                {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""} available
              </p>
            </div>
          </div>

          {/* Search Bar and View Toggle */}
          <div className="flex items-center gap-3">
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

            {/* View Toggle Buttons */}
            <div className="flex rounded-xl border border-[#E1D9EA] bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  viewMode === "list"
                    ? "bg-[#412460] text-white"
                    : "text-[#2D2D2D]/50 hover:text-[#412460]"
                }`}
                title="List view"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  viewMode === "card"
                    ? "bg-[#412460] text-white"
                    : "text-[#2D2D2D]/50 hover:text-[#412460]"
                }`}
                title="Card view"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
            </div>
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

        {!loading && !error && filteredProducts.length > 0 && (
          <div className="mt-6 flex-1 overflow-auto">
            {viewMode === "card" ? (
              /* Card View */
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((product) => {
                  const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files : [];
                  return (
                    <div
                      key={product.id}
                      className="flex flex-col rounded-2xl border border-[#E1D9EA] bg-white p-5 transition hover:border-[#412460]/30 hover:shadow-[0_4px_20px_rgba(65,36,96,0.08)]"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#412460] text-white">
                          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M14 3v5a2 2 0 0 0 2 2h5" />
                            <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l7 7v9a2 2 0 0 1-2 2Z" />
                          </svg>
                        </div>
                        <span className="rounded-full bg-[#F4F2EF] px-3 py-1 text-xs font-semibold text-[#412460]">
                          {pdfFiles.length} PDF{pdfFiles.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="mt-4 flex-1">
                        <h3 className="text-sm font-semibold text-[#2D2D2D] line-clamp-2">
                          {product.supplier_name || "Unnamed Supplier"}
                        </h3>
                        <p className="mt-1 text-xs text-[#2D2D2D]/50">
                          {product.category || "No category"}
                        </p>
                        {product.factory_location && (
                          <p className="mt-1 text-xs text-[#2D2D2D]/40">
                            <svg className="mr-1 inline h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            {product.factory_location}
                          </p>
                        )}
                      </div>

                      {/* PDF Files List */}
                      {pdfFiles.length > 0 && (
                        <div className="mt-4 space-y-2 border-t border-[#E1D9EA] pt-4">
                          {pdfFiles.map((file, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-xl bg-[#FBFAF8] px-3 py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B99353] text-[10px] font-semibold text-white">
                                  PDF
                                </span>
                                <span className="truncate text-xs text-[#2D2D2D]/70">{file.name || `File ${idx + 1}`}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => downloadFile(file.url, file.name)}
                                disabled={!file.url}
                                className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#412460] text-white transition hover:bg-[#B99353] disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Download"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <path d="m7 10 5 5 5-5" />
                                  <path d="M12 15V3" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List View */
              <div className="space-y-3">
                {filteredProducts.map((product) => {
                  const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files : [];
                  return (
                    <div
                      key={product.id}
                      className="flex items-center gap-4 rounded-2xl border border-[#E1D9EA] bg-white p-4 transition hover:border-[#412460]/30 hover:shadow-[0_4px_20px_rgba(65,36,96,0.08)]"
                    >
                      {/* Icon */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#412460] text-white">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14 3v5a2 2 0 0 0 2 2h5" />
                          <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l7 7v9a2 2 0 0 1-2 2Z" />
                        </svg>
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-[#2D2D2D] truncate">
                          {product.supplier_name || "Unnamed Supplier"}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-[#2D2D2D]/50">
                          <span>{product.category || "No category"}</span>
                          {product.factory_location && (
                            <span className="flex items-center gap-1">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              {product.factory_location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* PDF Count & Download */}
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-[#F4F2EF] px-3 py-1 text-xs font-semibold text-[#412460]">
                          {pdfFiles.length} PDF{pdfFiles.length !== 1 ? "s" : ""}
                        </span>
                        {pdfFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={() => downloadFile(pdfFiles[0].url, pdfFiles[0].name)}
                            disabled={!pdfFiles[0].url}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#412460] text-white transition hover:bg-[#B99353] disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Download"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <path d="m7 10 5 5 5-5" />
                              <path d="M12 15V3" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </CostumersPortal>
  );
}
