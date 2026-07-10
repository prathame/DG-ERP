import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft, Download, IndianRupee } from 'lucide-react';
import { exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

type Staff = { id: string; name: string; phone?: string; role?: string; address?: string; salary: number; joiningDate?: string; status: string; totalPaid: number; paymentCount: number; lastPayment?: string };

export function StaffMasterView({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<Staff[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', role: '', address: '', salary: '', joiningDate: '' });

  const load = () => { api.staff.list(debouncedSearch || undefined).then(setList).catch(() => setList([])).finally(() => setLoading(false)); };
  useEffect(load, [debouncedSearch]);

  const openAdd = () => { setEditing(null); setForm({ name: '', phone: '', role: '', address: '', salary: '', joiningDate: '' }); setModalOpen(true); };
  const openEdit = (s: Staff) => { setEditing(s); setForm({ name: s.name, phone: s.phone || '', role: s.role || '', address: s.address || '', salary: s.salary ? String(s.salary) : '', joiningDate: s.joiningDate || '' }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast('Name is required', 'error'); return; }
    try {
      if (editing) {
        await api.staff.update(editing.id, { name: form.name, phone: form.phone, role: form.role, address: form.address, salary: form.salary ? Number(form.salary) : undefined, status: editing.status });
        toast('Staff updated', 'success');
      } else {
        await api.staff.create({ name: form.name, phone: form.phone || undefined, role: form.role || undefined, address: form.address || undefined, salary: form.salary ? Number(form.salary) : undefined, joiningDate: form.joiningDate || undefined });
        toast(`${form.name} added`, 'success');
      }
      setModalOpen(false); load(); onRefresh();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await api.staff.delete(deleteTarget.id); toast('Staff removed', 'success'); setDeleteTarget(null); load(); onRefresh(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1"><h2 className="text-xl font-bold">Staff Master</h2><p className="text-sm text-gray-500">Add and manage staff members</p></div>
        <div className="flex items-center gap-2">
          {list.length > 0 && <button type="button" onClick={() => exportToCsv(list.map(s => ({ Name: s.name, Phone: s.phone || '', Role: s.role || '', Salary: s.salary, 'Joining Date': s.joiningDate || '', 'Total Paid': s.totalPaid, Payments: s.paymentCount })), 'staff')} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"><Download size={18} /> Export CSV</button>}
          <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={18} /> Add Staff</button>
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
          <div className="py-16 text-center text-gray-400"><IndianRupee size={40} className="mx-auto mb-3 opacity-30" /><p className="font-medium">{search ? 'No results' : 'No staff added yet'}</p><p className="text-sm mt-1">Click "Add Staff" to get started</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50">
                <th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Salary</th><th className="px-4 py-3 text-right">Total Paid</th>
                <th className="px-4 py-3 text-center">Payments</th><th className="px-4 py-3">Last Paid</th><th className="px-4 py-3">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {list.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><span className="font-medium">{s.name}</span>{s.status !== 'active' && <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-bold uppercase">{s.status}</span>}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{s.phone || '—'}</td>
                    <td className="px-4 py-3">{s.role ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{s.role}</span> : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm">{s.salary ? `₹${s.salary.toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold">₹{s.totalPaid.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs font-bold">{s.paymentCount}</span></td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{fmtDate(s.lastPayment)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget(s)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && <div className="px-4 py-3 bg-gray-50 border-t text-right font-bold text-sm">Total Paid: ₹{list.reduce((s, x) => s + x.totalPaid, 0).toLocaleString()}</div>}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Staff' : 'Add Staff'}</h3>
              <div className="space-y-3">
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Full name" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Phone</label><input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="9876543210" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Role</label><input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Driver, Helper, Packer..." /></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Monthly Salary (₹)</label><input type="number" min={0} value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={e => setForm({ ...form, joiningDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="button" onClick={handleSave} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">{editing ? 'Update' : 'Add Staff'}</button>
              </div>
            </motion.div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 text-center">
              <Trash2 className="mx-auto mb-3 text-rose-500" size={32} />
              <h3 className="font-bold text-lg mb-1">Remove {deleteTarget.name}?</h3>
              <p className="text-sm text-gray-500 mb-4">This won't delete their payment history.</p>
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
