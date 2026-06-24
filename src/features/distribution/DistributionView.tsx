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
  const [form, setForm] = useState({ productId: '', vendorId: '', quantity: 1, distributionDate: new Date().toISOString().slice(0, 10), discountPercent: '', amountPaid: '' });
  const [submitting, setSubmitting] = useState(false);
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

  const handleDistribute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorId || !form.productId) {
      toast('Select product and vendor', 'error');
      return;
    }
    const p = products.find(x => x.id === form.productId);
    const grossValue = (p?.price ?? 0) * (form.quantity || 0);
    const disc = parseFloat(form.discountPercent) || 0;
    const discountAmount = Math.round(grossValue * disc / 100);
    const netAmount = grossValue - discountAmount;
    const paid = parseFloat(form.amountPaid) || 0;
    if (paid > netAmount) { toast(`Amount paid (₹${paid}) cannot exceed bill amount (₹${netAmount}) after discount`, 'error'); return; }
    if (disc < 0 || disc > 100) { toast('Discount must be between 0% and 100%', 'error'); return; }
    setSubmitting(true);
    api.distribution.create({
      productId: form.productId,
      vendorId: form.vendorId,
      quantity: form.quantity,
      distributionDate: form.distributionDate,
      discountPercent: disc > 0 ? disc : undefined,
      amountPaid: paid > 0 ? paid : undefined,
    })
      .then(() => { setModalOpen(false); setForm({ productId: '', vendorId: '', quantity: 1, distributionDate: new Date().toISOString().slice(0, 10), discountPercent: '', amountPaid: '' }); load(); toast('Products distributed successfully', 'success'); })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
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
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const w = openPrintWindow(); if (!w) return;
                        api.distribution.getBill({
                          vendorId: selectedVendorId!,
                          productId: selectedProductId ?? undefined,
                        }).then((bill) => printBillInWindow(w, generateDistributionChallanHtml(bill))).catch((err) => { w.close(); toast(err.message, 'error'); });
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
                        }).then((bill) => saveBillAsPdf(generateDistributionChallanHtml(bill))).catch((err) => toast(err.message, 'error'));
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
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Distribute Product to Vendor</h3>
              <form onSubmit={handleDistribute} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Product</label><select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]"><option value="">Select product</option>{products.filter(p => (p.stock ?? 0) > 0).map((p) => <option key={p.id} value={p.id}>{p.name} — Available: {p.stock ?? 0}</option>)}</select></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Quantity</label><input type="number" min={1} value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" />{(() => { const p = products.find(x => x.id === form.productId); return p && <span className="text-xs text-gray-500 mt-1 block">Available in inventory: {p.stock ?? 0}</span>; })()}</div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Vendor</label><select required value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]"><option value="">Select vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Distribution Date</label><input type="date" value={form.distributionDate} onChange={(e) => setForm({ ...form, distributionDate: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                {(() => {
                  const p = products.find(x => x.id === form.productId);
                  const grossValue = (p?.price ?? 0) * (form.quantity || 0);
                  const discPct = parseFloat(form.discountPercent) || 0;
                  const discountAmount = Math.round(grossValue * discPct / 100);
                  const netAmount = grossValue - discountAmount;
                  const paid = parseFloat(form.amountPaid) || 0;
                  const remaining = netAmount - paid;
                  const overpaid = paid > netAmount;
                  return grossValue > 0 ? (
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-3">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Gross Value ({form.quantity} x ₹{(p?.price ?? 0).toLocaleString()})</span><span className="font-bold">₹{grossValue.toLocaleString()}</span></div>
                      <div><label className="text-xs font-bold text-gray-400 uppercase">Discount (%)</label><input type="number" min={0} max={100} step={0.5} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="0" /></div>
                      {discPct > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Discount ({discPct}%)</span><span className="font-bold text-emerald-600">-₹{discountAmount.toLocaleString()}</span></div>}
                      <div className="flex justify-between text-sm border-t border-gray-200 pt-2"><span className="text-gray-700 font-medium">Net Amount</span><span className="font-bold text-lg">₹{netAmount.toLocaleString()}</span></div>
                      <div><label className="text-xs font-bold text-gray-400 uppercase">Amount Paid by Vendor</label><input type="number" min={0} max={netAmount} step={0.01} value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} className={cn("w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#F27D26]", overpaid ? "border-rose-400 bg-rose-50" : "border-gray-200")} placeholder="0.00 (leave empty if full credit)" /></div>
                      {overpaid && <p className="text-xs text-rose-600 font-bold">Amount paid cannot exceed ₹{netAmount.toLocaleString()}</p>}
                      <div className="flex justify-between text-sm border-t border-gray-200 pt-2"><span className="text-gray-500">Remaining Balance</span><span className={cn("font-bold", remaining > 0 ? "text-rose-600" : "text-emerald-600")}>₹{Math.max(0, remaining).toLocaleString()}</span></div>
                    </div>
                  ) : null;
                })()}
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Distribute'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
