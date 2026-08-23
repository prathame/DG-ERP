import React, { useState } from 'react';
import { Info } from 'lucide-react';

export function GstPortalClearFilingModal({
  open,
  saving,
  hasIrn,
  hasEwb,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  hasIrn: boolean;
  hasEwb: boolean;
  onClose: () => void;
  onConfirm: (scope: 'irn' | 'ewb' | 'all') => void;
}) {
  const [scope, setScope] = useState<'ewb' | 'irn' | 'all'>('ewb');

  if (!open) return null;

  const options: { value: 'ewb' | 'irn' | 'all'; label: string; hint: string; disabled?: boolean }[] = [
    {
      value: 'ewb',
      label: 'E-Way Bill only',
      hint: 'Use after cancelling EWB on ewaybillgst.gov.in — same invoice can get a new E-Way.',
      disabled: !hasEwb,
    },
    {
      value: 'irn',
      label: 'E-Invoice (IRN) only',
      hint: 'Clears IRN + Signed QR in Dhandho. Cancel active E-Way on portal first if linked. Same invoice number cannot get a new IRN.',
      disabled: !hasIrn,
    },
    {
      value: 'all',
      label: 'Both IRN and E-Way',
      hint: 'Clears everything stored in Dhandho after you cancelled on the government portal.',
      disabled: !hasIrn && !hasEwb,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-indigo-800">
          <Info size={18} /> Clear filing (Manual / Portal mode)
        </h3>
        <p className="text-xs text-gray-600 mb-3">
          In <strong>Manual mode</strong>, cancellation happens on the <strong>government portal first</strong> (within
          24 hours). This button only removes the stored IRN / EWB / QR from Dhandho so you can re-import or re-file.
        </p>
        <ol className="text-xs text-gray-600 space-y-1.5 mb-4 list-decimal list-inside bg-gray-50 rounded-xl px-3 py-2.5">
          <li>
            <strong>E-Way:</strong> ewaybillgst.gov.in → Cancel E-Way Bill → then clear here → generate/import new EWB
            on same invoice.
          </li>
          <li>
            <strong>E-Invoice:</strong> einvoice1.gst.gov.in → Cancel IRN (cancel EWB first if linked) → clear here →
            use a <strong>new invoice number</strong> to file again.
          </li>
        </ol>
        <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">What to clear in Dhandho?</p>
        <div className="space-y-2">
          {options.map(o => (
            <label
              key={o.value}
              className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${o.disabled ? 'opacity-40 cursor-not-allowed' : scope === o.value ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}`}
            >
              <input
                type="radio"
                name="clear-scope"
                value={o.value}
                disabled={o.disabled}
                checked={scope === o.value}
                onChange={() => setScope(o.value)}
                className="mt-0.5"
              />
              <span>
                <span className="text-sm font-semibold block">{o.label}</span>
                <span className="text-xs text-gray-500">{o.hint}</span>
              </span>
            </label>
          ))}
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
            disabled={saving || options.every(o => o.disabled)}
            onClick={() => onConfirm(scope)}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? 'Clearing…' : 'Clear from Dhandho'}
          </button>
        </div>
      </div>
    </div>
  );
}
