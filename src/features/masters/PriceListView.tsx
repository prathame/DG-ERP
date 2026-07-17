import React, { useState, useEffect, useMemo } from 'react';
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
import { useBusinessConfig } from '../../lib/businessTypeConfig';

type PriceTab = 'generic' | 'vendor';

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
  validFrom?: string | null;
  validTo?: string | null;
}

function formatRuleDateRange(rule: Pick<PriceRule, 'validFrom' | 'validTo'>): string {
  const from = rule.validFrom ? String(rule.validFrom).slice(0, 10) : '';
  const to = rule.validTo ? String(rule.validTo).slice(0, 10) : '';
  if (!from && !to) return '';
  if (from && to) return `${from} → ${to}`;
  if (from) return `from ${from}`;
  return `to ${to}`;
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
  const cfg = useBusinessConfig();
  const partyLabel = cfg.labels.vendors; // Vendors | Customers | Clients
  const isService = cfg.type === 'service';
  const [tab, setTab] = useState<PriceTab>(isService ? 'generic' : 'vendor');
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bill, setBill] = useState<BillSettings | null>(null);
  const [tenant, setTenant] = useState<TenantHeader>({ companyName: 'Dhandho' });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const emptyForm = () => ({
    name: '',
    productId: '',
    vendorId: '',
    minQty: '1',
    maxQty: '',
    price: '',
    validFrom: '',
    validTo: '',
  });
  const [form, setForm] = useState(emptyForm);

  const tabRules = useMemo(
    () => (tab === 'generic' ? rules.filter(r => !r.vendorId) : rules.filter(r => !!r.vendorId)),
    [rules, tab],
  );
  const genericCount = rules.filter(r => !r.vendorId).length;
  const vendorCount = rules.filter(r => !!r.vendorId).length;

  const subtitle =
    tab === 'generic'
      ? isService
        ? 'Catalog rates for all clients — used when no client-specific rule matches'
        : `Quantity slabs for all ${partyLabel.toLowerCase()} (overrides product price)`
      : isService
        ? `Special rates for individual ${partyLabel.toLowerCase()}`
        : `Rates for a specific ${partyLabel.toLowerCase().replace(/s$/, '')} (overrides generic + product price)`;

  const openCreate = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

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
    if (tab === 'vendor' && !form.vendorId) {
      toast(`Select a ${partyLabel.replace(/s$/, '').toLowerCase()}`, 'error');
      return;
    }
    const vendorId = tab === 'generic' ? undefined : form.vendorId || undefined;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name || (vendorId ? `${partyLabel.replace(/s$/, '')} rate` : 'Catalog rate'),
        productId: form.productId,
        vendorId,
        minQty: Number(form.minQty) || 1,
        maxQty: form.maxQty ? Number(form.maxQty) : undefined,
        price: Number(form.price),
      };
      if (form.validFrom) body.validFrom = form.validFrom;
      if (form.validTo) body.validTo = form.validTo;
      await fetchApi('/price-lists', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setModalOpen(false);
      setForm(emptyForm());
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
    if (!tabRules.length) {
      toast('No price rules on this tab to export', 'error');
      return;
    }
    exportToCsv(
      tabRules.map(r => ({
        productName: r.productName || '',
        vendorName: r.vendorName || '',
        minQty: r.minQty,
        maxQty: r.maxQty ?? '',
        price: r.price,
        name: r.name || '',
        validFrom: r.validFrom ? String(r.validFrom).slice(0, 10) : '',
        validTo: r.validTo ? String(r.validTo).slice(0, 10) : '',
      })),
      tab === 'generic' ? 'price-list-generic' : 'price-list-vendor',
    );
    toast('Price list CSV downloaded', 'success');
  };

  const companyName = tenant.companyName || 'Dhandho';
  const brand = bill?.primaryColor || '#F27D26';

  const generatePriceListText = (vendorFilter?: string) => {
    const source = tabRules;
    const filtered = vendorFilter ? source.filter(r => r.vendorId === vendorFilter || !r.vendorId) : source;
    const scopeLabel = tab === 'generic' ? 'Generic catalog' : `${partyLabel}-specific`;
    const vendorName = vendorFilter ? vendors.find(v => v.id === vendorFilter)?.name || '' : '';
    let text = `*${companyName} — Price List (${scopeLabel})*\n`;
    if (tenant.gstNumber) text += `GSTIN: ${tenant.gstNumber}\n`;
    if (tenant.phone) text += `Phone: ${tenant.phone}\n`;
    if (vendorName) text += `For: *${vendorName}*\n`;
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
        const dates = formatRuleDateRange(r);
        text += `  ${vendorTag} Qty ${r.minQty}${r.maxQty ? `-${r.maxQty}` : '+'} → ₹${r.price.toLocaleString()}${dates ? ` (${dates})` : ''}\n`;
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

    const scopeLabel =
      tab === 'generic' ? (isService ? 'Generic catalog' : `All ${partyLabel}`) : `${partyLabel}-specific`;
    let rowsHtml = '';
    for (const r of tabRules) {
      const base = products.find(p => p.id === r.productId);
      const dates = formatRuleDateRange(r);
      const ruleLabel = [r.name || '', dates].filter(Boolean).join(' · ') || '—';
      rowsHtml += `<tr>
        <td>${esc(r.productName)}</td>
        <td style="text-align:right">₹${(base?.price ?? 0).toLocaleString('en-IN')}</td>
        <td><span class="chip ${r.vendorId ? 'chip-vendor' : 'chip-all'}">${esc(r.vendorId ? r.vendorName : `All ${partyLabel}`)}</span></td>
        <td style="text-align:center">${r.minQty}${r.maxQty ? `–${r.maxQty}` : '+'}${dates ? `<div class="muted" style="font-size:10px">${esc(dates)}</div>` : ''}</td>
        <td class="price" style="text-align:right">₹${Number(r.price).toLocaleString('en-IN')}</td>
        <td class="muted">${esc(ruleLabel)}</td>
      </tr>`;
    }

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>Price List — ${esc(companyName)}</title>
<style>
  @page { margin: 12mm; size: A4; }
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
  thead { display: table-header-group; }
  thead th { background: ${esc(brand)}; color: #fff; text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
  .repeat-banner th { background: #fff !important; color: #111827 !important; border-bottom: 2px solid ${esc(brand)}; text-transform: none; letter-spacing: 0; font-size: 11px; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
  tbody tr { break-inside: avoid; page-break-inside: avoid; }
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
  <div class="header avoid-break">
    ${logo ? `<div>${logo}</div>` : ''}
    <div class="header-text">
      <p class="company">${esc(companyName)}</p>
      ${bill?.tagline ? `<p class="tagline">${esc(bill.tagline)}</p>` : ''}
      ${contactBits ? `<p class="meta">${contactBits}</p>` : ''}
    </div>
  </div>
  <div class="doc-title avoid-break">
    <h2>Price List — ${esc(scopeLabel)}</h2>
    <span class="date">${esc(dateStr)}</span>
  </div>
  <table>
    <thead>
      <tr class="repeat-banner"><th colspan="6">
        <span style="font-weight:800;color:${esc(brand)};">${esc(companyName)}</span>
        <span style="float:right;font-weight:700;">Price List — ${esc(scopeLabel)}</span>
      </th></tr>
      <tr>
        <th>Product / Item</th>
        <th style="text-align:right">Base Price</th>
        <th>${esc(partyLabel)}</th>
        <th style="text-align:center">Qty Range</th>
        <th style="text-align:right">Special Price</th>
        <th>Rule</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px">No price rules</td></tr>`}
    </tbody>
  </table>
  <div class="print-end avoid-break">
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
</div>
</body></html>`;
  };

  const openPdf = () => {
    if (!tabRules.length) {
      toast('No price rules on this tab to print', 'error');
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
    const matching = tabRules.filter(r => r.productId === p.id);
    if (matching.length > 0) acc[p.name] = matching;
    return acc;
  }, {});

  const genericTabLabel = isService ? 'Generic (catalog)' : 'Generic (all)';
  const vendorTabLabel = `${partyLabel}-specific`;
  const partySingular = partyLabel.replace(/s$/, '');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold">Price List</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
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
          disabled={!tabRules.length}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={16} /> Export CSV
        </button>
        <button
          type="button"
          onClick={openPdf}
          disabled={!tabRules.length}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <FileDown size={16} /> PDF / Print
        </button>
        {tabRules.length > 0 && (
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
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
        >
          <Plus size={18} /> Add {tab === 'generic' ? 'Catalog' : partySingular} Rule
        </button>
      </div>

      <div className="flex gap-2">
        {(isService
          ? [
              { id: 'generic' as const, label: genericTabLabel, count: genericCount },
              { id: 'vendor' as const, label: vendorTabLabel, count: vendorCount },
            ]
          : [
              { id: 'vendor' as const, label: vendorTabLabel, count: vendorCount },
              { id: 'generic' as const, label: genericTabLabel, count: genericCount },
            ]
        ).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-colors',
              tab === t.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {t.label}
            <span className={cn('ml-1.5 text-xs', tab === t.id ? 'text-white/80' : 'text-gray-400')}>({t.count})</span>
          </button>
        ))}
      </div>

      {tabRules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <Tag size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-2">
            {tab === 'generic'
              ? isService
                ? 'No catalog rates yet'
                : `No all-${partyLabel.toLowerCase()} slabs yet`
              : `No ${partyLabel.toLowerCase()}-specific rates yet`}
          </p>
          <p className="text-sm mb-4 max-w-md mx-auto">
            {tab === 'generic'
              ? isService
                ? 'Add catalog prices here — they apply to every client unless a client-specific rule wins.'
                : `Optional qty slabs for every ${partySingular.toLowerCase()}. Product master price is the fallback when empty.`
              : `Override catalog / product price for one ${partySingular.toLowerCase()}.`}
          </p>
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
              onClick={openCreate}
              className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
            >
              + Add Rule
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
                        {rule.vendorId ? rule.vendorName : `All ${partyLabel}`}
                      </span>
                      <span className="text-sm text-gray-600">
                        Qty {rule.minQty}
                        {rule.maxQty ? `-${rule.maxQty}` : '+'}
                      </span>
                      <span className="font-bold text-brand">₹{rule.price.toLocaleString()}</span>
                      {formatRuleDateRange(rule) && (
                        <span className="text-xs text-gray-500">{formatRuleDateRange(rule)}</span>
                      )}
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
          {tabRules.filter(r => !grouped[r.productName]).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              {tabRules
                .filter(r => !Object.values(grouped).flat().includes(r))
                .map(rule => (
                  <div key={rule.id} className="flex items-center justify-between py-2">
                    <span className="text-sm">
                      {rule.productName} — ₹{Number(rule.price).toLocaleString()} (
                      {rule.vendorName || `All ${partyLabel}`})
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
              <h3 className="text-lg font-bold mb-1">
                {tab === 'generic' ? 'Add catalog rate' : `Add ${partySingular.toLowerCase()} rate`}
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                {tab === 'generic'
                  ? `Applies to all ${partyLabel.toLowerCase()} when no specific rule matches.`
                  : `Overrides catalog / product price for the selected ${partySingular.toLowerCase()}.`}
              </p>
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
                {tab === 'vendor' && (
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">{partySingular} *</label>
                    <select
                      value={form.vendorId}
                      onChange={e => setForm({ ...form, vendorId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    >
                      <option value="">Select {partySingular.toLowerCase()}</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Valid From</label>
                    <input
                      type="date"
                      value={form.validFrom}
                      onChange={e => setForm({ ...form, validFrom: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Valid To</label>
                    <input
                      type="date"
                      value={form.validTo}
                      onChange={e => setForm({ ...form, validTo: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                    />
                  </div>
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
            {
              key: 'vendorName',
              label: `${partySingular} Name (empty = generic / all)`,
            },
            { key: 'minQty', label: 'Min Qty' },
            { key: 'maxQty', label: 'Max Qty' },
            { key: 'price', label: 'Price', required: true },
            { key: 'name', label: 'Rule Name' },
            { key: 'validFrom', label: 'Valid From (YYYY-MM-DD)' },
            { key: 'validTo', label: 'Valid To (YYYY-MM-DD)' },
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
              validFrom: r.validFrom || r.ValidFrom || r.valid_from || '',
              validTo: r.validTo || r.ValidTo || r.valid_to || '',
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
