import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { cn } from '../lib/utils';

// ============ TOAST SYSTEM ============
type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type: ToastType };

export const ToastContext = createContext<{ toast: (message: string, type?: ToastType) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;
  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId + Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              className={cn(
                "px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2",
                t.type === 'success' && "bg-emerald-50 border-emerald-200 text-emerald-800",
                t.type === 'error' && "bg-rose-50 border-rose-200 text-rose-800",
                t.type === 'info' && "bg-blue-50 border-blue-200 text-blue-800"
              )}
            >
              {t.type === 'success' && <CheckCircle2 size={18} />}
              {t.type === 'error' && <AlertCircle size={18} />}
              {t.type === 'info' && <AlertCircle size={18} />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ============ LOADING SPINNER ============
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <div className="w-5 h-5 border-2 border-[#F27D26] border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-500">Loading...</span>
    </div>
  );
}

// ============ DATE RANGE FILTER ============
export function DateRangeFilter({ value, onChange }: { value: { range: string; from: string; to: string }; onChange: (v: { range: string; from: string; to: string }) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {['all', 'today', 'week', 'month'].map((r) => (
        <button key={r} type="button" onClick={() => onChange({ range: r, from: '', to: '' })} className={cn("px-3 py-1.5 text-xs font-bold rounded-full transition-colors", value.range === r ? "bg-[#F27D26] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
          {r === 'all' ? 'All' : r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
        </button>
      ))}
      <button type="button" onClick={() => onChange({ ...value, range: 'custom' })} className={cn("px-3 py-1.5 text-xs font-bold rounded-full transition-colors", value.range === 'custom' ? "bg-[#F27D26] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>Custom</button>
      {value.range === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" />
        </div>
      )}
    </div>
  );
}

// ============ PAGINATION ============
export function PaginationControls({ page, totalPages, total, onPageChange }: { page: number; totalPages: number; total: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-100">
      <span className="text-xs text-gray-500">{total} records &middot; Page {page} of {totalPages}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const start = Math.max(1, Math.min(page - 2, totalPages - 4));
          const p = start + i;
          if (p > totalPages) return null;
          return <button key={p} type="button" onClick={() => onPageChange(p)} className={cn("px-3 py-1.5 text-xs font-medium rounded-lg", p === page ? "bg-[#F27D26] text-white" : "bg-white border border-gray-200 hover:bg-gray-50")}>{p}</button>;
        })}
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );
}

// ============ DEBOUNCE HOOK ============
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
