import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

function formatFileSize(files = []) {
  const totalSize = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  if (!totalSize) return "0 MB";
  if (totalSize >= 1024 * 1024 * 1024) return `${(totalSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadFile(url, fileName) {
  if (!url) return;

  const link = document.createElement("a");
  const separator = url.includes("?") ? "&" : "?";
  link.href = `${url}${separator}download=${encodeURIComponent(fileName || "catalog.pdf")}`;
  link.download = fileName || "catalog.pdf";
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function AdminSuppliers() {
  const navigate = useNavigate();
  const location = useLocation();
  const filterCategoryFromNav = location.state?.filterCategory;
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(filterCategoryFromNav || null);

  // Clear navigation state on mount
  useEffect(() => {
    if (filterCategoryFromNav) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [filterCategoryFromNav, navigate, location.pathname]);

  const loadProducts = async () => {
    try {
      setProductsError("");
      const response = await fetch(`${API_BASE}/inventory/products`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}`,
        },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch products");
      }
      setProducts(result.data || []);
    } catch (error) {
      setProductsError(error.message || "Failed to fetch products");
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Group products by supplier
  const suppliersData = useMemo(() => {
    // First filter by category if selected
    let filteredProducts = products;
    if (selectedCategory) {
      filteredProducts = products.filter((p) => (p.category || "Uncategorized") === selectedCategory);
    }

    const grouped = filteredProducts.reduce((acc, product) => {
      const supplierKey = product.supplier_name || product.name || "Unknown Supplier";
      if (!acc[supplierKey]) {
        acc[supplierKey] = {
          supplierName: supplierKey,
          supplierEmail: product.supplier_email || "-",
          supplierPhone: product.supplier_phone || "-",
          factoryLocation: product.factory_location || "-",
          products: [],
          totalPdfs: 0,
        };
      }
      acc[supplierKey].products.push(product);
      const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files.length : 0;
      acc[supplierKey].totalPdfs += pdfFiles;
      return acc;
    }, {});

    let suppliers = Object.values(grouped);

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      suppliers = suppliers.filter(
        (s) =>
          s.supplierName.toLowerCase().includes(query) ||
          s.supplierEmail.toLowerCase().includes(query) ||
          s.supplierPhone.toLowerCase().includes(query) ||
          s.factoryLocation.toLowerCase().includes(query)
      );
    }

    return suppliers;
  }, [products, searchQuery, selectedCategory]);

  return (
    <AdminPageShell activePage="Suppliers" title="Suppliers" eyebrow="Cellzen Supplier Management">
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">Our Suppliers</h2>
            {selectedCategory && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-[#2D2D2D]/60">Category: {selectedCategory}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#412460] transition hover:text-[#B99353]"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                  Clear
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search suppliers..."
                className="h-9 w-48 rounded-[10px] border border-[#E8E1EE] bg-white pl-9 pr-4 text-xs font-medium text-[#2D2D2D] outline-none transition focus:border-[#412460] sm:w-64"
              />
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2D2D2D]/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2D2D2D]/40 hover:text-[#412460]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate("/admin-products/add-products", { state: { category: selectedCategory } })}
              className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#412460] px-4 text-xs font-semibold text-white shadow-[0_12px_22px_rgba(65,36,96,0.22)] transition hover:bg-[#B99353]"
            >
              Add Supplier
            </button>
          </div>
        </div>

        <div className="mt-8 min-h-0 flex-1">
          <div className="min-h-0 min-w-0 overflow-y-auto pr-1">
            {/* Suppliers Quick Access */}
            <section>
              {!loadingProducts && !productsError && suppliersData.length === 0 && !searchQuery && (
                <div className="rounded-2xl bg-[#F4F2EF] p-8 text-center">
                  <p className="text-sm font-semibold text-[#2D2D2D]/70">No suppliers yet</p>
                  <p className="mt-1 text-xs text-[#2D2D2D]/50">Add your first supplier using the button above</p>
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {suppliersData.map((supplier) => (
                  <div
                    key={supplier.supplierName}
                    className="group relative rounded-2xl border border-[#E8E1EE] bg-[#FBFAF8] p-5 transition hover:border-[#412460] hover:shadow-[0_8px_24px_rgba(65,36,96,0.12)]"
                  >
                    {/* Edit Button - Top Right */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const firstProduct = supplier.products[0];
                        if (firstProduct) {
                          navigate(`/admin-products/edit/${firstProduct.id}`, {
                            state: {
                              product: firstProduct,
                              file: firstProduct.pdf_files?.[0],
                              fileIndex: 0,
                              supplierName: supplier.supplierName,
                              supplierEmail: supplier.supplierEmail,
                              supplierPhone: supplier.supplierPhone,
                              factoryLocation: supplier.factoryLocation,
                              category: selectedCategory
                            }
                          });
                        }
                      }}
                      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#F4F2EF] text-[#412460] transition hover:bg-[#412460] hover:text-white z-10"
                      title={`Edit ${supplier.supplierName}`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                      </svg>
                    </button>

                    {/* Clickable Card Content */}
                    <button
                      type="button"
                      onClick={() => navigate("/admin-suppliers-product", { state: { supplierName: supplier.supplierName, category: selectedCategory } })}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#412460] text-white text-lg font-semibold">
                        {supplier.supplierName.charAt(0).toUpperCase()}
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-[#412460] line-clamp-1 pr-10">{supplier.supplierName}</h3>
                      <p className="mt-1 text-xs text-[#2D2D2D]/50">{supplier.products.length} Product{supplier.products.length === 1 ? "" : "s"} • {supplier.totalPdfs} PDF{supplier.totalPdfs === 1 ? "" : "s"}</p>
                    </button>
                  </div>
                ))}
              </div>
              {searchQuery && suppliersData.length === 0 && (
                <div className="mt-8 rounded-2xl bg-[#F4F2EF] p-8 text-center">
                  <p className="text-sm font-semibold text-[#2D2D2D]/70">No suppliers found</p>
                  <p className="mt-1 text-xs text-[#2D2D2D]/50">Try adjusting your search terms</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
