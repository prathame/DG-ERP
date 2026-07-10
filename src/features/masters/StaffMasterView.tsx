import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, ArrowLeft, Download, IndianRupee, Calendar } from 'lucide-react';
import { exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

type StaffMember = { name: string; totalPaid: number; paymentCount: number; lastPayment: string; firstPayment: string };

export function StaffMasterView({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<StaffMember[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ staffName: '', amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' });
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [staffPayments, setStaffPayments] = useState<{ id: string; amount: number; paymentDate: string; paymentMethod: string; notes?: string }[]>([]);

  const load = () => {
    api.payroll.staff(debouncedSearch || undefined).then(setList).catch(() => setList([])).finally(() => setLoading(false));
  };
  useEffect(load, [debouncedSearch]);

  const loadStaffPayments = (name: string) => {
    setSelectedStaff(name);
    api.payroll.list({ staffName: name }).then(setStaffPayments).catch(() => setStaffPayments([]));
  };

  const handleAdd = async () => {
    if (!form.staffName.trim()) { toast('Staff name required', 'error'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast('Enter valid amount', 'error'); return; }
    try {
      await api.payroll.create({ staffName: form.staffName.trim(), amount: Number(form.amount), paymentDate: form.paymentDate, paymentMethod: form.paymentMethod, notes: form.notes || undefined });
      toast(`₹${Number(form.amount).toLocaleString()} paid to ${form.staffName}`, 'success');
      setAddOpen(false);
      setForm({ staffName: '', amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' });
      load();
      onRefresh();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  if (selectedStaff) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setSelectedStaff(null)} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
          <div className="flex-1"><h2 className="text-xl font-bold">{selectedStaff}</h2><p className="text-sm text-gray-500">Payment history</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {staffPayments.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No payments found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b"><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Notes</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {staffPayments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-right font-bold">₹{p.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(p.paymentDate)}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{p.paymentMethod}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {staffPayments.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t text-right font-bold text-sm">Total: ₹{staffPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}</div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1"><h2 className="text-xl font-bold">Staff Master</h2><p className="text-sm text-gray-500">Manage staff & view payment records</p></div>
        <div className="flex items-center gap-2">
          {list.length > 0 && <button type="button" onClick={() => exportToCsv(list.map(s => ({ Name: s.name, 'Total Paid': s.totalPaid, Payments: s.paymentCount, 'Last Payment': s.lastPayment, 'First Payment': s.firstPayment })), 'staff_master')} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"><Download size={18} /> Export CSV</button>}
          <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={18} /> Record Payment</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand" />
          </div>
        </div>

        {loading ? <div className="py-16 text-center"><LoadingSpinner /></div> : list.length === 0 ? (
          <div className="py-16 text-center text-gray-400"><IndianRupee size={40} className="mx-auto mb-3 opacity-30" /><p className="font-medium">No staff payments yet</p><p className="text-sm mt-1">Click "Record Payment" to add your first staff member</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-4 py-3">Name</th><th className="px-4 py-3 text-right">Total Paid</th><th className="px-4 py-3 text-center">Payments</th><th className="px-4 py-3">Last Payment</th><th className="px-4 py-3">First Payment</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {list.map(s => (
                  <tr key={s.name} onClick={() => loadStaffPayments(s.name)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-right font-bold">₹{s.totalPaid.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-bold">{s.paymentCount}</span></td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{fmtDate(s.lastPayment)}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{fmtDate(s.firstPayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t text-right font-bold text-sm">Grand Total: ₹{list.reduce((s, x) => s + x.totalPaid, 0).toLocaleString()}</div>
        )}
      </div>

      <AnimatePresence>
        {addOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">Record Staff Payment</h3>
              <div className="space-y-3">
                <div className="relative">
                  <label className="text-xs font-bold text-gray-400 block mb-1">Staff Name *</label>
                  <input value={form.staffName} onChange={e => setForm({ ...form, staffName: e.target.value })} list="staff-names" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Type name or pick from list" />
                  <datalist id="staff-names">{list.map(s => <option key={s.name} value={s.name} />)}</datalist>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Amount (₹) *</label><input type="number" min={1} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="5000" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Date</label><input type="date" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Method</label><select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option></select></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Salary, advance, bonus..." /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setAddOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="button" onClick={handleAdd} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">Save Payment</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
