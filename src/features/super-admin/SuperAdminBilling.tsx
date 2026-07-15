import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Check, X, ChevronLeft, ChevronRight, IndianRupee, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LoadingSpinner, useToast } from '../../components/ui';
import { session } from '../../lib/session';

interface Invoice {
  id: string; tenantId: string; tenantName: string; invoiceNumber: string;
  periodStart: string; periodEnd: string; planName: string;
  amount: number; gstAmount: number; total: number; status: string;
  paidAt: string | null; notes: string | null; createdAt: string;
}

interface Tenant { id: string; companyName: string; planName?: string; }

export function SuperAdminBilling() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  const token = session.getToken();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const fetchInvoices = () => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set('page', String(page));
    if (filterStatus) q.set('status', filterStatus);
    fetch(`/api/super-admin/billing?${q.toString()}`, { headers })
      .then((r) => r.json())
      .then((data) => { setInvoices(data.data || []); setTotal(data.total || 0); setTotalPages(data.totalPages || 1); })
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInvoices(); }, [page, filterStatus]);

  const markPaid = async (id: string) => {
    await fetch(`/api/super-admin/billing/${id}/paid`, { method: 'PUT', headers });
    toast('Invoice marked as paid', 'success');
    fetchInvoices();
  };

  const deleteInvoice = async (id: string) => {
    await fetch(`/api/super-admin/billing/${id}`, { method: 'DELETE', headers });
    toast('Invoice deleted', 'success');
    fetchInvoices();
  };

  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const printInvoice = (inv: Invoice) => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice-${inv.invoiceNumber}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;padding:40px;max-width:700px;margin:auto;}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #F27D26;padding-bottom:16px;margin-bottom:24px;}
