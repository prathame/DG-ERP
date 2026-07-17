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

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

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
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            if (scannedRef.current) return;
            scannedRef.current = true;
            stopScanner();
            onScanRef.current(decodedText);
          },
          () => {}
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
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Barcode scanner">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-brand" aria-hidden="true" />
            <h3 className="font-bold text-sm">Scan Barcode</h3>
            {scanning && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-label="Scanning" />}
          </div>
          <button type="button" onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close scanner">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <p className="text-sm text-rose-600 text-center py-8" role="alert">{error}</p>
          ) : (
            <div id={containerId} className="rounded-xl overflow-hidden bg-black min-h-[200px]" />
          )}
        </div>
      </div>
    </div>
  );
}
