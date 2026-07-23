import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import type { Product, Vendor } from '../../types';
import { useToast } from '../../components/ui';
import { session } from '../../lib/session';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { isGstBillingEnabled } from '../../lib/billSettingsFlags';
import {
  adjustUnitPriceForGstToggle,
  displayUnitPriceForGst,
  linePricesAfterDiscount,
} from '../../lib/gstInclusivePrice';
import { deliveryPrintAvailability, printDistributionDocs } from '../../lib/printDistributionDocs';
import { shareDistributionDocsWhatsApp } from '../../lib/shareDistributionWhatsApp';
import { whatsAppInvoiceShareToast } from '../../lib/printStandaloneInvoice';
import type { DistributionBillData, DistributionBatch } from '../../api';

type DistRow = {
  productId: string;
  quantity: number;
  discount: number;
  withGst: boolean;
  customPrice: string;
};

const emptyRow = (withGst = true): DistRow => ({
  productId: '',
  quantity: 1,
  discount: 0,
  withGst,
  customPrice: '',
});

/**
 * Shared Record Sale / Distribute-to-vendor create flow.
 * Used by Sales (DistributionView) and non-service Invoices.
 */
export function CreateDistributionModal({
  onClose,
  onCreated,
  businessType = 'manufacturer',
  defaultGstRate = 18,
  initialVendorId,
}: {
  onClose: () => void;
  onCreated: () => void;
  businessType?: string;
  defaultGstRate?: number;
  /** Optional pre-selected vendor/customer */
  initialVendorId?: string;
}) {
  const { toast } = useToast();
  const isDirectSell = businessType === 'dealer' || businessType === 'retail' || businessType === 'silver_casting';
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [distVendorId, setDistVendorId] = useState(initialVendorId || '');
  const [distDate, setDistDate] = useState(new Date().toISOString().slice(0, 10));
  const [defaultWithGst, setDefaultWithGst] = useState(() => isGstBillingEnabled(null));
  const [distRows, setDistRows] = useState<DistRow[]>(() => [emptyRow(isGstBillingEnabled(null))]);
  const [distAmountPaid, setDistAmountPaid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [created, setCreated] = useState<{
    batch: DistributionBatch;
    bill: DistributionBillData;
  } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const headerGstRef = useRef<HTMLInputElement>(null);

  useEscapeKey(() => {
    if (created) {
      finishCreated();
      return true;
    }
    onClose();
    return true;
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([api.products.list(), api.vendors.list(), api.settings.getBillSettings().catch(() => null)])
      .then(([p, v, s]) => {
        setProducts(Array.isArray(p) ? p : []);
        setVendors(Array.isArray(v) ? v : []);
        const on = isGstBillingEnabled(s);
        setDefaultWithGst(on);
        setDistRows(prev => prev.map(r => (r.productId ? r : { ...r, withGst: on })));
      })
      .catch(() => {
        setProducts([]);
        setVendors([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const allGst = distRows.length > 0 && distRows.every(r => r.withGst);
  const someGst = distRows.some(r => r.withGst);
  useEffect(() => {
    if (headerGstRef.current) headerGstRef.current.indeterminate = someGst && !allGst;
  }, [someGst, allGst]);

  const addDistRow = () => setDistRows(rows => [...rows, emptyRow(defaultWithGst)]);
  const removeDistRow = (idx: number) => setDistRows(rows => rows.filter((_, i) => i !== idx));
  const updateDistRow = (idx: number, field: string, value: string | number | boolean) =>
    setDistRows(prev => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  const rowGstRate = (p?: Product) => p?.gstRate ?? defaultGstRate;

  const setAllWithGst = (on: boolean) =>
    setDistRows(prev =>
      prev.map(r => {
        const p = products.find(x => x.id === r.productId);
        const rate = rowGstRate(p);
        const current = r.customPrice ? parseFloat(r.customPrice) : (p?.price ?? 0);
        const nextPrice = adjustUnitPriceForGstToggle(current || 0, {
          prevWithGst: r.withGst,
          nextWithGst: on,
          priceIncludesGst: !!p?.priceIncludesGst,
          gstRate: rate,
        });
        return {
          ...r,
          withGst: on,
          customPrice: r.productId || r.customPrice ? String(nextPrice || '') : r.customPrice,
        };
      }),
    );

  /** Ignore stale resolve responses when vendor/product/qty changes quickly. */
  const resolveTokenRef = useRef<Record<number, number>>({});

  const resolveDistRowPrice = (idx: number, productId: string, vendor: string, quantity: number) => {
    if (!productId || !vendor || quantity <= 0) return;
    const token = (resolveTokenRef.current[idx] = (resolveTokenRef.current[idx] || 0) + 1);
    fetch(
      `/api/price-lists/resolve?productId=${encodeURIComponent(productId)}&vendorId=${encodeURIComponent(vendor)}&quantity=${quantity}`,
      {
        headers: {
          Authorization: `Bearer ${session.getToken()}`,
          'X-Tenant-ID': session.getTenantId() || '',
        },
      },
    )
      .then(r => r.json())
      .then(d => {
        if (resolveTokenRef.current[idx] !== token) return;
        if (!d || typeof d.price !== 'number') return;
        setDistRows(prev => {
          const row = prev[idx];
          if (!row || row.productId !== productId || (row.quantity || 0) !== quantity) return prev;
          const p = products.find(x => x.id === productId);
          const shown = displayUnitPriceForGst(d.price, {
            withGst: row.withGst,
            priceIncludesGst: !!p?.priceIncludesGst,
            gstRate: rowGstRate(p),
          });
          return prev.map((r, i) => (i === idx ? { ...r, customPrice: String(shown) } : r));
        });
      })
      .catch(() => {});
  };

  const rowMoney = (r: DistRow) => {
    const p = products.find(x => x.id === r.productId);
    const rate = rowGstRate(p);
    const unit = r.customPrice
      ? parseFloat(r.customPrice)
      : displayUnitPriceForGst(p?.price ?? 0, {
          withGst: r.withGst,
          priceIncludesGst: !!p?.priceIncludesGst,
          gstRate: rate,
        });
    return linePricesAfterDiscount({
      unitPrice: unit || 0,
      quantity: r.quantity || 0,
      discountPercent: r.discount || 0,
      withGst: r.withGst,
      // Field already stripped when GST off on inclusive products
      priceIncludesGst: !!p?.priceIncludesGst && r.withGst,
      gstRate: rate,
    });
  };

  const distTotals = distRows.reduce(
    (acc, r) => {
      const m = rowMoney(r);
      acc.gross += m.gross;
      acc.discount += m.discount;
      acc.net += m.net;
      acc.gst += m.gst;
      acc.billed += m.billed;
      acc.items += r.quantity || 0;
      return acc;
    },
    { gross: 0, discount: 0, net: 0, gst: 0, billed: 0, items: 0 },
  );

  const finishCreated = () => {
    setCreated(null);
    onCreated();
  };

  const handleDistributeAll = async () => {
    if (!distVendorId) {
      toast(isDirectSell ? 'Select a customer' : 'Select a vendor', 'error');
      return;
    }
    const validRows = distRows.filter(r => r.productId && r.quantity > 0);
    if (validRows.length === 0) {
      toast('Add at least one product', 'error');
      return;
    }
    const paid = parseFloat(distAmountPaid) || 0;
    if (paid > distTotals.billed) {
      toast(`Amount paid (₹${paid}) exceeds billed amount (₹${distTotals.billed})`, 'error');
      return;
    }
    const hasGst = validRows.some(r => r.withGst);
    const hasNon = validRows.some(r => !r.withGst);
    setSubmitting(true);
    try {
      const batch = await api.distribution.createBatch({
        vendorId: distVendorId,
        distributionDate: distDate,
        amountPaid: paid > 0 ? paid : undefined,
        gstRate: defaultGstRate,
        items: validRows.map(row => ({
          productId: row.productId,
          quantity: row.quantity,
          discountPercent: row.discount > 0 ? row.discount : undefined,
          withGst: row.withGst,
          customPrice: row.customPrice ? parseFloat(row.customPrice) : undefined,
        })),
      });
      const bill = await api.distribution.getBill({
        batchId: batch.batchId,
        vendorId: distVendorId,
      });
      if (hasGst && hasNon) {
        toast(
          `Saved as Tax Invoice + Bill of Supply — ${validRows.length} line(s), ${distTotals.items} items`,
          'success',
        );
      } else {
        toast(
          `Distribution saved — ${validRows.length} product line(s), ${distTotals.items} items${
            hasNon && !hasGst ? ' (Bill of Supply)' : ''
          }`,
          'success',
        );
      }
      setCreated({ batch, bill });
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const runPrint = async (kind: 'gst' | 'bos' | 'both') => {
    if (!created) return;
    setPrinting(true);
    try {
      await printDistributionDocs(created.bill, kind, false);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setPrinting(false);
    }
  };

  const runWhatsApp = async (kind: 'gst' | 'bos' | 'both') => {
    if (!created) return;
    setSharing(true);
    try {
      toast('Preparing PDF…', 'info');
      const { how, errorHint } = await shareDistributionDocsWhatsApp(created.bill, kind);
      if (how === 'cancelled') return;
      toast(whatsAppInvoiceShareToast(how, errorHint), how === 'pdf_fallback' ? 'info' : 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSharing(false);
    }
  };

  const printAvail = created ? deliveryPrintAvailability(created.bill) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={created ? finishCreated : onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white w-full max-w-6xl rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
      >
        {created && printAvail ? (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Check size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">{isDirectSell ? 'Sale' : 'Distribution'} saved</h3>
              <p className="text-sm text-gray-500">
                {created.batch.vendorName} · ₹{Number(created.batch.billValue || 0).toLocaleString('en-IN')} ·{' '}
                <span className="font-mono text-xs">{created.batch.batchId}</span>
              </p>
              {printAvail.isDual && (
                <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 mt-3 inline-block">
                  Dual docs: Tax Invoice + Bill of Supply (one delivery)
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {printAvail.hasGst && (
                <button
                  type="button"
                  disabled={printing || sharing}
                  onClick={() => void runPrint('gst')}
                  className="px-4 py-2.5 border border-emerald-300 text-emerald-700 bg-emerald-50 rounded-xl font-bold text-sm hover:bg-emerald-100 disabled:opacity-60"
                >
                  Print Tax Invoice
                </button>
              )}
              {printAvail.hasBos && (
                <button
                  type="button"
                  disabled={printing || sharing}
                  onClick={() => void runPrint('bos')}
                  className="px-4 py-2.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl font-bold text-sm hover:bg-amber-100 disabled:opacity-60"
                >
                  Print Bill of Supply
                </button>
              )}
              {printAvail.isDual && (
                <button
                  type="button"
                  disabled={printing || sharing}
                  onClick={() => void runPrint('both')}
                  className="px-4 py-2.5 bg-brand text-white rounded-xl font-bold text-sm disabled:opacity-60"
                >
                  Print Both
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {printAvail.hasGst && (
                <button
                  type="button"
                  disabled={printing || sharing}
                  onClick={() => void runWhatsApp('gst')}
                  className="px-4 py-2.5 border border-green-300 text-green-700 bg-green-50 rounded-xl font-bold text-sm hover:bg-green-100 disabled:opacity-60"
                >
                  {sharing ? 'Preparing…' : 'WhatsApp Tax Invoice'}
                </button>
              )}
              {printAvail.hasBos && (
                <button
                  type="button"
                  disabled={printing || sharing}
                  onClick={() => void runWhatsApp('bos')}
                  className="px-4 py-2.5 border border-green-300 text-green-700 bg-green-50 rounded-xl font-bold text-sm hover:bg-green-100 disabled:opacity-60"
                >
                  {sharing ? 'Preparing…' : 'WhatsApp Bill of Supply'}
                </button>
              )}
              {printAvail.isDual && (
                <button
                  type="button"
                  disabled={printing || sharing}
                  onClick={() => void runWhatsApp('both')}
                  className="px-4 py-2.5 border border-green-400 text-green-800 bg-green-50 rounded-xl font-bold text-sm hover:bg-green-100 disabled:opacity-60"
                >
                  {sharing ? 'Preparing…' : 'WhatsApp Both PDFs'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={finishCreated}
              className="w-full max-w-xs mx-auto py-2.5 border border-gray-200 rounded-xl font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-bold mb-1">{isDirectSell ? 'Record Sale' : 'Distribute Products to Vendor'}</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add products and set GST per line. Mixed GST / non-GST saves as Tax Invoice + Bill of Supply.
            </p>

            {loading ? (
              <p className="text-sm text-gray-500 py-8 text-center">Loading inventory…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">
                      {isDirectSell ? 'Customer' : 'Vendor'}
                    </label>
                    <select
                      value={distVendorId}
                      onChange={e => {
                        const nextVendor = e.target.value;
                        setDistVendorId(nextVendor);
                        distRows.forEach((row, idx) => {
                          if (row.productId && nextVendor && (row.quantity || 0) > 0) {
                            resolveDistRowPrice(idx, row.productId, nextVendor, row.quantity || 1);
                          }
                        });
                      }}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    >
                      <option value="">{isDirectSell ? 'Select customer' : 'Select vendor'}</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Date</label>
                    <input
                      type="date"
                      value={distDate}
                      onChange={e => setDistDate(e.target.value)}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    />
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto mb-4">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-200">
                        <th className="px-2 py-3 w-8">#</th>
                        <th className="px-2 py-3 min-w-[200px]">Product</th>
                        <th className="px-2 py-3 w-24">Qty</th>
                        <th className="px-2 py-3 w-32">Price (₹)</th>
                        <th className="px-2 py-3 w-20">Disc%</th>
                        <th className="px-2 py-3 w-16 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span>GST</span>
                            <input
                              ref={headerGstRef}
                              type="checkbox"
                              checked={allGst}
                              onChange={e => setAllWithGst(e.target.checked)}
                              className="rounded text-brand"
                              title={allGst ? 'All GST — uncheck for all non-GST' : 'Check for all GST'}
                              aria-label="All GST / All non-GST"
                            />
                          </div>
                        </th>
                        <th className="px-2 py-3 w-36 text-right">Billed (₹)</th>
                        <th className="px-2 py-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {distRows.map((row, idx) => {
                        const p = products.find(x => x.id === row.productId);
                        const packSz = p?.packSize || 1;
                        const isBox = packSz > 1;
                        const m = rowMoney(row);
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <SearchSelect
                                value={row.productId}
                                placeholder="Select product"
                                options={products
                                  .filter(pr => (pr.stock ?? 0) > 0)
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map(pr => {
                                    const ps = pr.packSize || 1;
                                    const isBoxPr = ps > 1;
                                    const rawCount = pr.remainingInventory ?? pr.stock ?? 0;
                                    return {
                                      value: pr.id,
                                      label: `${pr.name} — ₹${pr.price.toLocaleString()}${isBoxPr ? `/${pr.packName || 'Box'}` : ''}`,
                                      sublabel: isBoxPr ? `${rawCount} ${pr.packName || 'Box'}s` : `${rawCount} pcs`,
                                    };
                                  })}
                                onChange={pid => {
                                  const selPr = products.find(x => x.id === pid);
                                  setDistRows(prev =>
                                    prev.map((r, i) => {
                                      if (i !== idx) return r;
                                      if (!selPr) return { ...r, productId: pid };
                                      const shown = displayUnitPriceForGst(selPr.price, {
                                        withGst: defaultWithGst,
                                        priceIncludesGst: !!selPr.priceIncludesGst,
                                        gstRate: rowGstRate(selPr),
                                      });
                                      return {
                                        ...r,
                                        productId: pid,
                                        withGst: defaultWithGst,
                                        customPrice: String(shown),
                                      };
                                    }),
                                  );
                                  if (pid && distVendorId) {
                                    resolveDistRowPrice(idx, pid, distVendorId, row.quantity || 1);
                                  }
                                }}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={row.quantity || ''}
                                  onChange={e => {
                                    const v = e.target.value.replace(/[^0-9]/g, '');
                                    const newQty = v === '' ? 0 : parseInt(v, 10);
                                    updateDistRow(idx, 'quantity', newQty);
                                    if (row.productId && distVendorId && newQty > 0) {
                                      resolveDistRowPrice(idx, row.productId, distVendorId, newQty);
                                    }
                                  }}
                                  className="w-16 min-w-[64px] px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand"
                                />
                                {isBox && (
                                  <span className="px-1.5 py-1.5 bg-gray-100 rounded-lg text-[10px] font-bold text-gray-500">
                                    {p?.packName || 'Box'}
                                  </span>
                                )}
                              </div>
                              {isBox && (row.quantity || 0) > 0 && (
                                <span className="text-[10px] text-gray-400">= {(row.quantity || 0) * packSz} pcs</span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                  ₹
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.customPrice}
                                  onChange={e => {
                                    const v = e.target.value.replace(/[^0-9.]/g, '');
                                    updateDistRow(idx, 'customPrice', v);
                                  }}
                                  placeholder={p ? String(p.price) : '—'}
                                  className="w-full pl-6 pr-2 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
                                />
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.discount || ''}
                                onChange={e => {
                                  const v = e.target.value.replace(/[^0-9.]/g, '');
                                  updateDistRow(idx, 'discount', v === '' ? 0 : parseFloat(v));
                                }}
                                placeholder="0"
                                className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={row.withGst}
                                onChange={e => {
                                  const next = e.target.checked;
                                  setDistRows(prev =>
                                    prev.map((r, i) => {
                                      if (i !== idx) return r;
                                      const prod = products.find(x => x.id === r.productId);
                                      const current = parseFloat(String(r.customPrice)) || Number(prod?.price) || 0;
                                      const nextPrice = adjustUnitPriceForGstToggle(current, {
                                        prevWithGst: r.withGst,
                                        nextWithGst: next,
                                        priceIncludesGst: !!prod?.priceIncludesGst,
                                        gstRate: rowGstRate(prod),
                                      });
                                      return {
                                        ...r,
                                        withGst: next,
                                        customPrice: String(nextPrice),
                                      };
                                    }),
                                  );
                                }}
                                className="rounded text-brand"
                                aria-label={`GST for row ${idx + 1}`}
                              />
                            </td>
                            <td className="px-2 py-2 text-right font-bold whitespace-nowrap">
                              {m.billed > 0 ? (
                                <span>
                                  {row.withGst && (
                                    <span className="text-[10px] text-gray-400 block">
                                      ₹{m.net.toLocaleString()} +GST
                                    </span>
                                  )}
                                  {!row.withGst && !!p?.priceIncludesGst && (
                                    <span className="text-[10px] text-amber-600 block">excl. GST</span>
                                  )}
                                  <span className="text-base">₹{m.billed.toLocaleString()}</span>
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-1 py-2">
                              {distRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeDistRow(idx)}
                                  className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                >
                                  ×
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex border-t border-gray-200">
                    <button
                      type="button"
                      onClick={addDistRow}
                      className="flex-1 py-2 text-sm font-medium text-brand hover:bg-orange-50 transition-colors"
                    >
                      + Add Product Row
                    </button>
                    <label className="flex-1 py-2 text-sm font-medium text-center text-gray-500 hover:bg-gray-50 cursor-pointer border-l border-gray-200 transition-colors flex items-center justify-center gap-1.5">
                      <Upload size={14} /> Import CSV
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const lines = (reader.result as string).split(/\r?\n/).filter(l => l.trim());
                            if (lines.length < 2) {
                              toast('CSV must have header + data rows', 'error');
                              return;
                            }
                            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
                            const nameIdx = headers.findIndex(h => h.includes('product') || h === 'name');
                            const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
                            const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('rate'));
                            const gstIdx = headers.findIndex(h => h.includes('gst') || h.includes('withgst'));
                            const discIdx = headers.findIndex(h => h.includes('disc') || h.includes('discount'));
                            if (nameIdx < 0) {
                              toast('CSV must have a "productName" or "name" column', 'error');
                              return;
                            }
                            const newRows: DistRow[] = [];
                            const errors: string[] = [];
                            for (let i = 1; i < lines.length; i++) {
                              const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                              const pName = vals[nameIdx];
                              if (!pName) continue;
                              const match = products.find(pr => pr.name.toLowerCase() === pName.toLowerCase());
                              if (!match) {
                                errors.push(`Row ${i + 1}: "${pName}" not found in inventory`);
                                continue;
                              }
                              const qty = qtyIdx >= 0 ? parseInt(vals[qtyIdx]) || 0 : 1;
                              if (qty <= 0) {
                                errors.push(`Row ${i + 1}: "${pName}" — quantity must be greater than 0`);
                                continue;
                              }
                              const price = priceIdx >= 0 ? vals[priceIdx] : '';
                              if (price && isNaN(Number(price))) {
                                errors.push(`Row ${i + 1}: "${pName}" — invalid price "${price}"`);
                                continue;
                              }
                              const withGst = gstIdx >= 0 ? vals[gstIdx]?.toUpperCase() !== 'N' : defaultWithGst;
                              const disc = discIdx >= 0 ? parseInt(vals[discIdx]) || 0 : 0;
                              if (disc < 0 || disc > 100) {
                                errors.push(`Row ${i + 1}: "${pName}" — discount must be 0-100%`);
                                continue;
                              }
                              const catalog = price ? Number(price) : match.price;
                              const shown = displayUnitPriceForGst(catalog, {
                                withGst,
                                priceIncludesGst: !!match.priceIncludesGst,
                                gstRate: rowGstRate(match),
                              });
                              newRows.push({
                                productId: match.id,
                                quantity: qty,
                                customPrice: String(shown),
                                withGst,
                                discount: disc,
                              });
                            }
                            if (errors.length) {
                              toast(`Import failed — fix these errors:\n${errors.join('\n')}`, 'error');
                              return;
                            }
                            if (!newRows.length) {
                              toast('No valid rows found in CSV', 'error');
                              return;
                            }
                            setDistRows(newRows);
                            toast(
                              `${newRows.length} products loaded from CSV — review and click Distribute`,
                              'success',
                            );
                          };
                          reader.readAsText(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Items</span>
                    <span className="font-bold">{distTotals.items}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Gross Value</span>
                    <span className="font-bold">₹{distTotals.gross.toLocaleString()}</span>
                  </div>
                  {distTotals.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Discount</span>
                      <span className="font-bold text-emerald-600">-₹{distTotals.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal (base)</span>
                    <span className="font-bold">₹{distTotals.net.toLocaleString()}</span>
                  </div>
                  {distTotals.gst > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">GST</span>
                      <span className="font-bold">₹{distTotals.gst.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                    <span className="text-gray-700 font-medium">Total Billed Amount</span>
                    <span className="font-bold text-lg text-brand">₹{distTotals.billed.toLocaleString()}</span>
                  </div>
                  <div className="pt-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Amount Paid</label>
                    <input
                      type="number"
                      min={0}
                      max={distTotals.billed}
                      step={0.01}
                      value={distAmountPaid}
                      onChange={e => setDistAmountPaid(e.target.value)}
                      className={cn(
                        'w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand',
                        (parseFloat(distAmountPaid) || 0) > distTotals.billed
                          ? 'border-rose-400 bg-rose-50'
                          : 'border-gray-200',
                      )}
                      placeholder="0.00"
                    />
                  </div>
                  {distTotals.billed > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Balance</span>
                      <span
                        className={cn(
                          'font-bold',
                          distTotals.billed - (parseFloat(distAmountPaid) || 0) > 0
                            ? 'text-rose-600'
                            : 'text-emerald-600',
                        )}
                      >
                        ₹{Math.max(0, distTotals.billed - (parseFloat(distAmountPaid) || 0)).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDistributeAll}
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60"
                  >
                    {submitting ? 'Saving...' : `Distribute ${distTotals.items} Items`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
