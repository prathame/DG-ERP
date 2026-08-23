import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EWB_CANCEL_REASONS, IRN_CANCEL_REASONS } from '../../../shared/gstEwbValidation';

export function GstCancelGstModal({
  open,
  kind,
  saving,
  hasEwb,
  onClose,
  onConfirm,
}: {
  open: boolean;
  kind: 'irn' | 'ewb';
  saving: boolean;
  hasEwb?: boolean;
  onClose: () => void;
  onConfirm: (reason: number, remark: string) => void;
}) {
  const [reason, setReason] = useState(kind === 'irn' ? 2 : 3);
  const [remark, setRemark] = useState('');

  if (!open) return null;

  const reasons = kind === 'irn' ? IRN_CANCEL_REASONS : EWB_CANCEL_REASONS;
  const title = kind === 'irn' ? 'Cancel E-Invoice (IRN)' : 'Cancel E-Way Bill';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-red-700">
          <AlertTriangle size={18} /> {title}
        </h3>
        <p className="text-xs text-gray-600 mb-3">
          Government rule: cancel within <strong>24 hours</strong> of generation. Only the party who generated it can
          cancel. Cannot cancel if verified in transit.
        </p>
        {kind === 'irn' && hasEwb ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Cancel the <strong>E-Way Bill first</strong>, then cancel IRN. After IRN cancel, this invoice number cannot
            receive a new IRN — create a new invoice number.
          </p>
        ) : null}
        {kind === 'ewb' ? (
          <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mb-3">
            After cancel, you <strong>can generate a new E-Way Bill on the same invoice</strong>.
          </p>
        ) : null}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Reason *</label>
            <select
              value={reason}
              onChange={e => setReason(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            >
              {reasons.map(r => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Remarks</label>
            <input
              value={remark}
              onChange={e => setRemark(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
              placeholder="Optional note"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
          >
            Back
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onConfirm(reason, remark.trim())}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? 'Cancelling…' : 'Confirm cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
