import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from 'xlsx';
import AdminPageShell from "../AdminPageShell";
import CountrySelector from "../../../../components/ui/CountrySelector";
import { countries } from "../../../../components/countries";
import { useCurrency } from "../../../../contexts/CurrencyContext.jsx";
import { saveInvoice as syncInvoiceToBackend } from "../../../../utils/invoiceSync.js";
import { authFetch } from "../../../../utils/apiBase.js";
import {
  preloadTariff,
  isReady as isTariffReady,
  autoMatchHsCode,
  lookupByCode,
  calculateImportCost,
  unitQuantityForItem,
  effectiveDutyMultiplier,
  invoiceUnitForHsUnit,
} from "../../../../utils/hsCodeLookup";
import HsCodeDrawer from "./HsCodeDrawer";
import HsBreakdownModal from "./HsBreakdownModal";

// Invoice Number Input Component
function InvoiceNumberInput({ value, onChange }) {
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Get current month
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");

  // Parse the value
  const getSequence = () => {
    const parts = value.split("-");
    return parts[2] || "";
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsEditing(true);
    setEditValue(getSequence());
  };

  const handleBlur = () => {
    setIsEditing(false);
    const sequence = editValue.replace(/[^0-9]/g, "").slice(0, 4);
    if (sequence) {
      onChange(`CZN-${currentMonth}-${sequence}`);
    } else {
      // Keep the old value if empty, or generate new one
      onChange(value || `CZN-${currentMonth}-0001`);
    }
  };

  const handleChange = (e) => {
    const newValue = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
    setEditValue(newValue);
  };

  const displayValue = isEditing ? editValue : getSequence();

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className="flex cursor-text items-center rounded-[1rem] border border-[#E1E3EE] bg-white px-4 py-3"
    >
      <span className="pointer-events-none select-none text-sm font-semibold text-[#412460]">CZN-{currentMonth}-</span>
      <input
        ref={inputRef}
        type="text"
        required
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="w-16 bg-transparent text-sm text-[#2D2D2D] focus:outline-none"
        placeholder="0001"
      />
    </div>
  );
}

