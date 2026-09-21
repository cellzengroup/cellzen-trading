import React, { useEffect, useRef, useState } from "react";

// Accept QR plus the common 1D barcodes packages use. Restricting the format
// set makes decoding faster and less prone to mis-reads. Named for zxing-wasm; the
// browser's native BarcodeDetector spells the same formats differently, below.
const WASM_FORMATS = ["QRCode", "Code128", "Code39", "EAN13", "EAN8", "UPCA", "UPCE", "ITF", "Codabar", "DataMatrix"];
const NATIVE_FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "data_matrix"];

// zxing-wasm reads a frame in a few milliseconds when it skips the exhaustive
// search, and about 5x longer when it doesn't — but the exhaustive pass finds codes
// the quick one misses (tilted, soft). So most frames get the quick pass and every
// HARD_EVERY-th gets the thorough one. A code in view is read within a few frames
// either way. Codes are dark on light, so inverted ones aren't tried.
const WASM_FAST = { formats: WASM_FORMATS, maxNumberOfSymbols: 2, tryHarder: false, tryInvert: false };
const WASM_HARD = { ...WASM_FAST, tryHarder: true };
const HARD_EVERY = 3;

// 1920x1080 rather than the browser's default 640x480: a courier barcode held at a
// normal distance comes out about one pixel per bar at 640x480, too thin to read,
// so staff had to bring the phone close and wait for autofocus. Bar width in pixels
// is what decides whether a thin code reads at all (in testing, 1.6px bars failed
// and 1.8px read), and only the frame's region is decoded, so the extra pixels cost
// little. All are `ideal`, never required — a camera that can't do 1080p hands back
// the nearest it can — and one without continuous focus ignores the focus mode.
const CAMERA_VIDEO = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  advanced: [{ focusMode: "continuous" }],
};

// The scan frame drawn over the preview, as an inset from each edge of the camera
// box (fractions of its width / height). These numbers BOTH place the frame on
// screen and crop what is decoded, so a code is read exactly when it is inside the
// frame — nothing outside it is looked at. Decoding only that region is also what
// makes reads fast: a phone's portrait stream is far taller than the box it is shown
// in, and reading the whole of it meant decoding several times the pixels staff
// could even see, with the rest of the label's clutter throwing off the threshold.
const GUIDE = { x: 0.05, y: 0.1 };

// Consecutive-from-the-start failed frames after which an engine is written off.
const GIVE_UP_AFTER = 15;

// Set once this page's native detector has proven unusable (it advertised the
// formats, then threw on every frame), so later camera starts go straight to
// zxing-wasm instead of paying for the same second of failures every time.
let nativeDetectorBroken = false;

// zxing-wasm, loaded on first use — so a phone whose browser has its own detector
// never downloads it — and kept for the page's life. The .wasm is bundled with the
// site (the ?url import) rather than fetched from the library's default CDN, and
// instantiated up front so the first camera frame isn't waiting on it.
let wasmReader = null;
function loadWasmReader() {
  if (!wasmReader) {
    wasmReader = Promise.all([import("zxing-wasm/reader"), import("zxing-wasm/reader/zxing_reader.wasm?url")])
      .then(async ([mod, wasm]) => {
        await mod.prepareZXingModule({
          overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasm.default : prefix + path) },
          fireImmediately: true,
        });
        return mod.readBarcodes;
      })
      .catch((err) => {
        wasmReader = null; // let the next start try again
        throw err;
      });
  }
  return wasmReader;
}

// The part of the camera frame inside the on-screen guide, in video pixels. <video>
// is shown object-cover, so some of the frame is cropped off screen; the box then
// shows the centre of what remains. Null until the video has dimensions.
function scanRegion(video) {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  const cw = video.clientWidth || 0;
  const ch = video.clientHeight || 0;
  if (!vw || !vh || !cw || !ch) return null;
  const scale = Math.max(cw / vw, ch / vh); // object-cover
  const visW = cw / scale;
  const visH = ch / scale;
  const sx = Math.max(0, Math.round((vw - visW) / 2 + visW * GUIDE.x));
  const sy = Math.max(0, Math.round((vh - visH) / 2 + visH * GUIDE.y));
  const sw = Math.min(vw - sx, Math.round(visW * (1 - 2 * GUIDE.x)));
  const sh = Math.min(vh - sy, Math.round(visH * (1 - 2 * GUIDE.y)));
  return sw > 0 && sh > 0 ? { sx, sy, sw, sh } : null;
}

// Which of the codes in one region to act on: the one nearest its middle. A courier
// label often carries two barcodes side by side; aiming puts the wanted one
// mid-frame. `codes` are { text, box } with box in region pixels (or null when the
// detector gave none, in which case the first result wins).
function pickCode(codes, region) {
  let best = null;
  let bestDist = Infinity;
  for (const code of codes) {
    if (!code.box) return codes[0].text;
    const x = code.box.x + code.box.width / 2;
    const y = code.box.y + code.box.height / 2;
    const dist = (x - region.sw / 2) ** 2 + (y - region.sh / 2) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = code;
    }
  }
  return best ? best.text : null;
}

// Resolves on the next new video frame (or animation frame where the browser can't
// say), so a still frame is never decoded twice.
function nextFrame(video) {
  return new Promise((resolve) => {
    if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(() => resolve());
    else requestAnimationFrame(() => resolve());
  });
}

// The browser's own detector (Chrome on Android, among others) decodes in native
// code — on Android that is Google's on-device barcode model from Play Services —
// far faster than zxing's JavaScript. Null where it's missing, can't read both
// formats labels actually carry, or already failed on this page; the scanner then
// falls back to zxing.
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

