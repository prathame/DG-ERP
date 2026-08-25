import React, { useState } from 'react';
import { Truck, ExternalLink } from 'lucide-react';
import { useToast } from '../ui';
import { isSixDigitPin, openGstPinDistanceLookup } from '../../lib/pincode';
import {
  EWB_DOC_TYPES,
  EWB_SUB_SUPPLY_TYPES,
  EWB_VEHICLE_TYPES,
  INDIAN_STATES,
  fmtEwbDocDate,
} from '../../../shared/ewbFormOptions';

export type EwbFormState = {
  dispatchMasterRequired: boolean;
  dispatchFromState: string;
  transportMode: string;
  subSupplyType: string;
  docType: string;
  transporterName: string;
  distance: string;
  transDocNo: string;
  transDocDate: string;
  vehicleNo: string;
  vehicleType: string;
  transporterId: string;
};

export const defaultEwbForm = (sellerGstin?: string): EwbFormState => ({
  dispatchMasterRequired: false,
  dispatchFromState: sellerGstin ? sellerGstin.slice(0, 2) : '24',
  transportMode: '1',
  subSupplyType: 'Supply',
  docType: 'INV',
  transporterName: '',
  distance: '',
  transDocNo: '',
  transDocDate: fmtEwbDocDate(new Date().toISOString().slice(0, 10)),
  vehicleNo: '',
  vehicleType: 'R',
  transporterId: '',
});

