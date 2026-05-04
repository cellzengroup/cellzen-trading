import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AdminPageShell from "../AdminPageShell";
import CountrySelector from "../../../../components/ui/CountrySelector";
import { countries } from "../../../../components/countries";
import { useCurrency } from "../../../../contexts/CurrencyContext.jsx";
import { saveInvoice as syncInvoiceToBackend } from "../../../../utils/invoiceSync.js";

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

  // Currency options
  const CURRENCIES = [
    { code: "NPR", symbol: "Rs. ", name: "NPR" },
    { code: "USD", symbol: "$ ", name: "Dollar" },
    { code: "CNY", symbol: "¥ ", name: "RMB" },
  ];

  // Generate invoice number with format CZN-MM-0001 (sequential from 0001)
  const generateInvoiceNumber = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    // Get last sequence from localStorage for this month
    const storageKey = `invoice_seq_${month}`;
    const lastSeq = parseInt(localStorage.getItem(storageKey) || "0");
    const nextSeq = lastSeq + 1;

    // Save the new sequence
    localStorage.setItem(storageKey, nextSeq.toString());

    // Format as 4-digit number starting from 0001
    const sequence = String(nextSeq).padStart(4, "0");
    return `CZN-${month}-${sequence}`;
  };

  // Form State
  const [formData, setFormData] = useState({
    invoiceNumber: generateInvoiceNumber(),
    invoiceDate: new Date().toISOString().split("T")[0],
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    shareTo: "",
    modeOfDelivery: "",
    exportCountry: "",
    items: [{ productName: "", productImage: "", quantity: 1, unit: "KG", unitPrice: 0, priceUnit: "KG", weight: "", cbm: "", commission: 0 }],
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
  });

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
      items: [...prev.items, { productName: "", productImage: "", quantity: 1, unit: "KG", unitPrice: 0, priceUnit: "KG", weight: "", cbm: "", commission: 0 }],
    }));
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item;
        return { ...item, [field]: value };
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
      // Leg 2 (Border → Nepal): always CBM × borderRate
      const leg2 = totalCBM * borderRate;
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

  // Convert amount from one currency to another — returns full precision; callers apply .toFixed(2) for display
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

  // Show Step 3 only when checkbox is checked
  const steps = [
    { number: 1, label: "Information" },
    { number: 2, label: "Invoice Items" },
    ...(formData.includeCustomsTransport ? [{ number: 3, label: "Customs & Transport" }] : []),
  ];

  return (
    <AdminPageShell activePage="Invoices" title="Create Invoice" eyebrow="Create a new invoice for your customer">
      <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
        {/* Header with Title and Back Button */}
        <div className="flex items-center justify-between border-b border-[#EAE8E5] pb-4">
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
        <div className="mt-6 flex items-center justify-between gap-4">
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

            {/* Invoice Items Table */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">Items</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="bg-[#412460] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
                >
                  + Add Item
                </button>
              </div>

              <div className="overflow-x-auto rounded-[1rem] border border-[#E1E3EE]">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-[#F7F6F2] text-[#2D2D2D]/70">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Image</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Product Name</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">QTY</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Unit</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">
                        Unit Price ({getCurrencySymbolFor(currency).trim()}) / {formData.items[0]?.unit || "Unit"}
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">
                        Total Amount ({getCurrencySymbolFor(currency).trim()})
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Comm. %</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">Weight</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]">CBM</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item, index) => (
                      <tr key={index} className="border-t border-[#EAE8E5]">
                        <td className="px-4 py-3">
                          {item.productImage ? (
                            <div className="relative">
                              <img
                                src={item.productImage}
                                alt="Product"
                                onClick={() => setPreviewImage(item.productImage)}
                                className="h-14 w-14 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                title="Click to preview"
                              />
                              <button
                                type="button"
                                onClick={() => updateItem(index, "productImage", "")}
                                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFECEC] text-[#E05353] transition-colors hover:bg-[#E05353] hover:text-white"
                                title="Remove image"
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#E1E3EE] bg-[#F7F6F2] transition-colors hover:border-[#412460] hover:bg-[#412460]/5">
                              <svg className="h-5 w-5 text-[#2D2D2D]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      updateItem(index, "productImage", reader.result);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.productName || ""}
                            onChange={(e) => updateItem(index, "productName", e.target.value)}
                            placeholder="Enter product name"
                            className="w-full min-w-[180px] rounded-lg border border-[#E1E3EE] bg-white px-3 py-2 text-sm focus:border-[#412460] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity === 0 ? "" : item.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateItem(index, "quantity", val === "" ? "" : parseInt(val) || 0);
                            }}
                            className="w-20 rounded-lg border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-center focus:border-[#412460] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={item.unit}
                            onChange={(e) => {
                              const newUnit = e.target.value;
                              updateItem(index, "unit", newUnit);
                              updateItem(index, "priceUnit", newUnit);
                            }}
                            className="w-24 rounded-lg border border-[#E1E3EE] bg-white px-3 py-2 text-sm focus:border-[#412460] focus:outline-none"
                          >
                            <option value="KG">KG</option>
                            <option value="Unit">Unit</option>
                            <option value="Box">Box</option>
                            <option value="Pallet">Pallet</option>
                            <option value="Carton">Carton</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={toDisplay(item.unitPrice) || ""}
                            onChange={(e) => updateItem(index, "unitPrice", e.target.value === "" ? 0 : toStored(parseFloat(e.target.value)))}
                            className="w-28 rounded-lg border border-[#E1E3EE] bg-white px-3 py-2 text-sm focus:border-[#412460] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#412460]">
                          {getCurrencySymbolFor(currency)}{convertCurrency(parseFloat(calculateItemTotal(item)), origCurr, currency).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.commission || ""}
                            onChange={(e) => updateItem(index, "commission", e.target.value === "" ? 0 : parseFloat(e.target.value))}
                            placeholder="%"
                            className="w-20 rounded-lg border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-center focus:border-[#412460] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.weight}
                            onChange={(e) => updateItem(index, "weight", e.target.value)}
                            placeholder="e.g. 10kg"
                            className="w-24 rounded-lg border border-[#E1E3EE] bg-white px-3 py-2 text-sm focus:border-[#412460] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.cbm}
                            onChange={(e) => updateItem(index, "cbm", e.target.value)}
                            placeholder="e.g. 2.5"
                            className="w-24 rounded-lg border border-[#E1E3EE] bg-white px-3 py-2 text-sm focus:border-[#412460] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {formData.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFECEC] text-[#E05353] transition-colors hover:bg-[#E05353] hover:text-white"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Grand Total Display */}
            <div className="flex items-center justify-end gap-4 border-t border-[#EAE8E5] pt-4">
              <span className="text-sm text-[#2D2D2D]/60">Grand Total:</span>
              <span className="text-3xl font-bold text-[#412460]">{getCurrencySymbolFor(currency)}{calculateGrandTotalDisplay().toFixed(2)}</span>
            </div>

            {/* Submit Buttons with Checkbox on Left */}
            <div className="flex items-center justify-between pt-4">
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
                  {/* Customs Duty */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[#2D2D2D]/70">
                      Customs Duty ({sym.trim()})
                    </label>
                    <div className="flex items-center rounded-[1rem] border border-[#E1E3EE] bg-white px-4 py-3">
                      <span className="select-none text-sm font-semibold text-[#412460]">{sym}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={toDisplay(formData.customsDuty) || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, customsDuty: e.target.value === "" ? "" : toStored(e.target.value) }))}
                        className="flex-1 bg-transparent text-sm text-[#2D2D2D] focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
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
                    setSuccessModal({ show: false, message: "", type: "" });
                    if (successModal.type !== "error") {
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
    </AdminPageShell>
  );
}
