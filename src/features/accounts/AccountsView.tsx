import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus, Pencil, Trash2, AlertCircle, Download } from 'lucide-react';
import { cn, exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import type { Transaction } from '../../types';
import { useToast, LoadingSpinner, DateRangeFilter, PaginationControls } from '../../components/ui';

export function AccountsView() {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: 'Sales' as 'Sales' | 'Purchase' | 'Expense', amount: '', description: '', status: 'Completed' as 'Completed' | 'Pending' });
  const [submitting, setSubmitting] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [txDateFilter, setTxDateFilter] = useState({ range: 'all', from: '', to: '' });
  const [txIncome, setTxIncome] = useState(0);
  const [txExpense, setTxExpense] = useState(0);

  const load = (page = 1) => {
    api.transactions.list({ page, dateRange: txDateFilter.range !== 'all' && txDateFilter.range !== 'custom' ? txDateFilter.range : undefined, dateFrom: txDateFilter.range === 'custom' ? txDateFilter.from : undefined, dateTo: txDateFilter.range === 'custom' ? txDateFilter.to : undefined })
      .then((r) => { setTransactions(r.data); setTxPage(r.page); setTxTotalPages(r.totalPages); setTxTotal(r.total); setTxIncome(r.income); setTxExpense(r.expense); })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(1); }, [txDateFilter]);

  const openAdd = () => { setEditing(null); setForm({ date: new Date().toISOString().slice(0, 10), type: 'Sales', amount: '', description: '', status: 'Completed' }); setModalOpen(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setForm({ date: t.date, type: t.type, amount: String(t.amount), description: t.description, status: t.status }); setModalOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const data = { date: form.date, type: form.type, amount: parseFloat(form.amount) || 0, description: form.description, status: form.status };
    (editing ? api.transactions.update(editing.id, data) : api.transactions.create(data))
      .then(() => { setModalOpen(false); load(txPage); toast(editing ? 'Transaction updated' : 'Transaction added', 'success'); })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    api.transactions.delete(deleteTarget.id).then(() => { setDeleteTarget(null); load(txPage); toast('Transaction deleted', 'success'); }).catch((err) => toast(err.message, 'error'));
  };

  const totals = { income: txIncome, expense: txExpense };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Income</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">+₹{totals.income.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Expenses</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">-₹{totals.expense.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Net Balance</p>
          <p className={cn("text-2xl font-bold mt-1", (totals.income - totals.expense) >= 0 ? "text-emerald-600" : "text-rose-600")}>₹{(totals.income - totals.expense).toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-lg font-bold">Financial Ledger ({txTotal})</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => transactions.length && exportToCsv(transactions.map((t) => ({ id: t.id, date: t.date, type: t.type, amount: t.amount, description: t.description, status: t.status })), 'transactions')} disabled={!transactions.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Download size={18} /> Export CSV
            </button>
            <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold">
              <Plus size={18} /> Add Transaction
            </button>
          </div>
          </div>
          <DateRangeFilter value={txDateFilter} onChange={(v) => { setTxDateFilter(v); setTxPage(1); }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-6 py-4">Date</th><th className="px-6 py-4">Description</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500"><LoadingSpinner /></td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center">
                  <FileText className="mx-auto mb-3 text-gray-300" size={40} />
                  <p className="text-gray-500 font-medium">No transactions recorded</p>
                  <p className="text-gray-400 text-sm mt-1">Add your first transaction to start tracking finances</p>
                </td></tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 group">
                    <td className="px-6 py-4 text-sm text-gray-600">{t.date}</td>
                    <td className="px-6 py-4 text-sm font-bold">{t.description}</td>
                    <td className="px-6 py-4"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", t.type === 'Sales' ? 'bg-emerald-100 text-emerald-700' : t.type === 'Purchase' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700')}>{t.type}</span></td>
                    <td className="px-6 py-4"><span className={cn("font-bold", t.type === 'Sales' ? 'text-emerald-600' : 'text-rose-600')}>{t.type === 'Sales' ? '+' : '-'}₹{t.amount.toLocaleString()}</span></td>
                    <td className="px-6 py-4"><span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", t.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700')}>{t.status}</span></td>
                    <td className="px-6 py-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => openEdit(t)} className="p-2 text-[#F27D26] hover:bg-orange-50 rounded-lg"><Pencil size={16} /></button>
                      <button type="button" onClick={() => setDeleteTarget(t)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls page={txPage} totalPages={txTotalPages} total={txTotal} onPageChange={load} />
      </div>

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Transaction' : 'Add Transaction'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Date</label><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'Sales' | 'Purchase' | 'Expense' })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]"><option value="Sales">Sales (Income)</option><option value="Purchase">Purchase</option><option value="Expense">Expense</option></select></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Amount (₹)</label><input type="number" required min={0} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="0.00" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Description</label><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="e.g. Bulk Sale to Dealer A" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Completed' | 'Pending' })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]"><option value="Completed">Completed</option><option value="Pending">Pending</option></select></div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Save'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6 text-center">
              <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertCircle size={28} /></div>
              <p className="text-gray-600 mb-6">Delete transaction <strong>"{deleteTarget.description}"</strong>?</p>
              <div className="flex gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="button" onClick={handleDelete} className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold">Delete</button></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
