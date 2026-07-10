import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft, Download, IndianRupee, Calendar, X, MessageCircle } from 'lucide-react';
import { exportToCsv, shareViaWhatsApp } from '../../lib/utils';
import { api } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

type Staff = { id: string; name: string; phone?: string; role?: string; address?: string; salary: number; joiningDate?: string; status: string; totalPaid: number; paymentCount: number; lastPayment?: string };
type Payment = { id: string; staffName: string; amount: number; paymentDate: string; paymentMethod: string; referenceNumber?: string; notes?: string };

export function StaffMasterView({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', role: '', address: '', salary: '', joiningDate: '' });
  const [selected, setSelected] = useState<Staff | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });

  const load = () => { api.staff.list(debouncedSearch || undefined).then(setList).catch(() => setList([])).finally(() => setLoading(false)); };
  useEffect(load, [debouncedSearch]);

  const selectStaff = (s: Staff) => {
    setSelected(s);
    api.payroll.list({ staffName: s.name }).then(setPayments).catch(() => setPayments([]));
  };

  const openAdd = () => { setEditing(null); setForm({ name: '', phone: '', role: '', address: '', salary: '', joiningDate: '' }); setAddStaffOpen(true); };
  const openEdit = (s: Staff) => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', role: s.role || '', address: s.address || '', salary: s.salary ? String(s.salary) : '', joiningDate: s.joiningDate || '' }); setAddStaffOpen(true); };

  const handleSaveStaff = async () => {
    if (!form.name.trim()) { toast('Name is required', 'error'); return; }
    try {
      if (editing) {
        await api.staff.update(editing.id, { name: form.name, phone: form.phone, role: form.role, address: form.address, salary: form.salary ? Number(form.salary) : undefined });
        toast('Staff updated', 'success');
      } else {
        await api.staff.create({ name: form.name, phone: form.phone || undefined, role: form.role || undefined, address: form.address || undefined, salary: form.salary ? Number(form.salary) : undefined, joiningDate: form.joiningDate || undefined });
        toast(`${form.name} added`, 'success');
      }
      setAddStaffOpen(false); load(); onRefresh();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const handlePay = async () => {
    if (!selected) return;
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast('Enter valid amount', 'error'); return; }
    try {
      const amt = Number(payForm.amount);
      await api.payroll.create({ staffName: selected.name, amount: amt, paymentDate: payForm.paymentDate, paymentMethod: payForm.paymentMethod, referenceNumber: payForm.referenceNumber || undefined, notes: payForm.notes || undefined });
      toast(`₹${amt.toLocaleString()} paid to ${selected.name}`, 'success');
      setPayModalOpen(false);
      if (selected.phone) {
        const msg = `Hi ${selected.name},\n\nPayment of ₹${amt.toLocaleString()} has been made to you on ${payForm.paymentDate} via ${payForm.paymentMethod}.${payForm.notes ? `\nNote: ${payForm.notes}` : ''}\n\nThank you!`;
        if (confirm(`Send WhatsApp message to ${selected.name}?`)) shareViaWhatsApp(selected.phone, msg);
      }
      setPayForm({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
      load();
      selectStaff(selected);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.staff.delete(deleteTarget.id); toast('Staff removed', 'success'); setDeleteTarget(null); if (selected?.id === deleteTarget.id) setSelected(null); load(); onRefresh(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1"><h2 className="text-xl font-bold">Staff Management</h2><p className="text-sm text-gray-500">Add staff, track payments</p></div>
        <div className="flex items-center gap-2">
          {list.length > 0 && <button type="button" onClick={() => exportToCsv(list.map(s => ({ Name: s.name, Phone: s.phone || '', Role: s.role || '', Salary: s.salary, 'Total Paid': s.totalPaid, Payments: s.paymentCount })), 'staff')} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"><Download size={18} /> Export CSV</button>}
          <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={18} /> Add Staff</button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input type="text" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand" />
      </div>

      {loading && <div className="py-16 text-center"><LoadingSpinner /></div>}

      {/* Staff Tiles */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(s => {
            const due = s.salary ? Math.max(0, s.salary - s.totalPaid) : 0;
            const isSelected = selected?.id === s.id;
            return (
              <button key={s.id} type="button" onClick={() => selectStaff(s)}
                className={`text-left p-4 rounded-2xl border transition-all ${isSelected ? 'border-brand bg-orange-50 shadow-md' : 'border-gray-200 bg-white hover:shadow-md'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase">{s.name}</span>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="p-1 text-gray-400 hover:text-blue-600"><Pencil size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }} className="p-1 text-gray-400 hover:text-rose-600"><Trash2 size={12} /></button>
                  </div>
                </div>
                {s.role && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">{s.role}</span>}
                {s.phone && <p className="text-xs text-gray-400 mt-1">{s.phone}</p>}
                <div className="mt-3 flex items-center gap-3 text-sm">
                  {s.salary > 0 && <span>Salary: <b>₹{s.salary.toLocaleString()}</b></span>}
                  <span>Paid: <b className="text-emerald-600">₹{s.totalPaid.toLocaleString()}</b></span>
                  {due > 0 && <span>Due: <b className="text-rose-600">₹{due.toLocaleString()}</b></span>}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Click to view payments</p>
              </button>
            );
          })}
          {list.length === 0 && !search && (
            <div className="col-span-full py-16 text-center text-gray-400">
              <IndianRupee size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No staff added yet</p>
              <p className="text-sm mt-1">Click "Add Staff" to get started</p>
            </div>
          )}
        </div>
      )}

      {/* Selected Staff — Payment History */}
      {selected && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b flex items-center justify-between">
            <div>
              <h3 className="font-bold">{selected.name} — Payment History</h3>
              <p className="text-xs text-gray-400">{selected.paymentCount} payments · Total: ₹{selected.totalPaid.toLocaleString()}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setPayForm({ amount: selected.salary ? String(selected.salary) : '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' }); setPayModalOpen(true); }} className="flex items-center gap-1 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={14} /> Record Payment</button>
              <button type="button" onClick={() => setSelected(null)} className="p-2 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
          </div>
          {payments.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No payments recorded yet. Click "Record Payment" to add one.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b"><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3 w-10"></th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-right font-bold">₹{p.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(p.paymentDate)}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{p.paymentMethod}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{p.referenceNumber || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.notes || '—'}</td>
                      <td className="px-4 py-3"><button type="button" onClick={async () => { if (!confirm('Delete this payment?')) return; try { await api.payroll.delete(p.id); toast('Deleted', 'success'); load(); selectStaff(selected); } catch(e) { toast((e as Error).message, 'error'); } }} className="p-1 text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payments.length > 0 && <div className="px-4 py-3 bg-gray-50 border-t text-right font-bold text-sm">Total: ₹{payments.reduce((s, p) => s + p.amount, 0).toLocaleString()}</div>}
        </div>
      )}

      {/* Add/Edit Staff Modal */}
      <AnimatePresence>
        {addStaffOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddStaffOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Staff' : 'Add Staff'}</h3>
              <div className="space-y-3">
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Full name" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Phone</label><input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="9876543210" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Role</label><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Driver, Helper..." /></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Optional" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Monthly Salary (₹)</label><input type="number" min={0} value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Optional" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={e => setForm({ ...form, joiningDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" /></div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setAddStaffOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="button" onClick={handleSaveStaff} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">{editing ? 'Update' : 'Add Staff'}</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Record Payment Modal */}
        {payModalOpen && selected && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setPayModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-1">Pay {selected.name}</h3>
              <p className="text-sm text-gray-400 mb-4">{selected.role || 'Staff'}{selected.salary ? ` · Salary: ₹${selected.salary.toLocaleString()}` : ''}</p>
              <div className="space-y-3">
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Amount (₹) *</label><input type="number" min={1} value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="5000" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Date</label><input type="date" value={payForm.paymentDate} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Method</label><select value={payForm.paymentMethod} onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option></select></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Reference / UTR</label><input value={payForm.referenceNumber} onChange={e => setPayForm({ ...payForm, referenceNumber: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Optional" /></div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Notes</label><input value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" placeholder="Salary, advance, bonus..." /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setPayModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="button" onClick={handlePay} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">Pay ₹{payForm.amount ? Number(payForm.amount).toLocaleString() : '0'}</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirm */}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center">
              <Trash2 className="mx-auto mb-3 text-rose-500" size={32} />
              <h3 className="font-bold text-lg mb-1">Remove {deleteTarget.name}?</h3>
              <p className="text-sm text-gray-500 mb-4">Payment history will be preserved.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="button" onClick={handleDelete} className="flex-1 py-2 bg-rose-600 text-white rounded-xl font-bold">Remove</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
