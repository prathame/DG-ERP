import React, { useState } from 'react';
import { Truck, Search } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../ui';

export type EwbFormState = {
  vehicleNo: string;
  distance: string;
  transportMode: string;
  transporterName: string;
  transporterId: string;
  transDocNo: string;
  transDocDate: string;
};

export const defaultEwbForm = (): EwbFormState => ({
  vehicleNo: '',
  distance: '',
  transportMode: '1',
  transporterName: '',
  transporterId: '',
  transDocNo: '',
  transDocDate: new Date().toISOString().slice(0, 10),
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
  showIrnHint?: boolean;
};

export function EwbGenerateModal({
  open,
  title = 'Generate E-Way Bill',
  generating,
  form,
  onChange,
  onClose,
  onSubmit,
  fromPin,
  toPin,
  showIrnHint,
}: Props) {
  const { toast } = useToast();
  const [lookingUp, setLookingUp] = useState(false);

  if (!open) return null;

  async function lookupDistance() {
    if (!fromPin || !toPin) {
      toast('Seller and buyer pincodes required for distance lookup', 'error');
      return;
    }
    setLookingUp(true);
    try {
      const r = await api.gst.lookupDistance({ fromPin, toPin });
      if (!(r.distanceKm > 0)) {
        toast('Could not estimate distance — enter manually', 'error');
        return;
      }
      onChange({ ...form, distance: String(r.distanceKm) });
      toast(`Distance ${r.distanceKm} km (${fromPin} → ${toPin})`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Distance lookup failed', 'error');
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
          <Truck size={20} className="text-teal-600" /> {title}
        </h3>
        {showIrnHint ? (
          <p className="text-xs text-gray-500 mb-3">E-Way bill will be linked to the existing E-Invoice IRN.</p>
        ) : null}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Transport mode</label>
            <select
              value={form.transportMode}
              onChange={e => onChange({ ...form, transportMode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            >
              <option value="1">Road</option>
              <option value="2">Rail</option>
              <option value="3">Air</option>
              <option value="4">Ship</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vehicle no *</label>
            <input
              value={form.vehicleNo}
              onChange={e => onChange({ ...form, vehicleNo: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-sm"
              placeholder="GJ01AB1234"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-xs font-bold text-gray-400 uppercase">Distance (km) *</label>
              {fromPin && toPin ? (
                <button
                  type="button"
                  onClick={() => void lookupDistance()}
                  disabled={lookingUp}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline disabled:opacity-50"
                >
                  <Search size={12} /> {lookingUp ? 'Looking…' : 'Pin-to-pin'}
                </button>
              ) : null}
            </div>
            <input
              type="number"
              value={form.distance}
              onChange={e => onChange({ ...form, distance: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
              placeholder="150"
              min="1"
            />
            {fromPin && toPin ? (
              <p className="text-[10px] text-gray-400 mt-1">
                {fromPin} → {toPin}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Transporter</label>
              <input
                value={form.transporterName}
                onChange={e => onChange({ ...form, transporterName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Transporter ID</label>
              <input
                value={form.transporterId}
                onChange={e => onChange({ ...form, transporterId: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl font-mono text-sm"
                placeholder="GSTIN / ID"
              />
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
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
