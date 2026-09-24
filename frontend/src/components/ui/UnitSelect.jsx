import { useState, useRef, useEffect } from "react";

const DEFAULT_OPTIONS = ["KG", "CBM", "DOCS", "Pallet", "Unit"];

// Type-or-pick combobox for a table cell — native <datalist> can't be
// restyled consistently across browsers, so this renders its own dropdown.
export default function UnitSelect({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  placeholder = "",
  inputStyle = {},
  inputClassName = "",
  dataCell,
  onFocus,
  onKeyDown,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(String(value).toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <input
        type="text"
        data-cell={dataCell}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => { setOpen(true); onFocus?.(e); }}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setOpen(false);
          onKeyDown?.(e);
        }}
        placeholder={placeholder}
        autoComplete="off"
        style={{ ...inputStyle, paddingRight: 18, boxSizing: "border-box" }}
        className={`block h-full w-full border-none bg-transparent outline-none ${inputClassName}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((o) => !o)}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-[#2D2D2D]/35 hover:text-[#412460]"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-0.5 w-max min-w-full overflow-y-auto border border-[#412460]/20 bg-white shadow-lg" style={{ maxHeight: 160 }}>
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
              className={`block w-full whitespace-nowrap px-2 py-1 text-left text-xs hover:bg-[#412460]/8 ${
                opt === value ? "bg-[#412460]/8 font-semibold text-[#412460]" : "text-[#2D2D2D]"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
