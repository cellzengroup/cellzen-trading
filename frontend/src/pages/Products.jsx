import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

const VIEWED_KEY = "cz_viewed_products";
const VIEWED_LIMIT = 20;
const PAGE_SIZE = 8;          // smaller initial batch = faster first paint
const EAGER_COUNT = 6;        // first N images load eagerly with high priority
const GAP = 12;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 5;

function fisherYatesShuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function spreadBySupplier(arr) {
  const out = [...arr];
  for (let i = 1; i < out.length; i++) {
    if (out[i].supplier_name && out[i].supplier_name === out[i - 1].supplier_name) {
      for (let j = i + 1; j < out.length; j++) {
        const wouldBreakLeft = out[j].supplier_name !== out[i - 1].supplier_name;
        const wouldBreakRight = i + 1 >= out.length || out[j].supplier_name !== out[i + 1]?.supplier_name;
        if (wouldBreakLeft && wouldBreakRight) {
          [out[i], out[j]] = [out[j], out[i]];
          break;
        }
      }
    }
  }
  return out;
}

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function readViewed() {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeViewed(name) {
  try {
    const current = readViewed().filter((n) => n !== name);
    current.unshift(name);
    localStorage.setItem(VIEWED_KEY, JSON.stringify(current.slice(0, VIEWED_LIMIT)));
  } catch {
    // ignore
  }
}

function smartOrder(products) {
  // Pure random — shuffle twice for extra mixing, then break supplier runs.
  // Attach a stable per-item random value so column placement stays put while
  // images load (instead of reshuffling on every onLoad).
  const shuffled = fisherYatesShuffle(fisherYatesShuffle(products));
  const spread = spreadBySupplier(shuffled);
  return spread.map((p) => ({ ...p, _rand: Math.random() }));
}

function distributeIntoColumns(items, columnCount) {
  const columns = Array.from({ length: columnCount }, () => ({ items: [], heightUnits: 0 }));

  // Few items relative to columns (typical of a narrow search) — fill the
  // leftmost columns sequentially so there are no gaps in the row.
  if (items.length <= columnCount) {
    items.forEach((item, idx) => {
      columns[idx].items.push(item);
      const ratio = item.dims ? item.dims.w / item.dims.h : 1;
      columns[idx].heightUnits = 1 / Math.max(ratio, 0.1);
    });
    return columns;
  }

  // Many items — randomized "shortest-column" distribution
  for (const item of items) {
    let minHeight = Infinity;
    for (let i = 0; i < columnCount; i++) {
      if (columns[i].heightUnits < minHeight) minHeight = columns[i].heightUnits;
    }
    const tolerance = Math.max(0.5, minHeight * 0.3);
    const candidates = [];
    for (let i = 0; i < columnCount; i++) {
      if (columns[i].heightUnits <= minHeight + tolerance) candidates.push(i);
    }
    const r = item.product?._rand ?? Math.random();
    const pick = candidates[Math.floor(r * candidates.length)];
    columns[pick].items.push(item);
    const ratio = item.dims ? item.dims.w / item.dims.h : 1;
    columns[pick].heightUnits += 1 / Math.max(ratio, 0.1);
  }
  return columns;
}

// Zoomable full-screen image preview
function ImagePreview({ src, alt, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  const reset = () => { setZoom(1); setPos({ x: 0, y: 0 }); };
  const zoomIn  = () => setZoom((z) => Math.min(z + 0.5, ZOOM_MAX));
  const zoomOut = () => setZoom((z) => {
    const next = Math.max(z - 0.5, ZOOM_MIN);
    if (next === 1) setPos({ x: 0, y: 0 });
    return next;
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") reset();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Mouse-wheel zoom
  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setZoom((z) => {
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + delta));
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  // Drag to pan when zoomed in
  const onMouseDown = (e) => {
    if (zoom <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    });
  };
  const onMouseUp = () => { dragRef.current = null; };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
      onClick={onClose}
      onWheel={onWheel}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Toolbar */}
      <div
        className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white/10 p-1 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={zoomOut} className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15" aria-label="Zoom out">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-white">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={zoomIn} className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15" aria-label="Zoom in">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" onClick={reset} className="ml-1 px-3 text-[10px] font-bold uppercase tracking-wider text-white/80 hover:text-white">Reset</button>
        <button type="button" onClick={onClose} className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15" aria-label="Close">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Hint */}
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">
        Scroll to zoom · Drag to pan · Esc to close
      </p>

      {/* Image */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onMouseDown={onMouseDown}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); reset(); }}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
          cursor: zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
          transition: dragRef.current ? "none" : "transform 0.15s ease-out",
        }}
        className="max-h-[88vh] max-w-[92vw] select-none object-contain"
      />
    </div>
  );
}

