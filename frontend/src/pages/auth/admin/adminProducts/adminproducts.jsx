import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");
const MAX_PDF_SIZE = 50 * 1024 * 1024;

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

function FolderIllustration({ name, count }) {
  return (
    <div className="relative h-[150px] w-[174px]">
      <svg viewBox="0 0 256 220" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g clipPath="url(#folder-clip)">
          <path d="M255.743 129.649V53.3823C255.743 44.8686 248.861 37.969 240.368 37.969H15.7604C7.28166 37.969 0.398947 44.8686 0.398947 53.3823V67.8957C0.270697 52.7109 -0.0285511 37.5262 -5.12667e-05 22.3415C0.0141987 6.75677 6.55492 0.271479 22.1301 0.114346C37.0783 -0.0285019 52.0549 0.328618 67.0031 6.76827e-05C75.5388 -0.17135 83.191 1.99994 89.2615 7.79956C99.4217 17.5132 111.463 20.4559 125.114 20.3559C161.209 20.1273 197.304 20.1845 233.4 20.7416C239.085 20.8416 246.467 22.6129 249.929 26.4555C253.862 30.8124 255.914 38.369 255.943 44.54C256.071 72.9096 255.929 101.265 255.743 129.634V129.649Z" fill="#3C2056" />
          <path d="M255.744 53.3823V204.587C255.744 213.1 248.861 220 240.368 220H15.7608C7.28213 220 0.399414 213.1 0.399414 204.587V127.763C0.442164 111.65 0.470664 95.5367 0.456414 79.4377C0.456414 75.5951 0.427914 71.7382 0.399414 67.8956V53.3823C0.399414 44.8685 7.28213 37.969 15.7608 37.969H240.368C248.861 37.969 255.744 44.8685 255.744 53.3823Z" fill="#522E70" />
        </g>
        <defs>
          <clipPath id="folder-clip">
            <rect width="256" height="220" fill="white" />
          </clipPath>
        </defs>
      </svg>
      <div className="absolute inset-x-0 top-[50px] px-4 text-left text-white">
        <p className="break-words text-sm font-semibold leading-tight line-clamp-2">{name}</p>
      </div>
      <div className="absolute inset-x-0 bottom-[18px] px-4 text-left">
        <p className="text-[11px] font-medium text-white/90">{count}</p>
      </div>
    </div>
  );
}

function FileIcon({ type }) {
  const styles = {
    doc: "bg-[#412460]",
    sheet: "bg-[#B99353]",
    pdf: "bg-[#2D2D2D]",
    image: "bg-[#C7A86B]",
  };

  return (
    <span className={`flex h-5 w-5 items-center justify-center rounded-[5px] text-[10px] font-semibold text-white ${styles[type]}`}>
      {type === "pdf" ? "P" : type === "sheet" ? "S" : type === "image" ? "I" : "D"}
    </span>
  );
}

