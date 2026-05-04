import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");
const GALLERY_CATEGORY = "Product Gallery";
const MAX_IMAGES = 50;
const MAX_SIZE = 20 * 1024 * 1024;
const COMPRESS_MAX_DIMENSION = 1600;
const COMPRESS_QUALITY = 0.85;
const REQUEST_TIMEOUT_MS = 60000;
// Direct-to-Supabase uploads can run hotter than the old proxy-through-backend
// path — Render's free-tier bandwidth is no longer the bottleneck.
const UPLOAD_CONCURRENCY = 8;

const FIELD = "mt-2 w-full rounded-2xl border border-[#E1D9EA] bg-white px-4 py-3 text-sm font-semibold text-[#2D2D2D] outline-none transition placeholder:text-[#2D2D2D]/30 focus:border-[#412460]";
const LABEL = "text-xs font-semibold text-[#2D2D2D]/45";

// Resize + re-encode to slash upload sizes. Falls back to the original file on
// any anomaly so we never silently send a broken/empty image to the server.
async function compressImage(file) {
  if (!file || !file.type?.startsWith("image/")) return file;
  if (file.size < 1024 * 1024) return file;

  let url = null;
  try {
    url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("decode failed"));
      im.src = url;
    });

    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) return file;

    const ratio = Math.min(1, COMPRESS_MAX_DIMENSION / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * ratio));
    const h = Math.max(1, Math.round(nh * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", COMPRESS_QUALITY));
    if (!blob) return file;
    if (blob.size < 2048) return file;
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

// Direct browser → Supabase PUT with byte-level progress. The backend just
// signs the URL; we never stream image bytes through it.
function putToSignedUrl({ signedUrl, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    if (file?.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(1);
        resolve();
      } else {
        reject(new Error(`Storage upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out — try a smaller image"));
    xhr.send(file);
  });
}

async function directUploadImage({ file, token, onProgress }) {
  const signRes = await fetch(`${API_BASE}/inventory/products/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileName: file.name, kind: "image" }),
  });
  const signed = await signRes.json().catch(() => ({}));
  if (!signRes.ok || !signed?.signedUrl) {
    throw new Error(signed?.message || "Could not get upload URL");
  }
  await putToSignedUrl({ signedUrl: signed.signedUrl, file, onProgress });
  return signed.publicUrl;
}

function BulkImageUpload({ images, onAdd, onRemove, onClearAll, onDropFiles }) {
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  const latestRef = useRef({});
  const [dragging, setDragging] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const full = images.length >= MAX_IMAGES;

  latestRef.current = { images, full, onAdd, onDropFiles };

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    let counter = 0;

    const buildItems = (fileList) => {
      const { images } = latestRef.current;
      const arr = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      const remaining = MAX_IMAGES - images.length;
      let skippedCount = 0;
      const toAdd = [];
      for (const f of arr) {
        if (toAdd.length >= remaining) break;
        if (f.size > MAX_SIZE) { skippedCount++; continue; }
        toAdd.push({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, name: f.name, size: f.size, preview: URL.createObjectURL(f) });
      }
      if (skippedCount > 0) setSkipped(skippedCount);
      return toAdd;
    };

    const onDragOver  = (e) => e.preventDefault();
    const onDragEnter = (e) => { e.preventDefault(); counter++; if (!latestRef.current.full) setDragging(true); };
    const onDragLeave = (e) => { e.preventDefault(); counter--; if (counter === 0) setDragging(false); };
    const onDrop = (e) => {
      e.preventDefault();
      counter = 0;
      setDragging(false);
      if (latestRef.current.full) return;
      const processed = buildItems(e.dataTransfer.files);
      if (!processed.length) return;
      const { onDropFiles, onAdd } = latestRef.current;
      if (onDropFiles) onDropFiles(processed);
      else onAdd(processed);
    };

    el.addEventListener("dragover",  onDragOver);
    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop",      onDrop);
    return () => {
      el.removeEventListener("dragover",  onDragOver);
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop",      onDrop);
    };
  }, []);

  const handleFileInput = (fileList) => {
    const arr = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    const remaining = MAX_IMAGES - images.length;
    let skippedCount = 0;
    const toAdd = [];
    for (const f of arr) {
      if (toAdd.length >= remaining) break;
      if (f.size > MAX_SIZE) { skippedCount++; continue; }
      toAdd.push({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, name: f.name, size: f.size, preview: URL.createObjectURL(f) });
    }
    setSkipped(skippedCount);
    if (toAdd.length > 0) onAdd(toAdd);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={LABEL}>Product Images</span>
        {images.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-[#412460]">
              {images.length} <span className="font-medium text-[#2D2D2D]/40">/ {MAX_IMAGES}</span>
            </span>
            <button type="button" onClick={onClearAll} className="text-[10px] font-semibold text-[#E05353] hover:underline">Clear all</button>
          </div>
        )}
      </div>

      <div
        ref={dropRef}
        onClick={() => !full && fileRef.current?.click()}
        className={`mt-2 flex w-full cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed px-4 py-5 text-center transition
          ${dragging ? "border-[#412460] bg-[#F1EAF6]" : full ? "cursor-not-allowed border-[#CDBDD8] bg-[#FBFAF8] opacity-50" : "border-[#CDBDD8] bg-white hover:border-[#412460]/50"}`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[#412460] text-white shadow-[0_16px_28px_rgba(65,36,96,0.20)]">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </span>
        <p className="mt-3 text-sm font-semibold text-[#412460]">
          {full ? "Maximum reached" : images.length > 0 ? `${images.length} image${images.length > 1 ? "s" : ""} — add more` : "Drag & drop or click to select"}
        </p>
        <p className="mt-1 text-[10px] text-[#2D2D2D]/45">Drop up to {MAX_IMAGES} images · Max 20 MB each</p>
      </div>
      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { handleFileInput(e.target.files); e.target.value = ""; }} />

      {skipped > 0 && <p className="mt-1.5 text-[10px] font-semibold text-[#E05353]">{skipped} file{skipped > 1 ? "s" : ""} skipped — exceeds 20 MB.</p>}

      {images.length > 0 && (
        <div className="mt-3 max-h-44 overflow-y-auto rounded-xl pr-0.5">
          <div className="grid grid-cols-4 gap-1.5">
            {images.map((img, i) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl">
                <img src={img.preview} alt={img.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                  <button type="button" onClick={() => onRemove(i)} className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E05353] text-[9px] font-bold text-white">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FolderIllustration({ name, count }) {
  return (
    <div className="relative h-[150px] w-[174px]">
      <svg viewBox="0 0 256 220" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g clipPath="url(#gal-clip)">
          <path d="M255.743 129.649V53.3823C255.743 44.8686 248.861 37.969 240.368 37.969H15.7604C7.28166 37.969 0.398947 44.8686 0.398947 53.3823V67.8957C0.270697 52.7109 -0.0285511 37.5262 -5.12667e-05 22.3415C0.0141987 6.75677 6.55492 0.271479 22.1301 0.114346C37.0783 -0.0285019 52.0549 0.328618 67.0031 6.76827e-05C75.5388 -0.17135 83.191 1.99994 89.2615 7.79956C99.4217 17.5132 111.463 20.4559 125.114 20.3559C161.209 20.1273 197.304 20.1845 233.4 20.7416C239.085 20.8416 246.467 22.6129 249.929 26.4555C253.862 30.8124 255.914 38.369 255.943 44.54C256.071 72.9096 255.929 101.265 255.743 129.634V129.649Z" fill="#3C2056" />
          <path d="M255.744 53.3823V204.587C255.744 213.1 248.861 220 240.368 220H15.7608C7.28213 220 0.399414 213.1 0.399414 204.587V127.763C0.442164 111.65 0.470664 95.5367 0.456414 79.4377C0.456414 75.5951 0.427914 71.7382 0.399414 67.8956V53.3823C0.399414 44.8685 7.28213 37.969 15.7608 37.969H240.368C248.861 37.969 255.744 44.8685 255.744 53.3823Z" fill="#522E70" />
        </g>
        <defs>
          <clipPath id="gal-clip"><rect width="256" height="220" fill="white" /></clipPath>
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

function ImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#F4F2EF]">
      <svg className="h-9 w-9 text-[#412460]/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    </div>
  );
}

const EMPTY_FORM = { supplier_name: "", product_name: "", product_description: "" };

export default function ProductGallery() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]);
  const [quickError, setQuickError] = useState("");
  const [progress, setProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = async () => {
    try {
      setError("");
      const url = `${API_BASE}/inventory/products?category=${encodeURIComponent(GALLERY_CATEGORY)}&light=1`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}` },
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || "Failed to fetch products");
      setProducts(result.data || []);
    } catch (e) {
      setError(e.message || "Failed to fetch products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProducts(); }, []);

  useEffect(() => {
    if (selectedSupplier) {
      setForm((f) => ({ ...f, supplier_name: selectedSupplier }));
    } else {
      setForm((f) => ({ ...f, supplier_name: "" }));
    }
  }, [selectedSupplier]);

  const supplierFolders = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      const key = p.supplier_name || "Unknown Supplier";
      if (!map[key]) map[key] = { name: key, supplier_email: p.supplier_email, supplier_phone: p.supplier_phone, factory_location: p.factory_location, products: [] };
      map[key].products.push(p);
    });
    return Object.values(map);
  }, [products]);

  const activeFolder = selectedSupplier ? supplierFolders.find((f) => f.name === selectedSupplier) : null;

  const q = searchQuery.trim().toLowerCase();

  const filteredFolders = useMemo(() => {
    if (!q) return supplierFolders;
    return supplierFolders
      .map((folder) => ({
        ...folder,
        products: folder.products.filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
        ),
      }))
      .filter((folder) => folder.name.toLowerCase().includes(q) || folder.products.length > 0);
  }, [supplierFolders, q]);

  const filteredActiveProducts = useMemo(() => {
    if (!activeFolder) return [];
    if (!q) return activeFolder.products;
    return activeFolder.products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [activeFolder, q]);

  const uploadImages = async (toUpload, baseFields) => {
    const total = toUpload.length;
    const fileProgress = new Array(total).fill(0);
    let done = 0;
    const token = localStorage.getItem("inv_token") || "";

    const updateOverall = () => {
      const sum = fileProgress.reduce((a, b) => a + b, 0);
      setProgress({ done, total, percent: Math.round((sum / total) * 100) });
    };
    setProgress({ done: 0, total, percent: 0 });

    let cursor = 0;
    let firstError = null;

    const uploadOne = async (img, idx) => {
      let imageUrl = null;
      if (img?.file) {
        const compressed = await compressImage(img.file);
        imageUrl = await directUploadImage({
          file: compressed,
          token,
          onProgress: (p) => { fileProgress[idx] = p; updateOverall(); },
        });
      }
      // Tiny JSON request — no image bytes traverse our backend any more.
      const res = await fetch(`${API_BASE}/inventory/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...baseFields, image_url: imageUrl }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result?.message || "Failed to save product");
      }
      fileProgress[idx] = 1;
      done++;
      updateOverall();
    };

    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= total || firstError) return;
        try { await uploadOne(toUpload[i], i); }
        catch (err) { if (!firstError) firstError = err; return; }
      }
    };

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, total) }, worker));
    if (firstError) throw firstError;
  };

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    setQuickError("");
    if (!form.supplier_name.trim()) { setQuickError("Supplier name is required."); return; }
    if (!form.product_name.trim()) { setQuickError("Product name is required."); return; }

    try {
      setSubmitting(true);
      const baseFields = {
        name: form.product_name.trim(),
        description: form.product_description.trim(),
        supplier_name: form.supplier_name.trim(),
        category: GALLERY_CATEGORY,
      };
      const toUpload = images.length > 0 ? images : [null];
      await uploadImages(toUpload, baseFields);
      setForm(EMPTY_FORM);
      setImages([]);
      setLoading(true);
      await loadProducts();
    } catch (e) {
      setQuickError(e.message || "Failed to save product");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const handleDropAutoUpload = async (droppedFiles) => {
    if (!form.supplier_name.trim() || !form.product_name.trim()) {
      // Required fields missing — add to preview so user can fill then submit
      setImages((prev) => [...prev, ...droppedFiles]);
      if (!form.supplier_name.trim()) setQuickError("Fill Supplier Name to auto-upload on drop.");
      else setQuickError("Fill Product Name to auto-upload on drop.");
      return;
    }
    setQuickError("");
    setSubmitting(true);
    try {
      const baseFields = {
        name: form.product_name.trim(),
        description: form.product_description.trim(),
        supplier_name: form.supplier_name.trim(),
        category: GALLERY_CATEGORY,
      };
      await uploadImages(droppedFiles, baseFields);
      setLoading(true);
      await loadProducts();
    } catch (e) {
      setQuickError(e.message || "Failed to upload");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/inventory/products/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}` },
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || "Failed to delete");
      setPendingDelete(null);
      const remaining = products.filter((p) => p.id !== id);
      setProducts(remaining);
      const stillHas = remaining.some((p) => (p.supplier_name || "Unknown Supplier") === selectedSupplier);
      if (!stillHas) setSelectedSupplier(null);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <AdminPageShell activePage="Tools" title="Product Gallery" eyebrow="Supplier product images organised by supplier">
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">My Products Gallery</h2>
          </div>
          <div className="flex flex-1 items-center gap-3 sm:justify-end">
            {/* Search bar */}
            <div className="flex h-9 flex-1 items-center gap-2 rounded-[10px] border border-[#E1D9EA] bg-[#F7F6F2] px-3 sm:max-w-[260px]">
              <svg className="h-3.5 w-3.5 shrink-0 text-[#2D2D2D]/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products or suppliers…"
                className="w-full bg-transparent text-xs font-semibold text-[#2D2D2D] outline-none placeholder:font-normal placeholder:text-[#2D2D2D]/35"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="shrink-0 text-[#2D2D2D]/35 hover:text-[#E05353]">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <Link
              to="/admin-tools/product-gallery/add"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] bg-[#412460] px-4 text-xs font-semibold text-white shadow-[0_12px_22px_rgba(65,36,96,0.22)] transition hover:bg-[#B99353]"
            >
              Add Images
            </Link>
            <button
              type="button"
              onClick={() => navigate("/admin-tools")}
              className="flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-[#F4F2EF] px-4 text-xs font-semibold text-[#412460] transition hover:bg-[#412460] hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to Tools
            </button>
          </div>
        </div>

        <div className="mt-8 grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">

          {/* Left — Folders / Image Grid */}
          <div className="min-h-0 min-w-0 overflow-y-auto pr-1">

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#E1D9EA] border-t-[#412460]" />
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="rounded-2xl bg-[#FFF0F0] p-6 text-center text-sm font-semibold text-[#E05353]">{error}</div>
            )}

            {/* Supplier Folder View */}
            {!loading && !error && !selectedSupplier && (
              <section>
                {supplierFolders.length === 0 ? (
                  <div className="rounded-2xl bg-[#FBFAF8] p-12 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#412460]/8">
                      <svg className="h-7 w-7 text-[#412460]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-[#2D2D2D]/60">No supplier galleries yet</p>
                    <p className="mt-1.5 text-xs text-[#2D2D2D]/40">Add images using the panel on the right or click Add Images above.</p>
                  </div>
                ) : filteredFolders.length === 0 ? (
                  <div className="rounded-2xl bg-[#FBFAF8] p-12 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#412460]/8">
                      <svg className="h-6 w-6 text-[#412460]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
                      </svg>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-[#2D2D2D]/60">No results for "{searchQuery}"</p>
                    <p className="mt-1.5 text-xs text-[#2D2D2D]/40">Try searching by supplier name or product name.</p>
                    <button type="button" onClick={() => setSearchQuery("")} className="mt-4 text-xs font-semibold text-[#B99353] hover:underline">Clear search</button>
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filteredFolders.map((folder) => (
                      <button
                        key={folder.name}
                        type="button"
                        onClick={() => setSelectedSupplier(folder.name)}
                        className="group text-left transition active:opacity-80"
                      >
                        <FolderIllustration
                          name={folder.name}
                          count={`${folder.products.length} Product${folder.products.length !== 1 ? "s" : ""}`}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Image Grid — inside Supplier Folder */}
            {!loading && !error && selectedSupplier && activeFolder && (
              <section>
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-[#412460]">{activeFolder.name}</span>
                    <span className="text-xs text-[#2D2D2D]/50">
                      {activeFolder.products.length} Product{activeFolder.products.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSupplier(null)}
                    className="flex items-center gap-1.5 rounded-2xl border border-[#D9CEE3] px-4 py-2 text-xs font-semibold text-[#412460] transition hover:bg-[#F4F2EF]"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                    Back to Folders
                  </button>
                </div>

                {/* Supplier meta */}
                {(activeFolder.supplier_email || activeFolder.supplier_phone || activeFolder.factory_location) && (
                  <div className="mb-6 flex flex-wrap gap-5 rounded-2xl border border-[#E8E1EE] bg-[#FBFAF8] p-4">
                    {activeFolder.supplier_email && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B99353]">Email</p>
                        <p className="mt-1 text-xs font-semibold text-[#2D2D2D]/70">{activeFolder.supplier_email}</p>
                      </div>
                    )}
                    {activeFolder.supplier_phone && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B99353]">Phone</p>
                        <p className="mt-1 text-xs font-semibold text-[#2D2D2D]/70">{activeFolder.supplier_phone}</p>
                      </div>
                    )}
                    {activeFolder.factory_location && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#B99353]">Factory Location</p>
                        <p className="mt-1 text-xs font-semibold text-[#2D2D2D]/70">{activeFolder.factory_location}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Product cards */}
                {filteredActiveProducts.length === 0 && (
                  <div className="rounded-2xl bg-[#FBFAF8] p-10 text-center">
                    <p className="text-sm font-semibold text-[#2D2D2D]/60">No products match "{searchQuery}"</p>
                    <button type="button" onClick={() => setSearchQuery("")} className="mt-3 text-xs font-semibold text-[#B99353] hover:underline">Clear search</button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {filteredActiveProducts.map((product) => (
                    <article key={product.id} className="overflow-hidden rounded-2xl border border-[#E8E1EE] bg-white shadow-[0_6px_18px_rgba(45,45,45,0.06)]">
                      {/* Image */}
                      <div className="relative h-32 overflow-hidden bg-[#F4F2EF]">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                        ) : product.image_url_2 ? (
                          <img src={product.image_url_2} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImagePlaceholder />
                        )}
                        <button
                          type="button"
                          onClick={() => setPendingDelete(product.id)}
                          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-[#E05353] opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-[#E05353] hover:text-white"
                          aria-label="Delete"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
                          </svg>
                        </button>
                      </div>

                      {/* Info */}
                      <div className="p-2.5">
                        <h3 className="text-[11px] font-semibold leading-tight text-[#412460] line-clamp-1">{product.name}</h3>
                        {product.description && (
                          <p className="mt-1 text-[10px] leading-relaxed text-[#2D2D2D]/45 line-clamp-1">{product.description}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <Link
                            to={`/admin-tools/product-gallery/edit/${product.id}`}
                            state={{ product }}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F4F2EF] text-[#412460] transition hover:bg-[#412460] hover:text-white"
                            aria-label="Edit"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </Link>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(product.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFF0F0] text-[#E05353] transition hover:bg-[#E05353] hover:text-white"
                            aria-label="Delete"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right — Quick Add Panel (same style as adminProducts) */}
          <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border border-[#E8E1EE] bg-[#FBFAF8] p-5 shadow-[0_14px_35px_rgba(45,45,45,0.04)] xl:sticky xl:top-0 xl:self-start">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#412460]">Add Images</h2>
                <p className="mt-1 text-xs text-[#2D2D2D]/45">Upload supplier product images.</p>
              </div>
              <Link
                to="/admin-tools/product-gallery/add"
                state={selectedSupplier && activeFolder ? {
                  locked: true,
                  supplier_name: activeFolder.name,
                  supplier_email: activeFolder.supplier_email || "",
                  supplier_phone: activeFolder.supplier_phone || "",
                  factory_location: activeFolder.factory_location || "",
                } : undefined}
                className="text-xs font-semibold text-[#B99353] hover:text-[#412460]"
              >
                Full Panel
              </Link>
            </div>

            <form onSubmit={handleQuickSubmit} className="mt-6 flex min-h-0 flex-1 flex-col gap-5">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">

                <label className="block">
                  <span className={`${LABEL} flex items-center gap-2`}>
                    Name of the Suppliers
                    {selectedSupplier && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B99353]">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Locked
                      </span>
                    )}
                  </span>
                  <input
                    type="text"
                    value={form.supplier_name}
                    onChange={(e) => !selectedSupplier && setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                    readOnly={!!selectedSupplier}
                    placeholder="Name of the Suppliers"
                    className={
                      selectedSupplier
                        ? "mt-2 w-full cursor-not-allowed rounded-2xl border border-[#B99353] bg-[#F9F6F0] px-4 py-3 text-sm font-semibold text-[#2D2D2D] outline-none"
                        : FIELD
                    }
                  />
                </label>

                <label className="block">
                  <span className={LABEL}>Product Name</span>
                  <input
                    type="text"
                    value={form.product_name}
                    onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
                    placeholder="Product Name"
                    className={FIELD}
                  />
                </label>

                <label className="block">
                  <span className={LABEL}>Product Description</span>
                  <textarea
                    value={form.product_description}
                    onChange={(e) => setForm((f) => ({ ...f, product_description: e.target.value }))}
                    placeholder="Product Description"
                    rows={3}
                    className={`${FIELD} resize-none`}
                  />
                </label>

                <BulkImageUpload
                  images={images}
                  onAdd={(newImgs) => setImages((prev) => [...prev, ...newImgs])}
                  onRemove={(i) => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  onClearAll={() => setImages([])}
                  onDropFiles={handleDropAutoUpload}
                />

                {quickError && <p className="text-xs font-semibold text-[#E05353]">{quickError}</p>}
              </div>

              {progress && (
                <div className="shrink-0 space-y-1.5 px-1">
                  <div className="flex justify-between text-[10px] font-semibold">
                    <span className="text-[#412460]">Uploading {progress.done} / {progress.total}</span>
                    <span className="text-[#2D2D2D]/45">{progress.percent ?? 0}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E1D9EA]">
                    <div className="h-full rounded-full bg-[#412460] transition-all duration-200" style={{ width: `${progress.percent ?? 0}%` }} />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full shrink-0 rounded-2xl bg-[#412460] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(65,36,96,0.22)] transition hover:bg-[#B99353] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {progress ? `Uploading ${progress.percent ?? 0}% (${progress.done} / ${progress.total})…` : images.length > 1 ? `Upload ${images.length} Images` : "Upload"}
              </button>
            </form>
          </aside>
        </div>
      </div>

      {/* Delete modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
            <h2 className="text-lg font-semibold text-[#412460]">Delete this product?</h2>
            <p className="mt-2 text-xs text-[#2D2D2D]/50">The product and its images will be permanently removed.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setPendingDelete(null)} className="rounded-2xl border border-[#D9CEE3] px-4 py-3 text-sm font-semibold text-[#412460] transition hover:bg-[#F4F2EF]">Cancel</button>
              <button type="button" onClick={() => handleDelete(pendingDelete)} className="rounded-2xl bg-[#E05353] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#412460]">Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
