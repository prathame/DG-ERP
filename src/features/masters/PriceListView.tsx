import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Trash2, Tag, Printer, MessageCircle, Mail } from 'lucide-react';
import { cn, openPrintWindow, shareViaWhatsApp, shareViaEmail } from '../../lib/utils';
import { api, fetchApi } from '../../api';
import type { Product, Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { session } from '../../lib/session';

interface PriceRule {
  id: string; name: string; productId: string; productName: string;
  vendorId?: string; vendorName?: string;
  minQty: number; maxQty: number | null; price: number; isActive: boolean;
}

export function PriceListView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', productId: '', vendorId: '', minQty: '1', maxQty: '', price: '' });

  const load = () => {
    Promise.all([
      fetchApi<PriceRule[]>('/price-lists'),
      api.products.list(),
      api.vendors.list(),
    ]).then(([r, p, v]) => { setRules(r); setProducts(p); setVendors(v); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.productId || !form.price) { toast('Product and price required', 'error'); return; }
    setSubmitting(true);
    try {
      await fetchApi('/price-lists', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name || `${form.vendorId ? 'Vendor' : 'Slab'} Price`,
          productId: form.productId,
          vendorId: form.vendorId || undefined,
          minQty: Number(form.minQty) || 1,
          maxQty: form.maxQty ? Number(form.maxQty) : undefined,
          price: Number(form.price),
        }),
      });
      setModalOpen(false);
      setForm({ name: '', productId: '', vendorId: '', minQty: '1', maxQty: '', price: '' });
      load();
      toast('Price rule added', 'success');
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchApi(`/price-lists/${id}`, { method: 'DELETE' });
      load(); toast('Price rule deleted', 'success');
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  const companyName = (() => { try { return session.getUser()?.companyName || 'DG Business'; } catch { return 'DG Business'; } })();

  const generatePriceListText = (vendorFilter?: string) => {
    const filtered = vendorFilter ? rules.filter(r => r.vendorId === vendorFilter || !r.vendorId) : rules;
    const vendorName = vendorFilter ? vendors.find(v => v.id === vendorFilter)?.name || '' : 'All Products';
    let text = `📋 *${companyName} — Price List*\n`;
    if (vendorName !== 'All Products') text += `For: *${vendorName}*\n`;
    text += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;

    const byProduct: Record<string, typeof filtered> = {};
    for (const r of filtered) {
      const key = r.productName || r.productId;
      if (!byProduct[key]) byProduct[key] = [];
      byProduct[key].push(r);
    }

    for (const [name, pRules] of Object.entries(byProduct)) {
      const base = products.find(p => p.name === name);
      text += `*${name}* (Base: ₹${base?.price?.toLocaleString() || '—'})\n`;
      for (const r of pRules) {
        const vendorTag = r.vendorId ? `[${r.vendorName}]` : '[All]';
        text += `  ${vendorTag} Qty ${r.minQty}${r.maxQty ? `-${r.maxQty}` : '+'} → ₹${r.price.toLocaleString()}\n`;
      }
      text += '\n';
    }
    return text.trim();
  };

  const generatePriceListHtml = () => {
    let html = `<html><head><title>Price List — ${companyName}</title><style>body{font-family:sans-serif;padding:24px;max-width:800px;margin:0 auto}h1{font-size:20px;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left;font-size:13px}th{background:#f9fafb;font-weight:600;text-transform:uppercase;font-size:11px;color:#6b7280}.vendor{background:#f3e8ff;color:#7c3aed;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700}.all{background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700}.price{font-weight:700;color:#F27D26}@media print{body{padding:0}}</style></head><body>`;
    html += `<h1>${companyName}</h1><p style="color:#6b7280;font-size:13px;">Price List — ${new Date().toLocaleDateString('en-IN')}</p>`;
    html += `<table><thead><tr><th>Product</th><th>Base Price</th><th>Vendor</th><th>Qty Range</th><th>Special Price</th></tr></thead><tbody>`;
    for (const r of rules) {
      const base = products.find(p => p.id === r.productId);
      html += `<tr><td>${r.productName}</td><td>₹${base?.price?.toLocaleString() || '—'}</td><td><span class="${r.vendorId ? 'vendor' : 'all'}">${r.vendorId ? r.vendorName : 'All Vendors'}</span></td><td>${r.minQty}${r.maxQty ? `–${r.maxQty}` : '+'}</td><td class="price">₹${r.price.toLocaleString()}</td></tr>`;
    }
    html += '</tbody></table></body></html>';
    return html;
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  const grouped: Record<string, PriceRule[]> = products.reduce<Record<string, PriceRule[]>>((acc, p) => {
    const matching = rules.filter(r => r.productId === p.id);
    if (matching.length > 0) acc[p.name] = matching;
    return acc;
  }, {});

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1"><h2 className="text-xl font-bold">Price List</h2><p className="text-sm text-gray-500">Set custom prices per vendor and quantity slabs</p></div>
        {rules.length > 0 && <>
          <button type="button" onClick={() => { const w = openPrintWindow(); if (w) { w.document.write(generatePriceListHtml()); w.document.close(); w.print(); } }} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"><Printer size={16} /> Print</button>
          <button type="button" onClick={() => { const phone = prompt('Enter WhatsApp number (with country code):'); if (phone) shareViaWhatsApp(phone, generatePriceListText()); }} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 text-green-600"><MessageCircle size={16} /> WhatsApp</button>
          <button type="button" onClick={() => { const email = prompt('Enter email address:'); if (email) shareViaEmail(email, `Price List — ${companyName}`, generatePriceListText()); }} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 text-blue-600"><Mail size={16} /> Email</button>
        </>}
        <button type="button" onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={18} /> Add Price Rule</button>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <Tag size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-2">No price rules yet</p>
          <p className="text-sm mb-4">Add custom pricing for specific vendors or quantity slabs</p>
          <button type="button" onClick={() => setModalOpen(true)} className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark">+ Add Price Rule</button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([productName, productRules]) => (
            <div key={productName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="font-bold text-sm">{productName}</span>
                <span className="text-xs text-gray-400 ml-2">Base: ₹{products.find(p => p.name === productName)?.price?.toLocaleString()}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {productRules.map(rule => (
                  <div key={rule.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", rule.vendorId ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700')}>
                        {rule.vendorId ? rule.vendorName : 'All Vendors'}
                      </span>
                      <span className="text-sm text-gray-600">
                        Qty {rule.minQty}{rule.maxQty ? `-${rule.maxQty}` : '+'}
                      </span>
                      <span className="font-bold text-brand">₹{rule.price.toLocaleString()}</span>
                      {rule.name && <span className="text-xs text-gray-400">{rule.name}</span>}
                    </div>
                    <button type="button" onClick={() => handleDelete(rule.id)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {rules.filter(r => !grouped[r.productName]).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              {rules.filter(r => !Object.values(grouped).flat().includes(r)).map(rule => (
                <div key={rule.id} className="flex items-center justify-between py-2">
                  <span className="text-sm">{rule.productName} — ₹{rule.price} ({rule.vendorName || 'All'})</span>
                  <button type="button" onClick={() => handleDelete(rule.id)} className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">Add Price Rule</h3>
              <div className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Product *</label>
                  <select required value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm">
                    <option value="">Select product</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (₹{p.price})</option>)}
                  </select>
                </div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vendor (leave empty for all vendors)</label>
                  <select value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm">
                    <option value="">All Vendors (general slab)</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Min Qty</label><input type="text" inputMode="numeric" value={form.minQty} onChange={e => setForm({ ...form, minQty: e.target.value.replace(/[^0-9]/g, '') })} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="1" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Max Qty (empty = unlimited)</label><input type="text" inputMode="numeric" value={form.maxQty} onChange={e => setForm({ ...form, maxQty: e.target.value.replace(/[^0-9]/g, '') })} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="∞" /></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Price (₹) *</label><input type="text" inputMode="decimal" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, '') })} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="Custom price for this rule" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Rule Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm" placeholder="e.g. Bulk Discount, Dealer Rate" /></div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border rounded-xl font-medium">Cancel</button>
                  <button type="button" onClick={handleCreate} disabled={submitting} className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60">{submitting ? 'Saving...' : 'Add Rule'}</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
