import React from 'react';
import { Download, FileText, Package, ArrowRight } from 'lucide-react';

export type PortalFilingKind = 'invoice' | 'combined';

type Props = {
  open: boolean;
  generating: boolean;
  filingKind: PortalFilingKind;
  onFilingKindChange: (k: PortalFilingKind) => void;
  onClose: () => void;
  onDownloadInvoiceOnly: () => void;
  onContinueCombined: () => void;
  onEwayOnly?: () => void;
  showEwayOnly?: boolean;
};

export function GstPortalFileModal({
  open,
  generating,
  filingKind,
  onFilingKindChange,
  onClose,
  onDownloadInvoiceOnly,
  onContinueCombined,
  onEwayOnly,
  showEwayOnly,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-lg mb-1">File on government portal</h3>
        <p className="text-xs text-gray-500 mb-4">Manual mode — 3 quick steps</p>

        <ol className="text-xs text-gray-600 space-y-1.5 mb-5 bg-gray-50 border border-gray-100 rounded-xl p-3">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
              1
            </span>
            Download JSON from Dhandho
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
              2
            </span>
            Upload on <strong className="font-semibold">einvoice1.gst.gov.in</strong>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
              3
            </span>
            Click <strong className="font-semibold">Import response</strong> with the portal JSON
          </li>
        </ol>

        <p className="text-xs font-bold text-gray-400 uppercase mb-2">What are you filing?</p>
        <div className="space-y-2 mb-5">
          <button
            type="button"
            onClick={() => onFilingKindChange('combined')}
            className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${
              filingKind === 'combined' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <Package size={18} className="text-teal-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Invoice + E-Way (recommended)</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Goods are moving. One JSON → one upload → IRN and E-Way together.
                </p>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onFilingKindChange('invoice')}
            className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${
              filingKind === 'invoice' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <FileText size={18} className="text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Invoice only</p>
                <p className="text-[11px] text-gray-500 mt-0.5">No goods movement — E-Invoice (IRN) only.</p>
              </div>
            </div>
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
          >
            Cancel
          </button>
          {filingKind === 'invoice' ? (
            <button
              type="button"
              onClick={onDownloadInvoiceOnly}
              disabled={generating}
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Download size={14} />
              {generating ? 'Downloading…' : 'Download JSON'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onContinueCombined}
              disabled={generating}
              className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              Transport details
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        {showEwayOnly && onEwayOnly ? (
          <button
            type="button"
            onClick={onEwayOnly}
            className="w-full mt-3 text-[11px] text-gray-400 hover:text-teal-600 underline"
          >
            Advanced: E-Way only JSON (ewaybillgst.gov.in — use if IRN already filed)
          </button>
        ) : null}
      </div>
    </div>
  );
}
