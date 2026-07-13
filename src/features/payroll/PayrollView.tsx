import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, IndianRupee, Users, Calendar, Download } from 'lucide-react';
import { api } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';
import { exportToCsv } from '../../lib/utils';
import { useConfirm } from '../../hooks/useConfirm';

type Payment = { id: string; staffName: string; amount: number; paymentDate: string; paymentMethod: string; referenceNumber?: string; notes?: string; month: string; year: number };
type Summary = { year: number; grandTotal: number; byStaff: { name: string; total: number; payments: number }[]; byMonth: { month: string; total: number; payments: number }[] };

export function PayrollView({ accessLevel = 'full' }: { accessLevel?: string }) {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const canEdit = accessLevel === 'full';
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ staffName: '', amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
  const [tab, setTab] = useState<'payments' | 'summary'>('payments');
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const year = new Date().getFullYear();

  const load = () => {
    setLoading(true);
    Promise.all([api.payroll.list(), api.payroll.summary(year)]).then(([p, s]) => { setPayments(p); setSummary(s); }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    api.staff.list().then(members => {
      setNameSuggestions(members.map(m => m.name).sort());
    }).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!form.staffName.trim()) { toast('Staff name required', 'error'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast('Enter valid amount', 'error'); return; }
    try {
      await api.payroll.create({ staffName: form.staffName, amount: Number(form.amount), paymentDate: form.paymentDate, paymentMethod: form.paymentMethod, referenceNumber: form.referenceNumber || undefined, notes: form.notes || undefined });
      toast('Payment recorded', 'success');
      setModalOpen(false);
      setForm({ staffName: '', amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h2 className="text-xl font-bold">Staff Payments</h2><p className="text-sm text-gray-500">Track salary and payments to staff</p></div>
        <div className="flex gap-2">
          {payments.length > 0 && <button type="button" onClick={() => exportToCsv(payments.map(p => ({ Name: p.staffName, Amount: p.amount, Date: p.paymentDate, Method: p.paymentMethod, Reference: p.referenceNumber || '', Notes: p.notes || '' })), 'staff_payments')} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50"><Download size={16} /> CSV</button>}
          {canEdit && <button type="button" onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={16} /> Record Payment</button>}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('payments')} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === 'payments' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>Payments</button>
        <button type="button" onClick={() => setTab('summary')} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === 'summary' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>Summary</button>
      </div>

      {loading && <div className="py-20 text-center"><LoadingSpinner /></div>}

      {!loading && tab === 'payments' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {payments.length === 0 ? (
            <div className="py-16 text-center text-gray-400"><IndianRupee size={40} className="mx-auto mb-3 opacity-30" /><p className="font-medium">No payments recorded yet</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b"><th className="px-4 py-3">Staff</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Notes</th>{canEdit && <th className="px-4 py-3 w-10"></th>}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{p.staffName}</td>
                      <td className="px-4 py-3 text-right font-bold">₹{p.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{p.paymentMethod}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{p.referenceNumber || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">{p.notes || '—'}</td>
                      {canEdit && <td className="px-4 py-3"><button type="button" onClick={async () => { if (!await confirm({ message: 'Delete this payment? This cannot be undone.' })) return; try { await api.payroll.delete(p.id); toast('Deleted', 'success'); load(); } catch(e) { toast((e as Error).message, 'error'); } }} className="p-1 text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payments.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t text-right font-bold text-sm">Total: ₹{payments.reduce((s, p) => s + p.amount, 0).toLocaleString()}</div>
          )}
        </div>
      )}

      {!loading && tab === 'summary' && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-sm text-gray-400 uppercase mb-4 flex items-center gap-2"><Users size={16} /> By Staff — {year}</h3>
            <div className="space-y-3">
              {summary.byStaff.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div><p className="font-medium">{s.name}</p><p className="text-xs text-gray-400">{s.payments} payments</p></div>
                  <span className="font-bold">₹{s.total.toLocaleString()}</span>
                </div>
              ))}
              {summary.byStaff.length === 0 && <p className="text-gray-400 text-sm">No data</p>}
            </div>
            <div className="mt-4 pt-4 border-t flex justify-between font-bold"><span>Total</span><span>₹{summary.grandTotal.toLocaleString()}</span></div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-sm text-gray-400 uppercase mb-4 flex items-center gap-2"><Calendar size={16} /> Monthly — {year}</h3>
            <div className="space-y-2">
              {months.map((m, i) => {
                const data = summary.byMonth.find(x => x.month === String(i + 1).padStart(2, '0'));
                return (
                  <div key={m} className="flex items-center justify-between text-sm">
                    <span className={data ? 'font-medium' : 'text-gray-300'}>{m}</span>
                    <span className={data ? 'font-bold' : 'text-gray-300'}>{data ? `₹${data.total.toLocaleString()}` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">Record Staff Payment</h3>
              <div className="space-y-3">
                <div className="relative">
                  <label className="text-xs font-bold text-gray-400 block mb-1">Staff Name *</label>
                  <input value={form.staffName} onChange={e => { setForm({ ...form, staffName: e.target.value }); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Type name or pick from list" />
                  {showSuggestions && nameSuggestions.filter(n => !form.staffName || n.toLowerCase().includes(form.staffName.toLowerCase())).length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {nameSuggestions.filter(n => !form.staffName || n.toLowerCase().includes(form.staffName.toLowerCase())).map(n => (
                        <button key={n} type="button" onMouseDown={() => { setForm({ ...form, staffName: n }); setShowSuggestions(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-brand/10 hover:text-brand">{n}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Amount (₹) *</label><input type="number" min={1} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="5000" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Date</label><input type="date" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Method</label><select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option></select></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Reference / UTR</label><input value={form.referenceNumber} onChange={e => setForm({ ...form, referenceNumber: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="Salary, advance, bonus..." /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="button" onClick={handleSubmit} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">Save Payment</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmRenderer />
    </motion.div>
  );
}
