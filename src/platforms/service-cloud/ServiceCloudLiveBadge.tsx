/**
 * Online Capacitor only — shows Live / Online (no Sync). Desktop Electron UI untouched.
 */
import React, { useEffect, useState } from 'react';
import { Cloud, WifiOff } from 'lucide-react';
import { isServiceCloudMobile } from './mode';

export function ServiceCloudLiveBadge({ collapsed }: { collapsed?: boolean }) {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!isServiceCloudMobile()) return null;

  if (collapsed) {
    return (
      <div
        className={`flex justify-center py-1 ${online ? 'text-sky-600' : 'text-rose-500'}`}
        title={online ? 'Live · Online — one session at a time' : 'No internet'}
      >
        {online ? <Cloud size={18} /> : <WifiOff size={18} />}
      </div>
    );
  }

  return (
    <div className="px-0.5">
      <button
        type="button"
        onClick={() => setHintOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-lg text-left text-[12px] font-semibold border ${
          online ? 'bg-sky-50 text-sky-800 border-sky-100' : 'bg-rose-50 text-rose-700 border-rose-100'
        }`}
      >
        {online ? <Cloud size={16} className="shrink-0" /> : <WifiOff size={16} className="shrink-0" />}
        <span className="truncate">{online ? 'Live · Online' : 'No internet'}</span>
      </button>
      {hintOpen && (
        <p className="mt-1.5 px-1 text-[11px] text-gray-500 leading-snug">
          Service Cloud needs internet. Only one person can use the company app at a time — others see In use until you
          leave or idle out.
        </p>
      )}
    </div>
  );
}
