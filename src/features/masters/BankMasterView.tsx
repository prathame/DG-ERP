import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft, Download } from 'lucide-react';
import { cn, exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import type { Bank } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

export function BankMasterView({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<Bank[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bank | null>(null);
  const [form, setForm] = useState({ name: '', accountNumber: '', bankName: '', branch: '', ifscCode: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api.banks.list(debouncedSearch || undefined).then(setList).catch(() => setList([])).finally(() => setLoading(false));
    onRefresh();
  };
  useEffect(() => { setLoading(true); load(); }, [debouncedSearch]);

  const openAdd = () => { setEditing(null); setForm({ name: '', accountNumber: '', bankName: '', branch: '', ifscCode: '' }); setModalOpen(true); };
  const openEdit = (b: Bank) => { setEditing(b); setForm({ name: b.name, accountNumber: b.accountNumber ?? '', bankName: b.bankName ?? '', branch: b.branch ?? '', ifscCode: b.ifscCode ?? '' }); setModalOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    (editing ? api.banks.update(editing.id, form) : api.banks.create(form))
      .then(() => { setModalOpen(false); load(); })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    api.banks.delete(deleteTarget.id).then(() => { setDeleteTarget(null); load(); }).catch((err) => toast(err.message, 'error'));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1"><h2 className="text-xl font-bold">Bank Master</h2><p className="text-sm text-gray-500">Manage bank accounts</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => list.length && exportToCsv(list.map((b) => ({ id: b.id, name: b.name, accountNumber: b.accountNumber ?? '', bankName: b.bankName ?? '', branch: b.branch ?? '', ifscCode: b.ifscCode ?? '' })), 'banks')} disabled={!list.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} /> Export CSV
          </button>
          <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold"><Plus size={18} /> Add Bank</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search banks..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-3 py-3 sm:px-6 sm:py-4">Name</th><th className="px-3 py-3 sm:px-6 sm:py-4">Account No</th><th className="px-3 py-3 sm:px-6 sm:py-4">Bank</th><th className="px-3 py-3 sm:px-6 sm:py-4">Branch</th><th className="px-3 py-3 sm:px-6 sm:py-4">IFSC</th><th className="px-3 py-3 sm:px-6 sm:py-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={6} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr> :
                list.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 sm:px-6 sm:py-4 font-medium">{b.name}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{b.accountNumber || '-'}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{b.bankName || '-'}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{b.branch || '-'}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600 font-mono">{b.ifscCode || '-'}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 flex gap-2">
                      <button type="button" onClick={() => openEdit(b)} className="p-2 text-[#F27D26] hover:bg-orange-50 rounded-lg"><Pencil size={16} /></button>
                      <button type="button" onClick={() => setDeleteTarget(b)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Bank' : 'Add Bank'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Account Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="e.g. Main Account" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Account Number</label><input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Bank Name</label><input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Branch</label><input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">IFSC Code</label><input value={form.ifscCode} onChange={(e) => setForm({ ...form, ifscCode: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26] font-mono" /></div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Save'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <p className="text-gray-600 mb-6">Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
              <div className="flex gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="button" onClick={handleDelete} className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold">Delete</button></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
