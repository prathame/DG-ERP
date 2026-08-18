import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { api } from '../../api';
import type { Product } from '../../types';
import { useToast } from './Toast';
import { suggestHsnRate } from '../../lib/hsnRates';
import { pushAndroidBackHandler } from '../../lib/androidBackStack';

/** Compact catalog create for Invoice / Record Sale — no barcode prefix. */
export function QuickAddProductModal({
  initialName = '',
  initialPrice = '',
  defaultGstRate = 18,
  onClose,
  onCreated,
}: {
  initialName?: string;
  initialPrice?: string;
  defaultGstRate?: number;
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const { toast } = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(initialPrice);
  const [qty, setQty] = useState('1');
  const [hsnCode, setHsnCode] = useState('');
  const [gstRate, setGstRate] = useState(defaultGstRate);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    const unreg = pushAndroidBackHandler(() => {
      onClose();
      return true;
    });
    return () => {
      document.removeEventListener('keydown', onKey, true);
      unreg();
    };
  }, [onClose]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast('Enter a product name', 'error');
      return;
    }
    const quantity = Math.min(Math.max(1, Math.floor(Number(qty) || 1)), 500);
    const rate = Number(price);
    if (!Number.isFinite(rate) || rate < 0) {
      toast('Enter a valid price', 'error');
      return;
    }
    const hsn = hsnCode.replace(/\s/g, '');
    if (hsn && !/^\d{4}(\d{2})?(\d{2})?$/.test(hsn)) {
      toast('HSN must be 4, 6, or 8 digits', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.products.create({
        name: trimmed,
        price: rate,
        gstRate,
        hsnCode: hsn || undefined,
        barcodeMode: 'auto',
        quantity,
        stock: quantity,
      });
      toast('Product added', 'success');
      onCreated(created);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 10100 }}
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-product-title"
        className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="quick-add-product-title" className="text-lg font-bold mb-1">
          Add product
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Saved to inventory. Opening qty becomes InStock barcodes so you can sell or bill it now.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Name</label>
            <input
              ref={nameRef}
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
              placeholder="Product name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Opening qty</label>
              <input
                type="number"
                min={1}
                max={500}
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">HSN (optional)</label>
              <input
                value={hsnCode}
                onChange={e => {
                  const v = e.target.value;
                  const hint = suggestHsnRate(v);
                  setHsnCode(v);
                  if (hint) setGstRate(hint.rate);
                }}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg font-mono focus:ring-2 focus:ring-brand"
                placeholder="8413"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">GST %</label>
              <input
                type="number"
                min={0}
                max={40}
                value={gstRate}
                onChange={e => setGstRate(Number(e.target.value) || 0)}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void save()}
            className="flex-1 py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save product'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