type Props = {
  open: boolean;
  title?: string;
  generating: boolean;
  form: EwbFormState;
  onChange: (next: EwbFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  fromPin?: string;
  toPin?: string;
  sellerGstin?: string;
  showIrnHint?: boolean;
  submitLabel?: string;
  portalHint?: string;
};

export function EwbGenerateModal({
  open,
  title = 'E-Way Bill details',
  generating,
  form,
  onChange,
  onClose,
  onSubmit,
  fromPin,
  toPin,
  showIrnHint,
  submitLabel,
  portalHint,
}: Props) {
  const { toast } = useToast();
  const [lookingUp, setLookingUp] = useState(false);
  const isRoad = form.transportMode === '1';
  const canLookupPins = isSixDigitPin(fromPin) && isSixDigitPin(toPin);

  if (!open) return null;

  async function lookupDistance() {
    if (!canLookupPins) {
      toast('Seller and buyer pincodes required for GST PIN distance', 'error');
      return;
    }
    setLookingUp(true);
    try {
      const r = await openGstPinDistanceLookup(fromPin, toPin);
      toast(
        r.copied
          ? `Copied ${r.fromPin} → ${r.toPin}. Paste From/To on the GST page, then enter km here (or leave 0).`
          : `Opened GST PIN distance. From ${fromPin} To ${toPin} — enter km here (or leave 0).`,
        'success',
      );
    } finally {
      setLookingUp(false);
    }
  }

  const lbl = 'text-xs font-bold text-gray-400 uppercase block mb-1';
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Truck size={20} className="text-teal-600" /> {title}
        </h3>
        {showIrnHint ? (
          <p className="text-xs text-gray-500 mb-3">E-Way bill will be linked to the existing E-Invoice IRN.</p>
        ) : null}
        {portalHint ? <p className="text-[10px] text-gray-400 mb-3">{portalHint}</p> : null}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Dispatch master required</label>
              <select
                value={form.dispatchMasterRequired ? 'yes' : 'no'}
                onChange={e => onChange({ ...form, dispatchMasterRequired: e.target.value === 'yes' })}
                className={inp}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Dispatch from {form.dispatchMasterRequired ? '*' : ''}</label>
              <select
                value={form.dispatchFromState}
                onChange={e => onChange({ ...form, dispatchFromState: e.target.value })}
                disabled={!form.dispatchMasterRequired}
                className={inp + (form.dispatchMasterRequired ? '' : ' opacity-60')}
              >
                {INDIAN_STATES.map(s => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Mode of transportation *</label>
              <select
                value={form.transportMode}
                onChange={e => onChange({ ...form, transportMode: e.target.value })}
                className={inp}
              >
                <option value="1">Road</option>
                <option value="2">Rail</option>
                <option value="3">Air</option>
                <option value="4">Ship</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Sub type *</label>
              <select
                value={form.subSupplyType}
                onChange={e => onChange({ ...form, subSupplyType: e.target.value })}
                className={inp}
              >
                {EWB_SUB_SUPPLY_TYPES.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>Doc type *</label>
            <select value={form.docType} onChange={e => onChange({ ...form, docType: e.target.value })} className={inp}>
              {EWB_DOC_TYPES.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Transporter name *</label>
            <input
              value={form.transporterName}
              onChange={e => onChange({ ...form, transporterName: e.target.value })}
              className={inp}
              placeholder="Transporter / logistics company"
            />
          </div>
          <div>
            <label className={lbl}>Transporter ID (GSTIN)</label>
            <input
              value={form.transporterId}
              onChange={e => onChange({ ...form, transporterId: e.target.value.toUpperCase() })}
              className={inp + ' font-mono'}
              placeholder="Optional transporter GSTIN"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className={lbl + ' mb-0'}>Distance (km) *</label>
              <button
                type="button"
                onClick={() => void lookupDistance()}
                disabled={lookingUp || !canLookupPins}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline disabled:opacity-50"
              >
                <ExternalLink size={12} /> {lookingUp ? 'Opening…' : 'GST PIN distance'}
              </button>
            </div>
            <input
              type="number"
              value={form.distance}
              onChange={e => onChange({ ...form, distance: e.target.value })}
              className={inp}
              placeholder="0 = GST official PIN-to-PIN"
              min="0"
            />
            {canLookupPins ? (
              <p className="text-[10px] text-gray-400 mt-1 font-mono">
                {fromPin} → {toPin} on einvoice1.gst.gov.in
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-1">
                Add seller and buyer 6-digit PINs, then open the GST PIN-to-PIN page. Distance 0 uses the same official
                figure.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Transporter doc no *</label>
              <input
                value={form.transDocNo}
                onChange={e => onChange({ ...form, transDocNo: e.target.value })}
                className={inp}
                placeholder="LR / challan no."
              />
            </div>
            <div>
              <label className={lbl}>Transporter doc date *</label>
              <input
                type="date"
                value={form.transDocDate.includes('/') ? '' : form.transDocDate}
                onChange={e => onChange({ ...form, transDocDate: e.target.value })}
                className={inp}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Vehicle no {isRoad ? '*' : ''}</label>
              <input
                value={form.vehicleNo}
                onChange={e => onChange({ ...form, vehicleNo: e.target.value.toUpperCase() })}
                className={inp + ' font-mono'}
                placeholder={isRoad ? 'GJ01AB1234' : 'If applicable'}
              />
            </div>
            <div>
              <label className={lbl}>Vehicle type</label>
              <select
                value={form.vehicleType}
                onChange={e => onChange({ ...form, vehicleType: e.target.value })}
                className={inp}
              >
                {EWB_VEHICLE_TYPES.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={generating}
            className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold disabled:opacity-50"
          >
            {generating ? 'Working…' : submitLabel || 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Build query/body payload for E-Way JSON download and API generation. */
export function ewbFormToTransportPayload(form: EwbFormState) {
  const docDate = form.transDocDate.includes('/')
    ? form.transDocDate
    : fmtEwbDocDate(form.transDocDate || new Date().toISOString().slice(0, 10));
  return {
    vehicleNo: form.vehicleNo.trim().toUpperCase(),
    distance: Number(form.distance) || 0,
    transportMode: form.transportMode,
    transporterName: form.transporterName.trim(),
    transporterId: form.transporterId.trim(),
    transDocNo: form.transDocNo.trim(),
    transDocDate: docDate,
    subSupplyType: form.subSupplyType,
    docType: form.docType,
    vehicleType: form.vehicleType,
    dispatchMasterRequired: form.dispatchMasterRequired,
    dispatchFromState: form.dispatchFromState,
  };
}

export function validateEwbForm(form: EwbFormState): string | null {
  if (!form.transporterName.trim()) return 'Transporter name is required';
  if (form.distance === '' || Number.isNaN(Number(form.distance))) return 'Distance is required';
  if (!form.transDocNo.trim()) return 'Transporter document number is required';
  if (!form.transDocDate.trim()) return 'Transporter document date is required';
  if (form.transportMode === '1' && !form.vehicleNo.trim()) return 'Vehicle number is required for road transport';
  if (form.dispatchMasterRequired && !form.dispatchFromState) return 'Dispatch from state is required';
  return null;
}