// decode(video, region) for the native detector: only the guide region is handed
// over, cropped by the browser as it makes the bitmap.
function nativeDecoder(detector) {
  return async (video, region) => {
    const bitmap = await createImageBitmap(video, region.sx, region.sy, region.sw, region.sh);
    try {
      const found = await detector.detect(bitmap);
      return pickCode(
        found.map((c) => ({ text: c.rawValue, box: c.boundingBox })),
        region
      );
    } finally {
      bitmap.close?.();
    }
  };
}

// decode(video, region) for zxing-wasm: the guide region drawn onto a canvas and read
// from its pixels. A frame with no code in it is an empty result, not an error.
async function wasmDecoder() {
  const readBarcodes = await loadWasmReader();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let frames = 0;
  return async (video, region) => {
    if (canvas.width !== region.sw) canvas.width = region.sw;
    if (canvas.height !== region.sh) canvas.height = region.sh;
    ctx.drawImage(video, region.sx, region.sy, region.sw, region.sh, 0, 0, region.sw, region.sh);
    const image = ctx.getImageData(0, 0, region.sw, region.sh);
    frames += 1;
    const found = await readBarcodes(image, frames % HARD_EVERY === 0 ? WASM_HARD : WASM_FAST);
    return pickCode(
      found.filter((r) => r.isValid && r.text).map((r) => ({ text: r.text, box: positionBox(r.position) })),
      region
    );
  };
}

// The bounding box of a zxing-wasm result's four corner points.
function positionBox(p) {
  if (!p) return null;
  const xs = [p.topLeft.x, p.topRight.x, p.bottomRight.x, p.bottomLeft.x];
  const ys = [p.topLeft.y, p.topRight.y, p.bottomRight.y, p.bottomLeft.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// Continuous rear-camera scanner: the native BarcodeDetector where the browser
// has one, zxing-wasm everywhere else. Both read only the region
// inside the on-screen frame. Keeps the camera running across many scans and
// debounces an identical decoded string within `debounceMs`. Pass
// continuous={false} to stop after one decode (used by the Ship / Locate lookup).
// onDecode/onError are read through refs so the latest handler is always used even
// though the decode loop captured the callback once.
export default function WarehouseScanner({ onDecode, onError, continuous = true, debounceMs = 2500, autoStart = false }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
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

  // A stale start being stopped may clear <video>.srcObject whoever attached it.
  // Hand the camera that IS running its stream back.
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

  // Opens the camera and runs the engine's decode function (`decoding`, a promise so
  // an engine that has to load — zxing-wasm — does so while the camera opens) on the
  // guide region of every new frame. Both engines go through here, so both crop
  // identically and stop identically. Returns { stream, stop }. An engine whose
  // decode only ever throws (some devices advertise formats they can't read) is
  // written off after GIVE_UP_AFTER frames and `onGiveUp(isCurrent)` decides what
  // happens next.
  const startEngine = async (decoding, onGiveUp) => {
    decoding.catch(() => { /* reported below; don't leave it unhandled if the camera fails first */ });
    const gen = genRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_VIDEO });
    let stopped = false;
    const controls = {
      stream,
      stop: () => {
        stopped = true;
        stream.getTracks().forEach((t) => t.stop());
      },
    };
    try {
      const decode = await decoding;
      const video = videoRef.current;
      if (!video) return controls; // unmounted mid-init — the caller stops it
      video.srcObject = stream;
      await video.play().catch(() => { /* muted + playsInline, so autoplay is allowed */ });
      // Still the camera this scanner runs — not stopped, restarted or unmounted since.
      const isCurrent = () => mountedRef.current && controlsRef.current === controls && genRef.current === gen;
      (async () => {
        let failures = 0;
        let everRead = false;
        while (!stopped) {
          await nextFrame(video);
          if (stopped) return;
          if (video.readyState < 2) continue;
          const region = scanRegion(video);
          if (!region) continue;
          try {
            const text = await decode(video, region);
            everRead = true;
            if (!stopped && text) handleDecoded(text);
          } catch {
            failures += 1;
            if (!everRead && failures >= GIVE_UP_AFTER) {
              controls.stop();
              await onGiveUp(isCurrent);
              return;
            }
          }
        }
      })();
      return controls;
    } catch (err) {
      controls.stop(); // the decoder failed to load: don't leave the camera running
      throw err;
    }
  };

  // Native detector first; if it turns out unusable, this page remembers that and
  // the same camera restarts on zxing-wasm.
  const startNative = (detector) =>
    startEngine(Promise.resolve(nativeDecoder(detector)), async (isCurrent) => {
      nativeDetectorBroken = true;
      // A Stop, or Stop then Start, while this was failing has moved on without
      // it — leave that newer camera alone.
      if (!isCurrent()) return;
      releaseTracks();
      try {
        const fallback = await startWasm();
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
    });

  const startWasm = () =>
    startEngine(wasmDecoder(), async (isCurrent) => {
      if (!isCurrent()) return;
      onErrorRef.current?.("Barcode reading isn't working on this device — use manual entry below.");
      stop();
    });

  const start = async () => {
    if (controlsRef.current) return;
    const gen = ++genRef.current;
    try {
      const detector = await createNativeDetector();
      const controls = detector ? await startNative(detector) : await startWasm();
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
          // Scan frame: it is the read area (see GUIDE), so the camera outside it is dimmed.
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]"
              style={{ left: `${GUIDE.x * 100}%`, right: `${GUIDE.x * 100}%`, top: `${GUIDE.y * 100}%`, bottom: `${GUIDE.y * 100}%` }}
            >
              <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-2xl border-l-2 border-t-2 border-white/90" />
              <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-2xl border-r-2 border-t-2 border-white/90" />
              <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-2xl border-b-2 border-l-2 border-white/90" />
              <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-2xl border-b-2 border-r-2 border-white/90" />
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
