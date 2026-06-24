import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Plus, Download, Printer, MessageCircle, Mail, ArrowLeft } from 'lucide-react';
import { cn, exportToCsv, openPrintWindow, printBillInWindow, saveBillAsPdf, shareViaWhatsApp, shareViaEmail, formatDistributionChallanText } from '../../lib/utils';
import { api, DistributionRecord } from '../../api';
import type { Product, Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { generateDistributionChallanHtml } from '../../lib/billTemplates';

export function DistributionView({ user }: { user: { id: string; role?: string; vendorId?: string } | null }) {
  const { toast } = useToast();
  const vendorId = user?.role === 'Vendor' ? user?.vendorId : undefined;
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [summary, setSummary] = useState<{ totalBeforeDistribution: number; availableInInventory: number; totalDistributed: number; vendorStats: { vendorId: string; vendorName: string; distributed: number; sold: number; replaced: number; damaged: number; availableWithVendor: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [distVendorId, setDistVendorId] = useState('');
  const [distDate, setDistDate] = useState(new Date().toISOString().slice(0, 10));
  const [distRows, setDistRows] = useState<{ productId: string; quantity: number; discount: number }[]>([{ productId: '', quantity: 1, discount: 0 }]);
  const [distAmountPaid, setDistAmountPaid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [includeGst, setIncludeGst] = useState(true);
  const [splitBillModal, setSplitBillModal] = useState<{ bill: import('../../api').DistributionBillData } | null>(null);
  const [splitGstQty, setSplitGstQty] = useState(0);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(vendorId ?? null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      api.distribution.list(vendorId),
      api.distribution.summary(),
      vendorId ? Promise.resolve([]) : api.products.list(),
      vendorId ? Promise.resolve([]) : api.vendors.list(),
    ])
      .then(([d, s, p, v]) => {
        setDistributions(d);
        setSummary(s);
        setProducts(p);
        setVendors(v);
        if (vendorId) setSelectedVendorId(vendorId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); load(); }, [vendorId]);

  const addDistRow = () => setDistRows([...distRows, { productId: '', quantity: 1, discount: 0 }]);
  const removeDistRow = (idx: number) => setDistRows(distRows.filter((_, i) => i !== idx));
  const updateDistRow = (idx: number, field: string, value: string | number) => setDistRows(distRows.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const distTotals = distRows.reduce((acc, r) => {
    const p = products.find(x => x.id === r.productId);
    const gross = (p?.price ?? 0) * (r.quantity || 0);
    const disc = Math.round(gross * (r.discount || 0) / 100);
    acc.gross += gross;
    acc.discount += disc;
    acc.net += gross - disc;
    acc.items += r.quantity || 0;
    return acc;
  }, { gross: 0, discount: 0, net: 0, items: 0 });

  const handleDistributeAll = async () => {
    if (!distVendorId) { toast('Select a vendor', 'error'); return; }
    const validRows = distRows.filter(r => r.productId && r.quantity > 0);
    if (validRows.length === 0) { toast('Add at least one product', 'error'); return; }
    const paid = parseFloat(distAmountPaid) || 0;
    if (paid > distTotals.net) { toast(`Amount paid (₹${paid}) exceeds net amount (₹${distTotals.net})`, 'error'); return; }
    setSubmitting(true);
    try {
      for (const row of validRows) {
        await api.distribution.create({
          productId: row.productId,
          vendorId: distVendorId,
          quantity: row.quantity,
          distributionDate: distDate,
          discountPercent: row.discount > 0 ? row.discount : undefined,
        });
      }
      if (paid > 0) {
        await api.vendorFinance.recordPayment(distVendorId, {
          amount: paid,
          paymentDate: distDate,
          paymentMethod: 'Cash',
          notes: `Payment with distribution (${validRows.length} products)`,
        });
      }
      setModalOpen(false);
      setDistRows([{ productId: '', quantity: 1, discount: 0 }]);
      setDistVendorId('');
      setDistAmountPaid('');
      load();
      toast(`${validRows.length} product(s) distributed successfully`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Product Distribution</h2>
          <p className="text-sm text-gray-500">{vendorId ? 'Your distributed products' : 'Assign products to vendors for sale'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => distributions.length && exportToCsv(distributions.map((d) => ({ id: d.id, barcode: d.barcode, productName: d.productName, vendorName: d.vendorName, distributionDate: d.distributionDate, status: d.status })), 'distribution')} disabled={!distributions.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} /> Export CSV
          </button>
          {!vendorId && (
            <button type="button" onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold">
              <Plus size={18} /> Distribute to Vendor
            </button>
          )}
        </div>
      </div>

      {/* Vendor cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summary?.vendorStats?.filter((v) => v.distributed > 0 && (!vendorId || v.vendorId === vendorId)).map((v) => (
          <button
            key={v.vendorId}
            type="button"
            onClick={() => setSelectedVendorId(selectedVendorId === v.vendorId ? null : v.vendorId)}
            className={cn(
              "bg-white p-4 rounded-xl border shadow-sm text-left transition-all cursor-pointer hover:shadow-md",
              selectedVendorId === v.vendorId ? "border-[#F27D26] ring-2 ring-[#F27D26]/30" : "border-gray-100"
            )}
          >
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{v.vendorName}</p>
            <div className="mt-2 flex gap-4 text-sm flex-wrap">
              <span><strong>{v.distributed}</strong> distributed</span>
              <span className="text-emerald-600"><strong>{v.sold}</strong> sold</span>
              {(v.replaced ?? 0) > 0 && <span className="text-amber-600"><strong>{v.replaced}</strong> replacement{(v.replaced ?? 0) !== 1 ? 's' : ''}</span>}
              {(v.damaged ?? 0) > 0 && <span className="text-rose-600"><strong>{v.damaged}</strong> damaged</span>}
              <span className="text-blue-600"><strong>{v.availableWithVendor}</strong> with vendor</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Click to view products</p>
          </button>
        ))}
      </div>

      {/* Product details - only when vendor tile is clicked */}
      <div className="space-y-6">
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center"><LoadingSpinner /></div>
        )}
        {!loading && !selectedVendorId && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-500 mb-2">Click on a vendor tile above to see their distributed products</p>
            <p className="text-sm text-gray-400">Select Prathamesh Busa, Ravi, or any vendor with distributed products</p>
          </div>
        )}
        {!loading && selectedVendorId && (() => {
          const byVendor = distributions.reduce((acc, d) => {
            const key = d.vendorId;
            if (!acc[key]) acc[key] = { vendorName: d.vendorName, items: [] };
            acc[key].items.push(d);
            return acc;
          }, {} as Record<string, { vendorName: string; items: typeof distributions }>);
          const vendorData = byVendor[selectedVendorId];
          if (!vendorData) return null;
          const { vendorName, items } = vendorData;
          const stats = summary?.vendorStats?.find((v) => v.vendorId === selectedVendorId);

          // Group items by product
          const byProduct = items.reduce((acc, d) => {
            const key = d.productId;
            if (!acc[key]) acc[key] = { productName: d.productName, units: [] };
            acc[key].units.push(d);
            return acc;
          }, {} as Record<string, { productName: string; units: typeof distributions }>);
          type ByProductEntry = { productName: string; units: typeof distributions };
          const productList = Object.entries(byProduct).map(([pid, val]) => { const { productName, units } = val as ByProductEntry; return ({
            productId: pid,
            productName,
            distributed: units.filter((u) => u.status === 'Distributed').length,
            sold: units.filter((u) => u.status === 'Sold').length,
            replaced: units.filter((u) => u.status === 'Replaced').length,
            damaged: units.filter((u) => u.status === 'Damaged').length,
            availableWithVendor: units.filter((u) => u.status === 'Distributed').length,
            total: units.length,
          }); });

          const selectedProduct = selectedProductId ? byProduct[selectedProductId] : null;

          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => { if (selectedProductId) setSelectedProductId(null); else { setSelectedVendorId(null); setSelectedProductId(null); } }} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                    <ArrowLeft size={20} className="text-gray-600" />
                  </button>
                  <h3 className="font-bold text-lg">{selectedProduct ? selectedProduct.productName : vendorName}</h3>
                  <button
                    type="button"
                    onClick={() => {
                      api.distribution.getBill({ vendorId: selectedVendorId!, productId: selectedProductId ?? undefined })
                        .then((bill) => { setSplitBillModal({ bill }); setSplitGstQty(Math.ceil(bill.totalQuantity / 2)); })
                        .catch((err) => toast(err.message, 'error'));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors ml-2"
                    title="Split into GST + Non-GST bills"
                  >
                    Split Bill
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const w = openPrintWindow(); if (!w) return;
                        api.distribution.getBill({
                          vendorId: selectedVendorId!,
                          productId: selectedProductId ?? undefined,
                        }).then((bill) => printBillInWindow(w, generateDistributionChallanHtml(bill, { showGst: includeGst }))).catch((err) => { w.close(); toast(err.message, 'error'); });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#F27D26] hover:bg-orange-50 rounded-lg transition-colors"
                      title="Print Distribution Challan"
                    >
                      <Printer size={16} /> Print
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        api.distribution.getBill({
                          vendorId: selectedVendorId!,
                          productId: selectedProductId ?? undefined,
                        }).then((bill) => saveBillAsPdf(generateDistributionChallanHtml(bill, { showGst: includeGst }))).catch((err) => toast(err.message, 'error'));
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#F27D26] hover:bg-orange-50 rounded-lg transition-colors"
                      title="Save as PDF"
                    >
                      <Download size={16} /> PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        api.distribution.getBill({
                          vendorId: selectedVendorId!,
                          productId: selectedProductId ?? undefined,
                        }).then((bill) => {
                          const phone = bill.vendor.phone;
                          if (!phone) { toast('No vendor phone number on record', 'error'); return; }
                          shareViaWhatsApp(phone, formatDistributionChallanText(bill));
                        }).catch((err) => toast(err.message, 'error'));
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Send Challan via WhatsApp"
                    >
                      <MessageCircle size={16} /> WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        api.distribution.getBill({
                          vendorId: selectedVendorId!,
                          productId: selectedProductId ?? undefined,
                        }).then((bill) => {
                          const email = bill.vendor.email || '';
                          if (!email) { toast('No vendor email on record — enter email manually', 'info'); }
                          shareViaEmail(email, `Distribution Challan ${bill.challanId} — ${bill.company.name}`, formatDistributionChallanText(bill));
                        }).catch((err) => toast(err.message, 'error'));
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Send Challan via Email"
                    >
                      <Mail size={16} /> Email
                    </button>
                  </div>
                </div>
                {stats && !selectedProductId && (
                  <span className="text-sm text-gray-600">
                    <span className="font-medium">{stats.distributed}</span> distributed • <span className="text-emerald-600 font-medium">{stats.sold}</span> sold
                    {(stats.replaced ?? 0) > 0 && <> • <span className="text-amber-600 font-medium">{stats.replaced}</span> replacement{(stats.replaced ?? 0) !== 1 ? 's' : ''}</>}
                    {(stats.damaged ?? 0) > 0 && <> • <span className="text-rose-600 font-medium">{stats.damaged}</span> damaged</>}
                    {' • '}<span className="text-blue-600 font-medium">{stats.availableWithVendor}</span> with vendor
                  </span>
                )}
                {selectedProductId && selectedProduct && (
                  <span className="text-sm text-gray-600">
                    <span className="font-medium">{selectedProduct.units.length}</span> units • <span className="text-emerald-600 font-medium">{selectedProduct.units.filter((u) => u.status === 'Sold').length}</span> sold
                    {selectedProduct.units.filter((u) => u.status === 'Replaced').length > 0 && <> • <span className="text-amber-600 font-medium">{selectedProduct.units.filter((u) => u.status === 'Replaced').length}</span> replaced</>}
                    {selectedProduct.units.filter((u) => u.status === 'Damaged').length > 0 && <> • <span className="text-rose-600 font-medium">{selectedProduct.units.filter((u) => u.status === 'Damaged').length}</span> damaged</>}
                    {' • '}<span className="text-blue-600 font-medium">{selectedProduct.units.filter((u) => u.status === 'Distributed').length}</span> with vendor
                  </span>
                )}
              </div>
              {!selectedProductId ? (
                <div className="divide-y divide-gray-50">
                  <div className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">Products</div>
                  {productList.map((p) => (
                    <button key={p.productId} type="button" onClick={() => setSelectedProductId(p.productId)} className="w-full px-6 py-4 text-left hover:bg-gray-50 flex items-center justify-between transition-colors">
                      <span className="font-medium">{p.productName}</span>
                      <span className="text-sm text-gray-600">
                        <span className="font-medium">{p.total}</span> units • <span className="text-emerald-600">{p.sold} sold</span>
                        {p.replaced > 0 && <span className="text-amber-600"> • {p.replaced} replaced</span>}
                        {p.damaged > 0 && <span className="text-rose-600"> • {p.damaged} damaged</span>}
                        <span className="text-blue-600"> • {p.distributed} with vendor</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : selectedProduct ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-6 py-4">#</th><th className="px-6 py-4">Barcode</th><th className="px-6 py-4">Distribution Date</th><th className="px-6 py-4">Status</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedProduct.units.map((d, idx) => (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-500">{idx + 1}</td>
                          <td className="px-6 py-4 font-mono text-sm">{d.barcode}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{d.distributionDate}</td>
                          <td className="px-6 py-4"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", d.status === 'Sold' ? 'bg-emerald-100 text-emerald-700' : d.status === 'Distributed' ? 'bg-blue-100 text-blue-700' : d.status === 'Replaced' ? 'bg-amber-100 text-amber-700' : d.status === 'Damaged' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-700')}>{d.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })()}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-3xl rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-1">Distribute Products to Vendor</h3>
              <p className="text-sm text-gray-500 mb-4">Add multiple products, set quantity and discount for each. Save all at once.</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Vendor</label><select value={distVendorId} onChange={(e) => setDistVendorId(e.target.value)} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]"><option value="">Select vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Date</label><input type="date" value={distDate} onChange={(e) => setDistDate(e.target.value)} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-left">
                  <thead><tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-3 w-8">#</th>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3 w-20">Qty</th>
                    <th className="px-3 py-3 w-16">Disc%</th>
                    <th className="px-3 py-3 w-24 text-right">Net Price</th>
                    <th className="px-3 py-3 w-28 text-right">Line Total</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {distRows.map((row, idx) => {
                      const p = products.find(x => x.id === row.productId);
                      const gross = (p?.price ?? 0) * (row.quantity || 0);
                      const disc = Math.round(gross * (row.discount || 0) / 100);
                      const net = gross - disc;
                      const netUnit = p ? Math.round(p.price * (100 - (row.discount || 0)) / 100) : 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <select value={row.productId} onChange={(e) => updateDistRow(idx, 'productId', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]">
                              <option value="">Select product</option>
                              {products.filter(pr => (pr.stock ?? 0) > 0).map((pr) => <option key={pr.id} value={pr.id}>{pr.name} (₹{pr.price.toLocaleString()}) — {pr.stock} avl</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2"><input type="number" min={1} max={p?.stock ?? 9999} value={row.quantity || ''} onChange={(e) => updateDistRow(idx, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value, 10))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#F27D26]" /></td>
                          <td className="px-3 py-2"><input type="number" min={0} max={100} step={0.5} value={row.discount || ''} onChange={(e) => updateDistRow(idx, 'discount', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#F27D26]" /></td>
                          <td className="px-3 py-2 text-right text-sm font-medium">{p ? `₹${netUnit.toLocaleString()}` : '-'}</td>
                          <td className="px-3 py-2 text-right text-sm font-bold">{net > 0 ? `₹${net.toLocaleString()}` : '-'}</td>
                          <td className="px-3 py-2">{distRows.length > 1 && <button type="button" onClick={() => removeDistRow(idx)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded">×</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" onClick={addDistRow} className="w-full py-2 text-sm font-medium text-[#F27D26] hover:bg-orange-50 border-t border-gray-200 transition-colors">+ Add Product Row</button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2 mb-4">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Total Items</span><span className="font-bold">{distTotals.items}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Gross Value</span><span className="font-bold">₹{distTotals.gross.toLocaleString()}</span></div>
                {distTotals.discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Total Discount</span><span className="font-bold text-emerald-600">-₹{distTotals.discount.toLocaleString()}</span></div>}
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2"><span className="text-gray-700 font-medium">Net Amount</span><span className="font-bold text-lg text-[#F27D26]">₹{distTotals.net.toLocaleString()}</span></div>
                <div className="pt-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Amount Paid</label>
                  <input type="number" min={0} max={distTotals.net} step={0.01} value={distAmountPaid} onChange={(e) => setDistAmountPaid(e.target.value)} className={cn("w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#F27D26]", (parseFloat(distAmountPaid) || 0) > distTotals.net ? "border-rose-400 bg-rose-50" : "border-gray-200")} placeholder="0.00" />
                </div>
                {distTotals.net > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Balance</span><span className={cn("font-bold", (distTotals.net - (parseFloat(distAmountPaid) || 0)) > 0 ? "text-rose-600" : "text-emerald-600")}>₹{Math.max(0, distTotals.net - (parseFloat(distAmountPaid) || 0)).toLocaleString()}</span></div>}
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium">Cancel</button>
                <button type="button" onClick={handleDistributeAll} disabled={submitting} className="flex-1 py-2.5 bg-[#F27D26] text-white rounded-xl font-bold disabled:opacity-60">{submitting ? 'Saving...' : `Distribute ${distTotals.items} Items`}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Split Bill Modal */}
      <AnimatePresence>
        {splitBillModal && (() => {
          const { bill } = splitBillModal;
          const totalQty = bill.totalQuantity;
          const gstQty = Math.min(Math.max(0, splitGstQty), totalQty);
          const nonGstQty = totalQty - gstQty;
          const pricePerUnit = totalQty > 0 ? bill.totalValue / totalQty : 0;
          const gstAmount = Math.round(pricePerUnit * gstQty);
          const nonGstAmount = bill.totalValue - gstAmount;
          const gstRate = bill.gstRate || 18;
          const gstTax = Math.round(gstAmount * gstRate / 100);
          const halfGst = Math.round(gstTax / 2);
          const gstGrandTotal = gstAmount + gstTax;

          const makeSplitBill = (qty: number, amount: number, isGst: boolean): typeof bill => {
            const ratio = totalQty > 0 ? qty / totalQty : 0;
            return {
              ...bill,
              groupedItems: bill.groupedItems.map((g, i) => {
                const itemQty = i === 0 ? qty : 0;
                return { ...g, quantity: itemQty, lineTotal: Math.round(g.netPrice * itemQty), barcodeRange: itemQty > 0 ? g.barcodeRange : '-' };
              }).filter(g => g.quantity > 0),
              items: bill.items.slice(0, qty),
              totalQuantity: qty,
              grossValue: Math.round(bill.grossValue * ratio),
              totalDiscount: Math.round(bill.totalDiscount * ratio),
              totalValue: amount,
            };
          };

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setSplitBillModal(null)} />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold mb-1">Split Bill — GST + Non-GST</h3>
                <p className="text-sm text-gray-500 mb-4">Choose how many units go on the GST bill. The rest will be on a separate non-GST bill.</p>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4">
                  <div className="flex justify-between text-sm mb-3"><span className="text-gray-500">Total Units</span><span className="font-bold">{totalQty}</span></div>
                  <div className="flex justify-between text-sm mb-3"><span className="text-gray-500">Total Amount</span><span className="font-bold">₹{bill.totalValue.toLocaleString()}</span></div>
                  <div className="border-t border-gray-200 pt-3">
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">GST Bill — Units</label>
                    <input type="range" min={0} max={totalQty} value={gstQty} onChange={(e) => setSplitGstQty(parseInt(e.target.value, 10))} className="w-full accent-[#F27D26]" />
                    <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0</span><span>{totalQty}</span></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={cn("p-4 rounded-xl border-2", gstQty > 0 ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50")}>
                    <p className="text-xs font-bold text-emerald-700 uppercase mb-2">GST Bill</p>
                    <p className="text-2xl font-bold text-emerald-700">₹{gstGrandTotal.toLocaleString()}</p>
                    <p className="text-sm text-gray-600 mt-1">{gstQty} units</p>
                    {gstQty > 0 && (
                      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                        <p>Subtotal: ₹{gstAmount.toLocaleString()}</p>
                        <p>CGST @{gstRate / 2}%: ₹{halfGst.toLocaleString()}</p>
                        <p>SGST @{gstRate / 2}%: ₹{(gstTax - halfGst).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                  <div className={cn("p-4 rounded-xl border-2", nonGstQty > 0 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50")}>
                    <p className="text-xs font-bold text-amber-700 uppercase mb-2">Non-GST Bill</p>
                    <p className="text-2xl font-bold text-amber-700">₹{nonGstAmount.toLocaleString()}</p>
                    <p className="text-sm text-gray-600 mt-1">{nonGstQty} units</p>
                    <p className="text-xs text-gray-400 mt-2">No tax breakdown</p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg mb-3">Saving this split updates the vendor's finance — GST bill amount includes tax, non-GST shows base price only.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => {
                    api.distribution.applyBilling({ vendorId: selectedVendorId!, gstUnits: gstQty, nonGstUnits: nonGstQty, gstRate: gstRate }).then(() => {
                      toast('Billing saved to vendor finance', 'success');
                      if (gstQty > 0) { const w = openPrintWindow(); if (w) printBillInWindow(w, generateDistributionChallanHtml(makeSplitBill(gstQty, gstAmount, true), { showGst: true })); }
                      if (nonGstQty > 0) { setTimeout(() => { const w = openPrintWindow(); if (w) printBillInWindow(w, generateDistributionChallanHtml(makeSplitBill(nonGstQty, nonGstAmount, false), { showGst: false })); }, 500); }
                      setSplitBillModal(null);
                      load();
                    }).catch((err) => toast((err as Error).message, 'error'));
                  }} className="flex-1 py-2.5 bg-[#F27D26] text-white rounded-xl font-bold text-sm hover:bg-[#D96A1C]">
                    Save & Print Both Bills
                  </button>
                </div>
                <button type="button" onClick={() => setSplitBillModal(null)} className="w-full mt-2 py-2 border border-gray-200 rounded-xl font-medium text-sm">Cancel</button>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </motion.div>
  );
}
