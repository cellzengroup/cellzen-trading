import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

const FALLBACK_QUICK_ACCESS = [
  { name: "Mobile Phones", count: "51 items", active: true },
  { name: "Accessories", count: "24 items" },
  { name: "Gadgets", count: "18 items" },
  { name: "Project Summary for Product Plans", count: "Last modified", preview: true },
];

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

function FolderIllustration({ active }) {
  return (
    <div className="absolute inset-x-0 top-0 h-[74px] overflow-hidden">
      <div className={`absolute left-4 top-3 h-10 w-[68px] rounded-[14px] ${active ? "bg-white/16" : "bg-[#EEE9F3]"}`} />
      <div className={`absolute left-6 top-5 h-10 w-[92px] rounded-[14px] ${active ? "bg-white/22" : "bg-[#F7F4FA]"}`} />
      <div className={`absolute left-0 right-0 top-[42px] h-11 rounded-t-[22px] ${active ? "bg-white/13" : "bg-gradient-to-b from-white to-[#EAE4EF]"}`} />
    </div>
  );
}

function AvatarStack({ active }) {
  const colors = ["bg-[#412460]", "bg-[#B99353]", "bg-[#2D2D2D]", "bg-[#6B4C82]", "bg-[#C7A86B]"];

  return (
    <div className="mt-4 flex -space-x-1.5">
      {colors.map((color, index) => (
        <span
          key={color}
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
            active ? "border-[#412460] text-white" : "border-white text-white"
          } ${color}`}
        >
          {index + 1}
        </span>
      ))}
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
    if (!products.length) return FALLBACK_QUICK_ACCESS;

    const countsByCategory = products.reduce((counts, product) => {
      const category = product.category || "Uncategorized";
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {});

    const categories = Object.entries(countsByCategory).slice(0, 3).map(([name, count], index) => ({
      name,
      count: `${count} item${count > 1 ? "s" : ""}`,
      active: index === 0,
    }));

    return [...categories, FALLBACK_QUICK_ACCESS[3]];
  }, [products]);

  const productFileRows = useMemo(() => {
    return products.flatMap((product) => {
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
  }, [products]);

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
        <section>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {quickAccess.map((folder) => (
              <button
                type="button"
                key={folder.name}
                className={`relative h-[118px] overflow-hidden rounded-[16px] px-4 pb-4 pt-3 text-left shadow-[0_16px_28px_rgba(65,36,96,0.09)] transition hover:-translate-y-0.5 ${
                  folder.active ? "bg-[#412460] text-white" : "bg-[#F4F2EF] text-[#2D2D2D]"
                }`}
              >
                {folder.preview ? (
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-4 w-4 rounded-[4px] bg-[#B99353]" />
                      <p className="max-w-[140px] text-sm font-semibold leading-tight text-[#412460]">Project Summary for Product Plans</p>
                      <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-[#412460] text-[10px] font-semibold text-white">A</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#2D2D2D]/40">Last Modified</p>
                      <p className="mt-1 text-xs font-semibold text-[#2D2D2D]/50">Sept 9, 2026 - 04:23 AM</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <FolderIllustration active={folder.active} />
                    <div className="relative z-10">
                      <p className={`text-xs font-medium ${folder.active ? "text-white/58" : "text-[#2D2D2D]/40"}`}>Shared with</p>
                      <AvatarStack active={folder.active} />
                    </div>
                    <div className="relative z-10 mt-5">
                      <p className="text-sm font-semibold leading-none">{folder.name}</p>
                      <p className={`mt-2 text-xs font-medium ${folder.active ? "text-white/68" : "text-[#2D2D2D]/50"}`}>{folder.count}</p>
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-9">
          <div className="overflow-x-auto">
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
        </section>
          </div>

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
