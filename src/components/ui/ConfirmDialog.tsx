import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const btnCls = variant === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : variant === 'warning' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand hover:bg-brand-dark';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4" onClick={onCancel}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className={cn("p-2 rounded-xl shrink-0", variant === 'danger' ? 'bg-rose-100' : variant === 'warning' ? 'bg-amber-100' : 'bg-blue-100')}>
            <AlertTriangle size={20} className={variant === 'danger' ? 'text-rose-600' : variant === 'warning' ? 'text-amber-600' : 'text-blue-600'} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm hover:bg-gray-50">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={cn("flex-1 py-2.5 text-white rounded-xl font-bold text-sm", btnCls)}>{confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
