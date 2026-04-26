import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

const FIELD_STYLES =
  "mt-2 w-full rounded-2xl border border-[#E1D9EA] bg-white px-4 py-3 text-sm font-semibold text-[#2D2D2D] outline-none transition placeholder:text-[#2D2D2D]/30 focus:border-[#2D2D2D]/70";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");
const MAX_PDF_SIZE = 50 * 1024 * 1024;

function normalizePdfFiles(files) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  if (typeof files === "string") {
    try {
      const parsed = JSON.parse(files);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function AddProducts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { productId } = useParams();
  const isEditMode = Boolean(productId);
  const clickedEditFile = location.state?.file;
  const clickedEditFileIndex = location.state?.fileIndex;
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [formData, setFormData] = useState({
    supplier_name: "",
    supplier_email: "",
    supplier_phone: "",
    factory_location: "",
    category: "",
  });
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFileSizePopup, setShowFileSizePopup] = useState(false);
  const [existingPdfFiles, setExistingPdfFiles] = useState(() => {
    if (clickedEditFile) return [clickedEditFile];
    return normalizePdfFiles(location.state?.product?.pdf_files);
  });

  useEffect(() => {
    if (!productId) return;

    const loadProduct = async () => {
      try {
        const response = await fetch(`${API_BASE}/inventory/products/${productId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}`,
          },
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to load product");
        }

        const product = result.data;
        setFormData({
          supplier_name: product.supplier_name || "",
          supplier_email: product.supplier_email || "",
          supplier_phone: product.supplier_phone || "",
          factory_location: product.factory_location || "",
          category: product.category || "",
        });
        setExistingPdfFiles(clickedEditFile ? [clickedEditFile] : normalizePdfFiles(product.pdf_files).slice(0, 1));
      } catch (error) {
        setSubmitError(error.message || "Failed to load product");
      }
    };

    loadProduct();
  }, [productId, clickedEditFile]);

  const handlePdfFiles = (files) => {
    const nextFiles = Array.from(files || []);
    if (!nextFiles.length) return;

    if (nextFiles.some((file) => file.type !== "application/pdf")) {
      setFileError("Please upload PDF files only.");
      return;
    }

    if (nextFiles.some((file) => file.size > MAX_PDF_SIZE)) {
      setShowFileSizePopup(true);
      return;
    }

    setSelectedFiles((currentFiles) => [...currentFiles, ...nextFiles]);
    setFileError("");
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handlePdfFiles(event.dataTransfer.files);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    if (!formData.category.trim()) {
      setSubmitError("Category is required.");
      return;
    }

    const payload = new FormData();
    payload.append("name", formData.supplier_name.trim() || formData.category.trim());
    if (isEditMode && Number.isInteger(clickedEditFileIndex)) {
      payload.append("pdf_file_index", String(clickedEditFileIndex));
    }
    Object.entries(formData).forEach(([key, value]) => payload.append(key, value.trim()));
    selectedFiles.forEach((file) => payload.append("pdf_files", file));

    try {
      setIsSubmitting(true);
      const response = await fetch(`${API_BASE}/inventory/products${isEditMode ? `/${productId}` : ""}`, {
        method: isEditMode ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}`,
        },
        body: payload,
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to save product");
      }

      navigate("/admin-products");
    } catch (error) {
      setSubmitError(error.message || "Failed to save product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminPageShell activePage="Products" title={isEditMode ? "Edit Products" : "Add Products"} eyebrow="Add supplier details and product PDF">
      <div className="min-h-full rounded-[2rem] bg-white p-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#B99353]">Supplier Product File</p>
            <h2 className="mt-2 text-lg font-semibold text-[#412460]">{isEditMode ? "Edit Products" : "Add Products"}</h2>
            <p className="mt-2 max-w-xl text-xs text-[#2D2D2D]/45">
              Add supplier contact details, factory location, and attach the product PDF document.
            </p>
          </div>

          <Link
            to="/admin-products"
            className="inline-flex items-center justify-center rounded-2xl bg-[#F4F2EF] px-5 py-3 text-xs font-semibold text-[#412460] transition hover:bg-[#412460] hover:text-white"
          >
            Back to Products
          </Link>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_330px]">
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-[#E8E1EE] bg-[#FBFAF8] p-5 sm:p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-[#2D2D2D]/45">Name of the Suppliers</span>
                <input name="supplier_name" type="text" value={formData.supplier_name} onChange={handleFieldChange} placeholder="Name of the Suppliers" className={FIELD_STYLES} />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#2D2D2D]/45">Email</span>
                <input name="supplier_email" type="email" value={formData.supplier_email} onChange={handleFieldChange} placeholder="supplier@email.com" className={FIELD_STYLES} />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#2D2D2D]/45">Phone Number</span>
                <input name="supplier_phone" type="tel" value={formData.supplier_phone} onChange={handleFieldChange} placeholder="+86 000 0000 0000" className={FIELD_STYLES} />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#2D2D2D]/45">Factory Location</span>
                <input name="factory_location" type="text" value={formData.factory_location} onChange={handleFieldChange} placeholder="City, province, country" className={FIELD_STYLES} />
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs font-semibold text-[#2D2D2D]/45">Categories Name</span>
                <input name="category" type="text" value={formData.category} onChange={handleFieldChange} placeholder="Categories Name" className={FIELD_STYLES} />
              </label>
            </div>

            <div className="mt-6">
              <span className="text-xs font-semibold text-[#2D2D2D]/45">Product PDF</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
                className={`mt-2 flex min-h-[190px] w-full cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed px-5 py-8 text-center transition ${
                  isDragging ? "border-[#412460] bg-[#F1EAF6]" : "border-[#CDBDD8] bg-white hover:border-[#412460] hover:bg-[#F7F3FA]"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="sr-only"
                  onChange={(event) => handlePdfFiles(event.target.files)}
                />
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#412460] text-white shadow-[0_16px_28px_rgba(65,36,96,0.24)]">
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3v5a2 2 0 0 0 2 2h5" />
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l7 7v9a2 2 0 0 1-2 2Z" />
                    <path d="M9 15h6" />
                    <path d="M9 18h4" />
                  </svg>
                </div>
                <p className="mt-4 text-sm font-semibold text-[#412460]">
                  {selectedFiles.length ? `${selectedFiles.length} PDF file${selectedFiles.length > 1 ? "s" : ""} selected` : "Drag and drop supplier product PDFs"}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#2D2D2D]/45">
                  Drop multiple PDFs here, or click to browse and attach documents.
                </p>
                {fileError && <p className="mt-3 text-xs font-semibold text-[#E05353]">{fileError}</p>}
              </button>
              {selectedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-[#2D2D2D]/60">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}
                        className="text-[#E05353]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {submitError && <p className="mt-4 text-xs font-semibold text-[#E05353]">{submitError}</p>}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link
                to="/admin-products"
                className="inline-flex items-center justify-center rounded-2xl border border-[#D9CEE3] px-6 py-3 text-sm font-semibold text-[#412460] transition hover:bg-[#F4F2EF]"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl bg-[#412460] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(65,36,96,0.22)] transition hover:bg-[#B99353] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : isEditMode ? "Update Product" : "Save Product"}
              </button>
            </div>
          </form>

          <aside className="rounded-[28px] bg-[#412460] p-6 text-white shadow-[0_18px_38px_rgba(65,36,96,0.22)]">
            <p className="text-xs font-semibold text-white/55">{isEditMode ? "Update File" : "New File"}</p>
            <h3 className="mt-3 text-lg font-semibold">Supplier Product PDF</h3>
            <p className="mt-3 text-xs leading-6 text-white/62">
              Keep each product entry connected to one supplier profile and one uploaded PDF file.
            </p>
            <div className="mt-8 rounded-[24px] bg-white/10 p-4">
              {isEditMode && existingPdfFiles.length > 0 ? (
                <div className="space-y-2">
                  {existingPdfFiles.map((file, index) => (
                    <a
                      key={`${file.name}-${index}`}
                      href={file.url || "#"}
                      target={file.url ? "_blank" : undefined}
                      rel={file.url ? "noreferrer" : undefined}
                      onClick={(event) => {
                        if (!file.url) event.preventDefault();
                      }}
                      className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2 transition hover:bg-white/15"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#B99353] text-xs font-semibold text-white">
                        PDF
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{file.name || `Catalog PDF ${index + 1}`}</p>
                        <p className="mt-1 text-xs font-semibold text-[#B99353]">{file.url ? "Open PDF" : "PDF link unavailable"}</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#B99353] text-xs font-semibold">PDF</span>
                  <div>
                    <p className="text-sm font-semibold">Required Upload</p>
                    <p className="mt-1 text-xs text-white/50">Supplier catalog or product sheet</p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
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
    </AdminPageShell>
  );
}
