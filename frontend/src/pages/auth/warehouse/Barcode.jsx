import React, { useEffect, useRef } from "react";
import { toCanvas } from "bwip-js";

// Renders a Code-128 barcode for `text` directly onto a canvas (bwip-js), so a
// handheld scanner can read the code straight off the item / shelf label.
export default function Barcode({ text, scale = 3, height = 10, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !text) return;
    try {
      toCanvas(canvas, {
        bcid: "code128",
        text: String(text),
        scale,
        height,
        includetext: true,
        textxalign: "center",
        textsize: 10,
        paddingwidth: 6,
        paddingheight: 4,
        backgroundcolor: "FFFFFF",
      });
    } catch {
      /* ignore invalid input */
    }
  }, [text, scale, height]);

  return <canvas ref={ref} className={`block h-auto max-w-full ${className}`} aria-label={`Barcode ${text}`} />;
}
