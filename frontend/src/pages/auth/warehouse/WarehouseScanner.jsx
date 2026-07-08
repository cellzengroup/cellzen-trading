import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";

// Accept QR plus the common 1D barcodes packages use. Restricting the format
// set makes zxing-js faster and less prone to mis-reads.
const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.DATA_MATRIX,
]);

// Continuous rear-camera scanner built on zxing-js (@zxing/browser). Keeps the
// camera running across many scans and debounces an identical decoded string
// within `debounceMs`. Pass continuous={false} to stop after one decode (used
// by the Ship / Locate lookup). onDecode/onError are read through refs so the
// latest handler is always used even though zxing captured the callback once.
export default function WarehouseScanner({ onDecode, onError, continuous = true, debounceMs = 2500, autoStart = false }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastRef = useRef({ text: null, time: 0 });
  const onDecodeRef = useRef(onDecode);
  const onErrorRef = useRef(onError);
  const [scanning, setScanning] = useState(false);

  useEffect(() => { onDecodeRef.current = onDecode; }, [onDecode]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Belt-and-suspenders: stop any MediaStream tracks still attached to <video>.
  const releaseTracks = () => {
    const v = videoRef.current;
    if (v && v.srcObject) {
      try { v.srcObject.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      v.srcObject = null;
    }
  };

  const stop = () => {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
    }
    releaseTracks();
    if (mountedRef.current) setScanning(false);
  };

  const handleDecoded = (text) => {
    const now = Date.now();
    const last = lastRef.current;
    if (text === last.text && now - last.time < debounceMs) return; // debounce identical
    lastRef.current = { text, time: now };
    onDecodeRef.current?.(text);
    if (!continuous) stop();
  };

  const start = async () => {
    if (controlsRef.current) return;
    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader(HINTS);
      const controls = await readerRef.current.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result) => { if (result) handleDecoded(result.getText()); }
        // per-frame NotFoundException is expected when no code is in view — ignore
      );
      // If we unmounted during the async camera-init window, the stream is now
      // live but nobody holds the controls — stop it immediately to avoid an
      // orphaned camera that only a page reload would release.
      if (!mountedRef.current) {
        try { controls.stop(); } catch { /* ignore */ }
        releaseTracks();
        return;
      }
      controlsRef.current = controls;
      setScanning(true);
    } catch (err) {
      onErrorRef.current?.(err?.message || "Camera unavailable — use manual entry below.");
      stop();
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (autoStart) start();
    return () => {
      mountedRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div
        className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-[#141414] ring-1 ring-black/5"
        style={{ minHeight: scanning ? 280 : 172 }}
      >
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
        {scanning ? (
          // Corner-bracket scan frame overlay
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-40 w-60">
              <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-xl border-l-2 border-t-2 border-white/85" />
              <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-xl border-r-2 border-t-2 border-white/85" />
              <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-xl border-b-2 border-l-2 border-white/85" />
              <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-xl border-b-2 border-r-2 border-white/85" />
              <span className="wh-scanline absolute inset-x-2 top-1/2 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]" />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/45">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <path d="M7 12h10" />
            </svg>
            <span className="text-xs font-medium">Camera is off</span>
          </div>
        )}
      </div>
      <div className="flex justify-center">
        {!scanning ? (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-2 rounded-full bg-[#412460] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#B99353] active:scale-[.98]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Start Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-full bg-[#2D2D2D] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#412460] active:scale-[.98]"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            Stop Camera
          </button>
        )}
      </div>
    </div>
  );
}
