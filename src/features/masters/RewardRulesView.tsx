import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Pencil, Trash2, ArrowLeft, Download } from 'lucide-react';
import { cn, exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import type { RewardRule } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';

export function RewardRulesView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<RewardRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RewardRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RewardRule | null>(null);
  const [form, setForm] = useState({ productsSoldThreshold: 10, rewardPoints: 100, description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [redemptionSettings, setRedemptionSettings] = useState<{ minBalance: number; minPoints: number } | null>(null);
  const [redemptionForm, setRedemptionForm] = useState({ minBalance: 100, minPoints: 50 });
  const [redemptionSubmitting, setRedemptionSubmitting] = useState(false);

  const load = () => {
    Promise.all([api.rewardRules.list(), api.redemptionSettings.get()])
      .then(([r, rs]) => { setList(r); setRedemptionSettings(rs); setRedemptionForm({ minBalance: rs.minBalance, minPoints: rs.minPoints }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); load(); }, []);

  const handleRedemptionSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedemptionSubmitting(true);
    try {
      const updated = await api.redemptionSettings.update(redemptionForm);
      setRedemptionSettings(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      setRedemptionSubmitting(false);
    }
  };

  const openAdd = () => { setEditing(null); setForm({ productsSoldThreshold: 10, rewardPoints: 100, description: '' }); setModalOpen(true); };
  const openEdit = (r: RewardRule) => { setEditing(r); setForm({ productsSoldThreshold: r.productsSoldThreshold, rewardPoints: r.rewardPoints, description: r.description || '' }); setModalOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const data = { productsSoldThreshold: form.productsSoldThreshold, rewardPoints: form.rewardPoints, description: form.description || undefined };
    (editing ? api.rewardRules.update(editing.id, data) : api.rewardRules.create(data))
      .then(() => { setModalOpen(false); load(); })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    api.rewardRules.delete(deleteTarget.id).then(() => { setDeleteTarget(null); load(); }).catch((err) => toast(err.message, 'error'));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1"><h2 className="text-xl font-bold">Reward Rules</h2><p className="text-sm text-gray-500">Define reward milestones for vendor sales</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => list.length && exportToCsv(list.map((r) => ({ id: r.id, productsSoldThreshold: r.productsSoldThreshold, rewardPoints: r.rewardPoints, description: r.description ?? '' })), 'reward-rules')} disabled={!list.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} /> Export CSV
          </button>
          <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={18} /> Add Rule</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-lg mb-4">Redemption Settings</h3>
        <p className="text-sm text-gray-500 mb-4">When can users redeem points? Set minimum balance and minimum points per redemption.</p>
        <form onSubmit={handleRedemptionSave} className="flex flex-wrap items-end gap-4">
          <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Min balance to redeem (pts)</label><input type="number" min={0} value={redemptionForm.minBalance || ''} onChange={(e) => setRedemptionForm({ ...redemptionForm, minBalance: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-32 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
          <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Min points per redemption</label><input type="number" min={1} value={redemptionForm.minPoints || ''} onChange={(e) => setRedemptionForm({ ...redemptionForm, minPoints: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-32 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
          <button type="submit" disabled={redemptionSubmitting} className="px-4 py-2 bg-brand text-white rounded-xl font-bold text-sm">{redemptionSubmitting ? 'Saving...' : 'Save'}</button>
        </form>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-6 py-4">Threshold</th><th className="px-6 py-4">Points</th><th className="px-6 py-4">Description</th><th className="px-6 py-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={5} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr> :
                list.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">{r.productsSoldThreshold} sold</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">{r.rewardPoints} pts</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{r.description || '-'}</td>
                    <td className="px-6 py-4 flex gap-2">
                      <button type="button" onClick={() => openEdit(r)} className="p-2 text-brand hover:bg-orange-50 rounded-lg"><Pencil size={16} /></button>
                      <button type="button" onClick={() => setDeleteTarget(r)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
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
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Reward Rule' : 'Add Reward Rule'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Products sold threshold</label><input type="number" min={1} value={form.productsSoldThreshold || ''} onChange={(e) => setForm({ ...form, productsSoldThreshold: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Reward points</label><input type="number" min={0} value={form.rewardPoints || ''} onChange={(e) => setForm({ ...form, rewardPoints: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Description</label><input placeholder="e.g. 10 Submersible sold = 100 pts" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-brand text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Save'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <p className="text-gray-600 mb-6">Delete this reward rule?</p>
              <div className="flex gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="button" onClick={handleDelete} className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold">Delete</button></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
