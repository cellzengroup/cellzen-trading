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

// The same formats, as the browser's native BarcodeDetector names them.
const NATIVE_FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "data_matrix"];

// zxing reads a frame and then WAITS before the next one — 500ms by default in
// @zxing/browser — so a code in view was looked at only twice a second, and every
// blurred or half-framed read cost another half second. 100ms keeps it responsive
// without pinning a phone's main thread.
const ZXING_OPTIONS = { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 300 };

// 1280x720 rather than the browser's default 640x480: a courier barcode held at a
// normal distance comes out well under one pixel per bar at 640x480, too thin to
// read, so staff had to bring the phone close and wait for autofocus. Both are
// `ideal`, never required, and a camera without continuous focus ignores it.
const CAMERA_VIDEO = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  advanced: [{ focusMode: "continuous" }],
};

// Set once this page's native detector has proven unusable (it advertised the
// formats, then threw on every frame), so later camera starts go straight to
// zxing instead of paying for the same second of failures every time.
let nativeDetectorBroken = false;

// Which of the codes in one frame to act on: the one nearest the middle of what
// staff can SEE. The detector reads the whole camera frame, but <video> is shown
// object-cover in a shorter box, so part of the frame is cropped off screen — and
// a courier label often carries two barcodes side by side. Aiming puts the wanted
// one mid-frame, the same code zxing's scan-outward-from-the-centre used to pick.
// Codes outside the visible crop are ignored; a detector that gives no boxes falls
// back to its first result.
function pickCode(codes, video) {
  if (!codes.some((c) => c.boundingBox)) return codes[0];
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  const cw = video.clientWidth || 0;
  const ch = video.clientHeight || 0;
  if (!vw || !vh || !cw || !ch) return codes[0];
  const scale = Math.max(cw / vw, ch / vh); // object-cover
  const visW = cw / scale;
  const visH = ch / scale;
  const left = (vw - visW) / 2;
  const top = (vh - visH) / 2;
  let best = null;
  let bestDist = Infinity;
  for (const code of codes) {
    const box = code.boundingBox;
    if (!box) continue;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (x < left || x > left + visW || y < top || y > top + visH) continue;
    const dist = (x - vw / 2) ** 2 + (y - vh / 2) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = code;
    }
  }
  return best;
}

// The browser's own detector (Chrome on Android, among others) decodes in native
// code, far faster than zxing's JavaScript. Null where it's missing, can't read
// both formats labels actually carry, or already failed on this page; the scanner
// then falls back to zxing.
async function createNativeDetector() {
  if (nativeDetectorBroken) return null;
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes("qr_code") || !formats.includes("code_128")) return null;
    return new window.BarcodeDetector({ formats });
  } catch {
    return null;
  }
}

