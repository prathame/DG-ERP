import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const scannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const containerId = 'barcode-scanner-container';

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;
        // Explicit QR + 1D barcodes (library defaults include QR, but we pin formats + square box).
        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODABAR,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            // Square region so QR codes scan reliably (old 250×150 box favored 1D barcodes).
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const side = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
              return { width: side, height: side };
            },
            aspectRatio: 1,
          },
          decodedText => {
            if (scannedRef.current) return;
            scannedRef.current = true;
            stopScanner();
            onScanRef.current(decodedText);
          },
          () => {},
        );
        if (!cancelled) setScanning(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Camera access denied. Please allow camera permission.');
        }
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, []);

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode or QR scanner"
    >
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-brand" aria-hidden="true" />
            <h3 className="font-bold text-sm">Scan barcode or QR</h3>
            {scanning && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-label="Scanning" />}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Close scanner"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <p className="text-sm text-rose-600 text-center py-8" role="alert">
              {error}
            </p>
          ) : (
            <>
              <div id={containerId} className="rounded-xl overflow-hidden bg-black min-h-[240px]" />
              <p className="text-[11px] text-gray-400 text-center mt-2">Point at a barcode or QR code</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
