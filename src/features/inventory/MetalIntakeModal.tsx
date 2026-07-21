import React, { useEffect, useState } from 'react';
import { Scale, X, Printer } from 'lucide-react';
import { api } from '../../api';
import type { Product } from '../../types';
import { useToast } from '../../components/ui';
import { isWebSerialSupported, parseScaleText, readWeightFromSerial } from '../../lib/scaleBridge';
import { computeFineWeight, computeMakingAmount, computeMetalSalePrice } from '../../../shared/metal';
import { cn } from '../../lib/utils';

type IntakeResult = {
  barcode: string;
  productId: string;
  productName: string;
  netWeight: number;
  purity: number;
  fineWeight: number;
  suggestedPrice: number;
};

export function MetalIntakeModal({
  products,
  onClose,
  onCreated,
}: {
  products: Product[];
  onClose: () => void;
  onCreated: (result: IntakeResult) => void;
}) {
  const { toast } = useToast();
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [grossWeight, setGrossWeight] = useState('');
  const [netWeight, setNetWeight] = useState('');
  const [purity, setPurity] = useState('925');
  const [makingRate, setMakingRate] = useState('');
  const [metalRate, setMetalRate] = useState('');
  const [huid, setHuid] = useState('');
  const [barcodePrefix, setBarcodePrefix] = useState('AG');
  const [wedgeBuffer, setWedgeBuffer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [readingScale, setReadingScale] = useState(false);

  useEffect(() => {
    const p = products.find(x => x.id === productId);
    if (p && !metalRate) setMetalRate(String(p.price ?? ''));
  }, [productId, products]);

  const net = parseFloat(netWeight || grossWeight) || 0;
  const pur = parseFloat(purity) || 0;
  const fine = computeFineWeight(net, pur);
  const mRate = parseFloat(makingRate) || 0;
  const makingAmt = computeMakingAmount(net, mRate);
  const rate = parseFloat(metalRate) || 0;
  const suggested = computeMetalSalePrice(net, rate, makingAmt);

  const applyWeight = (grams: number, source: string) => {
    const v = String(grams);
    setGrossWeight(v);
    setNetWeight(v);
    toast(`Weight from ${source}: ${grams} g`, 'success');
  };

  const handleReadScale = async () => {
    setReadingScale(true);
    try {
      const reading = await readWeightFromSerial();
      applyWeight(reading.weight, 'scale');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Scale read failed', 'error');
    } finally {
      setReadingScale(false);
    }
  };

  const handleWedgeApply = () => {
    const parsed = parseScaleText(wedgeBuffer);
    if (!parsed || parsed.weight <= 0) {
      toast('Could not parse weight from scale text', 'error');
      return;
    }
    applyWeight(parsed.weight, 'wedge');
    setWedgeBuffer('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      toast('Select a product / design', 'error');
      return;
    }
    if (net <= 0) {
      toast('Enter a valid net weight', 'error');
      return;
    }
    setSubmitting(true);
    api.metal
      .intake({
        productId,
        grossWeight: parseFloat(grossWeight) || net,
        netWeight: net,
        purity: pur,
        makingRate: mRate || undefined,
        metalRate: rate || undefined,
        huid: huid.trim() || undefined,
        barcodePrefix: barcodePrefix.trim() || 'AG',
      })
      .then(result => {
        toast(`Tagged ${result.barcode}`, 'success');
        onCreated(result);
      })
      .catch(err => toast(err instanceof Error ? err.message : 'Intake failed', 'error'))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Metal Intake</h2>
            <p className="text-xs text-gray-500">Weigh → barcode → jewellery tag</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Product / Design</label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
              required
            >
              {products.length === 0 && <option value="">No products — create one first</option>}
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.price != null ? `(₹${p.price}/g)` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Gross (g)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={grossWeight}
                onChange={e => {
                  setGrossWeight(e.target.value);
                  if (!netWeight) setNetWeight(e.target.value);
                }}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                placeholder="0.000"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Net (g)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={netWeight}
                onChange={e => setNetWeight(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                placeholder="0.000"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!isWebSerialSupported() || readingScale}
              onClick={handleReadScale}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border',
                isWebSerialSupported()
                  ? 'border-brand text-brand hover:bg-orange-50'
                  : 'border-gray-200 text-gray-400 cursor-not-allowed',
              )}
            >
              <Scale size={16} />
              {readingScale ? 'Reading…' : 'Read from scale'}
            </button>
            {!isWebSerialSupported() && (
              <span className="text-[11px] text-gray-400 self-center">Web Serial needs Chrome/Edge on HTTPS</span>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Paste scale reading (keyboard wedge)</label>
            <div className="flex gap-2 mt-1">
              <input
                value={wedgeBuffer}
                onChange={e => setWedgeBuffer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleWedgeApply();
                  }
                }}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono"
                placeholder="e.g. 12.450 g"
              />
              <button
                type="button"
                onClick={handleWedgeApply}
                className="px-3 py-2 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Purity (‰)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="1000"
                value={purity}
                onChange={e => setPurity(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Fine (g)</label>
              <input
                readOnly
                value={fine ? fine.toFixed(3) : ''}
                className="w-full mt-1 px-3 py-2.5 border border-gray-100 rounded-xl text-sm bg-gray-50 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Metal rate ₹/g</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={metalRate}
                onChange={e => setMetalRate(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Making ₹/g</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={makingRate}
                onChange={e => setMakingRate(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Barcode prefix</label>
              <input
                value={barcodePrefix}
                onChange={e => setBarcodePrefix(e.target.value.toUpperCase())}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">HUID (optional)</label>
              <input
                value={huid}
                onChange={e => setHuid(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono"
              />
            </div>
          </div>

          <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-sm">
            <p className="font-bold text-gray-800">Suggested sale: ₹{suggested.toLocaleString('en-IN')}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {net || 0} g × ₹{rate || 0}/g + making ₹{makingAmt.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !productId}
              className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand-dark disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Printer size={16} />
              {submitting ? 'Saving…' : 'Create barcode'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
