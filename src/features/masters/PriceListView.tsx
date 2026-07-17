import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Trash2, Tag, MessageCircle, Mail, Download, Upload, FileDown } from 'lucide-react';
import {
  cn,
  openPrintWindow,
  printBillInWindow,
  shareViaWhatsApp,
  shareViaEmail,
  PRINT_POPUP_BLOCKED,
  exportToCsv,
} from '../../lib/utils';
import { api, fetchApi } from '../../api';
import type { BillSettings, Product, Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { CsvImport } from '../../components/ui/CsvImport';
import { session } from '../../lib/session';

function esc(t: unknown): string {
  return String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface PriceRule {
  id: string;
  name: string;
  productId: string;
  productName: string;
  vendorId?: string;
  vendorName?: string;
  minQty: number;
  maxQty: number | null;
  price: number;
  isActive: boolean;
}

type TenantHeader = {
  companyName: string;
  phone?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  email?: string | null;
};

export function PriceListView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bill, setBill] = useState<BillSettings | null>(null);
  const [tenant, setTenant] = useState<TenantHeader>({ companyName: 'Dhandho' });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    productId: '',
    vendorId: '',
    minQty: '1',
    maxQty: '',
    price: '',
  });

  const load = () => {
    const userId = session.getUser()?.id;
    Promise.all([
      fetchApi<PriceRule[]>('/price-lists'),
      api.products.list(),
      api.vendors.list(),
      api.settings.getBillSettings().catch(() => null),
      userId ? api.settings.getProfile(userId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([r, p, v, billSettings, profile]) => {
        setRules(r);
        setProducts(p);
        setVendors(v);
        if (billSettings) setBill(billSettings);
        const fromSession = (() => {
          try {
            return session.getUser()?.companyName || 'Dhandho';
          } catch {
            return 'Dhandho';
          }
        })();
        setTenant({
          companyName: (profile as { companyName?: string } | null)?.companyName || fromSession,
          phone: (profile as { phone?: string } | null)?.phone || null,
          address: (profile as { address?: string } | null)?.address || null,
          gstNumber: (profile as { gstNumber?: string } | null)?.gstNumber || null,
          email: (profile as { email?: string } | null)?.email || null,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.productId || !form.price) {
      toast('Product and price required', 'error');
      return;
    }
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
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchApi(`/price-lists/${id}`, { method: 'DELETE' });
      load();
      toast('Price rule deleted', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleExportCsv = () => {
    if (!rules.length) {
      toast('No price rules to export', 'error');
      return;
    }
    exportToCsv(
      rules.map(r => ({
        productName: r.productName || '',
        vendorName: r.vendorName || '',
        minQty: r.minQty,
        maxQty: r.maxQty ?? '',
        price: r.price,
        name: r.name || '',
      })),
      'price-list',
    );
    toast('Price list CSV downloaded', 'success');
  };

  const companyName = tenant.companyName || 'Dhandho';
  const brand = bill?.primaryColor || '#F27D26';

  const generatePriceListText = (vendorFilter?: string) => {
    const filtered = vendorFilter ? rules.filter(r => r.vendorId === vendorFilter || !r.vendorId) : rules;
    const vendorName = vendorFilter ? vendors.find(v => v.id === vendorFilter)?.name || '' : 'All Products';
    let text = `*${companyName} — Price List*\n`;
    if (tenant.gstNumber) text += `GSTIN: ${tenant.gstNumber}\n`;
    if (tenant.phone) text += `Phone: ${tenant.phone}\n`;
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
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const logo = bill?.logoBase64
      ? `<img src="${esc(bill.logoBase64)}" alt="" style="max-height:64px;max-width:160px;object-fit:contain" />`
      : '';
    const contactBits = [
      tenant.address,
      tenant.phone ? `Ph: ${tenant.phone}` : null,
      tenant.email ? `Email: ${tenant.email}` : null,
      tenant.gstNumber ? `GSTIN: ${tenant.gstNumber}` : null,
    ]
      .filter(Boolean)
      .map(s => esc(s))
      .join(' · ');

    let rowsHtml = '';
    for (const r of rules) {
      const base = products.find(p => p.id === r.productId);
      rowsHtml += `<tr>
        <td>${esc(r.productName)}</td>
        <td style="text-align:right">₹${(base?.price ?? 0).toLocaleString('en-IN')}</td>
        <td><span class="chip ${r.vendorId ? 'chip-vendor' : 'chip-all'}">${esc(r.vendorId ? r.vendorName : 'All Vendors')}</span></td>
        <td style="text-align:center">${r.minQty}${r.maxQty ? `–${r.maxQty}` : '+'}</td>
        <td class="price" style="text-align:right">₹${Number(r.price).toLocaleString('en-IN')}</td>
        <td class="muted">${esc(r.name || '—')}</td>
      </tr>`;
    }

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Price List — ${esc(companyName)}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1f2937; margin: 0; padding: 0; }
  .page { max-width: 900px; margin: 0 auto; padding: 28px 32px; }
  .header { display: flex; gap: 20px; align-items: flex-start; border-bottom: 3px solid ${esc(brand)}; padding-bottom: 16px; margin-bottom: 20px; }
  .header-text { flex: 1; min-width: 0; }
  .company { font-size: 22px; font-weight: 800; color: #111827; margin: 0 0 4px; letter-spacing: -0.02em; }
  .tagline { font-size: 12px; color: #6b7280; margin: 0 0 8px; }
  .meta { font-size: 11px; color: #4b5563; line-height: 1.5; }
  .doc-title { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 0 16px; }
  .doc-title h2 { margin: 0; font-size: 16px; font-weight: 700; color: ${esc(brand)}; text-transform: uppercase; letter-spacing: 0.06em; }
  .doc-title .date { font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { background: ${esc(brand)}; color: #fff; text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .price { font-weight: 700; color: ${esc(brand)}; }
  .muted { color: #9ca3af; font-size: 11px; }
  .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .chip-vendor { background: #f3e8ff; color: #7c3aed; }
  .chip-all { background: #fef3c7; color: #d97706; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; gap: 12px; }
  .bank { margin-top: 18px; padding: 12px 14px; background: #f9fafb; border-radius: 8px; font-size: 11px; color: #4b5563; }
  .bank strong { color: #111827; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 0; } }
</style>
</head><body>
<div class="page">
  <div class="header">
    ${logo ? `<div>${logo}</div>` : ''}
    <div class="header-text">
      <p class="company">${esc(companyName)}</p>
      ${bill?.tagline ? `<p class="tagline">${esc(bill.tagline)}</p>` : ''}
      ${contactBits ? `<p class="meta">${contactBits}</p>` : ''}
    </div>
  </div>
  <div class="doc-title">
    <h2>Price List</h2>
    <span class="date">${esc(dateStr)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product / Item</th>
        <th style="text-align:right">Base Price</th>
        <th>Vendor</th>
        <th style="text-align:center">Qty Range</th>
        <th style="text-align:right">Special Price</th>
        <th>Rule</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px">No price rules</td></tr>`}
    </tbody>
  </table>
  ${
    bill?.bankName || bill?.bankAccountNumber || bill?.bankUpiId
      ? `<div class="bank">
          <strong>Bank details</strong><br/>
          ${bill.bankAccountName ? `${esc(bill.bankAccountName)} · ` : ''}
          ${bill.bankName ? esc(bill.bankName) : ''}
          ${bill.bankBranch ? ` (${esc(bill.bankBranch)})` : ''}<br/>
          ${bill.bankAccountNumber ? `A/c: ${esc(bill.bankAccountNumber)}` : ''}
          ${bill.bankIfsc ? ` · IFSC: ${esc(bill.bankIfsc)}` : ''}
          ${bill.bankUpiId ? ` · UPI: ${esc(bill.bankUpiId)}` : ''}
        </div>`
      : ''
  }
  <div class="footer">
    <span>${esc(bill?.footerText || 'Prices subject to change without prior notice.')}</span>
    <span>${esc(companyName)}</span>
  </div>
</div>
</body></html>`;
  };

  const openPdf = () => {
    if (!rules.length) {
      toast('No price rules to print', 'error');
      return;
    }
    const w = openPrintWindow();
    if (!w) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    printBillInWindow(w, generatePriceListHtml(), `Price List — ${companyName}`);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );

  const grouped: Record<string, PriceRule[]> = products.reduce<Record<string, PriceRule[]>>((acc, p) => {
    const matching = rules.filter(r => r.productId === p.id);
    if (matching.length > 0) acc[p.name] = matching;
    return acc;
  }, {});

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold">Price List</h2>
          <p className="text-sm text-gray-500">Set custom prices per vendor and quantity slabs</p>
        </div>
        <button
          type="button"
          onClick={() => setCsvImportOpen(true)}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50"
        >
          <Upload size={16} /> Import CSV
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!rules.length}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={16} /> Export CSV
        </button>
        <button
          type="button"
          onClick={openPdf}
          disabled={!rules.length}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <FileDown size={16} /> PDF / Print
        </button>
        {rules.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => {
                const phone = prompt('Enter WhatsApp number (with country code):');
                if (phone) shareViaWhatsApp(phone, generatePriceListText());
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 text-green-600"
            >
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button
              type="button"
              onClick={() => {
                const email = prompt('Enter email address:');
                if (email) shareViaEmail(email, `Price List — ${companyName}`, generatePriceListText());
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 text-blue-600"
            >
              <Mail size={16} /> Email
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
        >
          <Plus size={18} /> Add Price Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <Tag size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-2">No price rules yet</p>
          <p className="text-sm mb-4">Add rules manually or import a CSV (product names must match Masters)</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setCsvImportOpen(true)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50 text-gray-700"
            >
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
            >
              + Add Price Rule
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([productName, productRules]) => (
            <div key={productName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="font-bold text-sm">{productName}</span>
                <span className="text-xs text-gray-400 ml-2">
                  Base: ₹{products.find(p => p.name === productName)?.price?.toLocaleString()}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {productRules.map(rule => (
                  <div key={rule.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          rule.vendorId ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700',
                        )}
                      >
                        {rule.vendorId ? rule.vendorName : 'All Vendors'}
                      </span>
                      <span className="text-sm text-gray-600">
                        Qty {rule.minQty}
                        {rule.maxQty ? `-${rule.maxQty}` : '+'}
                      </span>
                      <span className="font-bold text-brand">₹{rule.price.toLocaleString()}</span>
                      {rule.name && <span className="text-xs text-gray-400">{rule.name}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {rules.filter(r => !grouped[r.productName]).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              {rules
                .filter(r => !Object.values(grouped).flat().includes(r))
                .map(rule => (
                  <div key={rule.id} className="flex items-center justify-between py-2">
                    <span className="text-sm">
                      {rule.productName} — ₹{Number(rule.price).toLocaleString()} ({rule.vendorName || 'All'})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
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
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6"
            >
              <h3 className="text-lg font-bold mb-4">Add Price Rule</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Product *</label>
                  <select
                    required
                    value={form.productId}
                    onChange={e => setForm({ ...form, productId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                  >
                    <option value="">Select product</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{Number(p.price).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">
                    Vendor (leave empty for all vendors)
                  </label>
                  <select
                    value={form.vendorId}
                    onChange={e => setForm({ ...form, vendorId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                  >
                    <option value="">All Vendors (general slab)</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Min Qty</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.minQty}
                      onChange={e => setForm({ ...form, minQty: e.target.value.replace(/[^0-9]/g, '') })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">
                      Max Qty (empty = unlimited)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.maxQty}
                      onChange={e => setForm({ ...form, maxQty: e.target.value.replace(/[^0-9]/g, '') })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                      placeholder="∞"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Price (₹) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={form.price}
                    onChange={e => setForm({ ...form, price: e.target.value.replace(/[^0-9.]/g, '') })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    placeholder="Custom price for this rule"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Rule Name</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    placeholder="e.g. Bulk Discount, Dealer Rate"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="flex-1 py-2.5 border rounded-xl font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60"
                  >
                    {submitting ? 'Saving...' : 'Add Rule'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {csvImportOpen && (
        <CsvImport
          templateName="price_list_template"
          itemLabel="price rules"
          columns={[
            { key: 'productName', label: 'Product Name', required: true },
            { key: 'vendorName', label: 'Vendor Name (empty = all)' },
            { key: 'minQty', label: 'Min Qty' },
            { key: 'maxQty', label: 'Max Qty' },
            { key: 'price', label: 'Price', required: true },
            { key: 'name', label: 'Rule Name' },
          ]}
          onClose={() => setCsvImportOpen(false)}
          onImport={async rows => {
            const mapped = rows.map(r => ({
              productName: r.productName || r.ProductName || r.product || '',
              vendorName: r.vendorName || r.VendorName || r.vendor || '',
              minQty: r.minQty || r.MinQty || '1',
              maxQty: r.maxQty || r.MaxQty || '',
              price: r.price || r.Price || '',
              name: r.name || r.ruleName || r.Name || '',
            }));
            const result = await fetchApi<{ success: number; errors: string[] }>('/price-lists/bulk', {
              method: 'POST',
              body: JSON.stringify({ rules: mapped }),
            });
            load();
            if (result.success > 0) toast(`${result.success} price rule(s) imported`, 'success');
            return { success: result.success, errors: result.errors };
          }}
        />
      )}
    </motion.div>
  );
}
