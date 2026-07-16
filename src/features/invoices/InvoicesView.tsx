import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, FileText, Trash2, Download, Send, Check, X, Printer } from 'lucide-react';
import { cn, formatDate, exportToCsv, useTabLabel, fetchImageAsDataUrl, openPrintWindow, printBillInWindow, PRINT_POPUP_BLOCKED } from '../../lib/utils';
import { fetchApi } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { suggestHsnRate } from '../../lib/hsnRates';
import { session } from '../../lib/session';
import { api } from '../../api';

function esc(t: unknown): string {
  return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


type Invoice = {
  id: string; invoiceNumber: string; customerName: string; customerGstin?: string;
  customerAddress?: string; customerPhone?: string; items: LineItem[];
  subtotal: number; taxTotal: number; grandTotal: number;
  notes?: string; terms?: string; status: string; invoiceDate: string; dueDate?: string;
};
type LineItem = { description: string; hsnSac?: string; qty: number; rate: number; gstPercent: number; taxable: number; tax: number; total: number };

const emptyRow = (): { description: string; hsnSac: string; qty: number; rate: number; gstPercent: number } => ({ description: '', hsnSac: '', qty: 1, rate: 0, gstPercent: 18 });

export function InvoicesView() {
  const { toast } = useToast();
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
    fetchApi<Invoice[]>('/invoices').then(setInvoices).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); api.settings.getBillSettings().then(s => setBillSettings(s || {})).catch(() => {}); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetchApi(`/invoices/${deleteTarget.id}`, { method: 'DELETE' });
      setInvoices(prev => prev.filter(i => i.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast('Invoice deleted', 'success');
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  const handleStatus = async (inv: Invoice, status: string) => {
    try {
      await fetchApi(`/invoices/${inv.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status } : i));
      toast(`Invoice marked as ${status}`, 'success');
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  const statusBadge = (s: string) => {
    const m: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', paid: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-rose-100 text-rose-700' };
    return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", m[s] || m.draft)}>{s}</span>;
  };

  const [pdfStyle, setPdfStyle] = useState<'modern' | 'classic' | 'minimal'>(() => (localStorage.getItem('dg_inv_style') as 'modern' | 'classic' | 'minimal') || 'modern');

  const printInvoice = async (inv: Invoice) => {
    // Open sync with the click — await before window.open gets blocked (Electron / pop-up blockers)
    const w = openPrintWindow();
    if (!w) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    try {
    const user = session.getUser() || {};
    const bs = billSettings;
    const color = /^#[0-9a-fA-F]{3,8}$/.test(String(bs.primaryColor || '')) ? String(bs.primaryColor) : '#F27D26';
    const logoSrc = typeof bs.logoBase64 === 'string' && bs.logoBase64.startsWith('data:image/') ? bs.logoBase64 : '';
    const sigSrc = typeof bs.signatureBase64 === 'string' && bs.signatureBase64.startsWith('data:image/') ? bs.signatureBase64 : '';
    const logoHtml = logoSrc
      ? `<img src="${logoSrc}" style="width:48px;height:48px;border-radius:10px;object-fit:contain;" />`
      : `<div style="width:48px;height:48px;background:${color};border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:20px;">${esc((user.companyName || 'C').substring(0, 1))}</div>`;
    const tagline = esc((bs.tagline as string) || '');
    const invPrefix = esc((bs.invoicePrefix as string) || '');
    const footerText = esc((bs.footerText as string) || 'Powered by Dhandho');
    const hasBankDetails = bs.bankAccountName || bs.bankAccountNumber || bs.bankName;
    const upiQrDataUrl = bs.bankUpiId ? await fetchImageAsDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${bs.bankUpiId}&pn=${bs.bankAccountName || 'Business'}&cu=INR`)}`) : '';
    const upiQrHtml = upiQrDataUrl ? `<div style="text-align:center;"><img src="${upiQrDataUrl}" style="width:120px;height:120px;" /><p style="font-size:10px;color:#6b7280;margin-top:4px;">Scan to pay via UPI</p></div>` : '';
    const bankHtml = hasBankDetails || upiQrHtml ? `<div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">${hasBankDetails ? `<div style="flex:1;"><strong style="font-size:12px;">Bank Details</strong><table style="width:100%;margin-top:6px;font-size:11px;">${bs.bankAccountName ? `<tr><td style="color:#6b7280;width:100px;">Account Name</td><td>${esc(bs.bankAccountName)}</td></tr>` : ''}${bs.bankAccountNumber ? `<tr><td style="color:#6b7280;">Account No.</td><td style="font-family:monospace;">${esc(bs.bankAccountNumber)}</td></tr>` : ''}${bs.bankName ? `<tr><td style="color:#6b7280;">Bank</td><td>${esc(bs.bankName)}${bs.bankBranch ? `, ${esc(bs.bankBranch)}` : ''}</td></tr>` : ''}${bs.bankIfsc ? `<tr><td style="color:#6b7280;">IFSC</td><td style="font-family:monospace;">${esc(bs.bankIfsc)}</td></tr>` : ''}</table></div>` : ''}${upiQrHtml}</div></div>` : '';
    const sigHtml = (bs.signatoryName || sigSrc) ? `<div style="margin-top:24px;display:flex;justify-content:flex-end;"><div style="text-align:center;">${sigSrc ? `<img src="${sigSrc}" style="height:50px;margin-bottom:4px;" />` : '<div style="height:50px;"></div>'}<p style="font-size:11px;border-top:1px solid #999;padding-top:4px;">${esc(bs.signatoryName || '')}${bs.signatoryDesignation ? `<br/><span style="font-size:10px;color:#666;">${esc(bs.signatoryDesignation)}</span>` : ''}</p></div></div>` : '';
    const termsHtml = (inv.terms || bs.termsAndConditions) ? `<div style="margin-top:16px;font-size:10px;color:#666;"><strong>Terms & Conditions:</strong><br/>${esc(inv.terms || bs.termsAndConditions)}</div>` : '';

    const hasGst = inv.taxTotal > 0;
    const halfGst = Math.round(inv.taxTotal / 2);
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
      .items .total-row{font-weight:700;background:#f0f0f0;}
      .grand-total{font-size:16px;font-weight:900;color:${color};}
      .footer-text{font-size:9px;color:#999;text-align:center;margin-top:8px;}
      @media print{body{padding:10px;} @page{margin:8mm;}}
    </style></head><body>
    <table class="outer">
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
            ${hasGst ? `<br/><span style="font-size:10px;">Place of Supply: ${esc((() => {
              const code = String(inv.customerGstin || user.gstNumber || '24').trim().toUpperCase().slice(0, 2);
              const STATES: Record<string, string> = { '24': 'Gujarat', '27': 'Maharashtra', '07': 'Delhi', '29': 'Karnataka', '33': 'Tamil Nadu', '09': 'Uttar Pradesh', '06': 'Haryana', '03': 'Punjab', '08': 'Rajasthan', '23': 'Madhya Pradesh', '19': 'West Bengal', '36': 'Telangana', '37': 'Andhra Pradesh', '32': 'Kerala' };
              return `${STATES[code] || 'Gujarat'} (${code || '24'})`;
            })())}</span>` : ''}
          </td>
        </tr></table>
      </td></tr>
    </table>
    <table class="outer items" style="margin-top:-2px;">
      <thead><tr><th style="width:30px;">Sr</th><th class="left">Description</th><th>HSN/SAC</th><th>Qty</th><th class="right">Rate</th>${hasGst ? '<th class="right">GST%</th><th class="right">Tax</th>' : ''}<th class="right">Amount</th></tr></thead>
      <tbody>
        ${inv.items.map((it, i) => `<tr><td>${i + 1}</td><td class="left">${esc(it.description)}</td><td>${esc(it.hsnSac || '—')}</td><td>${it.qty}</td><td class="right">₹${Number(it.rate).toLocaleString()}</td>${hasGst ? `<td class="right">${it.gstPercent}%</td><td class="right">₹${Number(it.tax).toLocaleString()}</td>` : ''}<td class="right">₹${Number(it.total).toLocaleString()}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="${hasGst ? 7 : 5}" class="right">Subtotal</td><td class="right">₹${inv.subtotal.toLocaleString()}</td></tr>
        ${hasGst ? `<tr><td colspan="7" class="right">CGST</td><td class="right">₹${halfGst.toLocaleString()}</td></tr>
        <tr><td colspan="7" class="right">SGST</td><td class="right">₹${(inv.taxTotal - halfGst).toLocaleString()}</td></tr>` : ''}
        <tr class="total-row"><td colspan="${hasGst ? 7 : 5}" class="right"><span class="grand-total">Grand Total</span></td><td class="right"><span class="grand-total">₹${inv.grandTotal.toLocaleString()}</span></td></tr>
      </tbody>
    </table>
    ${inv.notes ? `<div style="margin-top:12px;padding:10px;background:#fffbeb;border-radius:6px;font-size:11px;color:#92400e;"><strong>Notes:</strong> ${esc(inv.notes)}</div>` : ''}
    ${bankHtml}${termsHtml}${sigHtml}
    <p class="footer-text">${footerText}</p>
    </body></html>`;
    printBillInWindow(w, html, `${hasGst ? 'Tax-Invoice' : 'Invoice'}-${inv.invoiceNumber}`);
    } catch (err) {
      try { w.close(); } catch { /* ignore */ }
      toast(err instanceof Error ? err.message : 'Print failed', 'error');
    }
  };

  if (loading) return <div className="py-20"><LoadingSpinner /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><FileText size={22} /> {useTabLabel('invoices', 'Invoices')}</h2>
          <p className="text-sm text-gray-500">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={pdfStyle} onChange={e => { const v = e.target.value as 'modern' | 'classic' | 'minimal'; setPdfStyle(v); localStorage.setItem('dg_inv_style', v); }} className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-brand">
            <option value="modern">Modern</option>
            <option value="classic">Classic (Tally)</option>
            <option value="minimal">Minimal</option>
          </select>
          <button type="button" onClick={() => setCreateOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-bold shadow-lg shadow-brand/20">
            <Plus size={18} /> New Invoice
          </button>
        </div>
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <FileText size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium text-lg">No invoices yet</p>
          <p className="text-gray-400 text-sm mt-1">Create your first standalone invoice for services or custom billing</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50/80 border-b-2 border-gray-200">
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-left">Invoice</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-left">Customer</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase">Date</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Amount</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-center">Status</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
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
                      <button type="button" onClick={() => printInvoice(inv)} className="p-1.5 text-brand hover:bg-orange-50 rounded-lg" title="Print/PDF"><Printer size={15} /></button>
                      {inv.status === 'draft' && <button type="button" onClick={() => handleStatus(inv, 'sent')} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Mark Sent"><Send size={15} /></button>}
                      {inv.status !== 'paid' && inv.status !== 'cancelled' && <button type="button" onClick={() => handleStatus(inv, 'paid')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Mark Paid"><Check size={15} /></button>}
                      <button type="button" onClick={() => setDeleteTarget(inv)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {createOpen && <CreateInvoiceModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />}
      </AnimatePresence>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedInvoice && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedInvoice(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">{selectedInvoice.invoiceNumber}</h3>
                  <p className="text-sm text-gray-500">{selectedInvoice.customerName}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(selectedInvoice.status)}
                  <button type="button" onClick={() => setSelectedInvoice(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
                </div>
              </div>
              <table className="w-full text-sm mb-4">
                <thead><tr className="border-b border-gray-200 text-xs text-gray-400 uppercase"><th className="py-2 text-left">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">GST</th><th className="py-2 text-right">Total</th></tr></thead>
                <tbody>{selectedInvoice.items.map((it, i) => (
                  <tr key={i} className="border-b border-gray-50"><td className="py-2">{it.description}</td><td className="py-2 text-right">{it.qty}</td><td className="py-2 text-right">₹{Number(it.rate).toLocaleString()}</td><td className="py-2 text-right">{it.gstPercent}%</td><td className="py-2 text-right font-medium">₹{Number(it.total).toLocaleString()}</td></tr>
                ))}</tbody>
              </table>
              <div className="text-right space-y-1 mb-4">
                <p className="text-sm text-gray-500">Subtotal: ₹{selectedInvoice.subtotal.toLocaleString()}</p>
                <p className="text-sm text-gray-500">Tax: ₹{selectedInvoice.taxTotal.toLocaleString()}</p>
                <p className="text-lg font-bold">Total: ₹{selectedInvoice.grandTotal.toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => printInvoice(selectedInvoice)} className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold flex items-center justify-center gap-2"><Printer size={16} /> Print / PDF</button>
                <button type="button" onClick={() => { const text = `Invoice ${selectedInvoice.invoiceNumber}\n${selectedInvoice.customerName}\nTotal: ₹${selectedInvoice.grandTotal.toLocaleString()}`; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`); }} className="px-4 py-2.5 border border-gray-200 rounded-xl font-medium text-sm">WhatsApp</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <p className="text-lg font-bold mb-2">Delete Invoice?</p>
              <p className="text-sm text-gray-500 mb-4">{deleteTarget.invoiceNumber} — ₹{deleteTarget.grandTotal.toLocaleString()}</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium">Cancel</button>
                <button type="button" onClick={handleDelete} className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Create Invoice Modal
function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [form, setForm] = useState({ customerName: '', customerGstin: '', customerAddress: '', customerPhone: '', invoiceDate: new Date().toISOString().slice(0, 10), dueDate: '', notes: '', terms: '' });
  const [rows, setRows] = useState([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchApi<{ number: string }>('/invoices/next-number').then(r => setInvoiceNumber(r.number)).catch(() => {}); }, []);

  const totals = rows.reduce((acc, r) => {
    const taxable = (r.qty || 0) * (r.rate || 0);
    const tax = Math.round(taxable * (r.gstPercent || 0) / 100 * 100) / 100;
    return { subtotal: acc.subtotal + taxable, tax: acc.tax + tax, grand: acc.grand + taxable + tax };
  }, { subtotal: 0, tax: 0, grand: 0 });

  const handleSubmit = async (status: 'draft' | 'sent') => {
    if (!form.customerName.trim()) { toast('Customer name is required', 'error'); return; }
    const validRows = rows.filter(r => r.description.trim() && r.rate > 0);
    if (!validRows.length) { toast('Add at least one line item', 'error'); return; }
    setSubmitting(true);
    try {
      await fetchApi('/invoices', { method: 'POST', body: JSON.stringify({ ...form, invoiceNumber, items: validRows, status }) });
      toast(`Invoice ${invoiceNumber} created`, 'success');
      onCreated();
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSubmitting(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">New Invoice</h3>
            <p className="text-sm text-gray-500 font-mono">{invoiceNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Customer Name *</label><input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="Company or person name" /></div>
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">GSTIN</label><input value={form.customerGstin} onChange={e => setForm({ ...form, customerGstin: e.target.value.toUpperCase() })} maxLength={15} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand font-mono" placeholder="Optional" /></div>
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Address</label><input value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="Street, City, State" /></div>
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Phone</label><input type="tel" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Invoice Date</label><input type="date" value={form.invoiceDate} onChange={e => setForm({ ...form, invoiceDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" /></div>
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Due Date</label><input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" /></div>
          </div>

          {/* Line items */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Line Items</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr className="text-xs font-bold text-gray-400 uppercase">
                  <th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 w-24">HSN/SAC</th><th className="px-3 py-2 w-16">Qty</th><th className="px-3 py-2 w-24">Rate</th><th className="px-3 py-2 w-16">GST%</th><th className="px-3 py-2 w-24 text-right">Total</th><th className="px-3 py-2 w-8"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => {
                    const taxable = (row.qty || 0) * (row.rate || 0);
                    const tax = Math.round(taxable * (row.gstPercent || 0) / 100 * 100) / 100;
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2"><input value={row.description} onChange={e => setRows(rows.map((r, i) => i === idx ? { ...r, description: e.target.value } : r))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm" placeholder="Service or item" /></td>
                        <td className="px-3 py-2">
                          <input value={row.hsnSac} onChange={e => {
                            const v = e.target.value;
                            const hint = suggestHsnRate(v);
                            setRows(rows.map((r, i) => i === idx ? { ...r, hsnSac: v, ...(hint && r.gstPercent === 18 ? { gstPercent: hint.rate } : {}) } : r));
                          }} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-mono" placeholder="9983" />
                        </td>
                        <td className="px-3 py-2"><input type="number" min={1} value={row.qty || ''} onChange={e => setRows(rows.map((r, i) => i === idx ? { ...r, qty: parseInt(e.target.value) || 0 } : r))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" /></td>
                        <td className="px-3 py-2"><input type="number" min={0} value={row.rate || ''} onChange={e => setRows(rows.map((r, i) => i === idx ? { ...r, rate: parseFloat(e.target.value) || 0 } : r))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" /></td>
                        <td className="px-3 py-2"><input type="number" min={0} max={28} value={row.gstPercent} onChange={e => setRows(rows.map((r, i) => i === idx ? { ...r, gstPercent: parseInt(e.target.value) || 0 } : r))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" /></td>
                        <td className="px-3 py-2 text-right text-sm font-medium">{taxable + tax > 0 ? `₹${(taxable + tax).toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2">{rows.length > 1 && <button type="button" onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="text-rose-400 hover:text-rose-600">×</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setRows([...rows, emptyRow()])} className="text-sm font-bold text-brand mt-2">+ Add Line</button>
          </div>

          {/* Totals */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">Subtotal: ₹{totals.subtotal.toLocaleString()} • Tax: ₹{totals.tax.toLocaleString()}</div>
            <div className="text-xl font-bold text-brand">₹{totals.grand.toLocaleString()}</div>
          </div>

          {/* Notes & Terms */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand text-sm" placeholder="Payment terms, bank details..." /></div>
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Terms & Conditions</label><textarea value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} rows={2} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand text-sm" placeholder="E&OE, goods once sold..." /></div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl font-medium">Cancel</button>
          <button type="button" onClick={() => handleSubmit('draft')} disabled={submitting} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold disabled:opacity-60">{submitting ? 'Saving...' : 'Save as Draft'}</button>
          <button type="button" onClick={() => handleSubmit('sent')} disabled={submitting} className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60">{submitting ? 'Saving...' : 'Create & Send'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
