import React, { useState, createContext, useContext, useCallback } from 'react';
import { AlertCircle, CheckCircle2, X, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; type: ToastType };

const TOAST_DURATION = 4000;

export const ToastContext = createContext<{ toast: (message: string, type?: ToastType) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

function ToastItem({ t, onDismiss }: { key?: React.Key; t: Toast; onDismiss: () => void }) {
  return (
    <div
      className={cn(
        'dg-toast-enter relative px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 overflow-hidden pr-9',
        t.type === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
        t.type === 'error' && 'bg-rose-50 border-rose-200 text-rose-800',
        t.type === 'info' && 'bg-blue-50 border-blue-200 text-blue-800',
      )}
    >
      {t.type === 'success' && <CheckCircle2 size={18} className="shrink-0" />}
      {t.type === 'error' && <AlertCircle size={18} className="shrink-0" />}
      {t.type === 'info' && <Info size={18} className="shrink-0" />}
      <span className="flex-1">{t.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 rounded-md opacity-50 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
      {/* Progress bar — CSS so ToastProvider stays off the motion cold path */}
      <div
        className={cn(
          'dg-toast-progress absolute bottom-0 left-0 right-0 h-[3px] origin-left',
          t.type === 'success' && 'bg-emerald-400',
          t.type === 'error' && 'bg-rose-400',
          t.type === 'info' && 'bg-blue-400',
        )}
      />
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;
  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId + Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), TOAST_DURATION);
  }, []);
  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed right-3 sm:right-4 z-[200] flex flex-col gap-2 max-w-[min(100vw-1.5rem,24rem)] w-full pointer-events-none [&_*]:pointer-events-auto"
        style={{ top: 'max(0.75rem, var(--safe-top))' }}
      >
        {toasts.map(t => (
          <ToastItem key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
