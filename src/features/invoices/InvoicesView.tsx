import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, FileText, Trash2, Download, Send, Check, X, Printer } from 'lucide-react';
import {
  cn,
  formatDate,
  exportToCsv,
  useTabLabel,
  fetchImageAsDataUrl,
  openPrintWindow,
  printBillInWindow,
  closePrintOverlay,
  PRINT_POPUP_BLOCKED,
} from '../../lib/utils';
import { isServiceMobileMode } from '../../platforms/service-mobile/mode';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { fetchApi } from '../../api';
import {
  useToast,
  LoadingSpinner,
  AppModal,
  ModalActions,
  ModalActionButton,
  FormSection,
  FormGrid,
  FormField,
  formControlClass,
  MobileStepper,
  LineItemCard,
  type LineItemCardField,
  MobilePillTabs,
  MobileKpiCard,
  MobileFab,
  MobileEmptyState,
} from '../../components/ui';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { suggestHsnRate } from '../../lib/hsnRates';
import { session } from '../../lib/session';
import { api } from '../../api';
import type { Product } from '../../types';

function esc(t: unknown): string {
  return String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  customerPhone?: string;
  items: LineItem[];
  subtotal: number;
  taxTotal: number;
  taxCgst?: number;
  taxSgst?: number;
  taxIgst?: number;
  isInterstate?: boolean;
  grandTotal: number;
  notes?: string;
  terms?: string;
  status: string;
  invoiceDate: string;
  dueDate?: string;
};
type LineItem = {
  description: string;
  hsnSac?: string;
  qty: number;
  rate: number;
  gstPercent: number;
  discountPercent?: number;
  productId?: string;
  taxable: number;
  tax: number;
  total: number;
};

type InvoiceLineRow = {
  description: string;
  hsnSac: string;
  qty: number;
  rate: number;
  gstPercent: number;
  discountPercent: number;
  /** Empty = custom line; otherwise Masters product id (price from price list when available) */
  productId: string;
};

type PriceRule = {
  id: string;
  productId: string;
  vendorId?: string;
  minQty: number;
  maxQty: number | null;
  price: number;
  isActive: boolean;
};

const emptyRow = (): InvoiceLineRow => ({
  description: '',
  hsnSac: '',
  qty: 1,
  rate: 0,
  gstPercent: 18,
  discountPercent: 0,
  productId: '',
});

function lineTaxable(qty: number, rate: number, discountPercent: number): number {
  const disc = Math.min(100, Math.max(0, discountPercent || 0));
  return Math.round((((qty || 0) * (rate || 0) * (100 - disc)) / 100) * 100) / 100;
}

/** Mirror server /price-lists/resolve: vendor slab > general slab > product.price */
function resolveCatalogPrice(product: Product, rules: PriceRule[], vendorId: string | null, qty: number): number {
  const q = qty > 0 ? qty : 1;
  const candidates = rules.filter(
    r =>
      r.isActive !== false &&
      r.productId === product.id &&
      r.minQty <= q &&
      (r.maxQty == null || r.maxQty >= q) &&
      (!r.vendorId || (vendorId && r.vendorId === vendorId)),
  );
  candidates.sort((a, b) => {
    const aV = vendorId && a.vendorId === vendorId ? 0 : 1;
    const bV = vendorId && b.vendorId === vendorId ? 0 : 1;
    if (aV !== bV) return aV - bV;
    return b.minQty - a.minQty;
  });
  return candidates[0]?.price ?? product.price ?? 0;
}