export default function AdminProducts() {
  const navigate = useNavigate();
  const location = useLocation();
  const filterSupplierFromNav = location.state?.filterSupplier;
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [quickForm, setQuickForm] = useState({ supplier_name: "", category: "" });
  const [quickFiles, setQuickFiles] = useState([]);
  const [quickDragging, setQuickDragging] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [showDuplicatePopup, setShowDuplicatePopup] = useState(false);
  const [showFileSizePopup, setShowFileSizePopup] = useState(false);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(filterSupplierFromNav || null);

  // Clear navigation state on mount
  useEffect(() => {
    if (filterSupplierFromNav) {
      // Clear the location state so refresh doesn't re-apply filter
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [filterSupplierFromNav, navigate, location.pathname]);

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

  const handleQuickFiles = (files) => {
    const nextFiles = Array.from(files || []);
    if (!nextFiles.length) return;

    if (nextFiles.some((file) => file.type !== "application/pdf")) {
      setQuickError("Please upload PDF files only.");
      return;
    }

    if (nextFiles.some((file) => file.size > MAX_PDF_SIZE)) {
      setShowFileSizePopup(true);
      return;
    }

    const uploadedFileNames = new Set(
      products.flatMap((product) => (Array.isArray(product.pdf_files) ? product.pdf_files : [])).map((file) => file.name?.toLowerCase()).filter(Boolean)
    );
    const selectedFileNames = new Set(quickFiles.map((file) => file.name.toLowerCase()));
    const duplicateExists = nextFiles.some((file) => uploadedFileNames.has(file.name.toLowerCase()) || selectedFileNames.has(file.name.toLowerCase()));

    if (duplicateExists) {
      setShowDuplicatePopup(true);
      return;
    }

    setQuickFiles((currentFiles) => [...currentFiles, ...nextFiles]);
    setQuickError("");
  };

  const handleQuickUpload = async (event) => {
    event.preventDefault();
    setQuickError("");

    if (!quickForm.category.trim()) {
      setQuickError("Category is required.");
      return;
    }

    const payload = new FormData();
    payload.append("name", quickForm.supplier_name.trim() || quickForm.category.trim());
    payload.append("supplier_name", quickForm.supplier_name.trim());
    payload.append("category", quickForm.category.trim());
    quickFiles.forEach((file) => payload.append("pdf_files", file));

    try {
      setQuickSubmitting(true);
      const response = await fetch(`${API_BASE}/inventory/products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}`,
        },
        body: payload,
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to upload product");
      }

      setQuickForm({ supplier_name: "", category: "" });
      setQuickFiles([]);
      setLoadingProducts(true);
      await loadProducts();
    } catch (error) {
      setQuickError(error.message || "Failed to upload product");
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleDeleteProduct = async (product, fileIndex = 0) => {
    try {
      const response = await fetch(`${API_BASE}/inventory/products/${product.id}?pdfFileIndex=${fileIndex}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}`,
        },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to delete product");
      }
      setLoadingProducts(true);
      await loadProducts();
    } catch (error) {
      setProductsError(error.message || "Failed to delete product");
    }
  };

  const quickAccess = useMemo(() => {
    if (!products.length) {
      return []; // No placeholder folders when loading or empty
    }

    const productsByCategory = products.reduce((acc, product) => {
      const category = product.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = { products: [], suppliers: 0, pdfs: 0 };
      }
      acc[category].products.push(product);
      const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files.length : 0;
      acc[category].suppliers += 1;
      acc[category].pdfs += pdfFiles;
      return acc;
    }, {});

    const categories = Object.entries(productsByCategory).slice(0, 3).map(([name, data], index) => ({
      name,
      count: `${data.pdfs} PDF${data.pdfs === 1 ? "" : "s"} • ${data.suppliers} Supplier${data.suppliers === 1 ? "" : "s"}`,
      active: index === 0,
      category: name,
    }));

    return categories;
  }, [products]);

  const productFileRows = useMemo(() => {
    let filteredProducts = products;

    if (selectedFolder) {
      filteredProducts = filteredProducts.filter((p) => (p.category || "Uncategorized") === selectedFolder.category);
    }

    if (selectedSupplier) {
      filteredProducts = filteredProducts.filter((p) => (p.supplier_name || p.name) === selectedSupplier);
    }

    return filteredProducts.flatMap((product) => {
      const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files : [];

      if (!pdfFiles.length) {
        return [{ product, file: null, fileIndex: 0, rowKey: product.id }];
      }

      return pdfFiles.map((file, fileIndex) => ({
        product,
        file,
        fileIndex,
        rowKey: `${product.id}-${fileIndex}-${file.name || "pdf"}`,
      }));
    });
  }, [products, selectedFolder, selectedSupplier]);

  return (
    <AdminPageShell activePage="Products" title="Products" eyebrow="Cellzen Product Management">
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">My Products</h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin-products/add-products"
              className="inline-flex h-9 items-center justify-center rounded-[10px] bg-[#412460] px-4 text-xs font-semibold text-white shadow-[0_12px_22px_rgba(65,36,96,0.22)] transition hover:bg-[#B99353]"
            >
              Add Products
            </Link>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#F4F2EF] text-[#412460]/50 transition hover:bg-[#412460] hover:text-white" aria-label="Grid view">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
              </svg>
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#F4F2EF] text-[#412460]/50 transition hover:bg-[#412460] hover:text-white" aria-label="Product info">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 11v5" />
                <path d="M12 8h.01" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-8 grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-h-0 min-w-0 overflow-y-auto pr-1">

        {!selectedFolder && (
        <section>
          {loadingProducts ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#E1D9EA] border-t-[#412460]" />
            </div>
          ) : quickAccess.length === 0 ? (
            <div className="rounded-2xl bg-[#FBFAF8] p-8 text-center">
              <p className="text-sm font-semibold text-[#2D2D2D]/70">No folders available</p>
              <p className="mt-2 text-xs text-[#2D2D2D]/50">Add products to create folders</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {quickAccess.map((folder) => (
                <button
                  type="button"
                  key={folder.name}
                  onClick={() => navigate("/admin-suppliers", { state: { filterCategory: folder.category } })}
                  className="group text-left transition active:opacity-80 cursor-pointer"
                >
                  <FolderIllustration name={folder.name} count={folder.count} />
                </button>
              ))}
            </div>
          )}
        </section>
        )}

        {/* Suppliers List - Show when folder selected */}
        {selectedFolder && (
        <section className="mt-2">
          {selectedFolder && (
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-[#412460]">
                  {selectedFolder.name}
                </span>
                <span className="text-xs text-[#2D2D2D]/60">{selectedFolder.count}</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedFolder(null); setSelectedSupplier(null); }}
                className="flex items-center gap-1.5 rounded-2xl border border-[#D9CEE3] px-4 py-2 text-xs font-semibold text-[#412460] transition hover:bg-[#F4F2EF]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
                Back to Folders
              </button>
            </div>
          )}

          {/* Suppliers List */}
          <div className="space-y-3">
            {selectedFolder.products?.map((product) => (
              <button
                key={product.id}
                onClick={() => setSelectedSupplier(selectedSupplier?.id === product.id ? null : product)}
                className={`w-full rounded-2xl border p-4 text-left transition cursor-pointer ${
                  selectedSupplier?.id === product.id
                    ? 'border-[#412460] bg-[#F1EAF6]'
                    : 'border-[#E8E1EE] bg-white hover:border-[#412460]/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#412460] text-white font-semibold">
                      {(product.supplier_name || product.name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-[#412460]">{product.supplier_name || product.name}</p>
                      <p className="text-xs text-[#2D2D2D]/50">{product.supplier_email || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#2D2D2D]/50">
                      {Array.isArray(product.pdf_files) ? product.pdf_files.length : 0} PDFs
                    </span>
                    <svg
                      className={`h-5 w-5 text-[#412460] transition-transform ${
                        selectedSupplier?.id === product.id ? 'rotate-180' : ''
                      }`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>

                {/* Expanded PDF Files */}
                {selectedSupplier?.id === product.id && product.pdf_files && product.pdf_files.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-[#E8E1EE] pt-4">
                    {product.pdf_files.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-white p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2D2D2D] text-[10px] font-semibold text-white">P</span>
                          <span className="truncate text-sm text-[#2D2D2D]/70">{file.name || `PDF ${idx + 1}`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {file.size && (
                            <span className="text-xs text-[#2D2D2D]/40">{formatFileSize([file])}</span>
                          )}
                          {file.url && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); downloadFile(file.url, file.name || `PDF ${idx + 1}`); }}
                              className="flex items-center gap-1 rounded-full bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#B99353]"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3v12" />
                                <path d="m7 10 5 5 5-5" />
                                <path d="M5 21h14" />
                              </svg>
                              Download
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
        )}

        {/* Products Table - Only show when no folder selected */}
        {!selectedFolder && (
          <div className="mt-12 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-left">
              <thead>
                <tr className="text-xs text-[#2D2D2D]/35">
                  <th className="px-4 pb-3">Supplier</th>
                  <th className="px-4 pb-3">Category</th>
                  <th className="px-4 pb-3">Email</th>
                  <th className="px-4 pb-3">Phone</th>
                  <th className="px-4 pb-3">Files</th>
                  <th className="px-4 pb-3 text-center">Link</th>
                  <th className="px-4 pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingProducts && (
                  <tr className="text-xs font-semibold">
                    <td colSpan="8" className="px-4 py-6 text-center text-[#2D2D2D]/45">
                      Loading products...
                    </td>
                  </tr>
                )}
                {!loadingProducts && productsError && (
                  <tr className="text-xs font-semibold">
                    <td colSpan="8" className="px-4 py-6 text-center text-[#E05353]">
                      {productsError}
                    </td>
                  </tr>
                )}
                {!loadingProducts && !productsError && productFileRows.length === 0 && (
                  <tr className="text-xs font-semibold">
                    <td colSpan="8" className="px-4 py-6 text-center text-[#2D2D2D]/45">
                      No products added yet.
                    </td>
                  </tr>
                )}
                {!loadingProducts && !productsError && productFileRows.map(({ product, file, fileIndex, rowKey }, index) => {
                  const displayName = file?.name || `PDF ${fileIndex + 1}`;

                  return (
                  <tr key={rowKey} className={`text-xs font-semibold ${index === 0 ? "bg-[#F1EAF6]" : "bg-white"}`}>
                    <td className="rounded-l-[10px] px-4 py-3 text-[#2D2D2D]/70">
                      <div className="flex items-center gap-3">
                        <FileIcon type="pdf" />
                        <span>{product.supplier_name || product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#2D2D2D]/45">{product.category || "Uncategorized"}</td>
                    <td className="px-4 py-3 text-[#2D2D2D]/45">{product.supplier_email || "-"}</td>
                    <td className="px-4 py-3 text-[#2D2D2D]/45">{product.supplier_phone || "-"}</td>
                    <td className="px-4 py-3 text-[#2D2D2D]/45">
                      {file?.url ? (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block max-w-[220px] truncate text-[#412460] transition hover:text-[#B99353]"
                        >
                          {displayName}
                        </a>
                      ) : (
                        <span className="block max-w-[220px] truncate">{file ? displayName : "No PDF"}</span>
                      )}
                      {file && <p className="mt-1 text-[#2D2D2D]/35">{formatFileSize([file])}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {file?.url ? (
                        <button
                          type="button"
                          onClick={() => downloadFile(file.url, displayName)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#B99353]"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12" />
                            <path d="m7 10 5 5 5-5" />
                            <path d="M5 21h14" />
                          </svg>
                          Download
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="rounded-r-[10px] px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin-products/edit/${product.id}`, { state: { product, file, fileIndex } })}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F4F2EF] text-[#412460] transition hover:bg-[#412460] hover:text-white"
                          aria-label={`Edit ${product.supplier_name || product.name}`}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteProduct({ product, fileIndex })}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF0F0] text-[#E05353] transition hover:bg-[#E05353] hover:text-white"
                          aria-label={`Delete ${product.supplier_name || product.name}`}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M6 6l1 15h10l1-15" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
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
          </div>

        {!selectedFolder && (
          <aside
            onDragEnter={(event) => {
              event.preventDefault();
              setQuickDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setQuickDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setQuickDragging(false);
              handleQuickFiles(event.dataTransfer.files);
            }}
            className={`flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border p-5 shadow-[0_14px_35px_rgba(45,45,45,0.04)] transition xl:sticky xl:top-0 xl:self-start ${
              quickDragging ? "border-[#412460] bg-[#F1EAF6]" : "border-[#E8E1EE] bg-[#FBFAF8]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#412460]">Add Products</h2>
                <p className="mt-1 text-xs text-[#2D2D2D]/45">Upload supplier product files.</p>
              </div>
              <Link to="/admin-products/add-products" className="text-xs font-semibold text-[#B99353] hover:text-[#412460]">
                Full Panel
              </Link>
            </div>

            <form onSubmit={handleQuickUpload} className="mt-6 flex min-h-0 flex-1 flex-col gap-5">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                <label className="block">
                <span className="text-xs font-semibold text-[#2D2D2D]/45">Name of the Suppliers</span>
                  <input
                    type="text"
                    value={quickForm.supplier_name}
                    onChange={(event) => setQuickForm((current) => ({ ...current, supplier_name: event.target.value }))}
                  placeholder="Name of the Suppliers"
                    className="mt-2 w-full rounded-2xl border border-[#E1D9EA] bg-white px-4 py-3 text-sm font-semibold text-[#2D2D2D] outline-none transition placeholder:text-[#2D2D2D]/30 focus:border-[#2D2D2D]/70"
                  />
                </label>

                <label className="block">
                <span className="text-xs font-semibold text-[#2D2D2D]/45">Categories Name</span>
                  <input
                    type="text"
                    value={quickForm.category}
                    onChange={(event) => setQuickForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="Categories Name"
                    className="mt-2 w-full rounded-2xl border border-[#E1D9EA] bg-white px-4 py-3 text-sm font-semibold text-[#2D2D2D] outline-none transition placeholder:text-[#2D2D2D]/30 focus:border-[#2D2D2D]/70"
                  />
                </label>

                <div>
                  <span className="text-xs font-semibold text-[#2D2D2D]/45">Upload Files</span>
                  <div
                    className={`mt-2 flex min-h-[170px] w-full flex-col items-center justify-center rounded-[28px] border-2 border-dashed px-4 py-6 text-center transition ${
                      quickDragging ? "border-[#412460] bg-white" : "border-[#CDBDD8] bg-white"
                    }`}
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#412460] text-xs font-semibold text-white shadow-[0_16px_28px_rgba(65,36,96,0.20)]">
                      PDF
                    </span>
                    <p className="mt-4 text-sm font-semibold text-[#412460]">
                      {quickFiles.length ? `${quickFiles.length} file${quickFiles.length > 1 ? "s" : ""} selected` : "Drag and drop files"}
                    </p>
                    <p className="mt-2 text-xs text-[#2D2D2D]/45">Drop multiple PDFs anywhere inside this Add Products panel.</p>
                  </div>

                  {quickFiles.length > 0 && (
                    <div className="mt-3 space-y-2 pr-1">
                      {quickFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-[#2D2D2D]/60">
                          <span className="truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setQuickFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}
                            className="shrink-0 text-[#E05353]"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {quickError && <p className="text-xs font-semibold text-[#E05353]">{quickError}</p>}
              </div>

              <button
                type="submit"
                disabled={quickSubmitting}
                className="w-full shrink-0 rounded-2xl bg-[#412460] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(65,36,96,0.22)] transition hover:bg-[#B99353] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {quickSubmitting ? "Uploading..." : "Upload"}
              </button>
            </form>
          </aside>
        )}
        </div>
      </div>
      {showDuplicatePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-lg font-semibold text-[#412460]">Catalog Already Uploaded</h2>
            <p className="mt-2 text-xs text-[#2D2D2D]/50">This PDF catalog is already in the products list.</p>
            <button
              type="button"
              onClick={() => setShowDuplicatePopup(false)}
              className="mt-6 w-full rounded-2xl bg-[#412460] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#B99353]"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {showFileSizePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-lg font-semibold text-[#412460]">File Is More Than 50 MB</h2>
            <p className="mt-2 text-xs text-[#2D2D2D]/50">Each PDF file must be 50 MB or less.</p>
            <button
              type="button"
              onClick={() => setShowFileSizePopup(false)}
              className="mt-6 w-full rounded-2xl bg-[#412460] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#B99353]"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {pendingDeleteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-lg font-semibold text-[#412460]">Do you really want to delete it?</h2>
            <p className="mt-2 text-xs text-[#2D2D2D]/50">This product catalog will be removed from the products list.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPendingDeleteProduct(null)}
                className="rounded-2xl border border-[#D9CEE3] px-4 py-3 text-sm font-semibold text-[#412460] transition hover:bg-[#F4F2EF]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { product: productToDelete, fileIndex } = pendingDeleteProduct;
                  setPendingDeleteProduct(null);
                  await handleDeleteProduct(productToDelete, fileIndex);
                }}
                className="rounded-2xl bg-[#E05353] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#412460]"
              >
                Yes, Go ahead
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
