import React, { useState } from 'react';
import { Scale, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  EWB_INTERSTATE_THRESHOLD_INR,
  EWB_MAX_DOC_AGE_DAYS,
  EWB_MAX_DISTANCE_KM,
  EWB_MAX_TOTAL_VALIDITY_DAYS,
  EWB_VALIDITY_KM_ODC,
  EWB_VALIDITY_KM_REGULAR,
  GST_CANCEL_WINDOW_HOURS,
  EWB_REJECT_WINDOW_HOURS,
  EWB_EXTENSION_WINDOW_HOURS,
} from '../../../shared/gstEwbValidation';

export function GstComplianceRulesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-semibold text-sm text-amber-950">
          <Scale size={16} className="shrink-0 text-amber-700" />
          GST rules reference (2025–26)
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-amber-700 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="px-4 pb-4 space-y-4 border-t border-amber-100 text-sm text-amber-950/90">
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-2">
              When E-Way Bill is needed
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed">
              <li>
                <strong>Interstate:</strong> consignment value above ₹
                {EWB_INTERSTATE_THRESHOLD_INR.toLocaleString('en-IN')} (incl. tax).
              </li>
              <li>
                <strong>Intrastate:</strong> varies by state (e.g. MH/DL often ₹1,00,000; WB ₹50,000; RJ up to ₹2,00,000
                in-city). Check notifications on ewaybillgst.gov.in.
              </li>
            </ul>
          </section>
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-2">
              Validity (portal enforces)
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed">
              <li>
                Regular cargo: <strong>1 day per {EWB_VALIDITY_KM_REGULAR} km</strong> (or part thereof).
              </li>
              <li>
                ODC: <strong>1 day per {EWB_VALIDITY_KM_ODC} km</strong>.
              </li>
              <li>Clock starts when Part B (vehicle) is updated on the portal.</li>
              <li>
                Extension: only <strong>{EWB_EXTENSION_WINDOW_HOURS} hours before or after</strong> expiry.
              </li>
              <li>
                Max total life incl. extensions: <strong>{EWB_MAX_TOTAL_VALIDITY_DAYS} days</strong> (from Jan 2025).
              </li>
              <li>
                Invoice/challan age: max <strong>{EWB_MAX_DOC_AGE_DAYS} days</strong> for new E-Way (from Jan 2025).
              </li>
            </ul>
          </section>
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-2">Cancellation</p>
            <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed">
              <li>
                <strong>E-Way Bill:</strong> generator may cancel within{' '}
                <strong>{GST_CANCEL_WINDOW_HOURS} hours</strong>. After cancel, you{' '}
                <strong>can generate a new E-Way on the same invoice number</strong>.
              </li>
              <li>
                <strong>E-Invoice (IRN):</strong> cancel within <strong>{GST_CANCEL_WINDOW_HOURS} hours</strong>. Cancel
                active E-Way first. <strong>Same invoice number cannot get a new IRN</strong> — void bill and use a new
                number.
              </li>
              <li>Recipient may reject E-Way within {EWB_REJECT_WINDOW_HOURS} hours.</li>
              <li>Cannot cancel if verified by officer in transit.</li>
            </ul>
          </section>
          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-2">
              Manual (Portal) mode in Dhandho
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
              <li>Download JSON → upload on government portal.</li>
              <li>Download response JSON → Import response (IRN, Signed QR, EWB auto-filled).</li>
              <li>Cancel on portal within 24h, then use Clear filing or import new response.</li>
            </ol>
          </section>
          <section className="rounded-lg border border-amber-100 bg-white/70 px-3 py-2.5 text-xs leading-relaxed">
            <strong>Signed QR</strong> always comes from the portal response — Dhandho renders it on print; it cannot be
            generated locally. Max distance hint in JSON: {EWB_MAX_DISTANCE_KM} km.
          </section>
        </div>
      ) : null}
    </div>
  );
}
