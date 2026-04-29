import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CostumersPortal from "../CostumersPortal";

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

// Folder Icon Component
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

export default function CostumerCatalog() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  // Group products by category for folder display
  const folders = useMemo(() => {
    if (!products.length) return [];

    const productsByCategory = products.reduce((acc, product) => {
      const category = product.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = { products: [], pdfs: 0 };
      }
      acc[category].products.push(product);
      const pdfFiles = Array.isArray(product.pdf_files) ? product.pdf_files.length : 0;
      acc[category].pdfs += pdfFiles;
      return acc;
    }, {});

    return Object.entries(productsByCategory).map(([name, data]) => ({
      name,
      count: `${data.pdfs} PDF${data.pdfs === 1 ? "" : "s"} • ${data.products.length} Product${data.products.length === 1 ? "" : "s"}`,
      category: name,
      productCount: data.products.length,
    }));
  }, [products]);

  const handleFolderClick = (folder) => {
    navigate(`/tracking/trackingpage/costumers/catalog-list`, { 
      state: { category: folder.category } 
    });
  };

  return (
    <CostumersPortal activePage="Catalogs">
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-white px-5 py-5 text-[#2D2D2D] shadow-[0_18px_40px_rgba(45,45,45,0.04)] sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">Costumer Catalogs</h2>
            <p className="mt-1 text-xs text-[#2D2D2D]/45">Browse product catalogs by category</p>
          </div>
        </div>

        {loading && (
          <div className="mt-8 flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-[#2D2D2D]/60">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E1D9EA] border-t-[#412460]" />
              Loading catalogs...
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="mt-8 rounded-2xl bg-[#FEE2E2] p-4 text-sm text-[#E05353]">
            {error}
          </div>
        )}

        {!loading && !error && folders.length === 0 && (
          <div className="mt-8 flex flex-1 items-center justify-center rounded-2xl bg-[#FBFAF8] p-8">
            <div className="text-center">
              <p className="text-sm font-semibold text-[#2D2D2D]/70">No catalogs available</p>
              <p className="mt-2 text-xs text-[#2D2D2D]/50">Shared product catalogs will appear here</p>
            </div>
          </div>
        )}

        {!loading && !error && folders.length > 0 && (
          <div className="mt-6 flex-1 overflow-auto">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {folders.map((folder) => (
                <button
                  type="button"
                  key={folder.name}
                  onClick={() => handleFolderClick(folder)}
                  className="group text-left transition active:opacity-80 cursor-pointer"
                >
                  <FolderIllustration name={folder.name} count={folder.count} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </CostumersPortal>
  );
}