// Continuous rear-camera scanner: the native BarcodeDetector where the browser
// has one, zxing-js (@zxing/browser) everywhere else. Keeps the camera running
// across many scans and debounces an identical decoded string within
// `debounceMs`. Pass continuous={false} to stop after one decode (used by the
// Ship / Locate lookup). onDecode/onError are read through refs so the latest
// handler is always used even though the decode loop captured the callback once.
export default function WarehouseScanner({ onDecode, onError, continuous = true, debounceMs = 2500, autoStart = false }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const mountedRef = useRef(true);
  // Every code read within the last `debounceMs`, text -> time it fired. Per code,
  // not just the last one: with two codes in view the reads alternate A, B, A, B,
  // and a last-code-only debounce let every one of them through — each a put-away.
  const seenRef = useRef(new Map());
  // Bumped by every start and stop, so a camera start (or a fallback to zxing)
  // that finishes after the scanner was stopped or restarted knows it is stale.
  const genRef = useRef(0);
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

  // zxing's stop() clears <video>.srcObject whoever attached it. After stopping a
  // stale zxing start, hand the camera that IS running its stream back.
  const reattachCurrent = () => {
    const stream = controlsRef.current?.stream;
    const v = videoRef.current;
    if (stream && v && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => { /* muted + playsInline, so autoplay is allowed */ });
    }
  };

  const stop = () => {
    genRef.current += 1;
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
    }
    releaseTracks();
    if (mountedRef.current) setScanning(false);
  };

  const handleDecoded = (text) => {
    const now = Date.now();
    const seen = seenRef.current;
    for (const [code, time] of seen) if (now - time >= debounceMs) seen.delete(code);
    if (seen.has(text)) return; // this code already fired within debounceMs
    seen.set(text, now);
    onDecodeRef.current?.(text);
    if (!continuous) stop();
  };

  // zxing reads a stream this component opens itself (decodeFromStream) rather than
  // one opened inside the library, so its controls carry the stream just like the
  // native path's. A stale start's stop() clears the shared <video> whoever
  // attached it; with the stream known, the running camera — zxing or native — can
  // always be handed its preview back (reattachCurrent).
  const startZxing = async () => {
    if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader(HINTS, ZXING_OPTIONS);
    const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_VIDEO });
    try {
      const controls = await readerRef.current.decodeFromStream(
        stream,
        videoRef.current,
        (result) => { if (result) handleDecoded(result.getText()); }
        // per-frame NotFoundException is expected when no code is in view — ignore
      );
      return {
        ...controls,
        stream,
        stop: () => {
          try {
            controls.stop();
          } finally {
            stream.getTracks().forEach((t) => t.stop());
          }
        },
      };
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw err;
    }
  };

  // Native path: the camera stream straight into <video>, read by the browser's
  // detector on animation frames — one detect() in flight at a time, no more
  // often than every 60ms, so the phone isn't kept at full tilt. Returns the same
  // { stop } shape as zxing's controls, plus the stream. A detector that only ever
  // throws (some devices advertise formats they can't read) hands over to zxing,
  // and the page remembers not to try it again.
  const startNative = async (detector) => {
    const gen = genRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: CAMERA_VIDEO,
    });
    let stopped = false;
    const controls = {
      stream,
      stop: () => {
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
      },
    };
    const video = videoRef.current;
    if (!video) return controls; // unmounted mid-init — the caller stops it
    video.srcObject = stream;
    await video.play().catch(() => { /* muted + playsInline, so autoplay is allowed */ });
    // Still the camera this scanner runs — not stopped, restarted or unmounted since.
    const isCurrent = () => mountedRef.current && controlsRef.current === controls && genRef.current === gen;
    let busy = false;
    let last = 0;
    let failures = 0;
    let everRead = false;
    const tick = async (now) => {
      if (stopped) return;
      if (!busy && video.readyState >= 2 && now - last >= 60) {
        busy = true;
        last = now;
        try {
          const codes = await detector.detect(video);
          everRead = true;
          const code = codes.length ? pickCode(codes, video) : null;
          if (!stopped && code) handleDecoded(code.rawValue);
        } catch {
          failures += 1;
          if (!everRead && failures >= 15) {
            nativeDetectorBroken = true;
            controls.stop();
            // A Stop, or Stop then Start, while this was failing has moved on
            // without it — leave that newer camera alone.
            if (!isCurrent()) return;
            releaseTracks();
            try {
              const fallback = await startZxing();
              if (isCurrent()) {
                controlsRef.current = fallback;
                reattachCurrent();
              } else {
                fallback.stop();
                reattachCurrent();
              }
            } catch (err) {
              onErrorRef.current?.(err?.message || "Camera unavailable — use manual entry below.");
              // Don't leave Stop Camera showing over a dead preview.
              if (isCurrent()) stop();
            }
            return;
          }
        }
        busy = false;
      }
      if (!stopped) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return controls;
  };

  const start = async () => {
    if (controlsRef.current) return;
    const gen = ++genRef.current;
    try {
      const detector = await createNativeDetector();
      const controls = detector ? await startNative(detector) : await startZxing();
      // Unmounted, or stopped / restarted, during the async camera-init window:
      // the stream is live but nobody holds these controls — stop them now, so no
      // orphaned camera is left that only a page reload would release.
      if (!mountedRef.current || genRef.current !== gen) {
        try { controls.stop(); } catch { /* ignore */ }
        if (!mountedRef.current) releaseTracks();
        else reattachCurrent();
        return;
      }
      controlsRef.current = controls;
      // A stale start stopped in the meantime may have cleared <video> after this
      // camera attached to it; make sure the preview is this camera's.
      reattachCurrent();
      setScanning(true);
    } catch (err) {
      // A stale start (stopped or restarted since) failing is not the camera
      // failing: stay quiet, and give the running camera its preview back in case
      // this start attached to <video> before it gave up.
      if (genRef.current !== gen) {
        reattachCurrent();
        return;
      }
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