function FlipCard({ product, eager, dims, onLoadDims, onView, onPreview }) {
  const img = product.image_url || product.image_url_2;
  const clickTimer = useRef(null);
  const [loaded, setLoaded] = useState(false);

  // Single click → modal (delayed); double click cancels and opens zoom preview
  const handleClick = (e) => {
    e.preventDefault();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    clickTimer.current = setTimeout(() => {
      onView(product);
      clickTimer.current = null;
    }, 280);
  };

  const handleDoubleClick = (e) => {
    e.preventDefault();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    onPreview(product);
  };

  // Reserve the right space upfront with an aspect ratio so there's no layout
  // shift when the image loads. If we don't know the dims yet, default to 4:5.
  const aspectRatio = dims ? `${dims.w} / ${dims.h}` : "4 / 5";

  return (
    <div className="group mb-3 block w-full [perspective:1200px]">
      <div className="relative w-full transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d] [transition-delay:0ms] group-hover:[transition-delay:550ms] group-hover:[transform:rotateY(180deg)]">
        {/* Front — image with placeholder + fade-in */}
        <button
          type="button"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          aria-label={product.name}
          style={{ aspectRatio }}
          className="relative block w-full overflow-hidden rounded-2xl bg-white p-0 text-left [backface-visibility:hidden] focus:outline-none"
        >
          {/* Pinterest-style placeholder — pulsing gradient until image arrives */}
          {!loaded && (
            <div
              className="absolute inset-0 animate-pulse"
              style={{ background: "linear-gradient(135deg, #EDEAE3 0%, #F4F2EE 50%, #E5E1DA 100%)" }}
              aria-hidden="true"
            />
          )}
          <img
            src={img}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            fetchpriority={eager ? "high" : "low"}
            onLoad={(e) => {
              setLoaded(true);
              if (onLoadDims && e.target.naturalWidth && e.target.naturalHeight) {
                onLoadDims(e.target.naturalWidth, e.target.naturalHeight);
              }
            }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </button>

        {/* Back — only the product name */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl bg-[#412460] p-5 text-center text-white [transform:rotateY(180deg)] [backface-visibility:hidden]">
          <h3 className="premium-font-galdgdersemi text-base leading-tight sm:text-lg">
            {product.name}
          </h3>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeProduct, setActiveProduct] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [imageDims, setImageDims] = useState({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);

  // When the search slides open, focus the input. When it closes, clear it.
  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    } else {
      setSearchQuery("");
    }
  }, [searchOpen]);

  // Fetch the gallery — tries same-origin first, falls back to known production
  // backends so the public page works even if the frontend is hosted separately.
  const loadGallery = useCallback(async () => {
    setLoading(true);

    // Build candidate API bases. Same-origin first (works for single-server deploy
    // and dev), then known production hosts as fallbacks.
    const candidates = [API_BASE];
    if (typeof window !== "undefined") {
      const sameOrigin = `${window.location.origin}/api`;
      if (!candidates.includes(sameOrigin)) candidates.push(sameOrigin);
    }
    [
      "https://cellzen-trading.onrender.com/api",
      "https://www.cellzen.com.np/api",
      "https://cellzen.com.np/api",
    ].forEach((u) => { if (!candidates.includes(u)) candidates.push(u); });

    let lastErr = null;
    for (const base of candidates) {
      try {
        const url = `${base}/inventory/products/public-gallery`;
        const res = await fetch(url, { cache: "no-cache", mode: "cors" });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status} from ${base}`); continue; }
        const data = await res.json();
        if (!data.success) { lastErr = new Error(data.message || `Bad response from ${base}`); continue; }
        setProducts(data.data || []);
        setError("");
        setLoading(false);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    setError((lastErr && lastErr.message) || "Failed to load gallery");
    setLoading(false);
  }, []);

  // Load once on mount — no auto-refetch (avoids reshuffling positions while
  // the user is browsing or interacting with the search bar)
  useEffect(() => { loadGallery(); }, [loadGallery]);

  // Track container width responsively
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ordered = useMemo(() => smartOrder(products), [products]);

  // Filter by search query (matches name, description, supplier_name)
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((p) =>
      String(p.name || "").toLowerCase().includes(q)
      || String(p.description || "").toLowerCase().includes(q)
      || String(p.supplier_name || "").toLowerCase().includes(q)
    );
  }, [ordered, searchQuery]);

  // Reset visibleCount when the user starts a new search
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery]);

  const hasMore = visibleCount < filtered.length;
  const visibleProducts = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  // Capture dims from the live <img> onLoad — no separate preload, no double
  // download. Until an image loads, the card uses a default 4:5 aspect ratio
  // placeholder, then settles when real dims arrive.
  const captureDims = useCallback((id, naturalWidth, naturalHeight) => {
    if (!naturalWidth || !naturalHeight) return;
    setImageDims((prev) => prev[id] ? prev : { ...prev, [id]: { w: naturalWidth, h: naturalHeight } });
  }, []);

  const columnCount = useMemo(() => {
    if (containerWidth < 480) return 2;
    if (containerWidth < 760) return 3;
    if (containerWidth < 1100) return 4;
    return 5;
  }, [containerWidth]);

  const columns = useMemo(() => {
    const items = visibleProducts.map((p) => ({
      id: p.id,
      product: p,
      dims: imageDims[p.id] || { w: 1, h: 1 },
    }));
    return distributeIntoColumns(items, columnCount);
  }, [visibleProducts, imageDims, columnCount]);

  // Infinite scroll
  useEffect(() => {
    if (loading || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, hasMore, filtered.length]);

  const handleView = (product) => {
    writeViewed(product.name);
    setActiveProduct(product);
  };

  const handlePreview = (product) => {
    writeViewed(product.name);
    setPreviewSrc({
      url: product.image_url || product.image_url_2,
      name: product.name,
    });
  };

  return (
    <>
      <section className="bg-[#F4F2EE] pt-6 pb-16 sm:pt-10 sm:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">

          {/* Header — mobile: just the search button on the right.
              Desktop: title left, sliding search right. */}
          <div className="mb-10 flex items-center justify-end gap-4 sm:justify-between">
            <h1 className="hidden premium-font-galdgderbold text-3xl leading-[1] text-[#2D2D2D] sm:block lg:text-4xl">
              Product Gallery
            </h1>

            {/* Sliding search — input slides out from the right of the button */}
            <div className="flex items-center">
              <div
                className={`flex items-center overflow-hidden rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                  ${searchOpen
                    ? "w-64 border border-[#2D2D2D]/10 bg-white px-4 py-2.5 opacity-100 shadow-[0_2px_10px_rgba(45,45,45,0.04)] sm:w-72"
                    : "pointer-events-none w-0 border-0 bg-transparent px-0 py-0 opacity-0 shadow-none"}`}
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products…"
                  tabIndex={searchOpen ? 0 : -1}
                  className="w-full bg-transparent text-sm text-[#2D2D2D] outline-none placeholder:text-[#2D2D2D]/35"
                />
              </div>

              <button
                type="button"
                onClick={() => setSearchOpen((o) => !o)}
                className={`ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors
                  ${searchOpen ? "bg-[#412460] text-white hover:bg-[#B99353]" : "bg-white text-[#412460] shadow-[0_2px_10px_rgba(45,45,45,0.06)] hover:bg-[#412460] hover:text-white"}`}
                aria-label={searchOpen ? "Close search" : "Open search"}
              >
                {searchOpen ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3-3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

        <div ref={containerRef}>

          {loading && (
            <div className="flex items-center justify-center py-32">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#412460]/15 border-t-[#412460]" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-[#E05353]/30 bg-[#FFF1F1] p-8 text-center">
              <p className="text-sm font-semibold text-[#E05353]">Couldn't load the gallery.</p>
              <p className="mt-2 text-xs text-[#2D2D2D]/55">{error}</p>
              <button
                type="button"
                onClick={loadGallery}
                className="mt-5 inline-flex items-center justify-center rounded-full bg-[#412460] px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#B99353]"
              >
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && products.length === 0 && (
            <div className="rounded-2xl border border-[#2D2D2D]/10 bg-white p-12 text-center">
              <p className="text-sm font-semibold text-[#412460]">Catalog coming soon.</p>
            </div>
          )}

          {!loading && !error && products.length > 0 && filtered.length === 0 && (
            <div className="rounded-2xl border border-[#2D2D2D]/10 bg-white p-12 text-center">
              <p className="text-sm font-semibold text-[#412460]">No products match "{searchQuery}".</p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-4 text-xs font-semibold text-[#B99353] hover:underline"
              >
                Clear search
              </button>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <>
              <div className="flex items-start" style={{ gap: GAP }}>
                {columns.map((col, ci) => (
                  <div key={ci} className="flex-1 min-w-0">
                    {col.items.map((item) => {
                      // Eager-load the first few above-the-fold cards
                      const globalIndex = visibleProducts.findIndex((p) => p.id === item.id);
                      const eager = globalIndex >= 0 && globalIndex < EAGER_COUNT;
                      return (
                        <FlipCard
                          key={item.id}
                          product={item.product}
                          eager={eager}
                          dims={imageDims[item.id]}
                          onLoadDims={(w, h) => captureDims(item.id, w, h)}
                          onView={handleView}
                          onPreview={handlePreview}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              {hasMore && (
                <div ref={sentinelRef} className="mt-8 flex items-center justify-center py-6">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#412460]/15 border-t-[#412460]" />
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </section>

      {/* Detail modal (single click) */}
      {activeProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setActiveProduct(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveProduct(null)}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#412460] hover:bg-[#412460] hover:text-white"
              aria-label="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="grid gap-0 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handlePreview(activeProduct)}
                className="group relative block aspect-square cursor-zoom-in bg-white p-0 sm:aspect-auto"
                aria-label="View larger image"
              >
                <img
                  src={activeProduct.image_url || activeProduct.image_url_2}
                  alt={activeProduct.name}
                  className="h-full w-full object-contain"
                />
                {/* Zoom hint badge */}
                <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-[#412460]/85 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
                  </svg>
                  Click to zoom
                </span>
              </button>
              <div className="p-6 sm:p-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B99353]">Product</p>
                <h3 className="mt-3 premium-font-galdgdersemi text-2xl text-[#412460]">{activeProduct.name}</h3>
                {activeProduct.description && (
                  <p className="mt-4 text-sm leading-relaxed text-[#2D2D2D]/65">{activeProduct.description}</p>
                )}
                <Link
                  to={`/contact?product=${encodeURIComponent(activeProduct.name || "")}`}
                  className="mt-8 inline-flex rounded-full bg-[#412460] px-6 py-3 text-xs font-semibold uppercase tracking-widest text-white hover:bg-[#B99353]"
                >
                  Inquire about this product
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image-only zoom preview (double click) */}
      {previewSrc && (
        <ImagePreview
          src={previewSrc.url}
          alt={previewSrc.name}
          onClose={() => setPreviewSrc(null)}
        />
      )}
    </>
  );
}
