import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// How long the sheet takes to slide away. It stays mounted this long after `open`
// goes false, so leaving is animated too instead of the sheet just vanishing.
const EXIT_MS = 320;

// The bottom sheet "Upload image" opens on a phone: one row per way of getting a
// photo — "Take a photo", then "Choose from gallery". It slides up over a fading
// backdrop and slides back down when it is dismissed.
//
// `options` is [{ label, icon, onSelect }]. Choosing a row calls its `onSelect` and
// then closes the sheet. `onSelect` runs synchronously inside the tap, which is what
// lets it call `input.click()`: iOS only opens the camera or the photo picker for a
// click that comes straight out of a user gesture.
//
// Rendered into <body> above every warehouse popup (the QC popups are z-150 and
// z-160), so it is never clipped by, or stacked under, the popup it was opened from.
export default function QcSourceSheet({ open, onClose, options }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the first paints the sheet below the screen, the second moves
      // it up. Flipping straight away would give the browser no starting position,
      // and the sheet would appear in place with nothing to animate.
      let second = 0;
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Escape closes just this sheet. Caught on the way down (capture) and stopped, or
  // the QC popup underneath — which closes on Escape from a listener on window —
  // would close with it.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    // Every click is stopped here: through a portal React still bubbles it to the
    // popup this was opened from, and that popup's backdrop closes it.
    <div
      className="fixed inset-0 z-[165] flex items-end justify-center"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a QC photo"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md rounded-t-3xl bg-white px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-[#2D2D2D]/15" />
        {options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            onClick={() => { o.onSelect(); onClose(); }}
            className={`flex w-full items-center gap-3.5 rounded-2xl px-3 py-4 text-left text-[15px] font-semibold text-[#2D2D2D] transition active:bg-[#F6F4F0] ${
              i ? "border-t border-[#ECE9E3]" : ""
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#412460]/10 text-[#412460]">
              {o.icon}
            </span>
            {o.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
