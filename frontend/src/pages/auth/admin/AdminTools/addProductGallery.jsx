import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");
const GALLERY_CATEGORY = "Product Gallery";
const MAX_IMAGES = 50;
const MAX_SIZE = 20 * 1024 * 1024;
const COMPRESS_MAX_DIMENSION = 1600; // resize images larger than this
const COMPRESS_QUALITY = 0.85;
const REQUEST_TIMEOUT_MS = 60000; // 60s per upload, then bail

// Resize + re-encode an image File to keep upload sizes under control.
// On ANY anomaly (decode failure, empty blob, weird size) we fall back to the
// original file so the upload never silently transmits a broken image.
async function compressImage(file) {
  if (!file || !file.type?.startsWith("image/")) return file;
  // Only compress noticeably-large files. Smaller ones upload fast enough and
  // recompression risks degrading them for marginal speed gain.
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

    // White background so transparent PNGs don't go black when re-encoded as JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", COMPRESS_QUALITY));

    // Sanity gates — bail on anything fishy
    if (!blob) return file;
    if (blob.size < 2048) return file;          // suspiciously tiny → likely corrupt
    if (blob.size >= file.size) return file;    // compression didn't help

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

// XHR-based upload with byte-level progress + a hard timeout
function uploadWithProgress({ url, formData, token, onProgress, signal, method = "POST" }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = REQUEST_TIMEOUT_MS;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let result;
      try { result = JSON.parse(xhr.responseText); } catch { result = null; }
      if (xhr.status >= 200 && xhr.status < 300 && result?.success) {
        if (onProgress) onProgress(1);
        resolve(result);
      } else {
        reject(new Error(result?.message || `Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out — try a smaller image"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(formData);
  });
}

const FIELD = "mt-2 w-full rounded-2xl border border-[#E1D9EA] bg-white px-4 py-3 text-sm font-semibold text-[#2D2D2D] outline-none transition placeholder:text-[#2D2D2D]/30 focus:border-[#2D2D2D]/70";
const LABEL = "text-xs font-semibold text-[#2D2D2D]/45";

const EMPTY = {
  supplier_name: "",
  supplier_email: "",
  supplier_phone: "",
  factory_location: "",
  product_name: "",
  product_description: "",
};

function BulkImageUpload({ images, existingImages, onAdd, onRemove, onRemoveExisting, onClearAll }) {
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  const latestRef = useRef({});
  const [dragging, setDragging] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const full = images.length >= MAX_IMAGES;

  latestRef.current = { images, full, onAdd };

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
      if (processed.length > 0) latestRef.current.onAdd(processed);
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

  const totalCount = (existingImages?.length || 0) + images.length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={LABEL}>Product Images</span>
        {totalCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-[#412460]">
              {totalCount} <span className="font-medium text-[#2D2D2D]/40">/ {MAX_IMAGES}</span>
            </span>
            {images.length > 0 && (
              <button type="button" onClick={onClearAll} className="text-[10px] font-semibold text-[#E05353] hover:underline">
                Clear new
              </button>
            )}
          </div>
        )}
      </div>

      {/* Existing images (edit mode) */}
      {existingImages?.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-[#B99353]">Current Images</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {existingImages.map((img, i) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl">
                <img src={img.preview} alt="Current" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onRemoveExisting(i)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E05353] text-[10px] font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        ref={dropRef}
        onClick={() => !full && fileRef.current?.click()}
        className={`mt-3 flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition
          ${dragging ? "border-[#412460] bg-[#F1EAF6]" : full ? "cursor-not-allowed border-[#CDBDD8] bg-[#FBFAF8] opacity-50" : "border-[#CDBDD8] bg-white hover:border-[#412460]/50"}`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#412460] text-white shadow-[0_12px_24px_rgba(65,36,96,0.20)]">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </span>
        <p className="mt-3 text-sm font-semibold text-[#412460]">
          {full ? "Maximum images reached" : images.length > 0 ? `${images.length} new image${images.length > 1 ? "s" : ""} — add more` : "Drag & drop or click to select"}
        </p>
        <p className="mt-1 text-[10px] text-[#2D2D2D]/40">Up to {MAX_IMAGES} images · JPG, PNG, WEBP, GIF · Max 20 MB each</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { handleFileInput(e.target.files); e.target.value = ""; }}
      />

      {skipped > 0 && (
        <p className="mt-2 text-[10px] font-semibold text-[#E05353]">
          {skipped} file{skipped > 1 ? "s" : ""} skipped — exceeds 20 MB limit.
        </p>
      )}

      {/* New image thumbnails */}
      {images.length > 0 && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl pr-1">
          <p className="mb-2 text-[10px] font-semibold text-[#412460]/60">New images to upload</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {images.map((img, i) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl">
                <img src={img.preview} alt={img.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E05353] text-[10px] font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
                  <p className="truncate text-[8px] text-white">{i + 1}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddProductGallery() {
  const navigate = useNavigate();
  const { state: navState } = useLocation();
  const { productId } = useParams();
  const isEditMode = Boolean(productId);

  const productFromState = navState?.product;

  const [form, setForm] = useState(() => {
    if (isEditMode && productFromState) {
      return {
        supplier_name: productFromState.supplier_name || "",
        supplier_email: productFromState.supplier_email || "",
        supplier_phone: productFromState.supplier_phone || "",
        factory_location: productFromState.factory_location || "",
        product_name: productFromState.name || "",
        product_description: productFromState.description || "",
      };
    }
    if (navState?.supplier_name) {
      return {
        supplier_name: navState.supplier_name || "",
        supplier_email: navState.supplier_email || "",
        supplier_phone: navState.supplier_phone || "",
        factory_location: navState.factory_location || "",
        product_name: "",
        product_description: "",
      };
    }
    return EMPTY;
  });

  // Existing images in edit mode (shown from DB)
  const [existingImages, setExistingImages] = useState(() => {
    if (isEditMode && productFromState) {
      const imgs = [];
      if (productFromState.image_url) imgs.push({ id: "existing-1", preview: productFromState.image_url });
      if (productFromState.image_url_2) imgs.push({ id: "existing-2", preview: productFromState.image_url_2 });
      return imgs;
    }
    return [];
  });

  const [images, setImages] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [progress, setProgress] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // If edit mode and no state (e.g. direct URL), fetch from API
  useEffect(() => {
    if (!isEditMode || productFromState) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/inventory/products/${productId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}` },
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || "Failed to load product");
        const p = result.data;
        setForm({
          supplier_name: p.supplier_name || "",
          supplier_email: p.supplier_email || "",
          supplier_phone: p.supplier_phone || "",
          factory_location: p.factory_location || "",
          product_name: p.name || "",
          product_description: p.description || "",
        });
        const imgs = [];
        if (p.image_url) imgs.push({ id: "existing-1", preview: p.image_url });
        if (p.image_url_2) imgs.push({ id: "existing-2", preview: p.image_url_2 });
        setExistingImages(imgs);
      } catch (err) {
        setLoadError(err.message || "Failed to load product");
      }
    };
    load();
  }, [isEditMode, productId, productFromState]);

  const handleField = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    if (!form.supplier_name.trim()) { setSubmitError("Supplier name is required."); return; }
    if (!form.product_name.trim()) { setSubmitError("Product name is required."); return; }

    try {
      setSubmitting(true);
      const baseFields = {
        name: form.product_name.trim(),
        description: form.product_description.trim(),
        supplier_name: form.supplier_name.trim(),
        supplier_email: form.supplier_email.trim(),
        supplier_phone: form.supplier_phone.trim(),
        factory_location: form.factory_location.trim(),
        category: GALLERY_CATEGORY,
      };

      const token = localStorage.getItem("inv_token") || "";

      if (isEditMode) {
        // Update the single product record (compress new image first)
        const payload = new FormData();
        Object.entries(baseFields).forEach(([k, v]) => payload.append(k, v));
        if (images.length > 0) {
          const compressed = await compressImage(images[0].file);
          payload.append("image", compressed);
        }
        setProgress({ done: 0, total: 1, percent: 0 });
        await uploadWithProgress({
          url: `${API_BASE}/inventory/products/${productId}`,
          formData: payload,
          token,
          method: "PUT",
          onProgress: (p) => setProgress({ done: 0, total: 1, percent: Math.round(p * 100) }),
        });
      } else {
        // Create one record per image with bounded concurrency + real byte-level progress
        const toUpload = images.length > 0 ? images : [null];
        const total = toUpload.length;
        const fileProgress = new Array(total).fill(0); // 0..1 per file
        let done = 0;

        const updateOverall = () => {
          const sum = fileProgress.reduce((a, b) => a + b, 0);
          setProgress({ done, total, percent: Math.round((sum / total) * 100) });
        };

        setProgress({ done: 0, total, percent: 0 });

        const CONCURRENCY = 4;
        let cursor = 0;
        let firstError = null;

        const uploadOne = async (img, idx) => {
          const payload = new FormData();
          Object.entries(baseFields).forEach(([k, v]) => payload.append(k, v));
          if (img?.file) {
            const compressed = await compressImage(img.file);
            payload.append("image", compressed);
          }
          await uploadWithProgress({
            url: `${API_BASE}/inventory/products`,
            formData: payload,
            token,
            onProgress: (p) => {
              fileProgress[idx] = p;
              updateOverall();
            },
          });
          fileProgress[idx] = 1;
          done++;
          updateOverall();
        };

        const worker = async () => {
          while (true) {
            const i = cursor++;
            if (i >= total || firstError) return;
            try {
              await uploadOne(toUpload[i], i);
            } catch (err) {
              if (!firstError) firstError = err;
              return;
            }
          }
        };

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
        if (firstError) throw firstError;
      }

      navigate(-1);
    } catch (err) {
      setSubmitError(err.message || "Failed to save product");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const submitLabel = () => {
    if (progress) return `Uploading ${progress.percent ?? 0}% (${progress.done} / ${progress.total})…`;
    if (isEditMode) return submitting ? "Saving…" : "Update Product";
    if (images.length > 1) return `Save ${images.length} Images`;
    return "Save Product";
  };

  if (loadError) {
    return (
      <AdminPageShell activePage="Tools" title="Edit Product" eyebrow="Product Gallery">
        <div className="flex min-h-[300px] items-center justify-center">
          <p className="text-sm font-semibold text-[#E05353]">{loadError}</p>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      activePage="Tools"
      title={isEditMode ? "Edit Product" : "Add Images"}
      eyebrow="Add supplier details and product images"
    >
      <div className="min-h-full rounded-[2rem] bg-white p-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:p-7">

        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#B99353]">Product Gallery</p>
            <h2 className="mt-2 text-lg font-semibold text-[#412460]">
              {isEditMode ? "Edit Product" : "Add Images"}
            </h2>
            <p className="mt-2 max-w-xl text-xs text-[#2D2D2D]/45">
              {isEditMode
                ? "Update supplier details, product info, and replace the product image."
                : "Add supplier details, product info, and upload up to 50 images in one batch."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center rounded-2xl bg-[#F4F2EF] px-5 py-3 text-xs font-semibold text-[#412460] transition hover:bg-[#412460] hover:text-white"
          >
            Back to Gallery
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">

          {/* Left — Supplier + Product fields */}
          <div className="rounded-[28px] border border-[#E8E1EE] bg-[#FBFAF8] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">Supplier Details</p>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className={LABEL}>Name of the Suppliers <span className="text-[#E05353]">*</span></span>
                <input name="supplier_name" type="text" value={form.supplier_name} onChange={handleField} placeholder="e.g. Shenzhen Tech Co." className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Supplier Email</span>
                <input name="supplier_email" type="email" value={form.supplier_email} onChange={handleField} placeholder="supplier@email.com" className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Phone Number</span>
                <input name="supplier_phone" type="text" value={form.supplier_phone} onChange={handleField} placeholder="+86 123 456 7890" className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Factory Location</span>
                <input name="factory_location" type="text" value={form.factory_location} onChange={handleField} placeholder="e.g. Guangzhou, China" className={FIELD} />
              </label>
            </div>

            <div className="my-6 border-t border-[#E8E1EE]" />

            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">Product Details</p>
            <div className="mt-4 grid gap-5">
              <label className="block">
                <span className={LABEL}>Product Name <span className="text-[#E05353]">*</span></span>
                <input name="product_name" type="text" value={form.product_name} onChange={handleField} placeholder="e.g. Wireless Earbuds Pro" className={FIELD} />
              </label>
              <label className="block">
                <span className={LABEL}>Product Description</span>
                <textarea name="product_description" value={form.product_description} onChange={handleField} placeholder="Describe the product — material, use case, specifications…" rows={5} className={`${FIELD} resize-none`} />
              </label>
            </div>

            {submitError && <p className="mt-4 text-xs font-semibold text-[#E05353]">{submitError}</p>}
          </div>

          {/* Right — Image Upload */}
          <div className="flex flex-col gap-5">
            <div className="rounded-[28px] border border-[#E8E1EE] bg-[#FBFAF8] p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">Product Images</p>
              <p className="mt-1 text-[10px] text-[#2D2D2D]/40">
                {isEditMode
                  ? "Drag & drop a new image to replace the existing one."
                  : "Upload up to 50 images per batch. One record is saved per image."}
              </p>
              <div className="mt-4">
                <BulkImageUpload
                  images={images}
                  existingImages={existingImages}
                  onAdd={(newImgs) => setImages((prev) => [...prev, ...newImgs])}
                  onRemove={(i) => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  onRemoveExisting={(i) => setExistingImages((prev) => prev.filter((_, idx) => idx !== i))}
                  onClearAll={() => setImages([])}
                />
              </div>
            </div>

            {/* Progress bar — shows real byte-level progress, not just file count */}
            {progress && (
              <div className="rounded-2xl border border-[#E1D9EA] bg-white p-4">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-[#412460]">
                    Uploading {progress.done} / {progress.total}
                  </span>
                  <span className="text-[#2D2D2D]/50">{progress.percent ?? 0}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E1D9EA]">
                  <div
                    className="h-full rounded-full bg-[#412460] transition-all duration-200"
                    style={{ width: `${progress.percent ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[#412460] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(65,36,96,0.22)] transition hover:bg-[#B99353] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitLabel()}
            </button>
          </div>
        </form>
      </div>
    </AdminPageShell>
  );
}
