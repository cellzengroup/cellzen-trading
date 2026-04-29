import React, { useState, useEffect, useRef } from "react";
import AdminPageShell from "../AdminPageShell";
import { useCurrency } from "../../../../contexts/CurrencyContext.jsx";

const SETTINGS = [
  "Admin profile and access",
  "Notification preferences",
  "Shipment update rules",
  "Security and password policy",
  "Brand and dashboard display",
];

const BUTTONS = [
  { id: "transportal", label: "Transportal Cost management" },
  { id: "exchange", label: "Today's Exchange rate" },
  { id: "hscodes", label: "HS Codes" },
];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon",
  "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia",
  "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti",
  "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macedonia",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "Norway", "Oman", "Pakistan", "Palau",
  "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia",
  "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain",
  "Sri Lanka", "Sudan", "Suriname", "Swaziland", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe"
];

export default function AdminSettings() {
  const [activeModal, setActiveModal] = useState(null);
  const [activeTab, setActiveTab] = useState("add"); // for transport modal tabs
  const { exchangeRates, updateExchangeRates, formatCurrency, currency, currencySymbols, convertToUSD, convertFromUSD } = useCurrency();

  // State for transport form
  const [transportForm, setTransportForm] = useState({
    mode: "",
    method: "",
    from: "",
    to: "",
    rate: "",
    unit: "kg",
  });

  // Country dropdown state
  const [fromDropdownOpen, setFromDropdownOpen] = useState(false);
  const [toDropdownOpen, setToDropdownOpen] = useState(false);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const fromDropdownRef = useRef(null);
  const toDropdownRef = useRef(null);

  // Check if road transport to/from Nepal
  const isRoadToNepal = transportForm.mode === "road" && 
    (transportForm.from === "Nepal" || transportForm.to === "Nepal");

  // State for editing saved transport rates
  const [editingRateId, setEditingRateId] = useState(null);
  const [editRateForm, setEditRateForm] = useState({
    mode: "",
    method: "",
    from: "",
    to: "",
    rate: "",
    unit: "kg",
  });

  // State for delete confirmation modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteRateId, setDeleteRateId] = useState(null);

  const handleEditRate = (rate) => {
    setEditingRateId(rate.id);
    // Convert USD rate to display currency for editing
    const rateInDisplayCurrency = convertFromUSD(rate.rate, currency);
    setEditRateForm({ ...rate, rate: rateInDisplayCurrency });
  };

  const handleUpdateRate = () => {
    // Convert rate to USD before saving
    const rateInUSD = convertToUSD(editRateForm.rate, currency);
    setSavedTransportRates((prev) =>
      prev.map((rate) => (rate.id === editingRateId ? { ...rate, ...editRateForm, rate: rateInUSD } : rate))
    );
    setEditingRateId(null);
    // TODO: Update in database - PUT /api/transport-rates/:id
  };

  const openDeleteModal = (id) => {
    setDeleteRateId(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    setSavedTransportRates((prev) => prev.filter((rate) => rate.id !== deleteRateId));
    setDeleteModalOpen(false);
    setDeleteRateId(null);
    // TODO: Delete from database - DELETE /api/transport-rates/:id
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setDeleteRateId(null);
  };

  const handleCancelEdit = () => {
    setEditingRateId(null);
    setEditRateForm({
      mode: "",
      method: "",
      from: "",
      to: "",
      rate: "",
      unit: "kg",
    });
  };

  // Local state for editing rates (initialized from context)
  const [editRates, setEditRates] = useState({
    cny: exchangeRates.CNY.toString(),
    npr: exchangeRates.NPR.toString(),
  });

  // Saved transport rates - load from localStorage or use defaults
  const [savedTransportRates, setSavedTransportRates] = useState(() => {
    const saved = localStorage.getItem("cellzen_transport_rates");
    return saved ? JSON.parse(saved) : [
      { id: 1, mode: "air", method: "express", from: "China", to: "USA", rate: "5.50", unit: "kg", date: "2026-04-29" },
      { id: 2, mode: "sea", method: "fcl", from: "Shanghai", to: "Los Angeles", rate: "1200", unit: "container", date: "2026-04-28" },
    ];
  });

  // Save transport rates to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("cellzen_transport_rates", JSON.stringify(savedTransportRates));
  }, [savedTransportRates]);

  // Close country dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (fromDropdownRef.current && !fromDropdownRef.current.contains(event.target)) {
        setFromDropdownOpen(false);
      }
      if (toDropdownRef.current && !toDropdownRef.current.contains(event.target)) {
        setToDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openModal = (id) => {
    setActiveModal(id);
    // Reset edit rates when opening modal
    if (id === "exchange") {
      setEditRates({
        cny: exchangeRates.CNY.toString(),
        npr: exchangeRates.NPR.toString(),
      });
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setActiveTab("add");
  };

  const handleTransportFormChange = (field, value) => {
    setTransportForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveTransportRate = () => {
    // Convert rate to USD before saving
    const rateInUSD = convertToUSD(transportForm.rate, currency);
    const newRate = {
      id: Date.now(),
      ...transportForm,
      rate: rateInUSD,
      date: new Date().toISOString().split("T")[0],
    };
    setSavedTransportRates((prev) => [newRate, ...prev]);
    // TODO: Save to database - POST /api/transport-rates
    setTransportForm({ mode: "", method: "", from: "", to: "", rate: "", unit: "kg" });
    setActiveTab("list");
  };

  const saveExchangeRates = () => {
    // Update global exchange rates
    updateExchangeRates({
      CNY: parseFloat(editRates.cny),
      NPR: parseFloat(editRates.npr),
    });
    // TODO: Save to database - POST /api/exchange-rates
    closeModal();
  };

  const renderModalContent = () => {
    switch (activeModal) {
      case "transportal":
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-[#412460]">Transportal Cost Management</h3>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-[#E1E3EE]">
              <button
                onClick={() => setActiveTab("add")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "add"
                    ? "border-[#412460] text-[#412460]"
                    : "border-transparent text-gray-500 hover:text-[#412460]"
                }`}
              >
                Add New Rate
              </button>
              <button
                onClick={() => setActiveTab("list")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "list"
                    ? "border-[#412460] text-[#412460]"
                    : "border-transparent text-gray-500 hover:text-[#412460]"
                }`}
              >
                View Saved Rates ({savedTransportRates.length})
              </button>
            </div>

            {activeTab === "add" ? (
              <div className="rounded-xl border border-[#E1E3EE] p-4">
                {/* Form Fields */}
                <div className="space-y-4">
                  {/* Mode of Transportation */}
                  <div>
                    <label className="block text-sm font-medium text-[#2D2D2D] mb-1">Mode of transportation</label>
                    <select
                      value={transportForm.mode}
                      onChange={(e) => handleTransportFormChange("mode", e.target.value)}
                      className="w-full p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm focus:outline-none focus:border-[#412460] focus:ring-1 focus:ring-[#412460]"
                    >
                      <option value="">Select mode...</option>
                      <option value="road">Road Transport</option>
                      <option value="air">Air Freight</option>
                      <option value="sea">Sea Transport</option>
                    </select>
                  </div>

                  {/* From / To Country Dropdowns */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* From Country Dropdown */}
                    <div ref={fromDropdownRef} className="relative">
                      <label className="block text-sm font-medium text-[#2D2D2D] mb-1">From:</label>
                      {fromDropdownOpen ? (
                        <input
                          type="text"
                          value={fromSearch}
                          onChange={(e) => setFromSearch(e.target.value)}
                          placeholder="Type to search country..."
                          className="w-full p-3 rounded-xl border border-[#412460] bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#412460]"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setFromDropdownOpen(true)}
                          className="w-full p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm text-left focus:outline-none focus:border-[#412460] focus:ring-1 focus:ring-[#412460] flex items-center justify-between"
                        >
                          <span className={transportForm.from ? "text-[#2D2D2D]" : "text-gray-400"}>
                            {transportForm.from || "Select country..."}
                          </span>
                          <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      )}
                      {fromDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-xl bg-white shadow-lg border border-[#E1E3EE]">
                          {COUNTRIES.filter(c => c.toLowerCase().includes(fromSearch.toLowerCase())).map((country) => (
                            <button
                              key={country}
                              type="button"
                              onClick={() => { handleTransportFormChange("from", country); setFromDropdownOpen(false); setFromSearch(""); }}
                              className={`w-full px-4 py-2 text-left text-sm hover:bg-[#F4F2EF] ${
                                transportForm.from === country ? 'bg-[#412460]/10 text-[#412460] font-semibold' : 'text-[#2D2D2D]'
                              }`}
                            >
                              {country}
                            </button>
                          ))}
                          {COUNTRIES.filter(c => c.toLowerCase().includes(fromSearch.toLowerCase())).length === 0 && (
                            <div className="px-4 py-2 text-sm text-gray-400">No countries found</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* To Country Dropdown */}
                    <div ref={toDropdownRef} className="relative">
                      <label className="block text-sm font-medium text-[#2D2D2D] mb-1">To:</label>
                      {toDropdownOpen ? (
                        <input
                          type="text"
                          value={toSearch}
                          onChange={(e) => setToSearch(e.target.value)}
                          placeholder="Type to search country..."
                          className="w-full p-3 rounded-xl border border-[#412460] bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#412460]"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setToDropdownOpen(true)}
                          className="w-full p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm text-left focus:outline-none focus:border-[#412460] focus:ring-1 focus:ring-[#412460] flex items-center justify-between"
                        >
                          <span className={transportForm.to ? "text-[#2D2D2D]" : "text-gray-400"}>
                            {transportForm.to || "Select country..."}
                          </span>
                          <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      )}
                      {toDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-xl bg-white shadow-lg border border-[#E1E3EE]">
                          {COUNTRIES.filter(c => c.toLowerCase().includes(toSearch.toLowerCase())).map((country) => (
                            <button
                              key={country}
                              type="button"
                              onClick={() => { handleTransportFormChange("to", country); setToDropdownOpen(false); setToSearch(""); }}
                              className={`w-full px-4 py-2 text-left text-sm hover:bg-[#F4F2EF] ${
                                transportForm.to === country ? 'bg-[#412460]/10 text-[#412460] font-semibold' : 'text-[#2D2D2D]'
                              }`}
                            >
                              {country}
                            </button>
                          ))}
                          {COUNTRIES.filter(c => c.toLowerCase().includes(toSearch.toLowerCase())).length === 0 && (
                            <div className="px-4 py-2 text-sm text-gray-400">No countries found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Border Crossing - Only show for Road Transport to/from Nepal */}
                  {isRoadToNepal && (
                    <div>
                      <label className="block text-sm font-medium text-[#2D2D2D] mb-1">Border Crossing</label>
                      <select
                        value={transportForm.method}
                        onChange={(e) => handleTransportFormChange("method", e.target.value)}
                        className="w-full p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm focus:outline-none focus:border-[#412460] focus:ring-1 focus:ring-[#412460]"
                      >
                        <option value="">Select border crossing...</option>
                        <option value="kerung">From Kerung</option>
                        <option value="tatopani">From Tatopani</option>
                        <option value="korola">From Korola</option>
                      </select>
                    </div>
                  )}

                  {/* Rate */}
                  <div>
                    <label className="block text-sm font-medium text-[#2D2D2D] mb-1">Rate ({currency}):</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[#412460] font-semibold">{currencySymbols[currency]}</span>
                      <input
                        type="number"
                        value={transportForm.rate}
                        onChange={(e) => handleTransportFormChange("rate", e.target.value)}
                        placeholder="0.00"
                        className="flex-1 p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm focus:outline-none focus:border-[#412460] focus:ring-1 focus:ring-[#412460]"
                      />
                      <select
                        value={transportForm.unit}
                        onChange={(e) => handleTransportFormChange("unit", e.target.value)}
                        className="p-3 rounded-xl border border-[#E1E3EE] bg-white text-sm focus:outline-none focus:border-[#412460]"
                      >
                        <option value="kg">/ kg</option>
                        <option value="cbm">/ CBM</option>
                        <option value="container">/ container</option>
                        <option value="km">/ km</option>
                        <option value="mile">/ mile</option>
                        <option value="unit">/ unit</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-6">
                  <button
                    onClick={closeModal}
                    className="flex-1 py-2 border border-[#E1E3EE] text-[#2D2D2D] rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveTransportRate}
                    className="flex-1 py-2 bg-[#412460] text-white rounded-lg text-sm font-medium hover:bg-[#5a3680] transition-colors"
                  >
                    Save to Database
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#E1E3EE] p-4">
                <p className="text-xs text-[#412460] mb-4">Displaying in: {currency}</p>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {savedTransportRates.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No saved rates yet.</p>
                  ) : (
                    savedTransportRates.map((rate) => (
                      <div key={rate.id} className="p-3 bg-gray-50 rounded-lg">
                        {editingRateId === rate.id ? (
                          // Edit Mode
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={editRateForm.mode}
                                onChange={(e) => setEditRateForm({ ...editRateForm, mode: e.target.value })}
                                className="p-2 rounded-lg border border-[#E1E3EE] bg-white text-sm"
                              >
                                <option value="road">Road</option>
                                <option value="air">Air</option>
                                <option value="sea">Sea</option>
                              </select>
                              <input
                                type="text"
                                value={editRateForm.method}
                                onChange={(e) => setEditRateForm({ ...editRateForm, method: e.target.value })}
                                placeholder="Method"
                                className="p-2 rounded-lg border border-[#E1E3EE] bg-white text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={editRateForm.from}
                                onChange={(e) => setEditRateForm({ ...editRateForm, from: e.target.value })}
                                placeholder="From"
                                className="p-2 rounded-lg border border-[#E1E3EE] bg-white text-sm"
                              />
                              <input
                                type="text"
                                value={editRateForm.to}
                                onChange={(e) => setEditRateForm({ ...editRateForm, to: e.target.value })}
                                placeholder="To"
                                className="p-2 rounded-lg border border-[#E1E3EE] bg-white text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={editRateForm.rate}
                                onChange={(e) => setEditRateForm({ ...editRateForm, rate: e.target.value })}
                                placeholder="Rate"
                                className="flex-1 p-2 rounded-lg border border-[#E1E3EE] bg-white text-sm"
                              />
                              <select
                                value={editRateForm.unit}
                                onChange={(e) => setEditRateForm({ ...editRateForm, unit: e.target.value })}
                                className="p-2 rounded-lg border border-[#E1E3EE] bg-white text-sm"
                              >
                                <option value="kg">kg</option>
                                <option value="cbm">CBM</option>
                                <option value="container">container</option>
                                <option value="km">km</option>
                                <option value="mile">mile</option>
                                <option value="unit">unit</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={handleUpdateRate}
                                className="flex-1 py-1.5 bg-[#412460] text-white rounded-lg text-xs font-medium"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="flex-1 py-1.5 border border-[#E1E3EE] text-[#2D2D2D] rounded-lg text-xs font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium capitalize">{rate.mode} - {rate.method}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{rate.date}</span>
                                <button
                                  onClick={() => handleEditRate(rate)}
                                  className="p-1 text-[#412460] hover:bg-[#412460]/10 rounded"
                                  title="Edit"
                                >
                                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => openDeleteModal(rate.id)}
                                  className="p-1 text-[#E05353] hover:bg-[#E05353]/10 rounded"
                                  title="Delete"
                                >
                                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18" />
                                    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {rate.from} → {rate.to}
                            </div>
                            <div className="text-sm text-[#412460] font-semibold mt-1">
                              {formatCurrency(rate.rate)} / {rate.unit}
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case "exchange":
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-[#412460]">Today's Exchange Rates</h3>
            <div className="rounded-xl border border-[#E1E3EE] p-4">
              <p className="text-xs text-gray-500 mb-4">Current rates: USD 1 = {exchangeRates.CNY} CNY = {exchangeRates.NPR} NPR</p>

              {/* Exchange Rate Inputs */}
              <div className="space-y-4">
                {/* 1 USD = ___ CNY ___ NPR */}
                <div className="bg-[#412460]/5 rounded-xl p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-bold text-[#412460]">1 USD</span>
                    <span className="text-gray-400">=</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editRates.cny}
                      onChange={(e) => setEditRates((prev) => ({ ...prev, cny: e.target.value }))}
                      className="w-20 p-2 rounded-lg border border-[#E1E3EE] bg-white text-center font-semibold text-[#412460] focus:outline-none focus:border-[#412460]"
                    />
                    <span className="text-sm font-medium text-gray-600">CNY</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editRates.npr}
                      onChange={(e) => setEditRates((prev) => ({ ...prev, npr: e.target.value }))}
                      className="w-24 p-2 rounded-lg border border-[#E1E3EE] bg-white text-center font-semibold text-[#412460] focus:outline-none focus:border-[#412460]"
                    />
                    <span className="text-sm font-medium text-gray-600">NPR</span>
                  </div>
                </div>

                {/* 1 CNY = ___ USD ___ NPR */}
                <div className="bg-[#B99353]/5 rounded-xl p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-bold text-[#B99353]">1 CNY</span>
                    <span className="text-gray-400">=</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={(1 / parseFloat(editRates.cny || 7.24)).toFixed(4)}
                      readOnly
                      className="w-20 p-2 rounded-lg border border-[#E1E3EE] bg-gray-100 text-center font-semibold text-[#412460]"
                    />
                    <span className="text-sm font-medium text-gray-600">USD</span>
                    <input
                      type="number"
                      step="0.01"
                      value={(parseFloat(editRates.npr || 135.50) / parseFloat(editRates.cny || 7.24)).toFixed(2)}
                      readOnly
                      className="w-24 p-2 rounded-lg border border-[#E1E3EE] bg-gray-100 text-center font-semibold text-[#412460]"
                    />
                    <span className="text-sm font-medium text-gray-600">NPR</span>
                  </div>
                </div>

                {/* 1 NPR = ___ USD ___ CNY */}
                <div className="bg-[#E05353]/5 rounded-xl p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-bold text-[#E05353]">1 NPR</span>
                    <span className="text-gray-400">=</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={(1 / parseFloat(editRates.npr || 135.50)).toFixed(4)}
                      readOnly
                      className="w-20 p-2 rounded-lg border border-[#E1E3EE] bg-gray-100 text-center font-semibold text-[#412460]"
                    />
                    <span className="text-sm font-medium text-gray-600">USD</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={(parseFloat(editRates.cny || 7.24) / parseFloat(editRates.npr || 135.50)).toFixed(4)}
                      readOnly
                      className="w-24 p-2 rounded-lg border border-[#E1E3EE] bg-gray-100 text-center font-semibold text-[#412460]"
                    />
                    <span className="text-sm font-medium text-gray-600">CNY</span>
                  </div>
                </div>
              </div>

              <button
                onClick={saveExchangeRates}
                className="mt-6 w-full py-2 bg-[#412460] text-white rounded-lg text-sm font-medium hover:bg-[#5a3680] transition-colors"
              >
                Save & Apply Exchange Rates
              </button>
            </div>
          </div>
        );

      case "hscodes":
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-[#412460]">HS Codes Management</h3>
            <div className="rounded-xl border border-[#E1E3EE] p-4">
              <p className="text-sm text-gray-600 mb-4">Manage Harmonized System codes for product classification.</p>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium block">8471.30.01</span>
                    <span className="text-xs text-gray-500">Portable automatic data processing machines</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Active</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium block">8517.62.00</span>
                    <span className="text-xs text-gray-500">Machines for reception, conversion and transmission</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Active</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium block">8528.72.32</span>
                    <span className="text-xs text-gray-500">Reception apparatus for television</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Active</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium block">6203.42.11</span>
                    <span className="text-xs text-gray-500">Men's or boys' trousers of cotton</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">Review</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex-1 py-2 border border-[#412460] text-[#412460] rounded-lg text-sm font-medium hover:bg-[#412460]/5 transition-colors">
                  Add New
                </button>
                <button className="flex-1 py-2 bg-[#412460] text-white rounded-lg text-sm font-medium hover:bg-[#5a3680] transition-colors">
                  Import CSV
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AdminPageShell activePage="Settings" title="Settings" eyebrow="Cellzen Admin Settings">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <h2 className="text-lg font-semibold">Workspace Settings</h2>
          <div className="mt-5 space-y-3">
            {SETTINGS.map((setting) => (
              <label key={setting} className="flex items-center justify-between rounded-[2rem] border border-[#E1E3EE] p-5 text-sm">
                <span className="font-semibold text-[#2D2D2D]/70">{setting}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#412460]" />
              </label>
            ))}
          </div>

          {/* New Buttons Section */}
          <div className="mt-8 pt-6 border-t border-[#E1E3EE]">
            <h3 className="text-sm font-semibold text-[#2D2D2D]/70 mb-4">Management Tools</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {BUTTONS.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => openModal(btn.id)}
                  className="flex items-center justify-center p-4 rounded-xl border border-[#E1E3EE] bg-white hover:bg-[#412460] hover:text-white hover:border-[#412460] transition-all duration-200 group"
                >
                  <span className="text-sm font-medium text-center group-hover:text-white text-[#2D2D2D]">
                    {btn.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#E1E3EE] bg-[#412460] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">System</p>
          <h2 className="mt-4 text-2xl font-semibold">Cellzen Admin</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            These settings are placeholders for the Cellzen admin workspace and can be connected to the backend later.
          </p>
        </div>
      </div>

      {/* Modal/Popup */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />
          {/* Modal Content */}
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              {/* Close Button */}
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#E1E3EE] text-[#412460] hover:bg-[#412460] hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Modal Content */}
              {renderModalContent()}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={cancelDelete}
          />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-[#FFECEC] rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#E05353]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#2D2D2D] mb-2">Delete Rate</h3>
              <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this transport rate? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  className="flex-1 py-2 border border-[#E1E3EE] text-[#2D2D2D] rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-2 bg-[#E05353] text-white rounded-lg text-sm font-medium hover:bg-[#c94747] transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