// Mode of Transport Custom Selector Component
function ModeOfTransportSelector({ value, onChange, placeholder = "Select Mode" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const transportModes = [
    { value: "Air", label: "Air", description: "Transporting goods via aircraft" },
    { value: "Sea", label: "Sea", description: "Transporting goods via cargo ships" },
    { value: "Land", label: "Land", description: "Transporting goods via trucks" },
    { value: "Rail", label: "Rail", description: "Transporting goods via trains" },
  ];

  const selectedMode = transportModes.find(m => m.value === value);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (mode) => {
    onChange(mode.value);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <div
        onClick={() => setOpen(!open)}
        className={`w-full cursor-pointer rounded-[1rem] border bg-white px-4 py-3 text-sm flex items-center justify-between transition-all
          ${open ? 'border-[#412460] ring-2 ring-[#412460]/20' : 'border-[#E1E3EE] hover:border-[#412460]/50'}
        `}
      >
        <span className={selectedMode ? "text-[#2D2D2D]" : "text-[#2D2D2D]/50"}>
          {selectedMode?.label || placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-[#2D2D2D]/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-[1rem] border border-[#E1E3EE] bg-white shadow-lg overflow-hidden">
          {transportModes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleSelect(mode)}
              className={`w-full px-4 py-3 text-left text-sm transition-colors hover:bg-[#412460]/5
                ${value === mode.value ? "bg-[#412460]/10 text-[#412460] font-medium" : "text-[#2D2D2D]"}
              `}
            >
              <div className="font-medium">{mode.label}</div>
              <div className="text-xs text-[#2D2D2D]/50">{mode.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Country Button Selector - Button becomes search input when clicked
function CountryButtonSelector({ value, onChange, placeholder = "Select country..." }) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filteredCountries = searchQuery.trim()
    ? countries.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : countries;

  const handleSelect = (country) => {
    onChange(country);
    setOpen(false);
    setSearchQuery("");
  };

  const handleOpen = () => {
    if (!open) {
      setOpen(true);
      setSearchQuery("");
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger - Shows selected value, becomes input when open */}
      <div
        onClick={handleOpen}
        className={`w-full rounded-xl border bg-white text-sm flex items-center justify-between transition-all overflow-hidden
          ${open ? 'border-[#412460] ring-1 ring-[#412460]' : 'border-[#E1E3EE] hover:border-[#412460]/50 cursor-pointer'}
        `}
      >
        {/* Input field - shows country name when closed, editable when open */}
        <input
          ref={inputRef}
          type="text"
          value={open ? searchQuery : (value?.name || "")}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClick={handleOpen}
          placeholder={open ? "Type to search..." : placeholder}
          readOnly={!open}
          className={`flex-1 p-3 bg-transparent outline-none min-w-0
            ${(!open && !value) ? 'text-[#2D2D2D]/50' : 'text-[#2D2D2D]'}
            ${!open ? 'cursor-pointer' : 'cursor-text'}
          `}
        />

        {/* Chevron button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="p-3 flex-shrink-0 focus:outline-none"
          tabIndex={-1}
        >
          <svg
            className={`h-4 w-4 text-[#2D2D2D]/40 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#E1E3EE] bg-white shadow-lg overflow-hidden max-h-60 flex flex-col">
          {/* Country List */}
          <div className="overflow-y-auto flex-1 p-1">
            {!searchQuery.trim() && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#2D2D2D]/40">Popular</p>
                {["China", "Nepal", "India", "United States"].map((countryName) => {
                  const country = countries.find(c => c.name === countryName);
                  if (!country) return null;
                  return (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => handleSelect(country)}
                      className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors hover:bg-[#412460]/5
                        ${value?.code === country.code ? "bg-[#412460]/10 text-[#412460] font-medium" : "text-[#2D2D2D]"}
                      `}
                    >
                      {country.name}
                    </button>
                  );
                })}
                <div className="border-t border-[#E1E3EE] my-1" />
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#2D2D2D]/40">All Countries</p>
              </>
            )}
            {filteredCountries.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[#2D2D2D]/50">No countries found</div>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors hover:bg-[#412460]/5
                    ${value?.code === country.code ? "bg-[#412460]/10 text-[#412460] font-medium" : "text-[#2D2D2D]"}
                  `}
                >
                  {country.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Share To Dropdown Component with search
function ShareToDropdown({ users, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedUser = users.find(u => u.id === value);

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (userId) => {
    onChange(userId);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    setIsOpen(true);
  };

  const displayValue = selectedUser
    ? selectedUser.name
    : searchQuery || "";

  return (
    <div ref={dropdownRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        className="w-full rounded-[1rem] border border-[#E1E3EE] px-4 py-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none focus:ring-2 focus:ring-[#412460]/20"
        placeholder="Type to search users..."
      />
      {isOpen && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-[1rem] border border-[#E1E3EE] bg-white shadow-lg">
          <button
            type="button"
            onClick={() => handleSelect("")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-[#F7F6F2]"
          >
            <span className="italic text-[#2D2D2D]/60">None (Enter manually)</span>
          </button>
          {filteredUsers.length === 0 ? (
            <div className="px-4 py-2 text-sm text-[#2D2D2D]/50">
              No users found
            </div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user.id)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-[#F7F6F2]"
              >
                <span className="font-medium">{user.name}</span>
                <span className="ml-2 text-xs text-[#2D2D2D]/50">({user.type})</span>
                {user.email && <div className="text-xs text-[#2D2D2D]/40">{user.email}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

// Custom Searchable Dropdown Component
function SearchableUserDropdown({ users, value, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedUser = users.find(u => u.id === value);

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedUsers = filteredUsers.reduce((acc, user) => {
    const type = user.type || "Other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(user);
    return acc;
  }, {});

  const handleSelect = (userId) => {
    onChange(userId);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleInputClick = () => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
    setIsOpen(true);
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div
        onClick={handleInputClick}
        className="flex cursor-pointer items-center justify-between rounded-[1rem] border border-[#E1E3EE] bg-white px-4 py-3 text-sm text-[#2D2D2D] transition-all hover:border-[#412460]"
      >
        <div className="flex flex-1 items-center gap-2">
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{selectedUser.name}</span>
              <span className="rounded-full bg-[#412460]/10 px-2 py-0.5 text-xs text-[#412460]">
                {selectedUser.type}
              </span>
            </div>
          ) : value ? (
            <span className="text-[#2D2D2D]/50">{placeholder}</span>
          ) : (
            <span className="text-[#2D2D2D]/50 italic">None (Enter manually)</span>
          )}
        </div>
        <svg
          className={`h-5 w-5 text-[#2D2D2D]/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full rounded-[1rem] border border-[#E1E3EE] bg-white shadow-lg">
          <div className="border-b border-[#EAE8E5] p-3">
            <div className="flex items-center gap-2 rounded-full bg-[#F7F6F2] px-3 py-2">
              <svg className="h-4 w-4 text-[#2D2D2D]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={handleInputChange}
                placeholder="Filter users by name, email or type..."
                className="w-full bg-transparent text-sm text-[#2D2D2D] placeholder:text-[#2D2D2D]/40 focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSearchQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-full p-1 hover:bg-[#EAE8E5]"
                >
                  <svg className="h-3 w-3 text-[#2D2D2D]/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto py-2">
            {/* None Option */}
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={`w-full px-4 py-3 text-left transition-colors hover:bg-[#F7F6F2] ${
                !value ? "bg-[#412460]/5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#2D2D2D]/70">None (Enter manually)</span>
                {!value && (
                  <svg className="h-4 w-4 text-[#412460]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </button>

            <div className="my-2 border-t border-[#EAE8E5]" />

            {filteredUsers.length === 0 ? (
              <div className="px-4 py-3 text-center text-sm text-[#2D2D2D]/50">
                No users found matching "{searchQuery}"
              </div>
            ) : (
              Object.entries(groupedUsers).map(([type, typeUsers]) => (
                <div key={type}>
                  <div className="sticky top-0 bg-[#F7F6F2] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/60">
                    {type}s ({typeUsers.length})
                  </div>
                  {typeUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSelect(user.id)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-[#F7F6F2] ${
                        value === user.id ? "bg-[#412460]/5" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#2D2D2D]">{user.name}</span>
                          {value === user.id && (
                            <svg className="h-4 w-4 text-[#412460]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <span className="text-xs text-[#2D2D2D]/50">{user.email}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[#EAE8E5] px-4 py-2 text-xs text-[#2D2D2D]/40">
            {filteredUsers.length} of {users.length} users
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCreateInvoice() {
  const navigate = useNavigate();
  const { currency, setCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [successModal, setSuccessModal] = useState({ show: false, message: "", type: "" });
  const [isEditMode, setIsEditMode] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState(null);

  // Data from backend
  const [customers, setCustomers] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [partners, setPartners] = useState([]);

  // Transport rates from settings
  const [transportRates, setTransportRates] = useState([]);

  // Load transport rates from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("cellzen_transport_rates");
    if (saved) {
      setTransportRates(JSON.parse(saved));
    }
  }, []);

  // Check for edit data in sessionStorage on mount
  useEffect(() => {
    const editData = sessionStorage.getItem("edit_invoice_data");
    if (editData) {
      const parsedData = JSON.parse(editData);
      setIsEditMode(true);
      setEditInvoiceId(parsedData.invoiceNumber || parsedData.id);
      // Check if customs/transport was actually enabled (values > 0)
      const hasTransportCost = parseFloat(parsedData.transportCost || 0) > 0;
      const hasCustomsDuty = parseFloat(parsedData.customsDuty || 0) > 0;
      const hasDocCharges = parseFloat(parsedData.documentationCharges || 0) > 0;
      const hasOtherCharges = parseFloat(parsedData.otherCharges || 0) > 0;
      const hasTransportRoute =
        parsedData.transportFrom &&
        parsedData.transportTo &&
        (parsedData.transportFrom.name || parsedData.transportTo.name);
      const inferredCustoms =
        hasTransportCost ||
        hasCustomsDuty ||
        hasDocCharges ||
        hasOtherCharges ||
        !!hasTransportRoute;
      const shouldIncludeCustoms =
        parsedData.includeCustomsTransport === true
          ? true
          : parsedData.includeCustomsTransport === false
            ? false
            : inferredCustoms;

      setFormData(prev => ({
        ...prev,
        ...parsedData,
        // Ensure items array exists
        items: parsedData.items || prev.items,
        // Restore currency from the saved invoice
        originalCurrency: parsedData.currency || currency,
        // Set the checkbox based on whether customs data has actual values
        includeCustomsTransport: shouldIncludeCustoms,
      }));
      // Set the currency to match the invoice's currency
      if (parsedData.currency) {
        setCurrency(parsedData.currency);
      }
      // Clear the edit data from sessionStorage
      sessionStorage.removeItem("edit_invoice_data");
    }
  }, []);

  // Auto-generate the next invoice number from the backend on mount. Skipped
  // when editing an existing invoice so we don't overwrite its number.
  useEffect(() => {
    // If sessionStorage still has edit data, the edit-mode effect will populate
    // the number. Bail so we don't race that.
    if (sessionStorage.getItem("edit_invoice_data")) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/inventory/invoices/next-number");
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.success || !data.data?.invoiceNumber) return;
        setFormData((prev) => ({ ...prev, invoiceNumber: data.data.invoiceNumber }));
      } catch {
        // Network error — keep the default CZN-MM-0001 placeholder so the
        // user can still type and submit.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Currency options
  const CURRENCIES = [
    { code: "NPR", symbol: "Rs. ", name: "NPR" },
    { code: "USD", symbol: "$ ", name: "Dollar" },
    { code: "CNY", symbol: "¥ ", name: "RMB" },
  ];

  // Default invoice number for the current month — used as a placeholder until
  // the backend returns the authoritative next sequence (see effect below).
  // Format: CZN-MM-NNNN starting at 0001.
  const defaultInvoiceNumber = () => {
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    return `CZN-${month}-0001`;
  };

  // Form State
  const [formData, setFormData] = useState({
    invoiceNumber: defaultInvoiceNumber(),
    invoiceDate: new Date().toISOString().split("T")[0],
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    shareTo: "",
    modeOfDelivery: "",
    exportCountry: "",
    items: [{ productName: "", productImage: "", quantity: 1, unit: "KG", unitPrice: 0, priceUnit: "KG", weight: "", cbm: "", commission: 0, hsCode: "", hsAutoMatched: true, hsConfidence: "none", dutyOrigin: null, alcoholAbv: null, mergedInto: {} }],
    notes: "",
    customsDuty: "",
    documentationCharges: "",
    otherCharges: "",
    originalCurrency: currency, // Store the currency when invoice was created
    transportCost: "",
    transportFrom: null,
    transportTo: null,
    borderCrossing: "",
    shippingCompany: "",
    trackingNumber: "",
    customsNotes: "",
    includeCustomsTransport: false, // Radio button state for adding customs/transport
    defaultDutyOrigin: "CN", // Origin country used for HS-based duty calc unless an item overrides (China is the most common origin for Cellzen)
    customsDutyAutoFilled: true, // True until the user manually edits the customs duty input — keeps the HS-derived value in sync
  });

  // HS tariff loading + drawer/modal state
  const [tariffReady, setTariffReady] = useState(isTariffReady());
  const [hsDrawerIndex, setHsDrawerIndex] = useState(null); // null = drawer closed
  const [hsModalOpen, setHsModalOpen] = useState(false);

  // Excel-like fill-drag state: tracks which column is being dragged and the row range
  const [fillDrag, setFillDrag] = useState(null); // { colKey, fromIndex, toIndex }
  // Excel-like selected cell: { row, col }
  const [focusedCell, setFocusedCell] = useState(null);
  // Row selection (Set of row indices) — click row-number gutter to select rows
  const [selRows, setSelRows] = useState(new Set());
  const [lastSelRow, setLastSelRow] = useState(null);
  // Cell-range selection — drag on data cells to select a rectangle { r1, c1, r2, c2 } (col indices into MERGE_COLS)
  const [selRange, setSelRange] = useState(null);
  // Image drag-over: index of row whose image drop zone is currently hovered
  const [imgDragOver, setImgDragOver] = useState(null);
  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y }

  // Preload the tariff bundle once. After this resolves, all HS lookups + calcs
  // are pure in-memory and synchronous.
  useEffect(() => {
    if (tariffReady) return;
    let cancelled = false;
    preloadTariff()
      .then(() => { if (!cancelled) setTariffReady(true); })
      .catch(() => { /* tariff lookups will simply be no-ops until reload */ });
    return () => { cancelled = true; };
  }, [tariffReady]);

  // After tariff finishes loading, auto-match HS codes for any items that were
  // typed before the bundle was ready.
  useEffect(() => {
    if (!tariffReady) return;
    setFormData(prev => {
      let dirty = false;
      const items = prev.items.map(item => {
        if (!item.productName?.trim()) return item;
        if (item.hsAutoMatched === false) return item; // user pinned manually
        if (item.hsCode && item.hsConfidence && item.hsConfidence !== "none") return item;
        const m = autoMatchHsCode(item.productName);
        if ((m.code || "") !== (item.hsCode || "") || m.confidence !== item.hsConfidence) {
          dirty = true;
          const next = { ...item, hsCode: m.code || "", hsConfidence: m.confidence };
          // Auto-sync invoice unit to HS unit (only if still on default KG).
          if (m.code) {
            const matched = lookupByCode(m.code);
            const wantInv = invoiceUnitForHsUnit(matched?.unit);
            if (wantInv && (next.unit === "KG" || !next.unit)) {
              next.unit = wantInv;
              next.priceUnit = wantInv;
            }
          }
          return next;
        }
        return item;
      });
      return dirty ? { ...prev, items } : prev;
    });
  }, [tariffReady]);

  // Get current currency symbol with space
  const getCurrencySymbol = () => {
    const curr = CURRENCIES.find(c => c.code === currency);
    return curr?.symbol || "Rs. ";
  };

  const getCurrencySymbolFor = (currencyCode) => {
    const curr = CURRENCIES.find(c => c.code === currencyCode);
    return curr?.symbol || "Rs. ";
  };

  const getInvoiceItemCurrencySymbol = () => getCurrencySymbolFor(formData.originalCurrency || currency);

  // Convert USD rate to target currency (defaults to current currency)
  const convertRateFromUSD = (usdRate, targetCurrency = currency) => {
    if (!usdRate || isNaN(usdRate)) return 0;
    // Exchange rates are stored as: 1 USD = X CNY/NPR
    // To convert USD to target: multiply by exchange rate
    const rates = { USD: 1, CNY: 7.24, NPR: 135.50 };
    const savedRates = localStorage.getItem('cellzen_exchange_rates');
    if (savedRates) {
      const parsed = JSON.parse(savedRates);
      Object.assign(rates, parsed);
    }
    return parseFloat(usdRate) * (rates[targetCurrency] || 1);
  };

  // Convert amount from one currency to another — returns full precision; callers apply .toFixed(2) for display.
  // Hoisted up here so it's defined before computeItemCifNpr / aggregateHsDutyNpr (which reference it).
  const convertCurrency = (amount, fromCurrency, toCurrency) => {
    if (fromCurrency === toCurrency) return parseFloat(amount) || 0;
    if (!amount || isNaN(amount)) return 0;

    const rates = { USD: 1, CNY: 7.24, NPR: 135.50 };
    const savedRates = localStorage.getItem('cellzen_exchange_rates');
    if (savedRates) {
      const parsed = JSON.parse(savedRates);
      Object.assign(rates, parsed);
    }

    const amountInUSD = parseFloat(amount) / rates[fromCurrency];
    return amountInUSD * rates[toCurrency];
  };

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Auto-fill Customs Duty fields when Step 3 is opened
  useEffect(() => {
    if (currentStep === 3) {
      setFormData(prev => {
        const updates = {};

        // Sync Mode of Transport from Step 1 (if available)
        if (prev.modeOfDelivery) {
          updates.modeOfDelivery = prev.modeOfDelivery;
        }

        // Default From country to China (if not set)
        if (!prev.transportFrom) {
          const china = countries.find(c => c.name === "China");
          if (china) {
            updates.transportFrom = china;
          }
        }

        // Auto-fill To country from Export Country in Step 1 (if available and not set)
        if (prev.exportCountry && !prev.transportTo) {
          const exportCountryObj = countries.find(c =>
            c.name.toLowerCase() === prev.exportCountry.toLowerCase()
          );
          if (exportCountryObj) {
            updates.transportTo = exportCountryObj;
          }
        }

        return { ...prev, ...updates };
      });
    }
  }, [currentStep]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("inv_token");
      if (!token) {
        console.error("No auth token found");
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      const [customersRes, distributorsRes, suppliersRes, partnersRes] = await Promise.all([
        fetch(`${API_BASE}/inventory/auth/users?type=customers`, { headers }),
        fetch(`${API_BASE}/inventory/auth/users?type=distributors`, { headers }),
        fetch(`${API_BASE}/inventory/auth/users?type=suppliers`, { headers }),
        fetch(`${API_BASE}/inventory/auth/users?type=partners`, { headers }),
      ]);

      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.data || []);
      }
      if (distributorsRes.ok) {
        const data = await distributorsRes.json();
        setDistributors(data.data || []);
      }
      if (suppliersRes.ok) {
        const data = await suppliersRes.json();
        setSuppliers(data.data || []);
      }
      if (partnersRes.ok) {
        const data = await partnersRes.json();
        setPartners(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // Combine all users for "Share to" dropdown
  const allShareableUsers = [
    ...customers.map(u => ({ ...u, type: "Customer" })),
    ...distributors.map(u => ({ ...u, type: "Distributor" })),
    ...suppliers.map(u => ({ ...u, type: "Supplier" })),
    ...partners.map(u => ({ ...u, type: "Partner" })),
  ];

  const getSelectedShareUser = (userId = formData.shareTo) => allShareableUsers.find(u => u.id === userId);

  const handleShareToChange = (userId) => {
    if (!userId) {
      // Clear selection
      setFormData(prev => ({
        ...prev,
        shareTo: "",
      }));
      return;
    }
    const selectedUser = allShareableUsers.find(u => u.id === userId);
    if (selectedUser) {
      setFormData(prev => ({
        ...prev,
        shareTo: userId,
        customerName: selectedUser.name,
        customerEmail: selectedUser.email || "",
      }));
    }
  };

  const handleCurrencyChange = (nextCurrency) => {
    // The invoice right-side currency fixes the denomination — same numbers, different label.
    // It does NOT touch the global display currency (header).
    setFormData(prev => ({
      ...prev,
      originalCurrency: nextCurrency,
    }));
  };

  const syncSharedInvoice = async (invoiceData) => {
    const token = localStorage.getItem("inv_token");
    if (!token) return;

    const selectedUser = getSelectedShareUser(invoiceData.shareTo);
    const response = await fetch(`${API_BASE}/inventory/invoices/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        invoice: invoiceData,
        sharedUserId: invoiceData.shareTo || "",
        sharedUserType: selectedUser?.type || "",
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Invoice was saved but could not be shared");
    }
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { productName: "", productImage: "", quantity: 1, unit: "KG", unitPrice: 0, priceUnit: "KG", weight: "", cbm: "", commission: 0, hsCode: "", hsAutoMatched: true, hsConfidence: "none", dutyOrigin: null, alcoholAbv: null, mergedInto: {} }],
    }));
  };

  const importFromExcel = useCallback((file) => {
    if (!file) return;

    const processFile = async () => {
      const buffer = await file.arrayBuffer();

      // ── 1. Extract images via ExcelJS (handles both floated and embedded images) ──
      const imgByRow = {};
      try {
        const { Workbook } = await import('exceljs');
        const exWb = new Workbook();
        await exWb.xlsx.load(buffer);
        const exWs = exWb.getWorksheet(1);
        if (exWs) {
          for (const img of exWs.getImages()) {
            const rowIdx = Math.floor(img.range.tl.nativeRow); // 0-based
            const wbImg = exWb.getImage(img.imageId);
            if (wbImg?.buffer) {
              const arr = new Uint8Array(wbImg.buffer);
              const b64 = btoa(arr.reduce((acc, b) => acc + String.fromCharCode(b), ''));
              const ext = wbImg.extension || 'png';
              if (!imgByRow[rowIdx]) imgByRow[rowIdx] = `data:image/${ext};base64,${b64}`;
            }
          }
        }
      } catch { /* image extraction is best-effort */ }

      // ── 2. Parse cell data via SheetJS ──
      const wb = XLSX.read(new Uint8Array(buffer), {
        type: 'array', cellFormula: false, cellStyles: false, raw: false,
      });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Expand merged cells — fill all cells in each merge region with the top-left value
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
      const merges = ws['!merges'] || [];
      const grid = rawRows.map(r => [...(r || [])]);
      for (const m of merges) {
        const val = grid[m.s.r]?.[m.s.c] ?? null;
        for (let r = m.s.r; r <= m.e.r; r++) {
          for (let c = m.s.c; c <= m.e.c; c++) {
            if (!grid[r]) grid[r] = [];
            if (r === m.s.r && c === m.s.c) continue;
            grid[r][c] = val;
          }
        }
      }

      if (grid.length < 2) return;

      const normalise = h => String(h ?? '').toLowerCase()
        .replace(/[()（）\[\]\/\\]/g, ' ').replace(/\s+/g, ' ').trim();

      // ── 3. Auto-detect header row by keyword scoring ──
      // The real header row contains words like "model", "qty", "price", "no", "type" etc.
      // Metadata preamble rows (Proforma Invoice, Order Date, Shipper…) score very low.
      const HEADER_KWS = [
        'no','no.','model','type','spc','spec','qty','quantity','unit','price','total',
        'weight','kg','cbm','volume','commission','image','picture','photo','product',
        'name','description','goods','code','remark','amount','item',
        '数量','单价','型号','产品','品名','规格','重量','价格','总价','图片','编号','型','号',
      ];
      let bestScore = 0;
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(25, grid.length); i++) {
        const row = grid[i] || [];
        const score = row.reduce((s, cell) => {
          const h = normalise(cell);
          return s + (HEADER_KWS.some(kw => h === kw || h.startsWith(kw + ' ') || h.endsWith(' ' + kw) || h.includes(' ' + kw + ' ')) ? 1 : 0);
        }, 0);
        if (score > bestScore) { bestScore = score; headerRowIdx = i; }
      }

      const headers = (grid[headerRowIdx] || []).map(normalise);

      // findCol: first header containing any keyword
      // findColX: same but skip headers that also contain any of the excluded terms
      const findCol = (...kws) => {
        for (const kw of kws) {
          const i = headers.findIndex(h => h.includes(kw));
          if (i !== -1) return i;
        }
        return -1;
      };
      const findColX = (excl, ...kws) => {
        for (const kw of kws) {
          const i = headers.findIndex(h => h.includes(kw) && !excl.some(ex => h.includes(ex)));
          if (i !== -1) return i;
        }
        return -1;
      };

      // Exclude image/picture columns from text columns, and total column from unit price
      const EXCL_PIC   = ['picture', 'photo', 'image', 'pic', '图片', '图'];
      const EXCL_TOTAL = ['total', '总'];

      // Column detection — wide keyword sets to handle many Excel formats
      const cNo    = findCol('no.','no ','序号','#','sr.no','s.no','item no','编号');
      // Name-building columns (all concatenated): model → type → spc → desc → name
      const cModel = findColX(EXCL_PIC, 'model','型号','sku','article no','part no','item code','item no','货号');
      const cType  = findColX(EXCL_PIC, 'type','类型','category','种类','品类');
      const cSpc   = findColX(EXCL_PIC, 'spc.','spc','spec','specification','规格','details','variant','配置');
      const cDesc  = findColX(EXCL_PIC, 'description','desc','详情','描述','说明');
      // cName: explicitly named product name columns — never picture columns
      const cName  = findColX(EXCL_PIC, 'product name','item name','goods name','commodity name',
                              'goods','commodity','品名','商品名','产品名','货物名','物品');
      const cQty   = findCol('order quantity','quantity pcs','quantity','qty','pcs','件数','数量','count','pieces');
      const cUnit  = findColX([...EXCL_PIC, ...EXCL_TOTAL, 'price','cost'], 'unit of measure','unit','uom','单位');
      // Unit price: prefer specific labels; exclude total/gross-total columns
      const cUP    = findColX(EXCL_TOTAL,
                              'exw price','unit price','price rmb','price usd','price cny',
                              'unit cost','单价','出厂价','exw','price','rate','cost','售价');
      const cKg    = findCol('gross weight','net weight','weight kg','total weight','weight','kg',
                             '毛重','净重','重量','g.w','n.w','gross','net wt');
      const cCbm   = findCol('cbm','volume','cubic meter','cubic','m3','m³','体积','立方');
      const cComm  = findCol('commission %','commission','comm %','comm','佣金');

      // Parse numeric values: handles raw numbers, and strings with any currency symbol
      const toNum = v => {
        if (typeof v === 'number') return v;
        const s = String(v ?? '').replace(/[¥￥$€£₹₩,，\s]/g, '').replace(/[^\d.-]/g, '');
        return parseFloat(s) || 0;
      };

      const blankItem = () => ({
        productName: '', productImage: '', quantity: 1, unit: 'PCS', unitPrice: 0,
        priceUnit: 'PCS', weight: '', cbm: '', commission: 0,
        hsCode: '', hsAutoMatched: true, hsConfidence: 'none',
        dutyOrigin: null, alcoholAbv: null, mergedInto: {},
      });

      // ── 4. Build items from data rows ──
      const newItems = [];
      for (let i = headerRowIdx + 1; i < grid.length; i++) {
        const row = grid[i] || [];
        // Skip blank rows and rows that are pure formula artefacts
        if (row.every(c => c == null || String(c).trim() === '' || String(c).startsWith('='))) continue;

        // Skip footer/note rows: NO. column contains non-numeric text (e.g. "TOTAL", "备注")
        if (cNo >= 0) {
          const noVal = String(row[cNo] ?? '').trim();
          if (noVal && !/^\d+$/.test(noVal)) continue;
        }

        // Build product name: MODEL → TYPE → SPC → DESC → NAME (all concatenated, deduplicated)
        // e.g. "C6939" + "Charger" + "US cable" → "C6939 Charger US cable"
        const seen = new Set();
        const nameParts = [];
        for (const ci of [cModel, cType, cSpc, cDesc, cName]) {
          if (ci < 0) continue;
          const v = String(row[ci] ?? '').trim();
          // Skip formula strings (=DISPIMG, =IMAGE, etc.) — those are image embeds, not text
          if (v && !v.startsWith('=') && !seen.has(v.toLowerCase())) {
            seen.add(v.toLowerCase()); nameParts.push(v);
          }
        }
        // Last resort: first non-empty text cell that isn't a pure number or formula
        if (nameParts.length === 0) {
          const skipCols = new Set([cQty, cUP, cKg, cCbm, cComm].filter(x => x >= 0));
          for (let j = 0; j < row.length; j++) {
            if (skipCols.has(j)) continue;
            const v = String(row[j] ?? '').trim();
            if (v && !v.startsWith('=') && isNaN(Number(v.replace(/[¥$€£,]/g, '')))) { nameParts.push(v); break; }
          }
        }
        const productName = nameParts.map(p => p.trim()).filter(Boolean).join('  ').trim();
        if (!productName) continue;

        // Skip footer/note rows by content — summary lines, payment terms, remarks etc.
        const pnLower = productName.toLowerCase();
        const FOOTER_KWS = [
          'total:','total：','total pcs','total qty','合计','小计',
          '注意事项','注意','remark','remarks','note:','notes:',
          'payment term','付款','定金','deposit',
          'balance amount','余额','balance:',
          'signature','签字','签名',
          '是否分开','是否过热','封口','保质',
        ];
        if (FOOTER_KWS.some(kw => pnLower.startsWith(kw) || pnLower.includes(kw))) continue;

        const qty       = cQty  >= 0 ? (toNum(row[cQty])  || 1) : 1;
        const unit      = cUnit >= 0 ? (String(row[cUnit] ?? '').trim() || 'PCS') : 'PCS';
        const unitPrice = cUP   >= 0 ? toNum(row[cUP])  : 0;
        const rawKg     = cKg   >= 0 ? toNum(row[cKg])  : 0;
        const rawCbm    = cCbm  >= 0 ? toNum(row[cCbm]) : 0;
        const weight    = rawKg  > 0 ? String(rawKg)  : '';
        const cbm       = rawCbm > 0 ? String(rawCbm) : '';
        const commission = cComm >= 0 ? toNum(row[cComm]) : 0;

        // Image: use ExcelJS-extracted image for this row (0-based index = i)
        const productImage = imgByRow[i] || '';

        // Auto-match HS code
        let hsCode = '', hsConfidence = 'none';
        if (productName && isTariffReady()) {
          const m = autoMatchHsCode(productName);
          hsCode = m.code || ''; hsConfidence = m.confidence;
        }

        newItems.push({ ...blankItem(), productName, productImage, quantity: qty, unit, priceUnit: unit, unitPrice, weight, cbm, commission, hsCode, hsConfidence });
      }

      if (newItems.length === 0) return;

      setFormData(prev => {
        const existing = prev.items.filter(it => it.productName || it.productImage || it.weight || it.cbm);
        return { ...prev, items: existing.length > 0 ? [...existing, ...newItems] : newItems };
      });
    };

    processFile().catch(err => console.error('Excel import failed:', err));
  }, []);

  // ── PDF import ───────────────────────────────────────────────────────────────
  const importFromPDF = useCallback((file) => {
    if (!file) return;

    const processFile = async () => {
      const buffer = await file.arrayBuffer();

      // Lazy-load pdfjs-dist so it doesn't bloat the initial bundle
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url,
      ).href;

      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

      // ── 1. Extract text items with coordinates across all pages ──
      const allItems = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const vp      = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        for (const item of content.items) {
          const str = item.str?.trim();
          if (!str) continue;
          // PDF y=0 is bottom-left; flip to top-down
          allItems.push({ str, x: item.transform[4], y: vp.height - item.transform[5], page: p });
        }
      }
      if (allItems.length === 0) return;

      // ── 2. Cluster text into visual lines (tight ±4 pt tolerance) ──
      allItems.sort((a, b) => a.y - b.y || a.x - b.x);
      const LINE_TOL = 4;
      const lines = [];
      let cur = [allItems[0]];
      for (let i = 1; i < allItems.length; i++) {
        if (Math.abs(allItems[i].y - cur[cur.length - 1].y) <= LINE_TOL) {
          cur.push(allItems[i]);
        } else {
          lines.push([...cur].sort((a, b) => a.x - b.x));
          cur = [allItems[i]];
        }
      }
      if (cur.length) lines.push([...cur].sort((a, b) => a.x - b.x));
      if (lines.length < 2) return;

      const normalise = h => String(h ?? '').toLowerCase()
        .replace(/[()（）\[\]\/\\]/g, ' ').replace(/\s+/g, ' ').trim();

      const HEADER_KWS = [
        'no','no.','model','type','spc','spec','qty','quantity','unit','price','total',
        'weight','kg','cbm','volume','commission','image','picture','photo','product',
        'name','description','goods','code','remark','amount','item',
        '数量','单价','型号','产品','品名','规格','重量','价格','总价','图片','编号','型','号',
      ];
      const scoreItems = items => items.reduce((s, it) => {
        const h = normalise(it.str);
        return s + (HEADER_KWS.some(kw =>
          h === kw || h.startsWith(kw + ' ') || h.endsWith(' ' + kw) || h.includes(' ' + kw + ' '),
        ) ? 1 : 0);
      }, 0);

      // ── 3. Detect header — try single line and bilingual 2-line pairs ──
      // Bilingual PDFs (e.g. "编号" on one line, "NO" on the next) score higher as a pair.
      let bestScore = 0, headerLineIdx = 0, headerLineCount = 1;
      for (let i = 0; i < Math.min(25, lines.length); i++) {
        const s1 = scoreItems(lines[i]);
        if (s1 > bestScore) { bestScore = s1; headerLineIdx = i; headerLineCount = 1; }
        if (i + 1 < lines.length) {
          const yGap = lines[i + 1][0].y - lines[i][lines[i].length - 1].y;
          if (yGap < 22) {
            const s2 = scoreItems([...lines[i], ...lines[i + 1]]);
            if (s2 > bestScore) { bestScore = s2; headerLineIdx = i; headerLineCount = 2; }
          }
        }
      }

      // Merge header lines; cluster stacked bilingual text by x-proximity into one column entry
      const rawHdrItems = [
        ...lines[headerLineIdx],
        ...(headerLineCount === 2 ? lines[headerLineIdx + 1] : []),
      ].sort((a, b) => a.x - b.x);
      const hCols = [];
      for (const it of rawHdrItems) {
        const last = hCols[hCols.length - 1];
        if (last && Math.abs(it.x - last.x) < 35) {
          last.text += ' ' + it.str;
        } else {
          hCols.push({ x: it.x, text: it.str });
        }
      }
      const headers  = hCols.map(c => normalise(c.text));
      const headerXs = hCols.map(c => c.x);
      const colCount = hCols.length;

      const assignCol = x => {
        let best = 0, bestDist = Infinity;
        headerXs.forEach((hx, i) => { const d = Math.abs(x - hx); if (d < bestDist) { bestDist = d; best = i; } });
        return best;
      };

      const dataStart = headerLineIdx + headerLineCount;

      // ── 4. Column detection ──
      const findCol = (...kws) => {
        for (const kw of kws) { const i = headers.findIndex(h => h.includes(kw)); if (i !== -1) return i; }
        return -1;
      };
      const findColX = (excl, ...kws) => {
        for (const kw of kws) {
          const i = headers.findIndex(h => h.includes(kw) && !excl.some(ex => h.includes(ex)));
          if (i !== -1) return i;
        }
        return -1;
      };

      const EXCL_PIC   = ['picture', 'photo', 'image', 'pic', '图片', '图'];
      const EXCL_TOTAL = ['total', '总'];

      // Exclude SN/NO-like terms from name/spec columns so a header like
      // "Product SN" or "Item Sr." can't accidentally be picked as the product
      // name column.
      const EXCL_NO = ['sn', 's/n', 's.n', 'serial', 'sr.', 'sr ', 'srno', 'sr no', 'no.', 'no ', '#', '序号', '编号'];

      const cNo    = findCol('sn', 's/n', 's.n', 'serial no', 'serial', 'sr.no', 'sr no', 'srno', 's.no', 'sr.', 'no.', 'no ', 'item no', '#', '序号', '编号');
      const cModel = findColX([...EXCL_PIC, ...EXCL_NO], 'model', '型号', 'sku', 'article no', 'part no', 'item code', 'item no', '货号');
      const cType  = findColX([...EXCL_PIC, ...EXCL_NO], 'type', '类型', 'category', '种类', '品类');
      const cSpc   = findColX([...EXCL_PIC, ...EXCL_NO], 'spc.', 'spc', 'spec', 'specification', '规格', 'details', 'variant', '配置');
      const cDesc  = findColX([...EXCL_PIC, ...EXCL_NO], 'description', 'desc', '详情', '描述', '说明');
      const cName  = findColX([...EXCL_PIC, ...EXCL_NO], 'product name', 'item name', 'goods name', 'commodity name',
                              'product description', 'item description',
                              'goods', 'commodity', '品名', '商品名', '产品名', '货物名', '物品');
      const cQty   = findCol('order quantity', 'quantity pcs', 'quantity', 'qty', 'pcs', '件数', '数量', 'count', 'pieces');
      const cUnit  = findColX([...EXCL_PIC, ...EXCL_TOTAL, 'price', 'cost'], 'unit of measure', 'unit', 'uom', '单位');
      const cUP    = findColX(EXCL_TOTAL, 'exw price', 'unit price', 'price rmb', 'price usd', 'price cny',
                              'unit cost', '单价', 'u p', 'u/p', '出厂价', 'exw', 'price', 'rate', 'cost', '售价');
      const cKg    = findCol('gross weight', 'net weight', 'weight kg', 'total weight', 'weight', 'kg',
                             '毛重', '净重', '重量', 'g.w', 'n.w', 'gross', 'net wt');
      const cCbm   = findCol('cbm', 'volume', 'cubic meter', 'cubic', 'm3', 'm³', '体积', '立方');
      const cComm  = findCol('commission %', 'commission', 'comm %', 'comm', '佣金');

      // ── 5. Merge multi-line table rows using NO column as row boundary ──
      // PDFs often have multi-line cells (e.g. TIGER / PRIVACY / GLASS / SINGLE
      // spread over 4 visual lines). A new invoice item starts when the NO column
      // position contains a sequential integer (1, 2, 3...).
      //
      // If the SN/NO header wasn't matched by keyword, auto-infer it: pick the
      // column whose data rows are dominated by sequential small integers.
      let noColIdx = cNo;
      if (noColIdx < 0) {
        let bestCol = -1, bestScore = 0;
        for (let c = 0; c < colCount; c++) {
          let intCount = 0, total = 0;
          for (let i = dataStart; i < Math.min(dataStart + 30, lines.length); i++) {
            const it = lines[i].find(t => Math.abs(t.x - headerXs[c]) <= 35);
            if (!it) continue;
            total++;
            if (/^\d{1,3}$/.test(it.str.trim())) intCount++;
          }
          if (total >= 2 && intCount / total >= 0.7 && intCount > bestScore) {
            bestScore = intCount; bestCol = c;
          }
        }
        if (bestCol >= 0) noColIdx = bestCol;
      }

      const noColX   = noColIdx >= 0 ? headerXs[noColIdx] : headerXs[0];
      const NO_X_TOL = 45; // pt — generous tolerance for slight x offsets

      // ── Anchor-based bucketing ──
      // Each SN integer (e.g. "28", "29", "30") is an anchor for one invoice
      // row. Anchors are vertically POSITIONED IN THE MIDDLE of a multi-line
      // cell, so text both above AND below the SN may belong to that row.
      // We assign every line to its nearest anchor by y-distance, which
      // handles PDFs where product names wrap across 2–3 lines around the
      // SN (e.g. "IPHONE PRO" on one line, "30" on the SN line, "MAX" below).
      const candidates = [];
      for (let i = dataStart; i < lines.length; i++) {
        const line        = lines[i];
        const noCandidate = line.find(it => Math.abs(it.x - noColX) <= NO_X_TOL);
        const noText      = noCandidate ? noCandidate.str.trim() : '';
        if (/^\d{1,4}$/.test(noText)) {
          candidates.push({ lineIdx: i, sn: parseInt(noText, 10), y: line[0].y });
        }
      }

      // Coalesce anchors that sit within 8pt of each other (a single tall row
      // shouldn't get two anchors). Keep the first one we saw.
      const MIN_ROW_HEIGHT = 8;
      const anchors = [];
      for (const c of candidates) {
        if (anchors.length === 0 || (c.y - anchors[anchors.length - 1].y) >= MIN_ROW_HEIGHT) {
          anchors.push(c);
        }
      }

      // Compute the typical row height from the median gap between anchors.
      // We use this to bound how far a line can be from its nearest anchor —
      // footer/totals lines below the last SN must not be sucked into the
      // last row's bucket (which is what made qty "50" become "501900").
      const anchorGaps = [];
      for (let a = 1; a < anchors.length; a++) {
        anchorGaps.push(anchors[a].y - anchors[a - 1].y);
      }
      anchorGaps.sort((a, b) => a - b);
      const medianGap = anchorGaps[Math.floor(anchorGaps.length / 2)] || 20;
      const MAX_LINE_DIST = medianGap * 0.7; // ~70% of one row's height

      let tableRowBuckets;
      const bucketAnchorY = []; // y of each bucket's anchor (or null in fallback mode)
      if (anchors.length > 0) {
        // Each line → nearest anchor by y-distance, bounded by MAX_LINE_DIST.
        // Lines further than MAX_LINE_DIST from any anchor are dropped
        // (header preamble above first SN, footer/totals below last SN).
        tableRowBuckets = anchors.map(() => []);
        for (const a of anchors) bucketAnchorY.push(a.y);
        for (let i = dataStart; i < lines.length; i++) {
          const line  = lines[i];
          const lineY = line[0].y;
          let bestAnchor = -1, bestDist = Infinity;
          for (let a = 0; a < anchors.length; a++) {
            const d = Math.abs(lineY - anchors[a].y);
            if (d < bestDist) { bestDist = d; bestAnchor = a; }
          }
          if (bestAnchor >= 0 && bestDist <= MAX_LINE_DIST) {
            tableRowBuckets[bestAnchor].push(...line);
          }
        }
      } else {
        // No SN integers found — treat every line as its own row.
        tableRowBuckets = [];
        for (let i = dataStart; i < lines.length; i++) {
          tableRowBuckets.push([...lines[i]]);
          bucketAnchorY.push(null);
        }
      }

      // Numeric columns must NEVER be concatenated. If a row's bucket contains
      // multiple fragments at the qty/price/weight x-position (e.g. from a
      // continuation line), pick the one closest to the SN anchor's y — that's
      // the value on the actual data line, not a stray number from a wrapped
      // name above or a partial total below.
      const NUMERIC_COLS = new Set([cQty, cUP, cKg, cCbm, cComm].filter(x => x >= 0));

      // Build one aligned cell-array per invoice item row.
      // Text cells: sort fragments top-to-bottom, dedup tail repeats, dedup
      // repeated phrases ("IPH 14 PRO IPH 14 PRO" → "IPH 14 PRO").
      // Numeric cells: single closest-to-anchor value, never concatenated.
      const alignedGrid = tableRowBuckets.map((bucket, bIdx) => {
        const anchorY = bucketAnchorY[bIdx];
        const cells   = new Array(colCount).fill(null);
        const byCol   = new Array(colCount).fill(null).map(() => []);
        for (const it of bucket) byCol[assignCol(it.x)].push(it);
        for (let c = 0; c < colCount; c++) {
          const frags = byCol[c];
          if (frags.length === 0) continue;

          if (NUMERIC_COLS.has(c)) {
            // Pick the fragment nearest the SN anchor (the data row's own line).
            let best = frags[0], bestDist = Infinity;
            for (const it of frags) {
              const d = anchorY != null ? Math.abs(it.y - anchorY) : 0;
              if (d < bestDist) { bestDist = d; best = it; }
            }
            cells[c] = best.str.trim() || null;
            continue;
          }

          const sorted = frags.slice().sort((a, b) => a.y - b.y || a.x - b.x);
          let txt = '';
          for (const it of sorted) {
            const s = it.str.trim();
            if (!s) continue;
            if (!txt) { txt = s; continue; }
            if (txt.toLowerCase().endsWith(s.toLowerCase())) continue;
            txt += ' ' + s;
          }
          const repeat = txt.match(/^(.+?)(?:\s+\1)+$/);
          if (repeat) txt = repeat[1].trim();
          cells[c] = txt || null;
        }
        return cells;
      });

      // ── 6. Build invoice items ──
      const toNum = v => {
        if (typeof v === 'number') return v;
        const s = String(v ?? '').replace(/[¥￥$€£₹₩,，\s]/g, '').replace(/[^\d.-]/g, '');
        return parseFloat(s) || 0;
      };
      const blankItem = () => ({
        productName: '', productImage: '', quantity: 1, unit: 'PCS', unitPrice: 0,
        priceUnit: 'PCS', weight: '', cbm: '', commission: 0,
        hsCode: '', hsAutoMatched: true, hsConfidence: 'none',
        dutyOrigin: null, alcoholAbv: null, mergedInto: {},
      });
      const FOOTER_KWS = [
        'total:', 'total：', 'total pcs', 'total qty', '合计', '小计',
        '注意事项', '注意', 'remark', 'remarks', 'note:', 'notes:',
        'payment term', '付款', '定金', 'deposit',
        'balance amount', '余额', 'balance:', 'signature', '签字', '签名',
      ];

      const newItems = [];
      for (const row of alignedGrid) {
        if (row.every(c => c == null || String(c).trim() === '')) continue;

        // With anchor-based bucketing the SN cell may contain "28 some text"
        // (the SN plus adjacent fragments), so only skip rows where the SN
        // cell DOESN'T start with a digit (a footer/note row like "TOTAL:").
        if (noColIdx >= 0) {
          const noVal = String(row[noColIdx] ?? '').trim();
          if (noVal && !/^\d/.test(noVal)) continue;
        }

        // Collect candidate name fragments in priority order (most readable first).
        const candidateParts = [];
        for (const ci of [cName, cModel, cType, cSpc, cDesc]) {
          if (ci < 0) continue;
          const v = String(row[ci] ?? '').trim();
          if (v) candidateParts.push(v);
        }

        // Cross-column dedup: if one fragment is a substring of another (case-
        // insensitive), keep the longer one. This prevents names like
        // "IPH 14 PRO IPH 14 PRO" when cName and cModel hold the same text,
        // and collapses "IPH 15/16 IPH 15" → "IPH 15/16".
        const nameParts = [];
        for (const p of candidateParts) {
          const pLower = p.toLowerCase();
          const idx = nameParts.findIndex(np => {
            const nLower = np.toLowerCase();
            return nLower.includes(pLower) || pLower.includes(nLower);
          });
          if (idx >= 0) {
            if (p.length > nameParts[idx].length) nameParts[idx] = p;
          } else {
            nameParts.push(p);
          }
        }

        if (nameParts.length === 0) {
          // Skip SN/qty/price/measurement columns. Use noColIdx so we exclude
          // the SN column even when it was auto-inferred (not matched by header
          // keyword), preventing serial numbers from being picked as the name.
          const skipCols = new Set([noColIdx, cNo, cQty, cUP, cKg, cCbm, cComm].filter(x => x >= 0));
          for (let j = 0; j < row.length; j++) {
            if (skipCols.has(j)) continue;
            const v = String(row[j] ?? '').trim();
            // Skip pure short integers (likely a stray SN) and anything that
            // parses cleanly as a number.
            if (!v) continue;
            if (/^\d{1,4}$/.test(v)) continue;
            if (!isNaN(Number(v.replace(/[¥$€£,]/g, '')))) continue;
            nameParts.push(v); break;
          }
        }
        // Join with single space (natural product-name format, no separators
        // like " - / " that the user has to clean up afterwards).
        const productName = nameParts.join(' ').replace(/\s+/g, ' ').trim();
        if (!productName) continue;

        const pnLower = productName.toLowerCase();
        if (FOOTER_KWS.some(kw => pnLower.startsWith(kw) || pnLower.includes(kw))) continue;

        const qty        = cQty  >= 0 ? (toNum(row[cQty])  || 1) : 1;
        const unit       = cUnit >= 0 ? (String(row[cUnit] ?? '').trim() || 'PCS') : 'PCS';
        const unitPrice  = cUP   >= 0 ? toNum(row[cUP])  : 0;
        const rawKg      = cKg   >= 0 ? toNum(row[cKg])  : 0;
        const rawCbm     = cCbm  >= 0 ? toNum(row[cCbm]) : 0;
        const weight     = rawKg  > 0 ? String(rawKg)  : '';
        const cbm        = rawCbm > 0 ? String(rawCbm) : '';
        const commission = cComm >= 0 ? toNum(row[cComm]) : 0;

        let hsCode = '', hsConfidence = 'none';
        if (productName && isTariffReady()) {
          const m = autoMatchHsCode(productName);
          hsCode = m.code || ''; hsConfidence = m.confidence;
        }
        newItems.push({ ...blankItem(), productName, quantity: qty, unit, priceUnit: unit, unitPrice, weight, cbm, commission, hsCode, hsConfidence });
      }

      if (newItems.length === 0) {
        setSuccessModal({ show: true, message: "No products found in this PDF. The table layout may not be recognized.", type: "error" });
        return;
      }

      setFormData(prev => {
        const existing = prev.items.filter(it => it.productName || it.productImage || it.weight || it.cbm);
        return { ...prev, items: existing.length > 0 ? [...existing, ...newItems] : newItems };
      });
      setSuccessModal({ show: true, message: `Imported ${newItems.length} product${newItems.length === 1 ? "" : "s"} from PDF`, type: "info" });
    };

    processFile().catch(err => {
      console.error('PDF import failed:', err);
      setSuccessModal({ show: true, message: "PDF import failed. The file may be image-based or corrupted.", type: "error" });
    });
  }, []);

  const removeItem = (index) => {
    setFormData(prev => {
      const items = prev.items.filter((_, i) => i !== index);
      return { ...prev, items };
    });
  };

  const updateItem = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [field]: value };
        // Auto-match HS code when productName changes — but only if the user
        // hasn't manually pinned a code (hsAutoMatched stays true until they
        // override via the drawer's search).
        if (field === "productName" && next.hsAutoMatched !== false) {
          if (!value || !String(value).trim()) {
            next.hsCode = "";
            next.hsConfidence = "none";
          } else if (isTariffReady()) {
            const m = autoMatchHsCode(value);
            next.hsCode = m.code || "";
            next.hsConfidence = m.confidence;
            // Auto-sync invoice line unit to the HS row's unit (kg → KG,
            // L → Litre, no → Unit) so the duty calc uses the right
            // multiplier without the user having to think about it. We
            // only override the default "KG" — if the user has already
            // picked Box / Pallet / Carton intentionally, leave it alone.
            if (m.code) {
              const matchedRow = lookupByCode(m.code);
              const wantInvUnit = invoiceUnitForHsUnit(matchedRow?.unit);
              if (wantInvUnit && (next.unit === "KG" || !next.unit)) {
                next.unit = wantInvUnit;
                next.priceUnit = wantInvUnit;
              }
            }
          }
          // If tariff isn't loaded yet, leave the field empty; the
          // useEffect below will retry once preloadTariff() resolves.
        }
        return next;
      }),
    }));
  };

  const calculateItemTotal = (item) => {
    const baseTotal = item.quantity * item.unitPrice;
    const commissionPercent = item.commission || 0;
    const commissionAmount = baseTotal * (commissionPercent / 100);
    return (baseTotal + commissionAmount).toFixed(2);
  };

  // Check if all items have weight or CBM filled (required for customs/transport)
  const hasRequiredMeasurements = () => {
    return formData.items.every(item => {
      const hasWeight = item.weight && parseFloat(item.weight) > 0;
      const hasCBM = item.cbm && parseFloat(item.cbm) > 0;
      return hasWeight || hasCBM;
    });
  };

  // CIF in NPR for an item. The Nepal customs tariff is denominated in NPR,
  // so any HS-based duty calc must use NPR-denominated CIF regardless of
  // what currency the invoice is being entered in.
  //
  //   CIF (NPR) = quantity × unitPrice (in originalCurrency) → converted to NPR
  //
  // If `unitPrice` is already stored in the invoice's `originalCurrency` (it is
  // — `toStored` round-trips through originalCurrency), we just convert from
  // that currency to NPR using the same exchange-rate table the rest of the
  // invoice uses (localStorage `cellzen_exchange_rates`, falling back to the
  // built-in defaults of 1 USD = 7.24 CNY = 135.50 NPR).
  //
  // We deliberately don't include `convertCurrency` as a useCallback dep:
  // the function is redefined every render so including it would defeat memo,
  // and since it only reads from localStorage (no closure over render-scoped
  // state) the latest closure is always safe.
  const computeItemCifNpr = useCallback((item) => {
    const qty = parseFloat(item?.quantity) || 0;
    const price = parseFloat(item?.unitPrice) || 0;
    if (qty <= 0 || price <= 0) return 0;
    const origCurr = formData.originalCurrency || currency;
    const cifInOrigCurr = qty * price;
    if (origCurr === "NPR") return cifInOrigCurr;
    const npr = convertCurrency(cifInOrigCurr, origCurr, "NPR");
    // Guard against NaN/Infinity in case a currency is missing from the rates
    // table; fall back to no conversion so the user at least sees *something*
    // (better than silently zeroing out their duty).
    return (typeof npr === "number" && Number.isFinite(npr) && npr > 0)
      ? npr
      : cifInOrigCurr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.originalCurrency, currency]);

  // Aggregated HS-derived duty in NPR across all invoice items. The C&T panel
  // uses this to auto-populate the customs duty field. Returns 0 if the tariff
  // bundle hasn't loaded yet or no item has a valid HS code.
  const aggregateHsDutyNpr = useMemo(() => {
    if (!tariffReady) return 0;
    let total = 0;
    for (const item of formData.items) {
      if (!item.hsCode) continue;
      const cifNpr = computeItemCifNpr(item);
      if (cifNpr <= 0) continue;
      const row = lookupByCode(item.hsCode);
      // For specific-duty rows, multiply Rs/unit by the quantity in the row's
      // unit (kg → item.weight, m³ → item.cbm, etc.). For chapter 22 spirits
      // the multiplier is further scaled by ABV% (LP-litre basis). For
      // ad-valorem-only rows the `quantity` arg is unused.
      const unitQty = row && row.specificDutyNpr != null
        ? effectiveDutyMultiplier(item, row)
        : (parseFloat(item.quantity) || 1);
      const calc = calculateImportCost({
        code: item.hsCode,
        cifValue: cifNpr,
        originCountry: item.dutyOrigin || formData.defaultDutyOrigin || "CN",
        quantity: unitQty,
      });
      if (!calc || calc.error) continue;
      // The C&T panel's Customs Duty field shows the FULL Total Duty for the
      // shipment — every charge that the importer pays on top of CIF:
      //   customs (ad-valorem) + specific duty (Rs/unit, ABV-scaled for spirits)
      //   + excise + agri reform fee + advance income tax + VAT.
      // This matches what a Nepal customs declaration totals up.
      const b = calc.breakdown;
      total += (b.customsDuty || 0)
            + (b.specificDutyAmount || 0)
            + (b.exciseAmount || 0)
            + (b.agriFeeAmount || 0)
            + (b.advTaxAmount || 0)
            + (b.vatAmount || 0);
    }
    return total;
  }, [tariffReady, formData.items, formData.defaultDutyOrigin, computeItemCifNpr]);

  // Auto-write the HS-derived total into the Customs Duty field whenever it
  // changes — but only while the user hasn't manually overridden the value
  // (`customsDutyAutoFilled` flips to false the moment they type into the
  // field). Conversion: NPR (basis of the Nepal tariff) → invoice's
  // originalCurrency (the denomination `formData.customsDuty` is stored in).
  // Rounded to 2 decimals so the input doesn't show ugly floats like
  // "298.92666666666669" on a NPR→CNY conversion.
  useEffect(() => {
    if (!tariffReady) return;
    if (!formData.customsDutyAutoFilled) return;
    const origCurr = formData.originalCurrency || currency;
    const aggInOrig = origCurr === "NPR"
      ? aggregateHsDutyNpr
      : convertCurrency(aggregateHsDutyNpr, "NPR", origCurr);
    if (!Number.isFinite(aggInOrig)) return;
    const rounded = Math.round(aggInOrig * 100) / 100;
    const current = parseFloat(formData.customsDuty) || 0;
    // Skip the update if we're already in sync (within half a cent), to avoid
    // a re-render loop. When the aggregate drops to 0 (no HS codes / no CIF),
    // we set the field to "" rather than 0 so the placeholder shows.
    if (rounded <= 0) {
      if (current !== 0 && formData.customsDuty !== "") {
        setFormData((prev) => ({ ...prev, customsDuty: "" }));
      }
      return;
    }
    if (Math.abs(current - rounded) < 0.005) return;
    setFormData((prev) => ({ ...prev, customsDuty: rounded }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariffReady, aggregateHsDutyNpr, formData.originalCurrency, currency, formData.customsDutyAutoFilled]);

  const calculateGrandTotal = () => {
    return formData.items.reduce((sum, item) => {
      const baseTotal = item.quantity * item.unitPrice;
      const commissionPercent = item.commission || 0;
      const commissionAmount = baseTotal * (commissionPercent / 100);
      return sum + baseTotal + commissionAmount;
    }, 0).toFixed(2);
  };

  const calculateGrandTotalDisplay = () => {
    const totalInOriginal = parseFloat(calculateGrandTotal());
    return convertCurrency(totalInOriginal, formData.originalCurrency || currency, currency);
  };

  // Find ALL matching transport rate entries for the current route
  const findMatchingRates = () => {
    const { modeOfDelivery, transportFrom, transportTo, borderCrossing } = formData;
    if (!modeOfDelivery || !transportFrom || !transportTo) return [];

    return transportRates.filter(rate => {
      const modeMatch = rate.mode === modeOfDelivery;
      const fromMatch = rate.from === transportFrom.name;
      const toMatch   = rate.to   === transportTo.name;
      if (modeOfDelivery === "road" && (transportFrom.name === "Nepal" || transportTo.name === "Nepal")) {
        return modeMatch && fromMatch && toMatch && rate.method === borderCrossing;
      }
      return modeMatch && fromMatch && toMatch;
    });
  };

  // Merge kg/CBM/border rates across all matching entries.
  // Scans every entry so separate kg-only or CBM-only saves are combined.
  const resolveRates = (tgt = currency) => {
    const entries = findMatchingRates();
    let kgRate = 0, cbmRate = 0, borderRate = 0;

    for (const r of entries) {
      // New-format field: rateKg
      if (r.rateKg != null && kgRate === 0)
        kgRate = convertRateFromUSD(r.rateKg, tgt);
      // New-format field: rateCBM
      if (r.rateCBM != null && cbmRate === 0)
        cbmRate = convertRateFromUSD(r.rateCBM, tgt);
      // Border leg rate (new or old format)
      if (r.rateBorder != null && borderRate === 0)
        borderRate = convertRateFromUSD(r.rateBorder, tgt);
      // Old-format fallback: single rate + unit
      if (r.unit === "kg"  && r.rate != null && kgRate  === 0)
        kgRate  = convertRateFromUSD(r.rate, tgt);
      if (r.unit === "cbm" && r.rate != null && cbmRate === 0)
        cbmRate = convertRateFromUSD(r.rate, tgt);
    }

    return { kgRate, cbmRate, borderRate };
  };

  // Get matching transport rates for display (in header currency)
  const getTransportRates = () => resolveRates(currency);

  // Get transport rates in original currency
  const getTransportRatesInOriginal = () => resolveRates(formData.originalCurrency || currency);

  // Calculate transportation cost in original currency (for saving)
  const getTransportationCostInOriginal = () => {
    const { modeOfDelivery, transportFrom, transportTo } = formData;
    if (!modeOfDelivery || !transportFrom || !transportTo) return 0;

    const totalWeight = formData.items.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
    const totalCBM    = formData.items.reduce((sum, item) => sum + (parseFloat(item.cbm)    || 0), 0);
    if (totalWeight === 0 && totalCBM === 0) return 0;

    const { kgRate, cbmRate, borderRate } = getTransportRatesInOriginal();

    if (borderRate > 0) {
      // Nepal border crossing — two legs
      // Leg 1 (China → Border): higher of weight×kgRate or CBM×cbmRate
      const kgCost  = kgRate  ? totalWeight * kgRate  : 0;
      const cbmCost = cbmRate ? totalCBM    * cbmRate : 0;
      const leg1 = (kgCost > 0 && cbmCost > 0) ? Math.max(kgCost, cbmCost) : (kgCost || cbmCost);
      // Leg 2 (Border → Nepal / Kerung → Nepal): charged per CBM. When no CBM
      // is provided, convert weight to chargeable CBM (200 kg = 1 CBM) so the
      // leg is still priced off the weight instead of coming out as zero.
      const KG_PER_CBM = 200;
      const leg2CBM = totalCBM > 0 ? totalCBM : totalWeight / KG_PER_CBM;
      const leg2 = leg2CBM * borderRate;
      return leg1 + leg2;
    }

    // Standard single-route: higher of weight×kgRate or CBM×cbmRate
    const kgCost  = kgRate  ? totalWeight * kgRate  : 0;
    const cbmCost = cbmRate ? totalCBM    * cbmRate : 0;
    if (kgCost > 0 && cbmCost > 0) return Math.max(kgCost, cbmCost);
    return kgCost || cbmCost || 0;
  };

  // Transportation cost displayed in header currency (converts from originalCurrency)
  const calculateTransportationCost = () => {
    const origCurr = formData.originalCurrency || currency;
    return convertCurrency(getTransportationCostInOriginal(), origCurr, currency);
  };

  // origCurr = invoice denomination (right-side selector); currency = header display currency
  const origCurr = formData.originalCurrency || currency;
  const toDisplay = (v) => parseFloat(convertCurrency(parseFloat(v) || 0, origCurr, currency).toFixed(2));
  const toStored  = (v) => convertCurrency(parseFloat(v) || 0, currency, origCurr);

  const convertCurrentCurrencyToOriginal = (amount) => {
    const parsedAmount = parseFloat(amount || 0);
    if (!parsedAmount || isNaN(parsedAmount)) return 0;
    return convertCurrency(parsedAmount, currency, formData.originalCurrency || currency);
  };

  // Calculate documentation charges (0.3% of cargo value) in original currency
  const getDocumentationChargeInOriginal = () => {
    const { modeOfDelivery } = formData;
    if (modeOfDelivery !== "road") return 0;

    const itemsTotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    return itemsTotal * 0.003; // 0.3% of cargo value in original currency
  };

  // Documentation charges converted to header currency for display
  const getDocumentationChargeDisplay = () => {
    const origCurr = formData.originalCurrency || currency;
    return convertCurrency(getDocumentationChargeInOriginal(), origCurr, currency);
  };

  const handleNext = () => {
    setCurrentStep(2);
  };

  const handleBack = () => {
    if (currentStep === 3) {
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }
  };

  // Auto-uncheck the customs/transport option if user removes all measurements
  useEffect(() => {
    if (!hasAnyMeasurements() && formData.includeCustomsTransport) {
      setFormData(prev => ({ ...prev, includeCustomsTransport: false }));
    }
  }, [formData.items]);

  // Clear customs/transport only when the user turns the checkbox off (not on initial mount).
  // Otherwise the mount-time "false" state runs in the same effect phase as edit hydration and wipes loaded data.
  const prevIncludeCustomsRef = useRef(null);
  useEffect(() => {
    const wasIncluded = prevIncludeCustomsRef.current;
    const nowIncluded = formData.includeCustomsTransport;
    prevIncludeCustomsRef.current = nowIncluded;

    if (wasIncluded === true && nowIncluded === false) {
      setFormData(prev => ({
        ...prev,
        customsDuty: "",
        documentationCharges: "",
        otherCharges: "",
        transportCost: "",
        transportFrom: null,
        transportTo: null,
        borderCrossing: "",
        shippingCompany: "",
        trackingNumber: "",
        customsNotes: "",
      }));
      setCurrentStep(step => (step === 3 ? 2 : step));
    }
  }, [formData.includeCustomsTransport]);

  const handleCancelClick = () => {
    setShowCancelModal(true);
  };

  const handleSaveDraftAndExit = async () => {
    setLoading(true);
    try {
      const drafts = JSON.parse(localStorage.getItem("invoice_drafts") || "[]");
      // Only include customs/transport data if checkbox is checked
      let finalTransportCost = "";
      let finalDocCharges = "";
      let finalCustomsDuty = "";
      let finalOtherCharges = "";

      if (formData.includeCustomsTransport) {
        const recalcTransport = getTransportationCostInOriginal();
        finalTransportCost = recalcTransport > 0
          ? recalcTransport.toFixed(2)
          : (parseFloat(formData.transportCost || 0) > 0 ? parseFloat(formData.transportCost).toFixed(2) : "");
        const recalcDoc = formData.modeOfDelivery === "road"
          ? getDocumentationChargeInOriginal()
          : convertCurrentCurrencyToOriginal(formData.documentationCharges);
        finalDocCharges = recalcDoc > 0
          ? recalcDoc.toFixed(2)
          : (parseFloat(formData.documentationCharges || 0) > 0 ? parseFloat(formData.documentationCharges).toFixed(2) : "");
        finalCustomsDuty = parseFloat(formData.customsDuty || 0) > 0 ? convertCurrentCurrencyToOriginal(formData.customsDuty).toFixed(2) : "";
        finalOtherCharges = parseFloat(formData.otherCharges || 0) > 0 ? convertCurrentCurrencyToOriginal(formData.otherCharges).toFixed(2) : "";
      }

      const draftData = {
        ...formData,
        customsDuty: finalCustomsDuty,
        otherCharges: finalOtherCharges,
        transportCost: finalTransportCost,
        documentationCharges: finalDocCharges,
        currency,
        status: "Draft",
        draftSavedAt: new Date().toISOString(),
      };

      let savedDraft;
      if (isEditMode && editInvoiceId) {
        // Update the existing draft
        savedDraft = drafts.find(d => (d.invoiceNumber || d.id) === editInvoiceId);
        const updatedDrafts = drafts.map(d =>
          (d.invoiceNumber || d.id) === editInvoiceId
            ? { ...draftData, id: d.id }
            : d
        );
        localStorage.setItem("invoice_drafts", JSON.stringify(updatedDrafts));
        savedDraft = { ...draftData, id: savedDraft?.id };
      } else {
        savedDraft = { id: `draft-${Date.now()}`, ...draftData };
        drafts.push(savedDraft);
        localStorage.setItem("invoice_drafts", JSON.stringify(drafts));
      }

      setShowCancelModal(false);
      setSuccessModal({ show: true, message: "Invoice Draft saved", type: "draft" });
      setLoading(false);

      // Background backend mirror — local save is durable, don't block UI on it.
      syncInvoiceToBackend(savedDraft).catch(err => {
        console.warn("Backend draft sync failed:", err?.message);
      });
      return;
    } catch (error) {
      console.error("Error saving draft:", error);
      setSuccessModal({ show: true, message: "Failed to save draft", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelModal(false);
    navigate("/admin-invoices");
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const drafts = JSON.parse(localStorage.getItem("invoice_drafts") || "[]");

      // Only include customs/transport data if checkbox is checked
      let finalTransportCost = "";
      let finalDocCharges = "";
      let finalCustomsDuty = "";
      let finalOtherCharges = "";

      if (formData.includeCustomsTransport) {
        const recalcTransport = getTransportationCostInOriginal();
        finalTransportCost = recalcTransport > 0
          ? recalcTransport.toFixed(2)
          : (parseFloat(formData.transportCost || 0) > 0 ? parseFloat(formData.transportCost).toFixed(2) : "");
        const recalcDoc = formData.modeOfDelivery === "road"
          ? getDocumentationChargeInOriginal()
          : convertCurrentCurrencyToOriginal(formData.documentationCharges);
        finalDocCharges = recalcDoc > 0
          ? recalcDoc.toFixed(2)
          : (parseFloat(formData.documentationCharges || 0) > 0 ? parseFloat(formData.documentationCharges).toFixed(2) : "");
        finalCustomsDuty = parseFloat(formData.customsDuty || 0) > 0 ? convertCurrentCurrencyToOriginal(formData.customsDuty).toFixed(2) : "";
        finalOtherCharges = parseFloat(formData.otherCharges || 0) > 0 ? convertCurrentCurrencyToOriginal(formData.otherCharges).toFixed(2) : "";
      }

      const draftData = {
        ...formData,
        customsDuty: finalCustomsDuty,
        otherCharges: finalOtherCharges,
        transportCost: finalTransportCost,
        documentationCharges: finalDocCharges,
        currency,
        status: "Draft",
        draftSavedAt: new Date().toISOString(),
      };

      let savedDraft;
      if (isEditMode && editInvoiceId) {
        // Update the existing draft
        const existing = drafts.find(d => (d.invoiceNumber || d.id) === editInvoiceId);
        savedDraft = { ...draftData, id: existing?.id };
        const updatedDrafts = drafts.map(d =>
          (d.invoiceNumber || d.id) === editInvoiceId
            ? savedDraft
            : d
        );
        localStorage.setItem("invoice_drafts", JSON.stringify(updatedDrafts));
        setSuccessModal({ show: true, message: "Invoice Draft Updated", type: "draft" });
      } else {
        // New draft — guard against accidental duplicates
        const alreadyExists = drafts.some(d => d.invoiceNumber === formData.invoiceNumber);
        if (alreadyExists) {
          setSuccessModal({ show: true, message: "Already saved as a draft", type: "exists" });
          return;
        }
        savedDraft = { id: `draft-${Date.now()}`, ...draftData };
        drafts.push(savedDraft);
        localStorage.setItem("invoice_drafts", JSON.stringify(drafts));
        setSuccessModal({ show: true, message: "Invoice Draft saved", type: "draft" });
      }
      setLoading(false);
      // Background backend mirror — UI doesn't wait on the remote DB.
      syncInvoiceToBackend(savedDraft).catch(err => {
        console.warn("Backend draft sync failed:", err?.message);
      });
      return;
    } catch (error) {
      console.error("Error saving draft:", error);
      setSuccessModal({ show: true, message: "Failed to save draft. Please try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Only include customs/transport data if checkbox is checked
      let finalTransportCost = "";
      let finalDocCharges = "";
      let finalCustomsDuty = "";
      let finalOtherCharges = "";

      if (formData.includeCustomsTransport) {
        const recalcTransport = getTransportationCostInOriginal();
        finalTransportCost = recalcTransport > 0
          ? recalcTransport.toFixed(2)
          : (parseFloat(formData.transportCost || 0) > 0 ? parseFloat(formData.transportCost).toFixed(2) : "");
        const recalcDoc = formData.modeOfDelivery === "road"
          ? getDocumentationChargeInOriginal()
          : convertCurrentCurrencyToOriginal(formData.documentationCharges);
        finalDocCharges = recalcDoc > 0
          ? recalcDoc.toFixed(2)
          : (parseFloat(formData.documentationCharges || 0) > 0 ? parseFloat(formData.documentationCharges).toFixed(2) : "");
        finalCustomsDuty = parseFloat(formData.customsDuty || 0) > 0 ? convertCurrentCurrencyToOriginal(formData.customsDuty).toFixed(2) : "";
        finalOtherCharges = parseFloat(formData.otherCharges || 0) > 0 ? convertCurrentCurrencyToOriginal(formData.otherCharges).toFixed(2) : "";
      }

      const finalFormData = {
        ...formData,
        customsDuty: finalCustomsDuty,
        otherCharges: finalOtherCharges,
        transportCost: finalTransportCost,
        documentationCharges: finalDocCharges,
        currency,
      };

      // Get existing drafts
      const drafts = JSON.parse(localStorage.getItem("invoice_drafts") || "[]");

      let savedInvoice;
      let modalMessage;
      let modalType;
      if (isEditMode && editInvoiceId) {
        // Update existing invoice
        const existing = drafts.find(d => (d.invoiceNumber || d.id) === editInvoiceId);
        savedInvoice = {
          ...finalFormData,
          id: existing?.id,
          status: existing?.status || "Updated",
          updatedAt: new Date().toISOString(),
        };
        const updatedDrafts = drafts.map(draft =>
          (draft.invoiceNumber || draft.id) === editInvoiceId ? savedInvoice : draft
        );
        localStorage.setItem("invoice_drafts", JSON.stringify(updatedDrafts));
        modalMessage = "Invoice Updated";
        modalType = "updated";
      } else {
        // Create new invoice
        savedInvoice = {
          id: `draft-${Date.now()}`,
          ...finalFormData,
          status: "Generated",
          generatedAt: new Date().toISOString(),
        };
        drafts.push(savedInvoice);
        localStorage.setItem("invoice_drafts", JSON.stringify(drafts));
        modalMessage = "Invoice Generated";
        modalType = "generated";
      }

      // Pop the success modal NOW — local save is durable and the user
      // shouldn't wait on the remote DB for the UI to respond.
      setSuccessModal({ show: true, message: modalMessage, type: modalType });
      setLoading(false);

      // Run both backend syncs in parallel in the background. Each is
      // independent (different rows touched the same way is fine — last
      // write wins and they carry the same payload). If either fails the
      // local save is still intact and a future save will reconcile.
      Promise.all([
        syncSharedInvoice(savedInvoice).catch(err => {
          console.warn("Shared-invoice sync failed:", err?.message);
        }),
        syncInvoiceToBackend(savedInvoice).catch(err => {
          console.warn("Backend invoice sync failed:", err?.message);
        }),
      ]);
      return;
    } catch (error) {
      console.error("Error creating/updating invoice:", error);
      setSuccessModal({ show: true, message: "Failed to save invoice", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Check if any item has weight or CBM (to enable customs/transport option)
  const hasAnyMeasurements = () => {
    return formData.items.some(item => {
      const hasWeight = item.weight && parseFloat(item.weight) > 0;
      const hasCBM = item.cbm && parseFloat(item.cbm) > 0;
      return hasWeight || hasCBM;
    });
  };

  // ─── Excel-like helpers ────────────────────────────────────────────────────

  const totalKg = useMemo(
    () => formData.items.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0),
    [formData.items],
  );
  const totalCbm = useMemo(
    () => formData.items.reduce((s, it) => s + (parseFloat(it.cbm) || 0), 0),
    [formData.items],
  );

  // Data columns in table order — index maps column position for range selection
  const MERGE_COLS = ['image', 'productName', 'quantity', 'unit', 'unitPrice', 'total', 'commission', 'weight', 'cbm', 'hsCode'];

  // Per-column rowspan: returns 0 if this cell is merged into the one above, otherwise span count.
  // Orphaned cells (mergedInto=true but at row 0) auto-promote to leader.
  const getCellRowspan = useCallback((index, colKey) => {
    const isMerged = formData.items[index]?.mergedInto?.[colKey];
    if (isMerged && index > 0) return 0; // properly merged → don't render
    let span = 1;
    for (let i = index + 1; i < formData.items.length; i++) {
      if (formData.items[i]?.mergedInto?.[colKey]) span++;
      else break;
    }
    return span;
  }, [formData.items]);

  // Column order for Enter-key navigation (left → right, wraps to next row)
  const CELL_COL_ORDER = ['productName', 'quantity', 'unit', 'unitPrice', 'commission', 'weight', 'cbm'];

  const handleCellKeyDown = useCallback((e, rowIndex, colKey) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Enter moves DOWN to the same column in the next row (Excel behaviour)
    const nextRow = rowIndex + 1;
    const nextCol = colKey;
    setFocusedCell({ row: nextRow, col: nextCol });
    setTimeout(() => {
      const el = document.querySelector(`[data-cell="${nextRow}-${nextCol}"]`);
      if (!el) return;
      el.focus();
      try { const len = el.value?.length ?? 0; el.setSelectionRange(len, len); } catch { /* number inputs */ }
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply fill-down when the user releases the mouse after dragging a handle.
  useEffect(() => {
    const onMouseUp = () => {
      if (!fillDrag) return;
      const { colKey, fromIndex, toIndex } = fillDrag;
      if (toIndex > fromIndex) {
        setFormData(prev => {
          const sourceValue = prev.items[fromIndex]?.[colKey];
          return {
            ...prev,
            items: prev.items.map((it, i) =>
              i > fromIndex && i <= toIndex ? { ...it, [colKey]: sourceValue } : it,
            ),
          };
        });
      }
      setFillDrag(null);
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [fillDrag]);

  // ─── Row selection & context menu ─────────────────────────────────────────

  // Saved state at mousedown — used to detect deselect vs drag in click handler
  const selRowsAtMouseDownRef = useRef(new Set());
  const dragOccurredRef = useRef(false);

  // Click on row-number gutter: select/deselect rows; supports Shift and Ctrl/Cmd
  const handleRowHeaderClick = useCallback((e, index) => {
    e.preventDefault();
    e.stopPropagation();
    setFocusedCell(null);
    // If this was actually a drag, selection was already handled by mouseenter
    if (dragOccurredRef.current) {
      dragOccurredRef.current = false;
      return;
    }
    if (e.shiftKey && lastSelRow !== null) {
      const lo = Math.min(lastSelRow, index), hi = Math.max(lastSelRow, index);
      const next = new Set();
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelRows(next);
    } else if (e.ctrlKey || e.metaKey) {
      // Use pre-mousedown state to correctly toggle
      const next = new Set(selRowsAtMouseDownRef.current);
      if (next.has(index)) next.delete(index); else next.add(index);
      setSelRows(next);
      setLastSelRow(index);
    } else {
      // Plain click: if row was already the sole selection → deselect all
      if (selRowsAtMouseDownRef.current.size === 1 && selRowsAtMouseDownRef.current.has(index)) {
        setSelRows(new Set());
        setLastSelRow(null);
      }
      // Otherwise mousedown already selected this row — nothing extra to do
    }
  }, [lastSelRow]);

  // Right-click anywhere in a row → select that row (keep existing multi-selection) + show menu
  const handleRowContextMenu = useCallback((e, index) => {
    e.preventDefault();
    // Build the effective row set: gutter selection, or derive from cell-range, or just the clicked row
    let effectiveRows = new Set(selRows);
    if (effectiveRows.size === 0 && selRange) {
      for (let r = selRange.r1; r <= selRange.r2; r++) effectiveRows.add(r);
    }
    if (!effectiveRows.has(index)) {
      effectiveRows = new Set([index]);
    }
    setSelRows(effectiveRows);
    setLastSelRow(index);
    // Clamp menu so it doesn't overflow viewport
    const x = Math.min(e.clientX, window.innerWidth  - 220);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    setCtxMenu({ x, y });
  }, [selRows, selRange]);

  // Insert blank row above/below the topmost selected row
  const ctxInsertRow = useCallback((direction) => {
    const pivot = direction === 'above'
      ? Math.min(...selRows)
      : Math.max(...selRows) + 1;
    const blank = { productName: '', productImage: '', quantity: 1, unit: 'KG', unitPrice: 0, priceUnit: 'KG', weight: '', cbm: '', commission: 0, hsCode: '', hsAutoMatched: true, hsConfidence: 'none', dutyOrigin: null, alcoholAbv: null, mergedInto: {} };
    setFormData(prev => {
      const items = [...prev.items];
      items.splice(pivot, 0, blank);
      return { ...prev, items };
    });
    setSelRows(new Set([pivot]));
    setCtxMenu(null);
  }, [selRows]);

  // Delete selected rows (keep at least 1)
  const ctxDeleteRows = useCallback(() => {
    setFormData(prev => {
      const items = prev.items.filter((_, i) => !selRows.has(i));
      return { ...prev, items: items.length ? items : [{ productName: '', productImage: '', quantity: 1, unit: 'KG', unitPrice: 0, priceUnit: 'KG', weight: '', cbm: '', commission: 0, hsCode: '', hsAutoMatched: true, hsConfidence: 'none', dutyOrigin: null, alcoholAbv: null, mergedInto: {} }] };
    });
    setSelRows(new Set());
    setCtxMenu(null);
  }, [selRows]);

  // Clear contents of selected rows (keep row structure)
  const ctxClearContents = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((it, i) =>
        selRows.has(i)
          ? { ...it, productName: '', quantity: 1, unitPrice: 0, weight: '', cbm: '', commission: 0 }
          : it,
      ),
    }));
    setCtxMenu(null);
  }, [selRows]);

  // Merge selected cells — works on selRange (specific columns) or full selRows (all columns)
  const ctxMergeRows = useCallback(() => {
    if (selRange && selRange.r1 < selRange.r2) {
      // Cell-range merge: only the selected columns
      const cols = MERGE_COLS.slice(selRange.c1, selRange.c2 + 1);
      setFormData(prev => ({
        ...prev,
        items: prev.items.map((it, i) => {
          if (i <= selRange.r1 || i > selRange.r2) return it;
          const mergedInto = { ...(it.mergedInto || {}) };
          cols.forEach(k => { mergedInto[k] = true; });
          return { ...it, mergedInto };
        }),
      }));
    } else if (selRows.size >= 2) {
      // Full-row merge: all columns
      const sorted = [...selRows].sort((a, b) => a - b);
      setFormData(prev => ({
        ...prev,
        items: prev.items.map((it, i) => {
          if (!selRows.has(i) || i === sorted[0]) return it;
          const mergedInto = Object.fromEntries(MERGE_COLS.map(k => [k, true]));
          return { ...it, mergedInto };
        }),
      }));
    }
    setCtxMenu(null);
  }, [selRows, selRange]);

  // Unmerge selected cells
  const ctxUnmergeRows = useCallback(() => {
    if (selRange) {
      const cols = MERGE_COLS.slice(selRange.c1, selRange.c2 + 1);
      setFormData(prev => ({
        ...prev,
        items: prev.items.map((it, i) => {
          if (i < selRange.r1 || i > selRange.r2) return it;
          const mergedInto = { ...(it.mergedInto || {}) };
          cols.forEach(k => { delete mergedInto[k]; });
          return { ...it, mergedInto };
        }),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map((it, i) => selRows.has(i) ? { ...it, mergedInto: {} } : it),
      }));
    }
    setCtxMenu(null);
  }, [selRows, selRange]);

  // Keyboard shortcuts for row/cell selection
  useEffect(() => {
    const onKey = (e) => {
      if (ctxMenu) { if (e.key === 'Escape') setCtxMenu(null); return; }
      if (selRows.size > 0 && !focusedCell) {
        if (e.key === 'Delete') { e.preventDefault(); ctxDeleteRows(); }          // Delete = remove rows
        if (e.key === 'Backspace') { e.preventDefault(); ctxClearContents(); }    // Backspace = clear contents
        if (e.key === 'Escape') { setSelRows(new Set()); setLastSelRow(null); setSelRange(null); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selRows, focusedCell, ctxMenu, ctxDeleteRows, ctxClearContents]);

  // Global paste — intercepts Ctrl+V anywhere while a row/cell in the table is active.
  // If the clipboard contains an image, pastes it into the focused/selected row's image column.
  useEffect(() => {
    const onPaste = (e) => {
      // Find an image in the clipboard
      let imgFile = null;
      for (const ci of Array.from(e.clipboardData?.items || [])) {
        if (ci.type.startsWith('image/')) { imgFile = ci.getAsFile(); break; }
      }
      if (!imgFile) return; // no image — let normal paste happen

      // Determine target row: focused cell row first, then first gutter-selected row
      let targetRow = focusedCell?.row;
      if (targetRow === undefined || targetRow === null) {
        if (selRows.size > 0) targetRow = Math.min(...selRows);
        else if (selRange) targetRow = selRange.r1;
      }
      if (targetRow === undefined || targetRow === null) return;

      e.preventDefault();
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => {
          if (targetRow >= prev.items.length) return prev;
          return {
            ...prev,
            items: prev.items.map((it, i) =>
              i === targetRow ? { ...it, productImage: reader.result } : it,
            ),
          };
        });
      };
      reader.readAsDataURL(imgFile);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [focusedCell, selRows, selRange]);

  // Click outside context menu → close it
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e) => {
      if (!e.target.closest('[data-ctxmenu]')) setCtxMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  // ── Drag-to-select rows (like Excel) ─────────────────────────────────────
  const rowDragRef = useRef({ active: false, startRow: null });

  // Stop drag on global mouseup
  useEffect(() => {
    const stop = () => {
      rowDragRef.current.active = false;
      cellDragRef.current.active = false;
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // Cell-drag ref — drag on data cells to select a rectangle
  const cellDragRef = useRef({ active: false, startRow: null, startColIdx: null });
  const excelInputRef = useRef(null);
  const pdfInputRef   = useRef(null);

  const handleCellMouseDown = useCallback((e, rowIndex, colIdx) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // don't trigger row drag
    cellDragRef.current = { active: true, startRow: rowIndex, startColIdx: colIdx };
    setSelRange({ r1: rowIndex, c1: colIdx, r2: rowIndex, c2: colIdx });
    setSelRows(new Set()); // clear row-gutter selection
  }, []);

  const handleCellMouseEnter = useCallback((rowIndex, colIdx) => {
    if (!cellDragRef.current.active) return;
    const { startRow, startColIdx } = cellDragRef.current;
    setSelRange({
      r1: Math.min(startRow, rowIndex), c1: Math.min(startColIdx, colIdx),
      r2: Math.max(startRow, rowIndex), c2: Math.max(startColIdx, colIdx),
    });
  }, []);

  const handleRowMouseDown = useCallback((e, index) => {
    if (e.button !== 0) return;
    e.preventDefault();
    selRowsAtMouseDownRef.current = new Set(selRows);
    dragOccurredRef.current = false;
    rowDragRef.current = { active: true, startRow: index };
    setSelRange(null); // clear cell-range selection when selecting rows
    setFocusedCell(null);
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      setSelRows(new Set([index]));
      setLastSelRow(index);
    }
  }, [selRows]);

  const handleRowMouseEnter = useCallback((index) => {
    if (!rowDragRef.current.active) return;
    if (cellDragRef.current.active) return; // cell drag takes priority
    if (index !== rowDragRef.current.startRow) dragOccurredRef.current = true;
    const lo = Math.min(rowDragRef.current.startRow, index);
    const hi = Math.max(rowDragRef.current.startRow, index);
    const next = new Set();
    for (let i = lo; i <= hi; i++) next.add(i);
    setSelRows(next);
    setLastSelRow(index);
  }, []);

  // ── Merge/Unmerge toggle for toolbar ─────────────────────────────────────
  const selRowsSorted = useMemo(() => [...selRows].sort((a, b) => a - b), [selRows]);

  // canMerge: true when a multi-row selection exists (either gutter rows or cell range spanning rows)
  const canMerge = selRows.size >= 2 || (selRange && selRange.r1 < selRange.r2);

  const isAlreadyMerged = useMemo(() => {
    // Check selRange first (cell-range selection)
    if (selRange && selRange.r1 < selRange.r2) {
      const cols = MERGE_COLS.slice(selRange.c1, selRange.c2 + 1);
      for (let i = selRange.r1 + 1; i <= selRange.r2; i++) {
        if (!cols.every(k => formData.items[i]?.mergedInto?.[k])) return false;
      }
      return true;
    }
    // Fallback: check full-row gutter selection
    if (selRows.size >= 2) {
      return selRowsSorted.slice(1).every(i => {
        const it = formData.items[i];
        return MERGE_COLS.every(k => it?.mergedInto?.[k]);
      });
    }
    return false;
  }, [selRange, selRows, selRowsSorted, formData.items]);

  const handleMergeToggle = useCallback(() => {
    if (isAlreadyMerged) ctxUnmergeRows(); else ctxMergeRows();
  }, [isAlreadyMerged, ctxMergeRows, ctxUnmergeRows]);

  // Show Step 3 only when checkbox is checked
  const steps = [
    { number: 1, label: "Information" },
    { number: 2, label: "Invoice Items" },
    ...(formData.includeCustomsTransport ? [{ number: 3, label: "Customs & Transport" }] : []),
  ];

  return (
    <AdminPageShell activePage="Invoices" title="Create Invoice" eyebrow="Create a new invoice for your customer">
      <div className={`rounded-[2rem] border border-[#E1E3EE] bg-white ${currentStep === 2 ? 'py-6 px-0' : 'p-6'}`}>
        {/* Header with Title and Back Button */}
        <div className={`flex items-center justify-between border-b border-[#EAE8E5] pb-4 ${currentStep === 2 ? 'px-6' : ''}`}>
          <h2 className="text-xl font-semibold text-[#412460]">
            {currentStep === 1 ? "Customer Information" : currentStep === 2 ? "Invoice Items" : "Customs Duty and Transportation"}
          </h2>
          <div className="flex items-center gap-2">
            {currentStep === 1 && (
              <button
                type="button"
                onClick={handleCancelClick}
                className="flex items-center gap-2 rounded-full border border-[#E1E3EE] bg-white px-4 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
              >
                Cancel
              </button>
            )}
            {currentStep === 2 && (
              <>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-full border border-[#B99353] bg-white px-4 py-2 text-sm font-semibold text-[#B99353] transition-colors hover:bg-[#B99353] hover:text-white disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-2 rounded-full bg-[#F4F2EF] px-4 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#412460] hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              </>
            )}
            {currentStep === 3 && (
              <>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={loading || !formData.includeCustomsTransport}
                  className="flex items-center gap-2 rounded-full border border-[#B99353] bg-white px-4 py-2 text-sm font-semibold text-[#B99353] transition-colors hover:bg-[#B99353] hover:text-white disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-2 rounded-full bg-[#F4F2EF] px-4 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#412460] hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              </>
            )}
          </div>
        </div>

        {/* Step Progress Indicator with Currency Selector */}
        <div className={`mt-6 flex items-center justify-between gap-4 ${currentStep === 2 ? 'px-6' : ''}`}>
          {/* Left: Step Indicators */}
          <div className="flex items-center gap-4">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.number)}
                  className="flex items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      currentStep >= step.number
                        ? "bg-[#412460] text-white"
                        : "bg-[#EAE8E5] text-[#2D2D2D]/50 hover:bg-[#412460]/20"
                    } ${currentStep === step.number ? "ring-2 ring-[#412460] ring-offset-2" : ""}`}
                  >
                    {step.number}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      currentStep >= step.number ? "text-[#412460]" : "text-[#2D2D2D]/50"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-8 ${
                      currentStep > step.number ? "bg-[#412460]" : "bg-[#EAE8E5]"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Right: Invoice Currency Selector — fixes denomination, no conversion */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#2D2D2D]/60">Invoice Currency:</span>
            <div className="flex rounded-lg border border-[#E1E3EE] bg-white overflow-hidden">
                {CURRENCIES.map((curr) => (
                  <button
                    key={curr.code}
                    type="button"
                    onClick={() => handleCurrencyChange(curr.code)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                      (formData.originalCurrency || currency) === curr.code
                        ? "bg-[#412460] text-white"
                        : "text-[#412460] hover:bg-[#412460]/10"
                    } ${curr.code !== "CNY" ? "border-r border-[#E1E3EE]" : ""}`}
                  >
                    {curr.code === "NPR" && "NPR"}
                    {curr.code === "USD" && "Dollar"}
                    {curr.code === "CNY" && "Yuan"}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Step 1: Information */}
        {currentStep === 1 && (
          <div className="mt-6 space-y-6">
            {/* Row 1: Invoice Number | Invoice Date */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Invoice Number *</label>
                <InvoiceNumberInput
                  value={formData.invoiceNumber}
                  onChange={(newValue) => setFormData(prev => ({ ...prev, invoiceNumber: newValue }))}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Invoice Date *</label>
                <input
                  type="date"
                  required
                  value={formData.invoiceDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, invoiceDate: e.target.value }))}
                  className="w-full rounded-[1rem] border border-[#E1E3EE] px-4 py-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none focus:ring-2 focus:ring-[#412460]/20"
                />
              </div>
            </div>

            {/* Row 2: Customer Name | Customer Email */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={formData.customerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  className="w-full rounded-[1rem] border border-[#E1E3EE] px-4 py-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none focus:ring-2 focus:ring-[#412460]/20"
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Customer Email (Optional)</label>
                <input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                  className="w-full rounded-[1rem] border border-[#E1E3EE] px-4 py-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none focus:ring-2 focus:ring-[#412460]/20"
                  placeholder="customer@example.com"
                />
              </div>
            </div>

            {/* Row 3: Customer Phone Number | Share to (Simple Dropdown) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Customer Phone Number (Optional)</label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerPhone: e.target.value }))}
                  className="w-full rounded-[1rem] border border-[#E1E3EE] px-4 py-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none focus:ring-2 focus:ring-[#412460]/20"
                  placeholder="e.g. +977 98XXXXXXXX"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                  Share To (Optional)
                </label>
                <ShareToDropdown
                  users={allShareableUsers}
                  value={formData.shareTo}
                  onChange={handleShareToChange}
                />
              </div>
            </div>

            {/* Row 4: Mode of Delivery | Export Country */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Mode of Delivery *</label>
                <select
                  required
                  value={formData.modeOfDelivery}
                  onChange={(e) => setFormData(prev => ({ ...prev, modeOfDelivery: e.target.value }))}
                  className="w-full rounded-[1rem] border border-[#E1E3EE] bg-white px-4 py-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none focus:ring-2 focus:ring-[#412460]/20 appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%232D2D2D' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
                >
                  <option value="">Select mode...</option>
                  <option value="road">Road Transport</option>
                  <option value="air">Air Freight</option>
                  <option value="sea">Sea Transport</option>
                  <option value="rail">Rail Transport</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Export Country *</label>
                <CountryButtonSelector
                  value={formData.exportCountry ? countries.find(c => c.name.toLowerCase() === formData.exportCountry.toLowerCase()) : null}
                  onChange={(country) => setFormData(prev => ({ ...prev, exportCountry: country?.name || "" }))}
                  placeholder="Select country..."
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Notes (Optional)</label>
              <textarea
                rows="3"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-[1rem] border border-[#E1E3EE] px-4 py-3 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none focus:ring-2 focus:ring-[#412460]/20"
                placeholder="Additional notes for the customer..."
              />
            </div>

            {/* Navigation Buttons - Bigger */}
            <div className="flex items-center justify-end gap-4 pt-6">
              <button
                type="button"
                onClick={handleCancelClick}
                className="rounded-lg border border-[#E1E3EE] px-6 py-3 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-[#412460] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Invoice Items */}
        {currentStep === 2 && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">

            {/* Invoice Items Table — full-bleed (card has px-0 on step 2) */}
            <div>
              {/* Toolbar: Items label | Merge/Unmerge (center) | + Add Item */}
              <div className="mb-3 grid px-6" style={{ gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
                {/* Left */}
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                  Items{selRows.size > 0 && <span className="ml-2 font-normal normal-case text-[#1d6f42]">({selRows.size} row{selRows.size !== 1 ? 's' : ''} selected)</span>}
                  {selRange && (selRange.r1 !== selRange.r2 || selRange.c1 !== selRange.c2) && <span className="ml-2 font-normal normal-case text-[#1d6f42]">({selRange.r2 - selRange.r1 + 1}×{selRange.c2 - selRange.c1 + 1} selected)</span>}
                </label>

                {/* Center — Merge / Unmerge toggle */}
                <button
                  type="button"
                  onClick={handleMergeToggle}
                  disabled={!canMerge}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 14px',
                    border: `1px solid ${canMerge ? '#1d6f42' : '#d0d0d0'}`,
                    background: isAlreadyMerged ? '#1d6f42' : canMerge ? '#e6f4ea' : '#f7f7f7',
                    color: isAlreadyMerged ? '#fff' : canMerge ? '#1d6f42' : '#aaa',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: canMerge ? 'pointer' : 'not-allowed',
                    borderRadius: 3,
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                  title={!canMerge ? 'Select 2+ rows first, then click Merge' : isAlreadyMerged ? 'Click to unmerge' : 'Click to merge selected cells'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {isAlreadyMerged
                      ? <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="15 8 19 12 15 16"/><polyline points="9 8 5 12 9 16"/></>
                      : <><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></>
                    }
                  </svg>
                  {isAlreadyMerged ? 'Unmerge' : 'Merge'}
                </button>

                {/* Right */}
                <div className="flex items-center justify-end gap-2">
                  {/* Hidden file inputs */}
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={(e) => { importFromExcel(e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => { importFromPDF(e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <button
                    type="button"
                    onClick={() => excelInputRef.current?.click()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px',
                      border: '1px solid #1d6f42',
                      background: '#e6f4ea',
                      color: '#1d6f42',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      borderRadius: 3,
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1d6f42'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#e6f4ea'; e.currentTarget.style.color = '#1d6f42'; }}
                    title="Import items from an Excel or CSV file (.xlsx, .xls, .csv)"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/>
                      <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    Import Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px',
                      border: '1px solid #b91c1c',
                      background: '#fef2f2',
                      color: '#b91c1c',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      borderRadius: 3,
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#b91c1c'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#b91c1c'; }}
                    title="Import items from a PDF invoice (.pdf)"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/>
                      <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    Import PDF
                  </button>
                  <button
                    type="button"
                    onClick={addItem}
                    className="bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
                  >
                    + Add Item
                  </button>
                </div>
              </div>

              {/* ── Excel-style spreadsheet grid ── */}
              <div
                className="overflow-x-auto border-y border-[#c6c6c6]"
                style={{ fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif', userSelect: 'none' }}
                onMouseLeave={() => { if (fillDrag) setFillDrag(prev => prev); }}
                onClick={(e) => { if (e.target === e.currentTarget) setFocusedCell(null); }}
              >
                <table
                  className="border-collapse"
                  style={{ fontSize: 13, tableLayout: 'fixed', width: '100%', minWidth: 1900 }}
                >
                  {/* ── Column header row (Excel: A B C …) ── */}
                  <colgroup>
                    <col style={{ width: 48 }} />  {/* row-number gutter */}
                    <col style={{ width: 100 }} /> {/* Image */}
                    <col />                         {/* Product Name — fills remaining */}
                    <col style={{ width: 100 }} /> {/* QTY */}
                    <col style={{ width: 110 }} /> {/* Unit */}
                    <col style={{ width: 190 }} /> {/* Unit Price */}
                    <col style={{ width: 190 }} /> {/* Total */}
                    <col style={{ width: 110 }} /> {/* Comm % */}
                    <col style={{ width: 150 }} /> {/* KG */}
                    <col style={{ width: 150 }} /> {/* CBM */}
                    <col style={{ width: 130 }} /> {/* HS Code */}
                    <col style={{ width: 48 }} />  {/* delete */}
                  </colgroup>

                  <thead>
                    {/* Row 1 — column letter labels */}
                    <tr style={{ height: 24 }}>
                      {/* Corner */}
                      <td style={{ background: '#f2f2f2', borderRight: '1px solid #c6c6c6', borderBottom: '1px solid #c6c6c6' }} />
                      {['A','B','C','D','E','F','G','H','I','J','K'].map((letter, ci) => {
                        const colKeys = ['','productName','quantity','unit','unitPrice','total','commission','weight','cbm','hsCode',''];
                        const isColActive = focusedCell && colKeys[ci] && focusedCell.col === colKeys[ci];
                        const isColFill   = fillDrag    && colKeys[ci] && fillDrag.colKey === colKeys[ci];
                        return (
                          <td
                            key={letter}
                            className="text-center select-none"
                            style={{
                              background: (isColActive || isColFill) ? '#d6e8d4' : '#f2f2f2',
                              color: (isColActive || isColFill) ? '#1d6f42' : '#444',
                              fontWeight: (isColActive || isColFill) ? 700 : 400,
                              fontSize: 12,
                              borderRight: '1px solid #c6c6c6',
                              borderBottom: '2px solid ' + ((isColActive || isColFill) ? '#1d6f42' : '#c6c6c6'),
                            }}
                          >
                            {letter}
                          </td>
                        );
                      })}
                      <td style={{ background: '#f2f2f2', borderBottom: '1px solid #c6c6c6' }} />
                    </tr>

                    {/* Row 2 — column name labels (bold, gray) */}
                    <tr style={{ height: 28, background: '#f7f7f7' }}>
                      <td style={{ borderRight: '1px solid #d0d0d0', borderBottom: '1px solid #d0d0d0', background: '#f2f2f2' }} />
                      {[
                        'Image',
                        'Product Name',
                        'QTY',
                        'Unit',
                        `Unit Price (${getCurrencySymbolFor(currency).trim()})`,
                        `Total (${getCurrencySymbolFor(currency).trim()})`,
                        'Comm. %',
                        'KG',
                        'CBM',
                        'HS Code',
                        '',
                      ].map((label, ci) => (
                        <td
                          key={ci}
                          className="text-center select-none"
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#444',
                            background: '#f7f7f7',
                            borderRight: '1px solid #d0d0d0',
                            borderBottom: '2px solid #c0c0c0',
                            padding: '0 6px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {label}
                        </td>
                      ))}
                    </tr>
                  </thead>

                  {/* ── Data rows ── */}
                  <tbody>
                    {formData.items.map((item, index) => {
                      // Per-column rowspan: 0 = merged (skip td), >0 = render with rowspan
                      const spans = Object.fromEntries(MERGE_COLS.map(k => [k, getCellRowspan(index, k)]));

                      const isRowActive   = focusedCell?.row === index;
                      const isRowFill     = fillDrag && index >= fillDrag.fromIndex && index <= fillDrag.toIndex;
                      const isRowSel      = selRows.has(index); // row-header gutter selected

                      // Cell is highlighted if inside a multi-cell selRange rectangle (skip single-click flash)
                      const isCellInRange = (colIdx) =>
                        selRange && (selRange.r1 !== selRange.r2 || selRange.c1 !== selRange.c2) &&
                        index >= selRange.r1 && index <= selRange.r2 &&
                        colIdx >= selRange.c1 && colIdx <= selRange.c2;

                      const cellSel = (colKey) => {
                        const active = focusedCell?.row === index && focusedCell?.col === colKey;
                        const inFill = fillDrag?.colKey === colKey && index >= fillDrag.fromIndex && index <= fillDrag.toIndex;
                        return { active, inFill };
                      };

                      const cellStyle = (colKey, extra = {}) => {
                        const colIdx = MERGE_COLS.indexOf(colKey);
                        const { active, inFill } = cellSel(colKey);
                        const inRange = isCellInRange(colIdx);
                        return {
                          position: 'relative',
                          borderRight: '1px solid #d0d0d0',
                          borderBottom: '1px solid #d0d0d0',
                          background: active ? '#fff' : inFill ? '#e6f4ea' : inRange ? '#cce5ff' : isRowSel ? '#e8f0ff' : '#fff',
                          outline: active ? '2px solid #1d6f42' : (inFill || inRange) ? '1px solid #1d6f42' : 'none',
                          outlineOffset: active ? -2 : -1,
                          zIndex: active ? 5 : inFill ? 3 : 'auto',
                          padding: 0,
                          ...extra,
                        };
                      };

                      // Mouse handlers for cell-range selection drag
                      const cellMD = (colIdx) => (e) => handleCellMouseDown(e, index, colIdx);
                      const cellME = (colIdx) => () => handleCellMouseEnter(index, colIdx);

                      // Click a cell → set React focus state AND give the input DOM focus
                      // e is optional — when user clicks directly on the input the browser
                      // already placed the cursor; only override position when clicking the TD padding.
                      const focusAndActivate = (col, e) => {
                        setFocusedCell({ row: index, col });
                        const clickedInput = e && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
                        if (clickedInput) return; // let browser keep cursor where user clicked
                        setTimeout(() => {
                          const el = document.querySelector(`[data-cell="${index}-${col}"]`);
                          if (!el) return;
                          el.focus();
                          // Move cursor to end only when we programmatically focused (TD padding click)
                          try {
                            const len = el.value?.length ?? 0;
                            el.setSelectionRange(len, len);
                          } catch { /* number inputs don't support setSelectionRange */ }
                        }, 0);
                      };

                      // Inline fill handle (only on the focused cell)
                      const fillHandle = (colKey) => {
                        const { active } = cellSel(colKey);
                        if (!active) return null;
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: -4,
                              right: -4,
                              width: 8,
                              height: 8,
                              background: '#1d6f42',
                              border: '1.5px solid #fff',
                              cursor: 'crosshair',
                              zIndex: 20,
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFillDrag({ colKey, fromIndex: index, toIndex: index });
                            }}
                            title="Drag to fill down"
                          />
                        );
                      };

                      // Shared input style — transparent, full-cell
                      const inputStyle = {
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        padding: '4px 8px',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: 15,
                        color: '#1f1f1f',
                        fontFamily: 'inherit',
                        lineHeight: '28px',
                        minHeight: 30,
                        boxSizing: 'border-box',
                      };



                      return (
                        <tr
                          key={index}
                          style={{ height: 34 }}
                          onMouseEnter={() => {
                            if (fillDrag) setFillDrag(prev => prev ? { ...prev, toIndex: Math.max(prev.fromIndex, index) } : null);
                            handleRowMouseEnter(index);
                          }}
                          onContextMenu={(e) => handleRowContextMenu(e, index)}
                          onDragOver={(e) => {
                            if (!e.dataTransfer.types.includes('Files')) return;
                            e.preventDefault();
                            setImgDragOver(index);
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) setImgDragOver(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setImgDragOver(null);
                            const file = e.dataTransfer.files?.[0];
                            if (!file?.type.startsWith('image/')) return;
                            const r = new FileReader();
                            r.onloadend = () => updateItem(index, 'productImage', r.result);
                            r.readAsDataURL(file);
                          }}
                        >
                          {/* Row number gutter — mousedown+drag to select row(s) */}
                          <td
                            className="text-center select-none"
                            style={{
                              fontSize: 11,
                              color: isRowSel ? '#fff' : isRowActive ? '#1d6f42' : '#888',
                              fontWeight: (isRowSel || isRowActive) ? 700 : 400,
                              background: isRowSel ? '#1d6f42' : (isRowActive || isRowFill) ? '#d6e8d4' : '#f2f2f2',
                              borderRight: '2px solid ' + (isRowSel ? '#155a30' : (isRowActive || isRowFill) ? '#1d6f42' : '#c6c6c6'),
                              borderBottom: '1px solid #d0d0d0',
                              cursor: 'row-resize',
                            }}
                            onMouseDown={(e) => handleRowMouseDown(e, index)}
                            onClick={(e) => handleRowHeaderClick(e, index)}
                            title="Click or drag to select rows"
                          >
                            {index + 1}
                          </td>

                          {/* ── A: Image ── */}
                          {spans.image > 0 && (() => {
                            const isDragOver = imgDragOver === index;
                            const applyImg = (file) => {
                              if (!file?.type.startsWith('image/')) return;
                              const r = new FileReader();
                              r.onloadend = () => updateItem(index, 'productImage', r.result);
                              r.readAsDataURL(file);
                            };
                            const dndProps = {
                              onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setImgDragOver(index); },
                              onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setImgDragOver(null); },
                              onDrop: (e) => { e.preventDefault(); e.stopPropagation(); setImgDragOver(null); applyImg(e.dataTransfer.files?.[0]); },
                              onPaste: (e) => {
                                for (const ci of Array.from(e.clipboardData?.items || [])) {
                                  if (ci.type.startsWith('image/')) { applyImg(ci.getAsFile()); e.preventDefault(); break; }
                                }
                              },
                            };
                            return (
                              <td rowSpan={spans.image} onMouseDown={cellMD(0)} onMouseEnter={cellME(0)}
                                style={{ borderRight: '1px solid #d0d0d0', borderBottom: '1px solid #d0d0d0', padding: 4, background: isCellInRange(0) ? '#cce5ff' : '#fff', verticalAlign: 'top' }}>
                                {item.productImage ? (
                                  <div tabIndex={0} {...dndProps}
                                    style={{ position: 'relative', display: 'inline-block', outline: 'none', borderRadius: 2 }}>
                                    <img
                                      src={item.productImage}
                                      alt=""
                                      onClick={() => setPreviewImage(item.productImage)}
                                      style={{ width: 72, height: 72, objectFit: 'cover', cursor: 'pointer', display: 'block', border: isDragOver ? '2px dashed #1d6f42' : '1px solid #d0d0d0', borderRadius: 2 }}
                                    />
                                    {isDragOver && (
                                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(29,111,66,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#1d6f42', fontWeight: 700, borderRadius: 2, pointerEvents: 'none' }}>Replace</div>
                                    )}
                                    <button type="button" onClick={() => updateItem(index, 'productImage', '')}
                                      style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#e05353', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff', cursor: 'pointer' }}>✕</button>
                                  </div>
                                ) : (
                                  <label tabIndex={0} {...dndProps}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, border: isDragOver ? '2px dashed #1d6f42' : '1px dashed #c0c0c0', cursor: 'pointer', background: isDragOver ? '#e6f4ea' : '#fafafa', color: isDragOver ? '#1d6f42' : '#aaa', fontSize: 9, borderRadius: 2, transition: 'all 0.12s', gap: 2 }}>
                                    <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="17 8 12 3 7 8" />
                                      <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                    <span style={{ fontSize: 8 }}>{isDragOver ? 'Drop!' : 'Click / Drop'}</span>
                                    <span style={{ fontSize: 7, opacity: 0.7 }}>{isDragOver ? '' : 'or Paste'}</span>
                                    <input type="file" accept="image/*" style={{ display: 'none' }}
                                      onChange={(e) => applyImg(e.target.files?.[0])} />
                                  </label>
                                )}
                              </td>
                            );
                          })()}

                          {/* ── B: Product Name ── */}
                          {spans.productName > 0 && <td
                            rowSpan={spans.productName}
                            style={cellStyle('productName', { verticalAlign: 'top' })}
                            onMouseDown={cellMD(1)} onMouseEnter={cellME(1)}
                            onClick={(e) => focusAndActivate('productName', e)}
                          >
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                              <input
                                type="text"
                                data-cell={`${index}-productName`}
                                value={item.productName || ""}
                                onChange={(e) => updateItem(index, "productName", e.target.value)}
                                onFocus={() => setFocusedCell({ row: index, col: 'productName' })}
                                onKeyDown={(e) => handleCellKeyDown(e, index, 'productName')}
                                placeholder="Product name…"
                                style={{ ...inputStyle, paddingRight: 22 }}
                              />
                              {/* HS dot */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setHsDrawerIndex(index); }}
                                disabled={!tariffReady}
                                title={item.hsCode ? `HS ${item.hsCode} (${item.hsConfidence})` : "No HS match"}
                                style={{
                                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                                  width: 14, height: 14, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                  background: !tariffReady ? '#ccc' : item.hsConfidence === 'high' ? '#22c55e' : item.hsConfidence === 'medium' ? '#f59e0b' : item.hsConfidence === 'low' ? '#fbbf24' : '#d1d5db',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: '#fff', fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              >HS</button>
                            </div>
                            {fillHandle('productName')}
                          </td>}

                          {/* ── C: QTY ── */}
                          {spans.quantity > 0 && <td rowSpan={spans.quantity} onMouseDown={cellMD(2)} onMouseEnter={cellME(2)} style={cellStyle('quantity', { textAlign: 'center', verticalAlign: 'top' })} onClick={(e) => focusAndActivate('quantity', e)}>
                            <input
                              type="number"
                              min="1"
                              data-cell={`${index}-quantity`}
                              value={item.quantity === 0 ? "" : item.quantity}
                              onChange={(e) => { const v = e.target.value; updateItem(index, "quantity", v === "" ? "" : parseInt(v) || 0); }}
                              onFocus={() => setFocusedCell({ row: index, col: 'quantity' })}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'quantity')}
                              style={{ ...inputStyle, textAlign: 'center' }}
                            />
                            {fillHandle('quantity')}
                          </td>}

                          {/* ── D: Unit ── */}
                          {spans.unit > 0 && <td rowSpan={spans.unit} onMouseDown={cellMD(3)} onMouseEnter={cellME(3)} style={cellStyle('unit', { textAlign: 'center', verticalAlign: 'top' })} onClick={(e) => focusAndActivate('unit', e)}>
                            <select
                              data-cell={`${index}-unit`}
                              value={item.unit}
                              onChange={(e) => { const u = e.target.value; updateItem(index, "unit", u); updateItem(index, "priceUnit", u); }}
                              onFocus={() => setFocusedCell({ row: index, col: 'unit' })}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'unit')}
                              style={{ ...inputStyle, textAlign: 'center', cursor: 'pointer', appearance: 'auto' }}
                            >
                              <option value="KG">KG</option>
                              <option value="Litre">Litre</option>
                              <option value="Unit">Unit</option>
                              <option value="Box">Box</option>
                              <option value="Pallet">Pallet</option>
                              <option value="Carton">Carton</option>
                            </select>
                            {fillHandle('unit')}
                          </td>}

                          {/* ── E: Unit Price ── */}
                          {spans.unitPrice > 0 && <td rowSpan={spans.unitPrice} onMouseDown={cellMD(4)} onMouseEnter={cellME(4)} style={cellStyle('unitPrice', { textAlign: 'right', verticalAlign: 'top' })} onClick={(e) => focusAndActivate('unitPrice', e)}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              data-cell={`${index}-unitPrice`}
                              value={toDisplay(item.unitPrice) || ""}
                              onChange={(e) => updateItem(index, "unitPrice", e.target.value === "" ? 0 : toStored(parseFloat(e.target.value)))}
                              onFocus={() => setFocusedCell({ row: index, col: 'unitPrice' })}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'unitPrice')}
                              style={{ ...inputStyle, textAlign: 'right' }}
                            />
                            {fillHandle('unitPrice')}
                          </td>}

                          {/* ── F: Total (computed) ── */}
                          {spans.total > 0 && <td rowSpan={spans.total} onMouseDown={cellMD(5)} onMouseEnter={cellME(5)} style={{ borderRight: '1px solid #d0d0d0', borderBottom: '1px solid #d0d0d0', textAlign: 'right', padding: '3px 8px', background: isCellInRange(5) ? '#cce5ff' : '#fafafa', color: '#1d6f42', fontWeight: 700, fontSize: 15, verticalAlign: 'top', cursor: 'default' }}>
                            {getCurrencySymbolFor(currency)}{convertCurrency(parseFloat(calculateItemTotal(item)), origCurr, currency).toFixed(2)}
                          </td>}

                          {/* ── G: Commission % ── */}
                          {spans.commission > 0 && <td rowSpan={spans.commission} onMouseDown={cellMD(6)} onMouseEnter={cellME(6)} style={cellStyle('commission', { textAlign: 'center', verticalAlign: 'top' })} onClick={(e) => focusAndActivate('commission', e)}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              data-cell={`${index}-commission`}
                              value={item.commission || ""}
                              onChange={(e) => updateItem(index, "commission", e.target.value === "" ? 0 : parseFloat(e.target.value))}
                              onFocus={() => setFocusedCell({ row: index, col: 'commission' })}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'commission')}
                              placeholder="%"
                              style={{ ...inputStyle, textAlign: 'center' }}
                            />
                            {fillHandle('commission')}
                          </td>}

                          {/* ── H: KG ── */}
                          {spans.weight > 0 && <td rowSpan={spans.weight} onMouseDown={cellMD(7)} onMouseEnter={cellME(7)} style={cellStyle('weight', { textAlign: 'right', verticalAlign: 'top' })} onClick={(e) => focusAndActivate('weight', e)}>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={item.weight}
                              data-cell={`${index}-weight`}
                              onChange={(e) => updateItem(index, "weight", e.target.value)}
                              onFocus={() => setFocusedCell({ row: index, col: 'weight' })}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'weight')}
                              placeholder="0"
                              style={{ ...inputStyle, textAlign: 'right' }}
                            />
                            {fillHandle('weight')}
                          </td>}

                          {/* ── I: CBM ── */}
                          {spans.cbm > 0 && <td rowSpan={spans.cbm} onMouseDown={cellMD(8)} onMouseEnter={cellME(8)} style={cellStyle('cbm', { textAlign: 'right', verticalAlign: 'top' })} onClick={(e) => focusAndActivate('cbm', e)}>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              data-cell={`${index}-cbm`}
                              value={item.cbm}
                              onChange={(e) => updateItem(index, "cbm", e.target.value)}
                              onFocus={() => setFocusedCell({ row: index, col: 'cbm' })}
                              onKeyDown={(e) => handleCellKeyDown(e, index, 'cbm')}
                              placeholder="0"
                              style={{ ...inputStyle, textAlign: 'right' }}
                            />
                            {fillHandle('cbm')}
                          </td>}

                          {/* ── J: HS Code ── */}
                          {spans.hsCode > 0 && <td
                            rowSpan={spans.hsCode}
                            onMouseDown={cellMD(9)} onMouseEnter={cellME(9)}
                            onClick={() => setHsDrawerIndex(index)}
                            title={item.hsCode ? `HS ${item.hsCode} · ${item.hsConfidence} confidence — click to edit` : 'Click to assign HS code'}
                            style={{ ...cellStyle('hsCode', { padding: '0 8px', verticalAlign: 'middle', cursor: 'pointer' }), background: isCellInRange(9) ? '#cce5ff' : '#fafffe' }}
                          >
                            {item.hsCode ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{
                                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                  background: item.hsConfidence === 'high' ? '#22c55e' : item.hsConfidence === 'medium' ? '#f59e0b' : item.hsConfidence === 'low' ? '#fbbf24' : '#d1d5db',
                                }} />
                                <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#1f1f1f', letterSpacing: '0.03em' }}>{item.hsCode}</span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#bbb', fontStyle: 'italic' }}>—</span>
                            )}
                          </td>}

                          {/* ── Delete ── */}
                          <td style={{ borderRight: '1px solid #d0d0d0', borderBottom: '1px solid #d0d0d0', textAlign: 'center', background: '#fafafa' }}>
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                style={{ width: 20, height: 20, borderRadius: '50%', background: '#ffecec', color: '#e05353', border: 'none', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                title="Delete row"
                              >✕</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* ── Total footer row ── */}
                  <tfoot>
                    <tr style={{ height: 32, background: '#f2f2f2' }}>
                      <td style={{ borderTop: '2px solid #1d6f42', borderRight: '2px solid #c6c6c6', background: '#f2f2f2' }} />
                      <td colSpan={7} style={{ borderTop: '2px solid #1d6f42', borderRight: '1px solid #d0d0d0', textAlign: 'right', padding: '0 10px', fontSize: 12, fontWeight: 700, color: '#444', letterSpacing: '0.05em' }}>
                        TOTAL
                      </td>
                      <td style={{ borderTop: '2px solid #1d6f42', borderRight: '1px solid #d0d0d0', textAlign: 'right', padding: '0 10px', fontWeight: 700, color: '#1d6f42', fontSize: 14 }}>
                        {totalKg > 0 ? `${Number.isInteger(totalKg) ? totalKg : totalKg.toFixed(3)} kg` : '—'}
                      </td>
                      <td style={{ borderTop: '2px solid #1d6f42', borderRight: '1px solid #d0d0d0', textAlign: 'right', padding: '0 10px', fontWeight: 700, color: '#1d6f42', fontSize: 14 }}>
                        {totalCbm > 0 ? `${Number.isInteger(totalCbm) ? totalCbm : totalCbm.toFixed(3)} m³` : '—'}
                      </td>
                      <td style={{ borderTop: '2px solid #1d6f42', borderRight: '1px solid #d0d0d0', background: '#f2f2f2' }} />
                      <td style={{ borderTop: '2px solid #1d6f42', background: '#f2f2f2' }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Grand Total Display */}
            <div className="flex items-center justify-end gap-4 border-t border-[#EAE8E5] px-6 pt-4">
              <span className="text-sm text-[#2D2D2D]/60">Grand Total:</span>
              <span className="text-3xl font-bold text-[#412460]">{getCurrencySymbolFor(currency)}{calculateGrandTotalDisplay().toFixed(2)}</span>
            </div>

            {/* Submit Buttons with Checkbox on Left */}
            <div className="flex items-center justify-between px-6 pt-4">
              {/* Left Side: Checkbox */}
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${hasAnyMeasurements() ? 'border-[#412460]/30 bg-[#FDFCFB]' : 'border-[#E1E3EE] bg-[#F7F6F2]'}`}>
                  <input
                    type="checkbox"
                    id="includeCustomsTransport"
                    checked={formData.includeCustomsTransport}
                    onChange={(e) => setFormData(prev => ({ ...prev, includeCustomsTransport: e.target.checked }))}
                    disabled={!hasAnyMeasurements()}
                    className="h-5 w-5 cursor-pointer accent-[#412460] disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <label
                    htmlFor="includeCustomsTransport"
                    className={`text-sm font-medium whitespace-nowrap ${hasAnyMeasurements() ? 'cursor-pointer text-[#412460]' : 'cursor-not-allowed text-[#2D2D2D]/40'}`}
                  >
                    Add Transportation and Customs
                  </label>
                </div>
                {!hasAnyMeasurements() && (
                  <span className="text-xs text-[#E05353]">
                    * Enter Weight or CBM to enable
                  </span>
                )}
              </div>

              {/* Right Side: Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancelClick}
                  className="rounded-lg border border-[#E1E3EE] px-6 py-3 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
                >
                  Cancel
                </button>
                {formData.includeCustomsTransport ? (
                  // Show Next button if checkbox is checked
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="rounded-lg bg-[#412460] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353]"
                  >
                    Next
                  </button>
                ) : (
                  // Show Generate Invoice button if checkbox is not checked
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-[#412460] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-50"
                  >
                    {loading ? "Generating..." : "Generate Invoice"}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        {/* Step 3: Customs Duty and Transportation */}
        {currentStep === 3 && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            {/* Warning if customs/transport is disabled */}
            {!formData.includeCustomsTransport && (
              <div className="rounded-lg border border-[#E05353]/30 bg-[#FFECEC] p-4">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-[#E05353]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm font-medium text-[#E05353]">
                    Customs & Transport is disabled. Go back to Step 2 and check "Add Transportation and Customs" to enable.
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="ml-auto rounded-lg bg-[#E05353] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#C04444]"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            )}
            {/* Customs, Documentation, Other Charges, and Freight Cost */}
            {(() => {
              const origCurr = formData.originalCurrency || currency;
              const sym = getCurrencySymbolFor(currency);
              // Helper: stored value (in origCurr) → display value (in currency)
              const toDisplay = (v) => parseFloat(convertCurrency(parseFloat(v) || 0, origCurr, currency).toFixed(2));
              // Helper: entered value (in currency) → stored value (in origCurr)
              const toStored  = (v) => convertCurrency(parseFloat(v) || 0, currency, origCurr);

              return (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Customs Duty — auto-filled from HS-code calculations.
                      Value flows: aggregateHsDutyNpr (NPR) → originalCurrency
                      (stored, rounded to 2 decimals) → display currency (shown).
                      Manual edits flip `customsDutyAutoFilled` to false so the
                      auto-update effect leaves the user's value alone. */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                      Customs Duty ({sym.trim()})
                    </label>
                    <div className={`flex items-center rounded-[1rem] border bg-white px-4 py-3 ${
                      formData.customsDutyAutoFilled && aggregateHsDutyNpr > 0
                        ? "border-green-300"
                        : "border-[#E1E3EE]"
                    }`}>
                      <span className="select-none text-sm font-semibold text-[#412460]">{sym}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={toDisplay(formData.customsDuty) || ""}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          customsDuty: e.target.value === "" ? "" : toStored(e.target.value),
                          customsDutyAutoFilled: false, // user took manual control
                        }))}
                        className="flex-1 bg-transparent text-sm text-[#2D2D2D] focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>

                    {/* Status subline:
                        - autoFilled + aggregate>0 → green "auto-filled from HS codes" + breakdown link
                        - manual override + aggregate>0 → "Manual override" + reset-to-auto link + breakdown
                        - aggregate=0 (no HS data yet) → just the breakdown link if anything to show */}
                    {tariffReady && aggregateHsDutyNpr > 0 ? (
                      <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px]">
                        {formData.customsDutyAutoFilled ? (
                          <span className="text-green-700">
                            ✓ Auto-filled — <strong>total duty</strong> (customs + specific + excise + agri + adv. tax + VAT)
                          </span>
                        ) : (() => {
                          // Show what the auto value WOULD be so user can see the diff
                          const aggInOrig = origCurr === "NPR"
                            ? aggregateHsDutyNpr
                            : convertCurrency(aggregateHsDutyNpr, "NPR", origCurr);
                          const safeAgg = Number.isFinite(aggInOrig) && aggInOrig > 0 ? aggInOrig : 0;
                          const aggDisplay = toDisplay(safeAgg);
                          return (
                            <span className="text-[#2D2D2D]/60">
                              <span className="text-amber-700">Manual override.</span>{" "}
                              HS total duty: <span className="font-mono font-semibold text-[#412460]">{sym}{aggDisplay.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>{" "}
                              <button
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, customsDutyAutoFilled: true }))}
                                className="font-semibold text-[#412460] hover:underline"
                              >
                                reset to auto
                              </button>
                            </span>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => setHsModalOpen(true)}
                          className="font-semibold text-[#412460] hover:underline whitespace-nowrap"
                        >
                          View breakdown →
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Documentation Charges */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                      Documentation Charges ({sym.trim()}) {formData.modeOfDelivery === "road" && "(Auto)"}
                    </label>
                    <div className="flex items-center rounded-[1rem] border border-[#E1E3EE] bg-white px-4 py-3">
                      <span className="select-none text-sm font-semibold text-[#412460]">{sym}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.modeOfDelivery === "road"
                          ? getDocumentationChargeDisplay().toFixed(2)
                          : (toDisplay(formData.documentationCharges) || "")}
                        readOnly={formData.modeOfDelivery === "road"}
                        onChange={(e) => formData.modeOfDelivery !== "road" && setFormData(prev => ({ ...prev, documentationCharges: e.target.value === "" ? "" : toStored(e.target.value) }))}
                        className="flex-1 bg-transparent text-sm text-[#2D2D2D] focus:outline-none"
                        placeholder={formData.modeOfDelivery === "road" ? "Auto-calculated" : "0.00"}
                      />
                    </div>
                    {formData.modeOfDelivery === "road" && (
                      <p className="mt-1 text-xs text-[#2D2D2D]/50">Auto-calculated: 0.3% of cargo value</p>
                    )}
                  </div>

                  {/* Other Charges */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                      Other Charges ({sym.trim()})
                    </label>
                    <div className="flex items-center rounded-[1rem] border border-[#E1E3EE] bg-white px-4 py-3">
                      <span className="select-none text-sm font-semibold text-[#412460]">{sym}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={toDisplay(formData.otherCharges) || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, otherCharges: e.target.value === "" ? "" : toStored(e.target.value) }))}
                        className="flex-1 bg-transparent text-sm text-[#2D2D2D] focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Freight Cost (read-only, auto-calculated) */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                      Freight Cost ({sym.trim()})
                    </label>
                    <div className="flex items-center rounded-[1rem] border border-[#E1E3EE] bg-white px-4 py-3">
                      <span className="select-none text-sm font-semibold text-[#412460]">{sym}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={calculateTransportationCost().toFixed(2)}
                        readOnly
                        className="flex-1 bg-transparent text-sm text-[#2D2D2D] focus:outline-none"
                        placeholder="Auto-calculated from rates"
                      />
                    </div>
                    {(() => {
                      const { kgRate, cbmRate, borderRate } = getTransportRates();
                      const borderLabels = { kerung: "Kerung", tatopani: "Tatopani", korola: "Korola" };
                      const borderLabel = borderLabels[formData.borderCrossing] || formData.borderCrossing || "Border";
                      const totalWeight = formData.items.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0);
                      const totalCBM    = formData.items.reduce((s, i) => s + (parseFloat(i.cbm)    || 0), 0);
                      const kgCost  = kgRate  * totalWeight;
                      const cbmCost = cbmRate * totalCBM;
                      const kgApplied  = kgRate  > 0 && (cbmRate === 0 || kgCost  >= cbmCost);
                      const cbmApplied = cbmRate > 0 && (kgRate  === 0 || cbmCost >  kgCost);

                      if (borderRate > 0) {
                        return (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-[#2D2D2D]/50">
                              China → {borderLabel}:{" "}
                              <span className={kgApplied ? "font-bold text-[#412460]" : ""}>
                                {kgRate > 0 ? `${sym}${kgRate.toFixed(2)}/kg` : "—"}
                              </span>
                              {" "}|{" "}
                              <span className={cbmApplied ? "font-bold text-[#412460]" : ""}>
                                {cbmRate > 0 ? `${sym}${cbmRate.toFixed(2)}/CBM` : "—"}
                              </span>
                            </p>
                            <p className="text-xs text-[#2D2D2D]/50">
                              {borderLabel} → Nepal: {sym}{borderRate.toFixed(2)}/CBM
                            </p>
                          </div>
                        );
                      } else if (kgRate > 0 && cbmRate > 0) {
                        return <p className="mt-1 text-xs text-[#2D2D2D]/50">KG: {sym}{kgRate.toFixed(2)}/kg | CBM: {sym}{cbmRate.toFixed(2)}/cbm | <span className="font-semibold text-[#412460]">Higher applied</span></p>;
                      } else if (kgRate > 0) {
                        return <p className="mt-1 text-xs text-[#2D2D2D]/50">KG rate: {sym}{kgRate.toFixed(2)}/kg</p>;
                      } else if (cbmRate > 0) {
                        return <p className="mt-1 text-xs text-[#2D2D2D]/50">CBM rate: {sym}{cbmRate.toFixed(2)}/cbm</p>;
                      }
                      return <p className="mt-1 text-xs text-[#E05353]">No matching transport rates found.</p>;
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* Transportation Section - All fields in single line */}
            <div className="rounded-xl border border-[#E1E3EE] bg-[#FDFCFB] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#412460]">Transportation</h3>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-xs text-[#2D2D2D]/50">Total Weight</span>
                    <p className="text-sm font-bold text-[#412460]">
                      {formData.items.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0).toFixed(2)} KG
                    </p>
                  </div>
                  <div className="h-8 w-px bg-[#E1E3EE]" />
                  <div className="text-right">
                    <span className="text-xs text-[#2D2D2D]/50">Total CBM</span>
                    <p className="text-sm font-bold text-[#412460]">
                      {formData.items.reduce((sum, item) => sum + (parseFloat(item.cbm) || 0), 0).toFixed(2)} CBM
                    </p>
                  </div>
                </div>
              </div>

              {/* Mode, From, To, Border Crossing - Single Line */}
              <div className={`grid gap-3 ${formData.modeOfDelivery === "road" && (formData.transportFrom?.name === "Nepal" || formData.transportTo?.name === "Nepal") ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                {/* Mode of Transport */}
                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D]/70 mb-1">Mode of transportation</label>
                  <select
                    value={formData.modeOfDelivery || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, modeOfDelivery: e.target.value }))}
                    className="w-full p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm focus:outline-none focus:border-[#412460] focus:ring-1 focus:ring-[#412460] appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%232D2D2D' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
                  >
                    <option value="">Select mode...</option>
                    <option value="road">Road Transport</option>
                    <option value="air">Air Freight</option>
                    <option value="sea">Sea Transport</option>
                    <option value="rail">Rail Transport</option>
                  </select>
                </div>

                {/* From Country */}
                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D]/70 mb-1">From:</label>
                  <CountryButtonSelector
                    value={formData.transportFrom}
                    onChange={(country) => setFormData(prev => ({ ...prev, transportFrom: country }))}
                    placeholder="Select country..."
                  />
                </div>

                {/* To Country */}
                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D]/70 mb-1">To:</label>
                  <CountryButtonSelector
                    value={formData.transportTo}
                    onChange={(country) => setFormData(prev => ({ ...prev, transportTo: country }))}
                    placeholder="Select country..."
                  />
                </div>

                {/* Border Crossing - Only show for Road Transport to/from Nepal */}
                {formData.modeOfDelivery === "road" &&
                  (formData.transportFrom?.name === "Nepal" || formData.transportTo?.name === "Nepal") && (
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D]/70 mb-1">Border Crossing</label>
                    <select
                      value={formData.borderCrossing || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, borderCrossing: e.target.value }))}
                      className="w-full p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm focus:outline-none focus:border-[#412460] focus:ring-1 focus:ring-[#412460] appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%232D2D2D' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
                    >
                      <option value="">Select border...</option>
                      <option value="kerung">Kerung</option>
                      <option value="tatopani">Tatopani</option>
                      <option value="korola">Korola</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Rate breakdown — shown when border crossing is selected */}
              {(() => {
                const { kgRate, cbmRate, borderRate } = getTransportRates();
                const borderLabels = { kerung: "Kerung", tatopani: "Tatopani", korola: "Korola" };
                const borderLabel = borderLabels[formData.borderCrossing];
                const sym = getCurrencySymbolFor(currency);
                if (!borderLabel || borderRate <= 0) return null;
                const totalWeight = formData.items.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0);
                const totalCBM    = formData.items.reduce((s, i) => s + (parseFloat(i.cbm)    || 0), 0);
                const kgCost  = kgRate  * totalWeight;
                const cbmCost = cbmRate * totalCBM;
                const kgApplied  = kgRate  > 0 && (cbmRate === 0 || kgCost  >= cbmCost);
                const cbmApplied = cbmRate > 0 && (kgRate  === 0 || cbmCost >  kgCost);
                return (
                  <div className="mt-3 rounded-xl border border-[#E1E3EE] bg-[#F9F8F6] px-4 py-3">
                    <p className="text-xs font-semibold text-[#412460] mb-2">Applied Rates</p>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs text-[#2D2D2D]/70">
                        <span>China → {borderLabel}</span>
                        <span className="flex gap-3">
                          <span className={kgApplied ? "font-bold text-[#412460]" : "text-[#2D2D2D]"}>
                            {kgRate > 0 ? `${sym}${kgRate.toFixed(2)} / kg` : <span className="text-[#2D2D2D]/30">— / kg</span>}
                          </span>
                          <span className="text-[#2D2D2D]/30">|</span>
                          <span className={cbmApplied ? "font-bold text-[#412460]" : "text-[#2D2D2D]"}>
                            {cbmRate > 0 ? `${sym}${cbmRate.toFixed(2)} / CBM` : <span className="text-[#2D2D2D]/30">— / CBM</span>}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#2D2D2D]/70">
                        <span>{borderLabel} → Nepal</span>
                        <span className="font-medium text-[#2D2D2D]">{sym}{borderRate.toFixed(2)} / CBM</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>


            {/* Total with Customs - only shown when enabled */}
            {formData.includeCustomsTransport && (() => {
              const origCurr = formData.originalCurrency || currency;
              const sym = getCurrencySymbolFor(currency);
              // All values displayed in header currency
              const invoiceTotal  = convertCurrency(parseFloat(calculateGrandTotal()), origCurr, currency);
              const customsDuty   = convertCurrency(parseFloat(formData.customsDuty   || 0), origCurr, currency);
              const otherCharges  = convertCurrency(parseFloat(formData.otherCharges  || 0), origCurr, currency);
              const docCharges    = formData.modeOfDelivery === "road"
                ? getDocumentationChargeDisplay()
                : convertCurrency(parseFloat(formData.documentationCharges || 0), origCurr, currency);
              const transportCost = calculateTransportationCost();
              const grandTotal    = invoiceTotal + customsDuty + docCharges + otherCharges + transportCost;
              const hasAdditionalCharges = customsDuty > 0 || docCharges > 0 || otherCharges > 0 || transportCost > 0;

              return (
                <div className="flex items-center justify-end gap-4 border-t border-[#EAE8E5] pt-4">
                  <div className="text-right">
                    <p className="text-xs text-[#2D2D2D]/50">Invoice Total</p>
                    <p className="text-lg font-bold text-[#2A1740]">
                      {sym}{invoiceTotal.toFixed(2)}
                    </p>
                  </div>
                  <div className="h-8 w-px bg-[#EAE8E5]" />
                  <div className="text-right">
                    <p className="text-xs text-[#2D2D2D]/50">Grand Total (with Customs, Docs, Other &amp; Freight)</p>
                    <p className="text-3xl font-bold text-[#412460]">
                      {hasAdditionalCharges ? sym + grandTotal.toFixed(2) : "---"}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={handleCancelClick}
                className="rounded-lg border border-[#E1E3EE] px-6 py-3 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.includeCustomsTransport}
                className="rounded-lg bg-[#412460] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-50"
              >
                {loading ? (isEditMode ? "Updating..." : "Generating...") : (isEditMode ? "Update Invoice" : "Generate Invoice")}
              </button>
            </div>
          </form>
        )}

        {/* Image Preview Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <img
                src={previewImage}
                alt="Product Preview"
                className="max-w-full max-h-[85vh] rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute -top-4 -right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2D2D2D] shadow-lg hover:bg-[#FFECEC] hover:text-[#E05353] transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-[2rem] border border-[#E1E3EE] bg-white p-6 shadow-2xl">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFECEC] text-[#E05353]">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[#2D2D2D]">Cancel Invoice?</h3>
                <p className="mb-6 text-sm text-[#2D2D2D]/60">
                  Do you want to cancel this invoice? You can save it as a draft to edit later.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(false)}
                    className="flex-1 rounded-lg border border-[#E1E3EE] px-4 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#F4F2EF]"
                  >
                    No, Continue
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraftAndExit}
                    disabled={loading}
                    className="flex-1 rounded-lg border border-[#B99353] bg-white px-4 py-2 text-sm font-semibold text-[#B99353] transition-colors hover:bg-[#B99353] hover:text-white disabled:opacity-50"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    className="flex-1 rounded-lg bg-[#E05353] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#C04444]"
                  >
                    Yes, Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {successModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-[2rem] border border-[#E1E3EE] bg-white p-6 shadow-2xl">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E9F8ED] text-[#1C9B55]">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3 className="mb-2 text-xl font-semibold text-[#412460]">{successModal.message}</h3>
                <p className="mb-6 text-sm text-[#2D2D2D]/60">
                  {successModal.type === "draft" && "Your invoice has been saved as a draft."}
                  {successModal.type === "generated" && "Your invoice has been generated successfully."}
                  {successModal.type === "updated" && "Your invoice has been updated successfully."}
                  {successModal.type === "exists" && "This invoice is already saved as a draft."}
                  {successModal.type === "error" && "Please try again."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const wasType = successModal.type;
                    setSuccessModal({ show: false, message: "", type: "" });
                    if (wasType !== "error" && wasType !== "info") {
                      navigate("/admin-invoices");
                    }
                  }}
                  className="w-full rounded-lg bg-[#2A1740] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#412460]"
                >
                  Okay
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HS code side drawer — opens when the row's confidence dot is clicked */}
      <HsCodeDrawer
        open={hsDrawerIndex != null}
        item={hsDrawerIndex != null ? formData.items[hsDrawerIndex] : null}
        itemIndex={hsDrawerIndex ?? 0}
        itemCount={formData.items.length}
        cifNpr={hsDrawerIndex != null ? computeItemCifNpr(formData.items[hsDrawerIndex]) : 0}
        invoiceCurrency={formData.originalCurrency || currency}
        cifInInvoiceCurrency={
          hsDrawerIndex != null
            ? (parseFloat(formData.items[hsDrawerIndex].quantity) || 0)
              * (parseFloat(formData.items[hsDrawerIndex].unitPrice) || 0)
            : 0
        }
        defaultOrigin={formData.defaultDutyOrigin}
        tariffReady={tariffReady}
        onChangeHs={(code, manual) => {
          if (hsDrawerIndex == null) return;
          const idx = hsDrawerIndex;
          // When the HS code changes (auto or manual), also sync the invoice
          // unit to the HS row's unit so the duty calc uses the right
          // multiplier — but only when the user hasn't picked Box/Pallet/
          // Carton (then leave their packaging choice alone).
          const matched = code ? lookupByCode(code) : null;
          const wantInv = invoiceUnitForHsUnit(matched?.unit);
          setFormData(prev => ({
            ...prev,
            items: prev.items.map((it, i) => {
              if (i !== idx) return it;
              const next = { ...it, hsCode: code, hsAutoMatched: !manual, hsConfidence: manual ? "high" : it.hsConfidence };
              if (wantInv && (it.unit === "KG" || !it.unit || it.unit === "Litre" || it.unit === "Unit")) {
                next.unit = wantInv;
                next.priceUnit = wantInv;
              }
              return next;
            }),
          }));
        }}
        onChangeOrigin={(originCode) => {
          if (hsDrawerIndex == null) return;
          const idx = hsDrawerIndex;
          setFormData(prev => ({
            ...prev,
            items: prev.items.map((it, i) => i === idx ? { ...it, dutyOrigin: originCode } : it),
          }));
        }}
        onChangeAbv={(abvValue) => {
          if (hsDrawerIndex == null) return;
          const idx = hsDrawerIndex;
          setFormData(prev => ({
            ...prev,
            items: prev.items.map((it, i) => i === idx ? { ...it, alcoholAbv: abvValue } : it),
          }));
        }}
        onClose={() => setHsDrawerIndex(null)}
        onPrev={() => setHsDrawerIndex((i) => Math.max(0, (i ?? 0) - 1))}
        onNext={() => setHsDrawerIndex((i) => Math.min(formData.items.length - 1, (i ?? 0) + 1))}
      />

      {/* HS per-item breakdown modal — opened from the C&T panel */}
      <HsBreakdownModal
        open={hsModalOpen}
        items={formData.items}
        defaultOrigin={formData.defaultDutyOrigin}
        computeCifNpr={computeItemCifNpr}
        onClose={() => setHsModalOpen(false)}
        onOpenItem={(idx) => setHsDrawerIndex(idx)}
      />

      {/* ── Excel right-click context menu ── */}
      {ctxMenu && (() => {
        const rowCount = selRows.size;
        const plural = rowCount !== 1 ? 's' : '';
        const canMergeCtx = rowCount >= 2 || (selRange && selRange.r1 < selRange.r2);

        const menuBtn = (label, icon, action, color, hint) => (
          <button key={label} type="button"
            onClick={action}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '6px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: color || '#1f1f1f' }}
            onMouseEnter={e => e.currentTarget.style.background = '#e8f0fd'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {hint && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>{hint}</span>}
          </button>
        );

        return (
          <div
            data-ctxmenu
            style={{
              position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 99999,
              background: '#fff', border: '1px solid #c0c0c0',
              boxShadow: '4px 4px 14px rgba(0,0,0,0.20)',
              minWidth: 220, fontFamily: 'Segoe UI, Calibri, Arial, sans-serif',
              fontSize: 13, borderRadius: 3, paddingTop: 4, paddingBottom: 4,
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Header */}
            <div style={{ padding: '4px 14px 6px', fontSize: 11, color: '#888', borderBottom: '1px solid #e8e8e8', marginBottom: 2 }}>
              {rowCount} row{plural} selected
            </div>

            {menuBtn('Insert Row Above',    '↑', () => ctxInsertRow('above'), null)}
            {menuBtn('Insert Row Below',    '↓', () => ctxInsertRow('below'), null)}

            <div style={{ borderTop: '1px solid #e8e8e8', margin: '3px 0' }} />

            {menuBtn(`Delete Row${plural}`, '🗑', ctxDeleteRows,   '#c0392b', 'Del')}
            {menuBtn('Clear Contents',      '⌫', ctxClearContents, null,      'Backspace')}

            {canMergeCtx && (
              <>
                <div style={{ borderTop: '1px solid #e8e8e8', margin: '3px 0' }} />
                {menuBtn('Merge Cells',   '⊞', ctxMergeRows,   '#1d6f42')}
                {menuBtn('Unmerge Cells', '⊟', ctxUnmergeRows, '#1d6f42')}
              </>
            )}
          </div>
        );
      })()}
    </AdminPageShell>
  );
}
