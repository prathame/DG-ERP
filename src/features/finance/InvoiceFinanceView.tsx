import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Trash2, FileText, IndianRupee, Clock, CheckCircle } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../api';
import { useToast, LoadingSpinner, isBillFullyPaid, PaidBadge } from '../../components/ui';
import { useConfirm } from '../../hooks/useConfirm';

type Summary = { clientName: string; clientPhone: string | null; invoiceCount: number; totalInvoiced: number; totalPaid: number; balance: number };
type ClientDetail = Awaited<ReturnType<typeof api.invoiceFinance.client>>;

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString()}`;

export function InvoiceFinanceView({ accessLevel = 'full' }: { accessLevel?: 'hidden' | 'view' | 'print' | 'full' }) {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payModal, setPayModal] = useState<{ invoiceId: string; invoiceNumber: string; balance: number } | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadSummary = () => {
    setLoading(true);
    api.invoiceFinance.summary().then(setSummary).catch(() => setSummary([])).finally(() => setLoading(false));
  };

  const loadDetail = (name: string) => {
    setDetailLoading(true);
    api.invoiceFinance.client(name).then(setDetail).catch(() => setDetail(null)).finally(() => setDetailLoading(false));
  };

  useEffect(() => { loadSummary(); }, []);

  const openPay = (inv: ClientDetail['invoices'][0]) => {
    setPayForm({ amount: String(inv.balance), paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
    setPayModal({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, balance: inv.balance });
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }

    if (amount > payModal.balance && payModal.balance > 0) {
      const extra = amount - payModal.balance;
      const ok = await confirm({
        title: 'Extra Payment',
        message: `Invoice balance is ${fmt(payModal.balance)}. You're paying ${fmt(amount)} — ${fmt(extra)} will be credit. Continue?`,
        confirmLabel: `Record ${fmt(amount)}`,
        variant: 'info',
      });
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      await api.invoiceFinance.recordPayment({ invoiceId: payModal.invoiceId, amount, paymentDate: payForm.paymentDate, paymentMethod: payForm.paymentMethod, referenceNumber: payForm.referenceNumber || undefined, notes: payForm.notes || undefined });
      toast('Payment recorded', 'success');
      setPayModal(null);
      if (selected) loadDetail(selected);
      loadSummary();
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (paymentId: string, amount: number) => {
    if (!await confirm({ title: 'Delete Payment', message: `Delete payment of ${fmt(amount)}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' })) return;
    try {
      await api.invoiceFinance.deletePayment(paymentId);
      toast('Payment deleted', 'success');
      if (selected) loadDetail(selected);
      loadSummary();
    } catch (err) { toast((err as Error).message, 'error'); }
  };

  const isReadOnly = accessLevel === 'view' || accessLevel === 'print';

  // Detail view
  if (selected && detail) {
    const overallPaid = isBillFullyPaid(detail.totalInvoiced, detail.balance);
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => { setSelected(null); setDetail(null); }} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <div className="flex-1">
            <h2 className="text-xl font-bold flex items-center gap-2">{detail.clientName} {overallPaid && <PaidBadge />}</h2>
            <p className="text-sm text-gray-500">{detail.invoices.length} invoice{detail.invoices.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Invoiced</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(detail.totalInvoiced)}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Received</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(detail.totalPaid)}</p>
          </div>
          <div className={cn("p-5 rounded-2xl border shadow-sm", detail.balance > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200")}>
            <p className="text-xs font-bold text-gray-400 uppercase">Balance</p>
            <p className={cn("text-2xl font-bold mt-1", detail.balance > 0 ? "text-rose-600" : "text-emerald-600")}>
              {detail.balance < 0 ? `${fmt(detail.balance)} credit` : fmt(detail.balance)}
            </p>
          </div>
        </div>

        {/* Invoices */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2"><FileText size={16} /> Invoices</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {detailLoading ? <div className="py-8 flex justify-center"><LoadingSpinner /></div> : detail.invoices.map(inv => {
              const paid = isBillFullyPaid(inv.grandTotal, inv.balance);
              return (
                <div key={inv.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-bold font-mono text-sm">{inv.invoiceNumber}</p>
                    <p className="text-xs text-gray-500">{formatDate(inv.invoiceDate)}{inv.dueDate ? ` · Due ${formatDate(inv.dueDate)}` : ''}</p>
                    {inv.notes && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{inv.notes}</p>}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-right">
                      <p className="text-sm font-bold">{fmt(inv.grandTotal)}</p>
                      {inv.paid > 0 && <p className="text-xs text-emerald-600">Paid: {fmt(inv.paid)}</p>}
                      {inv.balance > 0 && <p className="text-xs text-rose-600">Due: {fmt(inv.balance)}</p>}
                    </div>
                    {paid ? <PaidBadge size="sm" /> : (
                      inv.balance > 0 && <span className="text-xs bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={10} /> Unpaid</span>
                    )}
                    {!isReadOnly && !paid && (
                      <button type="button" onClick={() => openPay(inv)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
                        <Plus size={12} /> Pay
                      </button>
                    )}
                    {!isReadOnly && paid && inv.balance <= 0 && (
                      <button type="button" onClick={() => openPay({ ...inv, balance: 0 })} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">
                        <Plus size={12} /> Extra Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment history */}
        {detail.payments.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold flex items-center gap-2"><IndianRupee size={16} /> Payment History</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {detail.payments.map(p => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-emerald-600">+{fmt(p.amount)}</p>
                    <p className="text-xs text-gray-500">{formatDate(p.paymentDate)} · {p.paymentMethod} · Invoice {p.invoiceNumber}</p>
                    {p.referenceNumber && <p className="text-xs text-gray-400">Ref: {p.referenceNumber}</p>}
                  </div>
                  {!isReadOnly && (
                    <button type="button" onClick={() => handleDelete(p.id, p.amount)} className="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment modal */}
        <AnimatePresence>
          {payModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setPayModal(null)} />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
                <h3 className="text-lg font-bold mb-1">Record Payment</h3>
                <p className="text-sm text-gray-500 mb-4">Invoice {payModal.invoiceNumber} · Balance <span className="font-bold text-rose-600">{fmt(payModal.balance)}</span></p>
                <form onSubmit={handlePay} className="space-y-4">
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Amount (₹)</label><input type="number" required min={0.01} step={0.01} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Payment Date</label><input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Method</label>
                    <select value={payForm.paymentMethod} onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand">
                      {['Cash','Bank Transfer','UPI','Cheque','Other'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Reference</label><input value={payForm.referenceNumber} onChange={e => setPayForm(f => ({ ...f, referenceNumber: e.target.value }))} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Notes</label><input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setPayModal(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button>
                    <button type="submit" disabled={submitting} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Record Payment'}</button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {ConfirmRenderer}
      </motion.div>
    );
  }

  // Main list
  const filtered = summary.filter(c => !search || c.clientName.toLowerCase().includes(search.toLowerCase()));
  const totalOutstanding = summary.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const totalReceived = summary.reduce((s, c) => s + c.totalPaid, 0);
  const totalInvoiced = summary.reduce((s, c) => s + c.totalInvoiced, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Invoice Finance</h2>
          <p className="text-sm text-gray-500">Track payments against client invoices</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Invoiced</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(totalInvoiced)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Received</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalReceived)}</p>
        </div>
        <div className={cn("p-5 rounded-2xl border shadow-sm", totalOutstanding > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200")}>
          <p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>
          <p className={cn("text-2xl font-bold mt-1", totalOutstanding > 0 ? "text-rose-600" : "text-emerald-600")}>{fmt(totalOutstanding)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client..." className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" />
        </div>
        {loading ? <div className="py-12 flex justify-center"><LoadingSpinner /></div> : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">{search ? 'No matching clients' : 'No invoices yet — create invoices in the Invoices tab'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">Client</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">Invoiced</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">Received</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">Balance</th>
              <th className="px-5 py-3 text-center text-xs font-bold text-gray-400 uppercase">Invoices</th>
              <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.clientName} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium">{c.clientName}</p>
                    {c.clientPhone && <p className="text-xs text-gray-400">{c.clientPhone}</p>}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">{fmt(c.totalInvoiced)}</td>
                  <td className="px-5 py-3 text-right font-bold text-emerald-600">{fmt(c.totalPaid)}</td>
                  <td className="px-5 py-3 text-right">
                    {c.balance <= 0
                      ? <span className="text-emerald-600 font-bold flex items-center justify-end gap-1"><CheckCircle size={14} /> Paid</span>
                      : <span className="font-bold text-rose-600">{fmt(c.balance)}</span>
                    }
                  </td>
                  <td className="px-5 py-3 text-center text-gray-500">{c.invoiceCount}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => { setSelected(c.clientName); loadDetail(c.clientName); }} className="text-sm font-bold text-brand hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {ConfirmRenderer}
    </motion.div>
  );
}