export function InvoicesView() {
  const { toast } = useToast();
  const invoicesLabel = useTabLabel('invoices', 'Invoices');
  const serviceMobile = isServiceMobileMode();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [billSettings, setBillSettings] = useState<Record<string, unknown>>({});
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  useEscapeKey(() => {
    if (deleteTarget) setDeleteTarget(null);
    else if (selectedInvoice) setSelectedInvoice(null);
    else if (createOpen) setCreateOpen(false);
  });

  const load = () => {
    fetchApi<Invoice[]>('/invoices')
      .then(setInvoices)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    api.settings
      .getBillSettings()
      .then(s => {
        setBillSettings(s || {});
        const style = (s as { invoiceTemplateStyle?: string } | null)?.invoiceTemplateStyle;
        const legacy = localStorage.getItem('dg_inv_style');
        const next =
          style === 'classic' || style === 'minimal' || style === 'modern'
            ? style
            : legacy === 'classic' || legacy === 'minimal' || legacy === 'modern'
              ? legacy
              : 'modern';
        setPdfStyle(next);
      })
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetchApi(`/invoices/${deleteTarget.id}`, { method: 'DELETE' });
      setInvoices(prev => prev.filter(i => i.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast('Invoice deleted', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleStatus = async (inv: Invoice, status: string) => {
    try {
      await fetchApi(`/invoices/${inv.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      setInvoices(prev => prev.map(i => (i.id === inv.id ? { ...i, status } : i)));
      toast(`Invoice marked as ${status}`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-600',
      sent: 'bg-blue-100 text-blue-700',
      paid: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-rose-100 text-rose-700',
    };
    return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase', m[s] || m.draft)}>{s}</span>;
  };

  const [pdfStyle, setPdfStyle] = useState<'modern' | 'classic' | 'minimal'>('modern');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'cancelled'>('all');

  const printInvoice = async (inv: Invoice) => {
    // Open sync with the click — await before window.open gets blocked (Electron / pop-up blockers).
    // On Capacitor this opens an in-app preview (window.open is not available).
    const w = openPrintWindow('Preparing invoice…');
    if (!w) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    try {
      if (!Array.isArray(inv.items)) {
        throw new Error('Invoice has no line items to print');
      }
      const user = session.getUser() || {};
      const bs = billSettings;
      const color = /^#[0-9a-fA-F]{3,8}$/.test(String(bs.primaryColor || '')) ? String(bs.primaryColor) : '#F27D26';
      const logoSrc = typeof bs.logoBase64 === 'string' && bs.logoBase64.startsWith('data:image/') ? bs.logoBase64 : '';
      const sigSrc =
        typeof bs.signatureBase64 === 'string' && bs.signatureBase64.startsWith('data:image/')
          ? bs.signatureBase64
          : '';
      const logoHtml = logoSrc
        ? `<img src="${logoSrc}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
        : `<div style="width:48px;height:48px;background:${color};border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px;">${esc((user.companyName || 'C').substring(0, 1))}</div>`;
      const tagline = esc((bs.tagline as string) || '');
      const invPrefix = esc((bs.invoicePrefix as string) || '');
      const footerText = esc((bs.footerText as string) || 'Powered by Dhandho');
      const hasBankDetails = bs.bankAccountName || bs.bankAccountNumber || bs.bankName;
      const upiQrDataUrl = bs.bankUpiId
        ? await fetchImageAsDataUrl(
            `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${bs.bankUpiId}&pn=${bs.bankAccountName || 'Business'}&cu=INR`)}`,
          )
        : '';
      const upiQrHtml = upiQrDataUrl
        ? `<div style="text-align:center;"><img src="${upiQrDataUrl}" style="width:120px;height:120px;" /><p style="font-size:10px;color:#6b7280;margin-top:4px;">Scan to pay via UPI</p></div>`
        : '';
      const bankHtml =
        hasBankDetails || upiQrHtml
          ? `<div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">${hasBankDetails ? `<div style="flex:1;"><strong style="font-size:12px;">Bank Details</strong><table style="width:100%;margin-top:6px;font-size:11px;">${bs.bankAccountName ? `<tr><td style="color:#6b7280;width:100px;">Account Name</td><td>${esc(bs.bankAccountName)}</td></tr>` : ''}${bs.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(bs.bankAccountNumber)}</td></tr>` : ''}${bs.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(bs.bankName)}${bs.bankBranch ? `, ${esc(bs.bankBranch)}` : ''}</td></tr>` : ''}${bs.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(bs.bankIfsc)}</td></tr>` : ''}</table></div>` : ''}${upiQrHtml}</div></div>`
          : '';
      const sigHtml =
        bs.signatoryName || sigSrc
          ? `<div style="margin-top:24px;display:flex;justify-content:flex-end;"><div style="text-align:center;">${sigSrc ? `<img src="${sigSrc}" style="height:50px;margin-bottom:4px;" />` : '<div style="height:50px;"></div>'}<p style="font-size:11px;border-top:1px solid #999;padding-top:4px;">${esc(bs.signatoryName || '')}${bs.signatoryDesignation ? `<br/><span style="font-size:10px;color:#666;">${esc(bs.signatoryDesignation)}</span>` : ''}</p></div></div>`
          : '';
      const termsHtml =
        inv.terms || bs.termsAndConditions
          ? `<div style="margin-top:16px;font-size:10px;color:#666;"><strong>Terms & Conditions:</strong><br/>${esc(inv.terms || bs.termsAndConditions)}</div>`
          : '';

      const hasGst = inv.taxTotal > 0;
      const useIgst = inv.isInterstate === true || (typeof inv.taxIgst === 'number' && inv.taxIgst > 0);
      const taxCgst = typeof inv.taxCgst === 'number' ? inv.taxCgst : Math.round(inv.taxTotal / 2);
      const taxSgst = typeof inv.taxSgst === 'number' ? inv.taxSgst : Math.round((inv.taxTotal - taxCgst) * 100) / 100;
      const taxIgst = typeof inv.taxIgst === 'number' ? inv.taxIgst : inv.taxTotal;
      const showDiscCol = inv.items.some(it => (it.discountPercent || 0) > 0);
      const itemColspan = (hasGst ? 8 : 6) + (showDiscCol ? 1 : 0);
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${hasGst ? 'Tax Invoice' : 'Invoice'} — ${invPrefix}${esc(inv.invoiceNumber)}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;padding:20px;max-width:800px;margin:0 auto;font-size:12px;}
      table{border-collapse:collapse;}.outer{border:2px solid ${color};width:100%;}.outer td,.outer th{border:1px solid #ccc;padding:4px 8px;font-size:11px;}
      .hdr{border-bottom:2px solid ${color};}.hdr td{border:none;padding:8px 12px;vertical-align:top;}
      .tagline{background:${color};color:white;text-align:center;padding:4px;font-size:11px;font-weight:600;letter-spacing:1px;}
      .title-row td{padding:6px 12px;font-size:12px;border-bottom:2px solid ${color};}
      .gstin-text{font-family:monospace;font-weight:700;font-size:13px;}
      .title-text{font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;}
      .items th{background:#f0f0f0;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;padding:6px;text-align:center;font-weight:700;}
      .items td{padding:5px 6px;text-align:center;}.items .left{text-align:left;}.items .right{text-align:right;}
      .items tbody tr{break-inside:avoid;page-break-inside:avoid;}
      .items .total-row{font-weight:700;background:#f0f0f0;}
      .grand-total{font-size:16px;font-weight:900;color:${color};}
      .footer-text{font-size:9px;color:#999;text-align:center;margin-top:8px;}
      .repeat-banner th{background:#fff;border-bottom:2px solid ${color};text-align:left;padding:6px 8px;font-size:11px;text-transform:none;letter-spacing:0;}
      @media print{body{padding:10px;} @page{margin:10mm;} thead{display:table-header-group;}}
    </style></head><body>
    <table class="outer avoid-break">
      <tr class="hdr">
        <td colspan="2" style="width:65%;">
          <div style="display:flex;align-items:center;gap:12px;">${logoHtml}<div>
            <div style="font-size:18px;font-weight:800;color:${color};">${esc(user.companyName || 'Dhandho')}</div>
            ${user.address ? `<div style="font-size:10px;color:#555;margin-top:2px;">${esc(user.address)}</div>` : ''}
            ${user.phone ? `<div style="font-size:10px;color:#555;">Ph: ${esc(user.phone)}</div>` : ''}
          </div></div>
        </td>
        <td colspan="2" style="text-align:right;width:35%;">
          <div class="title-text" style="color:${color};">${hasGst ? 'TAX INVOICE' : 'INVOICE'}</div>
          <div style="font-size:11px;margin-top:4px;"><strong>${invPrefix}${esc(inv.invoiceNumber)}</strong></div>
          <div style="font-size:10px;color:#555;">Date: ${formatDate(inv.invoiceDate)}</div>
          ${inv.dueDate ? `<div style="font-size:10px;color:#555;">Due: ${formatDate(inv.dueDate)}</div>` : ''}
        </td>
      </tr>
      ${tagline ? `<tr><td colspan="4" class="tagline">${tagline}</td></tr>` : ''}
      <tr class="title-row">
        <td colspan="2">${user.gstNumber ? `<span class="gstin-text">GSTIN: ${esc(user.gstNumber)}</span>` : ''}</td>
        <td colspan="2" style="text-align:right;">${inv.status === 'paid' ? '<span style="color:#059669;font-weight:700;">✓ PAID</span>' : ''}</td>
      </tr>
      <tr><td colspan="4" style="padding:8px 12px;">
        <table style="width:100%;"><tr>
          <td style="border:none;width:50%;vertical-align:top;padding:4px 8px;">
            <strong style="font-size:10px;color:#555;">BILL TO:</strong><br/>
            <strong>${esc(inv.customerName)}</strong>
            ${inv.customerGstin ? `<br/><span style="font-family:monospace;font-size:11px;">GSTIN: ${esc(inv.customerGstin)}</span>` : ''}
            ${inv.customerAddress ? `<br/><span style="font-size:10px;">${esc(inv.customerAddress)}</span>` : ''}
            ${inv.customerPhone ? `<br/><span style="font-size:10px;">Ph: ${esc(inv.customerPhone)}</span>` : ''}
            ${
              hasGst
                ? `<br/><span style="font-size:10px;">Place of Supply: ${esc(
                    (() => {
                      const code = String(inv.customerGstin || user.gstNumber || '24')
                        .trim()
                        .toUpperCase()
                        .slice(0, 2);
                      const STATES: Record<string, string> = {
                        '24': 'Gujarat',
                        '27': 'Maharashtra',
                        '07': 'Delhi',
                        '29': 'Karnataka',
                        '33': 'Tamil Nadu',
                        '09': 'Uttar Pradesh',
                        '06': 'Haryana',
                        '03': 'Punjab',
                        '08': 'Rajasthan',
                        '23': 'Madhya Pradesh',
                        '19': 'West Bengal',
                        '36': 'Telangana',
                        '37': 'Andhra Pradesh',
                        '32': 'Kerala',
                      };
                      return `${STATES[code] || 'Gujarat'} (${code || '24'})`;
                    })(),
                  )}</span>`
                : ''
            }
          </td>
        </tr></table>
      </td></tr>
    </table>
    <table class="outer items" style="margin-top:-2px;">
      <thead>
        <tr class="repeat-banner"><th colspan="${itemColspan}">
          <span style="font-weight:800;color:${color};">${esc(user.companyName || 'Dhandho')}</span>
          <span style="float:right;font-weight:700;">${invPrefix}${esc(inv.invoiceNumber)}</span>
        </th></tr>
        <tr><th style="width:30px;">Sr</th><th class="left">Description</th><th>HSN/SAC</th><th>Qty</th><th class="right">Rate</th>${showDiscCol ? '<th class="right">Disc%</th>' : ''}${hasGst ? '<th class="right">GST%</th><th class="right">Tax</th>' : ''}<th class="right">Amount</th></tr>
      </thead>
      <tbody>
        ${inv.items
          .map((it, i) => {
            const disc = it.discountPercent || 0;
            return `<tr><td>${i + 1}</td><td class="left">${esc(it.description)}</td><td>${esc(it.hsnSac || '—')}</td><td>${it.qty}</td><td class="right">₹${Number(it.rate).toLocaleString()}</td>${showDiscCol ? `<td class="right">${disc > 0 ? `${disc}%` : '—'}</td>` : ''}${hasGst ? `<td class="right">${it.gstPercent}%</td><td class="right">₹${Number(it.tax).toLocaleString()}</td>` : ''}<td class="right">₹${Number(it.total).toLocaleString()}</td></tr>`;
          })
          .join('')}
      </tbody>
    </table>
    <div class="print-end avoid-break">
    <table class="outer items" style="margin-top:-2px;border-top:none;">
      <tbody>
        <tr class="total-row"><td colspan="${itemColspan - 1}" class="right">Subtotal</td><td class="right">₹${inv.subtotal.toLocaleString()}</td></tr>
        ${
          hasGst
            ? useIgst
              ? `<tr><td colspan="${itemColspan - 1}" class="right">IGST</td><td class="right">₹${Number(taxIgst).toLocaleString()}</td></tr>`
              : `<tr><td colspan="${itemColspan - 1}" class="right">CGST</td><td class="right">₹${Number(taxCgst).toLocaleString()}</td></tr>
        <tr><td colspan="${itemColspan - 1}" class="right">SGST</td><td class="right">₹${Number(taxSgst).toLocaleString()}</td></tr>`
            : ''
        }
        <tr class="total-row"><td colspan="${itemColspan - 1}" class="right"><span class="grand-total">Grand Total</span></td><td class="right"><span class="grand-total">₹${inv.grandTotal.toLocaleString()}</span></td></tr>
      </tbody>
    </table>
    ${inv.notes ? `<div style="margin-top:12px;padding:10px;background:#fffbeb;border-radius:6px;font-size:11px;color:#92400e;"><strong>Notes:</strong> ${esc(inv.notes)}</div>` : ''}
    ${bankHtml}${termsHtml}${sigHtml}
    <p class="footer-text">${footerText}</p>
    </div>
    </body></html>`;
      printBillInWindow(w, html, `${hasGst ? 'Tax-Invoice' : 'Invoice'}-${inv.invoiceNumber}`);
    } catch (err) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
      // Capacitor uses an in-app overlay; window.close() does not remove it.
      closePrintOverlay();
      toast(err instanceof Error ? err.message : 'Print failed', 'error');
    }
  };

  if (loading)
    return (
      <div className="py-20">
        <LoadingSpinner />
      </div>
    );

  const outstanding = invoices
    .filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + (i.grandTotal || 0), 0);
  const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.grandTotal || 0), 0);
  const filteredInvoices = statusFilter === 'all' ? invoices : invoices.filter(i => i.status === statusFilter);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 sm:space-y-6 pb-14 sm:pb-0"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 hidden sm:block">
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <FileText size={22} className="shrink-0" /> {invoicesLabel}
          </h2>
          <p className="text-sm text-gray-500">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          {/* Offline Mobile: template lives in Settings → Bill Customization */}
          {!serviceMobile && (
            <select
              value={pdfStyle}
              onChange={e => {
                const v = e.target.value as 'modern' | 'classic' | 'minimal';
                setPdfStyle(v);
                localStorage.setItem('dg_inv_style', v);
                void api.settings
                  .updateBillSettings({ ...billSettings, invoiceTemplateStyle: v })
                  .then(saved => setBillSettings(saved || { ...billSettings, invoiceTemplateStyle: v }))
                  .catch(() => {});
              }}
              className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-200 rounded-lg sm:rounded-xl text-[11px] sm:text-sm bg-white focus:ring-2 focus:ring-brand"
              aria-label="Invoice template"
            >
              <option value="modern">Modern</option>
              <option value="classic">Classic (Tally)</option>
              <option value="minimal">Minimal</option>
            </select>
          )}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-bold shadow-lg shadow-brand/20"
          >
            <Plus size={16} /> New Invoice
          </button>
        </div>
      </div>

      {/* Phone summary + filters — Outstanding/Collected live on Analytics for Offline Mobile */}
      <div className="sm:hidden space-y-2">
        {!serviceMobile && (
          <div className="grid grid-cols-2 gap-2">
            <MobileKpiCard label="Outstanding" value={`₹${outstanding.toLocaleString()}`} accent="rose" />
            <MobileKpiCard label="Collected" value={`₹${paidTotal.toLocaleString()}`} accent="green" />
          </div>
        )}
        <MobilePillTabs
          items={[
            { id: 'all', label: 'All' },
            { id: 'draft', label: 'Draft' },
            { id: 'sent', label: 'Sent' },
            { id: 'paid', label: 'Paid' },
          ]}
          value={statusFilter}
          onChange={id => setStatusFilter(id as typeof statusFilter)}
        />
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <>
          <div className="sm:hidden">
            <MobileEmptyState
              icon={<FileText />}
              title="No invoices yet"
              subtitle="Create your first invoice for services or custom billing"
              actionLabel="New Invoice"
              onAction={() => setCreateOpen(true)}
            />
          </div>
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <FileText size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium text-lg">No invoices yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Create your first standalone invoice for services or custom billing
            </p>
          </div>
        </>
      ) : (
        <>
          {filteredInvoices.length === 0 ? (
            <div className="sm:hidden py-8 text-center text-[12px] text-gray-400 font-medium">No matching invoices</div>
          ) : (
            <div className="sm:hidden space-y-2">
              {filteredInvoices.map(inv => (
                <div key={inv.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(inv)}
                    className="w-full text-left px-2.5 py-2 active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-[12px] text-gray-900 truncate">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-[13px] font-bold text-gray-800 truncate">{inv.customerName}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(inv.invoiceDate)}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-[13px] font-bold text-gray-900 tabular-nums">
                          ₹{inv.grandTotal.toLocaleString()}
                        </p>
                        {statusBadge(inv.status)}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-end gap-0.5 border-t border-gray-50 px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => printInvoice(inv)}
                      className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-brand hover:bg-orange-50 rounded-lg"
                      title={serviceMobile ? 'Download PDF' : 'Print/PDF'}
                      aria-label={serviceMobile ? 'Download invoice PDF' : 'Print invoice'}
                    >
                      {serviceMobile ? <Download size={14} /> : <Printer size={14} />}
                    </button>
                    {inv.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => handleStatus(inv, 'sent')}
                        className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Mark Sent"
                        aria-label="Mark sent"
                      >
                        <Send size={14} />
                      </button>
                    )}
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => handleStatus(inv, 'paid')}
                        className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        title="Mark Paid"
                        aria-label="Mark paid"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(inv)}
                      className="p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-lg"
                      title="Delete"
                      aria-label="Delete invoice"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Desktop / tablet table */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50/80 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-left">Invoice</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-left">Customer</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Amount</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-center">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map(inv => (
                  <tr
                    key={inv.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedInvoice(inv)}
                  >
                    <td className="px-4 py-3 font-mono font-medium text-sm">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{inv.customerName}</p>
                      {inv.customerGstin && <p className="text-[10px] text-gray-400 font-mono">{inv.customerGstin}</p>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold">₹{inv.grandTotal.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">{statusBadge(inv.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => printInvoice(inv)}
                          className="p-1.5 text-brand hover:bg-orange-50 rounded-lg"
                          title={serviceMobile ? 'Download PDF' : 'Print/PDF'}
                          aria-label={serviceMobile ? 'Download invoice PDF' : 'Print invoice'}
                        >
                          {serviceMobile ? <Download size={15} /> : <Printer size={15} />}
                        </button>
                        {inv.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleStatus(inv, 'sent')}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Mark Sent"
                          >
                            <Send size={15} />
                          </button>
                        )}
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => handleStatus(inv, 'paid')}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Mark Paid"
                          >
                            <Check size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(inv)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {invoices.length > 0 && <MobileFab label="Invoice" onClick={() => setCreateOpen(true)} />}

      {/* Create modal */}
      <AnimatePresence>
        {createOpen && (
          <CreateInvoiceModal
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              load();
            }}
          />
        )}
      </AnimatePresence>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedInvoice(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">{selectedInvoice.invoiceNumber}</h3>
                  <p className="text-sm text-gray-500">{selectedInvoice.customerName}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(selectedInvoice.status)}
                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(null)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-400 uppercase">
                      <th className="py-2 text-left">Item</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">Rate</th>
                      <th className="py-2 text-right">GST</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items.map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2">{it.description}</td>
                        <td className="py-2 text-right">{it.qty}</td>
                        <td className="py-2 text-right">₹{Number(it.rate).toLocaleString()}</td>
                        <td className="py-2 text-right">{it.gstPercent}%</td>
                        <td className="py-2 text-right font-medium">₹{Number(it.total).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-right space-y-1 mb-4">
                <p className="text-sm text-gray-500">Subtotal: ₹{selectedInvoice.subtotal.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Tax: ₹{selectedInvoice.taxTotal.toLocaleString()}</p>
                <p className="text-lg font-bold">Total: ₹{selectedInvoice.grandTotal.toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => printInvoice(selectedInvoice)}
                  className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  {serviceMobile ? (
                    <>
                      <Download size={16} /> Download PDF
                    </>
                  ) : (
                    <>
                      <Printer size={16} /> Print / PDF
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = `Invoice ${selectedInvoice.invoiceNumber}\n${selectedInvoice.customerName}\nTotal: ₹${selectedInvoice.grandTotal.toLocaleString()}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
                  }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl font-medium text-sm"
                >
                  WhatsApp
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center"
            >
              <p className="text-lg font-bold mb-2">Delete Invoice?</p>
              <p className="text-sm text-gray-500 mb-4">
                {deleteTarget.invoiceNumber} — ₹{deleteTarget.grandTotal.toLocaleString()}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export type InvoicePartyPrefill = {
  partyType?: 'vendor' | 'customer' | null;
  partyId?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
};

type InvoiceParty = {
  key: string; // vendor:ID | customer:ID
  label: string;
  name: string;
  phone: string;
  address: string;
  gstin: string;
  partyType: 'vendor' | 'customer';
  partyId: string;
};

// Create Invoice Modal
export function CreateInvoiceModal({
  onClose,
  onCreated,
  initialParty,
}: {
  onClose: () => void;
  onCreated: () => void;
  initialParty?: InvoicePartyPrefill | null;
}) {
  const { toast } = useToast();
  const cfg = useBusinessConfig();
  const isService = cfg.type === 'service';
  const vendorPartyKind = isService ? 'Client' : 'Vendor';
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [form, setForm] = useState({
    customerName: initialParty?.customerName || '',
    customerGstin: initialParty?.customerGstin || '',
    customerAddress: initialParty?.customerAddress || '',
    customerPhone: initialParty?.customerPhone || '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    notes: '',
    terms: '',
  });
  const [rows, setRows] = useState<InvoiceLineRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [parties, setParties] = useState<InvoiceParty[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [partyKey, setPartyKey] = useState(() => {
    if (initialParty?.partyType && initialParty?.partyId) {
      return `${initialParty.partyType}:${initialParty.partyId}`;
    }
    return '';
  });
  /** Phone stepper only; desktop shows all sections. */
  const [step, setStep] = useState(0);
  const INVOICE_STEPS = ['Party', 'Items', 'Review'];
  const resolveTokenRef = useRef<Record<number, number>>({});

  const pricingVendorId = partyKey.startsWith('vendor:') ? partyKey.slice('vendor:'.length) : null;

  /** Prefer server resolve; fall back to client catalog rules. */
  const resolveRowPrice = (idx: number, productId: string, vendorId: string | null, quantity: number) => {
    if (!productId || quantity <= 0) return;
    const token = (resolveTokenRef.current[idx] = (resolveTokenRef.current[idx] || 0) + 1);
    const qs = new URLSearchParams({
      productId,
      quantity: String(quantity),
    });
    if (vendorId) qs.set('vendorId', vendorId);
    fetch(`/api/price-lists/resolve?${qs}`, {
      headers: {
        Authorization: `Bearer ${session.getToken()}`,
        'X-Tenant-ID': session.getTenantId() || '',
      },
    })
      .then(r => r.json())
      .then(d => {
        if (resolveTokenRef.current[idx] !== token) return;
        if (!d || typeof d.price !== 'number') return;
        setRows(prev => {
          const row = prev[idx];
          if (!row || row.productId !== productId || (row.qty || 0) !== quantity) return prev;
          return prev.map((r, i) => (i === idx ? { ...r, rate: d.price } : r));
        });
      })
      .catch(() => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        const rate = resolveCatalogPrice(p, priceRules, vendorId, quantity);
        setRows(prev => {
          const row = prev[idx];
          if (!row || row.productId !== productId) return prev;
          return prev.map((r, i) => (i === idx ? { ...r, rate } : r));
        });
      });
  };

  useEffect(() => {
    fetchApi<{ number: string }>('/invoices/next-number')
      .then(r => setInvoiceNumber(r.number))
      .catch(() => {});
    Promise.all([api.vendors.list(), api.customers.list(), api.products.list(), fetchApi<PriceRule[]>('/price-lists')])
      .then(([vendors, customers, productList, rules]) => {
        const fromVendors: InvoiceParty[] = vendors
          .filter(v => v.id !== 'OWNER')
          .map(v => ({
            key: `vendor:${v.id}`,
            label: `${v.name} (${vendorPartyKind})`,
            name: v.name,
            phone: v.phone || '',
            address: v.address || '',
            gstin: v.gstNumber || '',
            partyType: 'vendor' as const,
            partyId: v.id,
          }));
        const fromCustomers: InvoiceParty[] = customers.map(c => ({
          key: `customer:${c.id}`,
          label: `${c.name} (${isService ? 'Customer' : 'Client'})`,
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          gstin: '',
          partyType: 'customer' as const,
          partyId: c.id,
        }));
        const list = [...fromVendors, ...fromCustomers].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        );
        setParties(list);
        setProducts(productList);
        setPriceRules(rules.filter(r => r.isActive !== false));
        // If opened from Finance with a party id, ensure fields filled once list loads
        if (initialParty?.partyType && initialParty?.partyId) {
          const key = `${initialParty.partyType}:${initialParty.partyId}`;
          const party = list.find(p => p.key === key);
          if (party) {
            setPartyKey(key);
            setForm(f => ({
              ...f,
              customerName: party.name || f.customerName,
              customerPhone: party.phone || f.customerPhone,
              customerAddress: party.address || f.customerAddress,
              customerGstin: party.gstin || f.customerGstin,
            }));
          }
        }
      })
      .catch(() => {
        setParties([]);
        setProducts([]);
        setPriceRules([]);
      });
  }, [initialParty?.partyType, initialParty?.partyId, vendorPartyKind, isService]);

  const selectParty = (key: string) => {
    setPartyKey(key);
    if (!key) return;
    const party = parties.find(p => p.key === key);
    if (!party) return;
    setForm(f => ({
      ...f,
      customerName: party.name,
      customerPhone: party.phone || f.customerPhone,
      customerAddress: party.address || f.customerAddress,
      customerGstin: party.gstin || f.customerGstin,
    }));
    // Re-price catalog lines when vendor party changes (vendor-specific price list)
    const vendorId = party.partyType === 'vendor' ? party.partyId : null;
    const nextRows = rows.map(r => {
      if (!r.productId) return r;
      const p = products.find(x => x.id === r.productId);
      if (!p) return r;
      return { ...r, rate: resolveCatalogPrice(p, priceRules, vendorId, r.qty) };
    });
    setRows(nextRows);
    nextRows.forEach((r, i) => {
      if (r.productId) resolveRowPrice(i, r.productId, vendorId, r.qty || 1);
    });
  };

  const applyCatalogItem = (idx: number, productId: string) => {
    if (!productId) {
      setRows(rows.map((r, i) => (i === idx ? { ...emptyRow(), qty: r.qty || 1 } : r)));
      return;
    }
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const qty = rows[idx]?.qty || 1;
    const rate = resolveCatalogPrice(p, priceRules, pricingVendorId, qty);
    const hint = p.hsnCode ? suggestHsnRate(p.hsnCode) : null;
    setRows(
      rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              productId: p.id,
              description: p.name,
              hsnSac: p.hsnCode || r.hsnSac || '',
              qty,
              rate,
              gstPercent: p.gstRate ?? hint?.rate ?? r.gstPercent ?? 18,
            }
          : r,
      ),
    );
    resolveRowPrice(idx, p.id, pricingVendorId, qty);
  };

  const updateRowQty = (idx: number, qty: number) => {
    setRows(
      rows.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, qty };
        if (r.productId) {
          const p = products.find(x => x.id === r.productId);
          if (p) next.rate = resolveCatalogPrice(p, priceRules, pricingVendorId, qty);
        }
        return next;
      }),
    );
    const row = rows[idx];
    if (row?.productId && qty > 0) {
      resolveRowPrice(idx, row.productId, pricingVendorId, qty);
    }
  };

  const totals = rows.reduce(
    (acc, r) => {
      const taxable = lineTaxable(r.qty, r.rate, r.discountPercent);
      const tax = Math.round(((taxable * (r.gstPercent || 0)) / 100) * 100) / 100;
      return { subtotal: acc.subtotal + taxable, tax: acc.tax + tax, grand: acc.grand + taxable + tax };
    },
    { subtotal: 0, tax: 0, grand: 0 },
  );

  const handleSubmit = async (status: 'draft' | 'sent') => {
    if (!form.customerName.trim()) {
      toast('Customer name is required', 'error');
      setStep(0);
      return;
    }
    const validRows = rows.filter(r => r.description.trim() && r.rate > 0);
    if (!validRows.length) {
      toast('Add at least one line item', 'error');
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const selected = parties.find(p => p.key === partyKey);
      await fetchApi('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          dueDate: form.dueDate?.trim() || null,
          invoiceNumber,
          items: validRows.map(({ description, hsnSac, qty, rate, gstPercent, discountPercent, productId }) => ({
            description,
            hsnSac,
            qty,
            rate,
            gstPercent,
            discountPercent: discountPercent || 0,
            ...(productId ? { productId } : {}),
          })),
          status,
          partyType: selected?.partyType || null,
          partyId: selected?.partyId || null,
        }),
      });
      toast(`Invoice ${invoiceNumber} created`, 'success');
      onCreated();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (step === 0 && !form.customerName.trim()) {
      toast('Customer name is required', 'error');
      return;
    }
    if (step === 1) {
      const validRows = rows.filter(r => r.description.trim() && r.rate > 0);
      if (!validRows.length) {
        toast('Add at least one line item', 'error');
        return;
      }
    }
    setStep(s => Math.min(2, s + 1));
  };

  const productSelectOptions = (qty: number) =>
    products.map(p => {
      const listPrice = resolveCatalogPrice(p, priceRules, pricingVendorId, qty || 1);
      const fromList = priceRules.some(r => r.productId === p.id && (!r.vendorId || r.vendorId === pricingVendorId));
      return (
        <option key={p.id} value={p.id}>
          {p.name} — ₹{listPrice.toLocaleString()}
          {fromList ? ' (price list)' : ''}
        </option>
      );
    });

  const renderLineItemFields = (row: InvoiceLineRow, idx: number): LineItemCardField[] => {
    const catalogPrice =
      row.productId && products.find(p => p.id === row.productId)
        ? resolveCatalogPrice(
            products.find(p => p.id === row.productId)!,
            priceRules,
            pricingVendorId,
            row.qty || 1,
          )
        : null;
    return [
      {
        key: 'product',
        label: 'Product',
        wide: true as const,
        node: (
          <select
            value={row.productId}
            onChange={e => applyCatalogItem(idx, e.target.value)}
            className={formControlClass}
          >
            <option value="">Custom item</option>
            {productSelectOptions(row.qty || 1)}
          </select>
        ),
      },
      {
        key: 'description',
        label: 'Description',
        wide: true as const,
        node: (
          <>
            <input
              value={row.description}
              onChange={e => setRows(rows.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))}
              className={formControlClass}
              placeholder={row.productId ? 'Description (editable)' : 'Type custom service or item'}
            />
            {catalogPrice != null && row.rate !== catalogPrice && (
              <p className="text-[10px] text-amber-600 mt-1">
                Rate edited from price list ₹{catalogPrice.toLocaleString()}
              </p>
            )}
          </>
        ),
      },
      {
        key: 'hsn',
        label: 'HSN/SAC',
        node: (
          <input
            value={row.hsnSac}
            onChange={e => {
              const v = e.target.value;
              const hint = suggestHsnRate(v);
              setRows(
                rows.map((r, i) =>
                  i === idx
                    ? {
                        ...r,
                        hsnSac: v,
                        ...(hint && r.gstPercent === 18 ? { gstPercent: hint.rate } : {}),
                      }
                    : r,
                ),
              );
            }}
            className={cn(formControlClass, 'font-mono')}
            placeholder="9983"
          />
        ),
      },
      {
        key: 'qty',
        label: 'Quantity',
        node: (
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={row.qty || ''}
            onChange={e => updateRowQty(idx, parseInt(e.target.value) || 0)}
            className={formControlClass}
          />
        ),
      },
      {
        key: 'rate',
        label: 'Rate',
        node: (
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={row.rate || ''}
            onChange={e =>
              setRows(rows.map((r, i) => (i === idx ? { ...r, rate: parseFloat(e.target.value) || 0 } : r)))
            }
            className={formControlClass}
          />
        ),
      },
      {
        key: 'disc',
        label: 'Discount %',
        node: (
          <input
            type="number"
            min={0}
            max={100}
            inputMode="decimal"
            value={row.discountPercent || ''}
            onChange={e =>
              setRows(
                rows.map((r, i) =>
                  i === idx
                    ? {
                        ...r,
                        discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                      }
                    : r,
                ),
              )
            }
            className={formControlClass}
            placeholder="0"
          />
        ),
      },
      {
        key: 'gst',
        label: 'GST %',
        node: (
          <input
            type="number"
            min={0}
            max={28}
            inputMode="numeric"
            value={row.gstPercent}
            onChange={e =>
              setRows(rows.map((r, i) => (i === idx ? { ...r, gstPercent: parseInt(e.target.value) || 0 } : r)))
            }
            className={formControlClass}
          />
        ),
      },
    ];
  };

  const totalsBar = (
    <div className="bg-gray-50 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3">
      <div className="text-xs sm:text-sm text-gray-600 min-w-0">
        Subtotal: ₹{totals.subtotal.toLocaleString()}
        <span className="hidden xs:inline"> • </span>
        <br className="sm:hidden" />
        Tax: ₹{totals.tax.toLocaleString()}
      </div>
      <div className="text-lg sm:text-xl font-bold text-brand shrink-0 tabular-nums">
        ₹{totals.grand.toLocaleString()}
      </div>
    </div>
  );

  const footer = (
    <>
      {/* Phone stepper actions */}
      <div className="sm:hidden">
        <ModalActions>
          {step === 0 ? (
            <ModalActionButton variant="ghost" onClick={onClose}>
              Cancel
            </ModalActionButton>
          ) : (
            <ModalActionButton variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))}>
              Back
            </ModalActionButton>
          )}
          {step < 2 ? (
            <ModalActionButton variant="primary" onClick={goNext}>
              Next
            </ModalActionButton>
          ) : (
            <>
              <ModalActionButton variant="secondary" disabled={submitting} onClick={() => handleSubmit('draft')}>
                {submitting ? 'Saving…' : 'Save Draft'}
              </ModalActionButton>
              <ModalActionButton variant="primary" disabled={submitting} onClick={() => handleSubmit('sent')}>
                {submitting ? 'Saving…' : 'Create & Send'}
              </ModalActionButton>
            </>
          )}
        </ModalActions>
      </div>
      {/* Desktop actions */}
      <div className="hidden sm:block">
        <ModalActions>
          <ModalActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ModalActionButton>
          <ModalActionButton variant="secondary" disabled={submitting} onClick={() => handleSubmit('draft')}>
            {submitting ? 'Saving…' : 'Save as Draft'}
          </ModalActionButton>
          <ModalActionButton variant="primary" disabled={submitting} onClick={() => handleSubmit('sent')}>
            {submitting ? 'Saving…' : 'Create & Send'}
          </ModalActionButton>
        </ModalActions>
      </div>
    </>
  );

  return (
    <AppModal
      title="New Invoice"
      subtitle={<span className="font-mono">{invoiceNumber}</span>}
      onClose={onClose}
      footer={footer}
      size="lg"
    >
      <div className="space-y-4">
        <MobileStepper
          className="sm:hidden"
          steps={INVOICE_STEPS}
          current={step}
          onStepClick={i => {
            if (i <= step) setStep(i);
          }}
        />

        {/* Step 0 — Party */}
        <div className={cn(step !== 0 && 'hidden', 'sm:block space-y-4')}>
          <FormSection title="Customer" description="Select a party or type a new customer">
            <FormGrid>
              <FormField label={isService ? 'Client' : 'Customer / Vendor'} required className="sm:col-span-2">
                <select value={partyKey} onChange={e => selectParty(e.target.value)} className={formControlClass}>
                  <option value="">{isService ? 'Select client' : 'Select vendor or client'}</option>
                  {parties.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Customer Name" required>
                <input
                  value={form.customerName}
                  onChange={e => {
                    setPartyKey('');
                    setForm({ ...form, customerName: e.target.value });
                  }}
                  className={formControlClass}
                  placeholder="Or type a new name"
                  list="invoice-party-names"
                />
                <datalist id="invoice-party-names">
                  {parties.map(p => (
                    <option key={p.key} value={p.name} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="GSTIN">
                <input
                  value={form.customerGstin}
                  onChange={e => setForm({ ...form, customerGstin: e.target.value.toUpperCase() })}
                  maxLength={15}
                  className={cn(formControlClass, 'font-mono')}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Address" className="sm:col-span-2">
                <input
                  value={form.customerAddress}
                  onChange={e => setForm({ ...form, customerAddress: e.target.value })}
                  className={formControlClass}
                  placeholder="Street, City, State"
                />
              </FormField>
              <FormField label="Phone">
                <input
                  type="tel"
                  value={form.customerPhone}
                  onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                  className={formControlClass}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Invoice Date" required>
                <input
                  type="date"
                  value={form.invoiceDate}
                  onChange={e => setForm({ ...form, invoiceDate: e.target.value })}
                  className={formControlClass}
                  required
                />
              </FormField>
              <FormField label="Due Date" hint="Optional — leave blank if not needed">
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm({ ...form, dueDate: e.target.value })}
                  className={formControlClass}
                />
              </FormField>
            </FormGrid>
          </FormSection>
        </div>

        {/* Step 1 — Items */}
        <div className={cn(step !== 1 && 'hidden', 'sm:block space-y-3')}>
          <FormSection title="Line Items" description="Pick from Masters / Price List, or choose Custom">
            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {rows.map((row, idx) => {
                const taxable = lineTaxable(row.qty, row.rate, row.discountPercent);
                const tax = Math.round(((taxable * (row.gstPercent || 0)) / 100) * 100) / 100;
                return (
                  <div key={idx}>
                    <LineItemCard
                      index={idx}
                      title={row.description || `Item ${idx + 1}`}
                      amountLabel={taxable + tax > 0 ? `₹${(taxable + tax).toLocaleString()}` : undefined}
                      canRemove={rows.length > 1}
                      onRemove={() => setRows(rows.filter((_, i) => i !== idx))}
                      fields={renderLineItemFields(row, idx)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-gray-50">
                  <tr className="text-xs font-bold text-gray-400 uppercase">
                    <th className="px-3 py-2 text-left min-w-[200px]">Item</th>
                    <th className="px-3 py-2 w-24">HSN/SAC</th>
                    <th className="px-3 py-2 w-16">Qty</th>
                    <th className="px-3 py-2 w-24">Rate</th>
                    <th className="px-3 py-2 w-16">Disc%</th>
                    <th className="px-3 py-2 w-16">GST%</th>
                    <th className="px-3 py-2 w-24 text-right">Total</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => {
                    const taxable = lineTaxable(row.qty, row.rate, row.discountPercent);
                    const tax = Math.round(((taxable * (row.gstPercent || 0)) / 100) * 100) / 100;
                    const catalogPrice =
                      row.productId && products.find(p => p.id === row.productId)
                        ? resolveCatalogPrice(
                            products.find(p => p.id === row.productId)!,
                            priceRules,
                            pricingVendorId,
                            row.qty || 1,
                          )
                        : null;
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2 space-y-1.5">
                          <select
                            value={row.productId}
                            onChange={e => applyCatalogItem(idx, e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                          >
                            <option value="">Custom item</option>
                            {productSelectOptions(row.qty || 1)}
                          </select>
                          <input
                            value={row.description}
                            onChange={e =>
                              setRows(rows.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))
                            }
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                            placeholder={row.productId ? 'Description (editable)' : 'Type custom service or item'}
                          />
                          {catalogPrice != null && row.rate !== catalogPrice && (
                            <p className="text-[10px] text-amber-600">
                              Rate edited from price list ₹{catalogPrice.toLocaleString()}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.hsnSac}
                            onChange={e => {
                              const v = e.target.value;
                              const hint = suggestHsnRate(v);
                              setRows(
                                rows.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        hsnSac: v,
                                        ...(hint && r.gstPercent === 18 ? { gstPercent: hint.rate } : {}),
                                      }
                                    : r,
                                ),
                              );
                            }}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                            placeholder="9983"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            value={row.qty || ''}
                            onChange={e => updateRowQty(idx, parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            value={row.rate || ''}
                            onChange={e =>
                              setRows(
                                rows.map((r, i) => (i === idx ? { ...r, rate: parseFloat(e.target.value) || 0 } : r)),
                              )
                            }
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={row.discountPercent || ''}
                            onChange={e =>
                              setRows(
                                rows.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        discountPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={28}
                            value={row.gstPercent}
                            onChange={e =>
                              setRows(
                                rows.map((r, i) =>
                                  i === idx ? { ...r, gstPercent: parseInt(e.target.value) || 0 } : r,
                                ),
                              )
                            }
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium">
                          {taxable + tax > 0 ? `₹${(taxable + tax).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                              className="text-rose-400 hover:text-rose-600 min-h-9 min-w-9"
                              aria-label="Remove line"
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
            </div>

            <button
              type="button"
              onClick={() => setRows([...rows, emptyRow()])}
              className="text-sm font-bold text-brand min-h-11 inline-flex items-center"
            >
              + Add Line
            </button>
            <div className={cn(step !== 1 && 'max-sm:hidden')}>{totalsBar}</div>
          </FormSection>
        </div>

        {/* Step 2 — Review */}
        <div className={cn(step !== 2 && 'hidden', 'sm:block space-y-4')}>
          <div className="sm:hidden space-y-2 text-sm">
            <p className="font-medium text-gray-800">{form.customerName || '—'}</p>
            <p className="text-xs text-gray-500">
              {rows.filter(r => r.description.trim()).length} item(s) · Invoice date {form.invoiceDate || '—'}
            </p>
          </div>
          {totalsBar}
          <FormGrid>
            <FormField label="Notes">
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className={cn(formControlClass, 'min-h-[5rem]')}
                placeholder="Payment terms, bank details..."
              />
            </FormField>
            <FormField label="Terms & Conditions">
              <textarea
                value={form.terms}
                onChange={e => setForm({ ...form, terms: e.target.value })}
                rows={3}
                className={cn(formControlClass, 'min-h-[5rem]')}
                placeholder="E&OE, goods once sold..."
              />
            </FormField>
          </FormGrid>
        </div>
      </div>
    </AppModal>
  );
}
