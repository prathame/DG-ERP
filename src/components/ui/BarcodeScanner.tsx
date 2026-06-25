import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'barcode-scanner-container';

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
      (decodedText) => {
        onScan(decodedText);
        scanner.stop().catch(() => {});
        onClose();
      },
      () => {}
    ).catch((err) => {
      setError(err?.message || 'Camera access denied. Please allow camera permission.');
    });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-[#F27D26]" />
            <h3 className="font-bold text-sm">Scan Barcode</h3>
          </div>
          <button onClick={() => { scannerRef.current?.stop().catch(() => {}); onClose(); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <div className="text-center py-8">
              <Camera size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-rose-500 mb-2">{error}</p>
              <p className="text-xs text-gray-400">Make sure camera permission is allowed in your browser settings.</p>
            </div>
          ) : (
            <>
              <div id={containerId} className="rounded-xl overflow-hidden" />
              <p className="text-xs text-gray-500 text-center mt-3">Point your camera at a barcode</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
