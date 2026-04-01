import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function BarcodeScanner({ onScan, onError }) {
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const [scanning, setScanning] = useState(false);

  const startScanning = async () => {
    if (html5QrRef.current || !scannerRef.current) return;

    try {
      const html5Qr = new Html5Qrcode('barcode-scanner');
      html5QrRef.current = html5Qr;

      await html5Qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText);
          stopScanning();
        },
        () => {} // ignore errors during scanning
      );
      setScanning(true);
    } catch (err) {
      onError?.(err.message || 'Failed to start camera');
    }
  };

  const stopScanning = async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      } catch (e) {
        // ignore
      }
      html5QrRef.current = null;
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div
        id="barcode-scanner"
        ref={scannerRef}
        className="w-full max-w-md mx-auto rounded-[1.2rem] overflow-hidden bg-black"
        style={{ minHeight: scanning ? 300 : 0 }}
      />

      <div className="flex justify-center">
        {!scanning ? (
          <button
            onClick={startScanning}
            className="px-6 py-3 bg-amber-700 text-white rounded-[1.2rem] hover:bg-amber-800 font-medium text-lg"
          >
            Start Scanner
          </button>
        ) : (
          <button
            onClick={stopScanning}
            className="px-6 py-3 bg-red-600 text-white rounded-[1.2rem] hover:bg-red-700 font-medium text-lg"
          >
            Stop Scanner
          </button>
        )}
      </div>
    </div>
  );
}