.logo{display:flex;align-items:center;gap:10px;}.logo-icon{width:40px;height:40px;background:#F27D26;border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:16px;}
table{width:100%;border-collapse:collapse;margin:20px 0;}th{background:#151619;color:white;padding:10px;text-align:left;font-size:11px;text-transform:uppercase;}
td{padding:10px;border-bottom:1px solid #e5e7eb;font-size:13px;}.total{font-size:18px;font-weight:bold;color:#F27D26;text-align:right;margin-top:16px;}
.footer{margin-top:40px;font-size:11px;color:#999;text-align:center;}
@media print{body{padding:20px;}}</style></head><body>
<div class="header"><div class="logo"><div class="logo-icon">DH</div><div><strong style="font-size:18px;">Dhandho Management</strong><br/><span style="font-size:11px;color:#888;">Subscription Invoice</span></div></div>
<div style="text-align:right;font-size:13px;"><strong>Invoice #${inv.invoiceNumber}</strong><br/>Date: ${new Date(inv.createdAt).toLocaleDateString()}<br/>Status: <strong style="color:${inv.status === 'paid' ? '#059669' : '#dc2626'}">${inv.status.toUpperCase()}</strong></div></div>
<div style="margin-bottom:20px;"><h4 style="font-size:11px;color:#999;text-transform:uppercase;margin-bottom:4px;">Bill To</h4>
<p style="font-size:15px;font-weight:bold;">${esc(inv.tenantName)}</p>
${inv.planName ? `<p style="font-size:12px;color:#666;">Plan: ${esc(inv.planName)}</p>` : ''}
${inv.periodStart ? `<p style="font-size:12px;color:#666;">Period: ${new Date(inv.periodStart).toLocaleDateString()} — ${inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString() : 'Ongoing'}</p>` : ''}</div>
<table><thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead><tbody>
<tr><td>Subscription — ${esc(inv.planName || 'Dhandho')}</td><td style="text-align:right;">₹${Number(inv.amount).toLocaleString()}</td></tr>
${Number(inv.gstAmount) > 0 ? `<tr><td>GST (18%)</td><td style="text-align:right;">₹${Number(inv.gstAmount).toLocaleString()}</td></tr>` : ''}
</tbody></table>
<div class="total">Total: ₹${Number(inv.total).toLocaleString()}</div>
${inv.notes ? `<p style="margin-top:16px;font-size:12px;color:#666;">${esc(inv.notes)}</p>` : ''}
<div class="footer"><p>Thank you for choosing Dhandho Management</p><p style="margin-top:4px;">This is a computer-generated invoice.</p></div>
</body></html>`;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400); }
  };

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.total), 0);
  const paidCount = invoices.filter((i) => i.status === 'paid').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-1">{total} invoices — ₹{totalRevenue.toLocaleString()} total</p>
        </div>
        <button type="button" onClick={() => { setCreateOpen(true); fetch('/api/super-admin/tenants', { headers }).then((r) => r.json()).then((data) => setTenants(data.map((t: Record<string, unknown>) => ({ id: t.id, companyName: t.companyName, planName: t.planName })))).catch(() => {}); }} className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-dark">
          <Plus size={18} /> Create Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['', 'unpaid', 'paid'].map((s) => (
          <button key={s} onClick={() => { setFilterStatus(s); setPage(1); }} className={cn("px-4 py-2 rounded-xl text-sm font-medium border transition-colors", filterStatus === s ? "bg-brand text-white border-brand" : "border-gray-200 text-gray-600 hover:border-brand")}>
            {s === '' ? 'All' : s === 'unpaid' ? 'Unpaid' : 'Paid'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Tenant</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Period</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="py-12 text-center"><LoadingSpinner /></td></tr> :
              invoices.length === 0 ? <tr><td colSpan={7} className="py-12 text-center text-gray-400">No invoices found</td></tr> :
              invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 font-medium">{inv.tenantName}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.planName || '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.periodStart ? `${new Date(inv.periodStart).toLocaleDateString()} — ${inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString() : ''}` : '-'}</td>
                  <td className="px-4 py-3 text-right font-bold">₹{Number(inv.total).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full uppercase", inv.status === 'paid' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => printInvoice(inv)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Print"><Printer size={14} /></button>
                      {inv.status !== 'paid' && <button type="button" onClick={() => markPaid(inv.id)} className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg" title="Mark Paid"><Check size={14} /></button>}
                      <button type="button" onClick={() => deleteInvoice(inv.id)} className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg" title="Delete"><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      <AnimatePresence>
        {createOpen && <CreateInvoiceModal tenants={tenants} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); fetchInvoices(); toast('Invoice created', 'success'); }} />}
      </AnimatePresence>
    </div>
  );
}

function CreateInvoiceModal({ tenants, onClose, onCreated }: { tenants: { id: string; companyName: string; planName?: string }[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ tenantId: '', amount: '', gstRate: '18', periodStart: '', periodEnd: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const gst = form.gstRate ? Math.round(Number(form.amount || 0) * Number(form.gstRate) / 100) : 0;
  const total = Number(form.amount || 0) + gst;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tenantId || !form.amount) { setError('Select tenant and enter amount'); return; }
    setSubmitting(true);
    try {
      const token = session.getToken();
      const res = await fetch('/api/super-admin/billing', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId: form.tenantId, amount: Number(form.amount), gstRate: Number(form.gstRate) || 0, periodStart: form.periodStart || undefined, periodEnd: form.periodEnd || undefined, notes: form.notes || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
        <h3 className="text-lg font-bold mb-4">Create Subscription Invoice</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tenant *</label>
            <select required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand">
              <option value="">Select tenant</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.companyName} {t.planName ? `(${t.planName})` : ''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Amount (₹) *</label>
              <input type="number" required min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" placeholder="999" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">GST Rate (%)</label>
              <input type="number" min={0} max={28} value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Period Start</label>
              <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Period End</label>
              <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" placeholder="Optional notes" />
          </div>
          {Number(form.amount) > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>₹{Number(form.amount).toLocaleString()}</span></div>
              {gst > 0 && <div className="flex justify-between"><span className="text-gray-500">GST ({form.gstRate}%)</span><span>₹{gst.toLocaleString()}</span></div>}
              <div className="flex justify-between font-bold text-brand border-t border-gray-200 pt-2 mt-2"><span>Total</span><span>₹{total.toLocaleString()}</span></div>
            </div>
          )}
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60">{submitting ? 'Creating...' : 'Create Invoice'}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
