import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, Plus, ArrowLeft, Search, IndianRupee, Trash2, Receipt } from 'lucide-react';
import { cn, formatDate, exportToCsv } from '../../lib/utils';
import { api, fetchApi } from '../../api';
import type { Product } from '../../types';
import { useToast, LoadingSpinner, PaidBadge, isBillFullyPaid } from '../../components/ui';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useConfirm } from '../../hooks/useConfirm';

interface Supplier { id: string; name: string; contactPerson?: string; phone?: string; email?: string; address?: string; gstNumber?: string | null }
interface PurchaseBatch { batchId: string; supplierId: string; supplierName: string; purchaseDate: string; productNames: string[]; total: number; billValue: number; amountPaid: number; balanceRemaining: number }

export function PurchasesView({ accessLevel = 'full' }: { accessLevel?: 'hidden' | 'view' | 'print' | 'full' } = {}) {
  const canEdit = accessLevel === 'full';
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<PurchaseBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<Record<string, unknown> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' });
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', date: new Date().toISOString().slice(0, 10), amountPaid: '', invoiceNumber: '' });
  const [purchaseRows, setPurchaseRows] = useState<{ productId: string; quantity: number; packs: number; loosePieces: number; costPrice: string; withGst: boolean }[]>([{ productId: '', quantity: 1, packs: 0, loosePieces: 0, costPrice: '', withGst: true }]);
  const [submitting, setSubmitting] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'unpaid' | 'paid'>('unpaid');
  const [searchText, setSearchText] = useState('');
  const [section, setSection] = useState<'purchases' | 'expenses'>('purchases');
  const [expenses, setExpenses] = useState<{ id: string; category: string; description?: string; amount: number; expenseDate: string; paymentMethod: string; notes?: string }[]>([]);
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: '', description: '', amount: '', expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' });
  const expenseCategories = ['Electricity', 'Rent', 'Petrol / Diesel', 'Phone / Internet', 'Office Supplies', 'Repairs & Maintenance', 'Transport / Freight', 'Insurance', 'Packaging', 'Marketing', 'Legal / Professional', 'Miscellaneous'];
  const [paymentModal, setPaymentModal] = useState<{ batchId: string; supplierId: string; billValue: number; balanceRemaining: number } | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [financeMap, setFinanceMap] = useState<Record<string, { totalPurchasedValue: number; totalPaid: number; balance: number }>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEscapeKey(() => {
    if (paymentModal) setPaymentModal(null);
    else if (supplierModal) setSupplierModal(false);
    else if (modalOpen) setModalOpen(false);
    else if (selectedBatchId) setSelectedBatchId(null);
  });

  const load = () => {
    setLoadError(null);
    Promise.all([
      fetchApi<Supplier[]>('/suppliers'),
      fetchApi<PurchaseBatch[]>('/purchases/batches'),
      api.products.list(),
    ]).then(([s, b, p]) => { setSuppliers(s); setBatches(b); setProducts(p); })
      .then(() => {
        fetchApi<{ supplierId: string; totalPurchasedValue: number; totalPaid: number; balance: number }[]>('/supplier-finance/summary')
          .then(fs => { const m: Record<string, { totalPurchasedValue: number; totalPaid: number; balance: number }> = {}; for (const f of fs) m[f.supplierId] = { totalPurchasedValue: Number(f.totalPurchasedValue) || 0, totalPaid: Number(f.totalPaid) || 0, balance: Number(f.balance) || 0 }; setFinanceMap(m); })
          .catch(() => {});
      })
      .catch((err) => setLoadError(err.message || 'Failed to load data'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); load(); }, []);
  useEffect(() => { if (section === 'expenses') api.expenses.list().then(setExpenses).catch(() => {}); }, [section]);

  const defaultGstRate = 18;
  const purchaseTotals = purchaseRows.reduce((acc, r) => {
    const p = products.find(x => x.id === r.productId);
    const ps = p?.packSize ?? 1;
    const actualQty = ps > 1 ? (r.packs * ps) + r.loosePieces : r.quantity;
    const cost = r.costPrice ? parseFloat(r.costPrice) : (p?.price ?? 0);
    const gross = cost * (actualQty || 0);
    const gst = r.withGst ? Math.round(gross * defaultGstRate / 100) : 0;
    acc.gross += gross; acc.gst += gst; acc.billed += gross + gst; acc.items += actualQty || 0;
    return acc;
  }, { gross: 0, gst: 0, billed: 0, items: 0 });

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name) { toast('Enter supplier name', 'error'); return; }
    setSubmitting(true);
    try {
      await fetchApi('/suppliers', { method: 'POST', body: JSON.stringify(supplierForm) });
      setSupplierModal(false); setSupplierForm({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' }); load(); toast('Supplier added', 'success');
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleCreatePurchase = async () => {
    if (!purchaseForm.supplierId) { toast('Select a supplier', 'error'); return; }
    const validRows = purchaseRows.filter(r => r.productId && (r.quantity > 0 || r.packs > 0 || r.loosePieces > 0));
    if (validRows.length === 0) { toast('Add at least one product', 'error'); return; }
    const paid = parseFloat(purchaseForm.amountPaid) || 0;
    if (paid > purchaseTotals.billed) { toast(`Amount paid (₹${paid}) exceeds bill (₹${purchaseTotals.billed})`, 'error'); return; }
    setSubmitting(true);
    try {
      await fetchApi('/purchases/batch', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: purchaseForm.supplierId, purchaseDate: purchaseForm.date, gstRate: defaultGstRate, invoiceNumber: purchaseForm.invoiceNumber || undefined,
          amountPaid: paid > 0 ? paid : undefined,
          items: validRows.map(r => {
            const rp = products.find(x => x.id === r.productId);
            const ps = rp?.packSize ?? 1;
            return { productId: r.productId, quantity: ps > 1 ? (r.packs * ps) + r.loosePieces : r.quantity, costPrice: r.costPrice ? parseFloat(r.costPrice) : undefined, withGst: r.withGst };
          }),
        }),
      });
      setModalOpen(false); setPurchaseRows([{ productId: '', quantity: 1, packs: 0, loosePieces: 0, costPrice: '', withGst: true }]); setPurchaseForm({ supplierId: '', date: new Date().toISOString().slice(0, 10), amountPaid: '', invoiceNumber: '' });
      load(); toast(`Purchase recorded — ${validRows.length} product(s), ${purchaseTotals.items} items`, 'success');
    } catch (err) { toast((err as Error).message, 'error'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (loadError) return <div className="bg-white rounded-xl border border-rose-200 p-12 text-center"><p className="text-rose-600 font-medium mb-2">Failed to load purchases</p><p className="text-sm text-gray-500 mb-4">{loadError}</p><button type="button" onClick={() => { setLoading(true); load(); }} className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark">Retry</button></div>;

  // Supplier list with finance
  const supplierStats = suppliers.map(s => {
    const f = financeMap[s.id];
    const sBatches = batches.filter(b => b.supplierId === s.id);
    return { ...s, totalPurchased: f?.totalPurchasedValue ?? 0, totalPaid: f?.totalPaid ?? 0, balance: f?.balance ?? 0, batchCount: sBatches.length };
  }).filter(s => {
    const isPaid = s.balance <= 0 && s.totalPurchased > 0;
    if (paymentFilter === 'paid' ? !isPaid : (s.totalPurchased > 0 && isPaid)) return false;
    if (paymentFilter === 'unpaid' && s.totalPurchased === 0 && s.batchCount === 0) return false;
    if (searchText && !s.name.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  // Selected supplier view
  if (selectedSupplierId) {
    const supplierBatches = batches.filter(b => b.supplierId === selectedSupplierId);
    const supplierName = supplierBatches[0]?.supplierName ?? suppliers.find(s => s.id === selectedSupplierId)?.name ?? 'Supplier';

    if (selectedBatchId && batchDetail) {
      const bd = batchDetail;
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => { setSelectedBatchId(null); setBatchDetail(null); }} className="p-2 hover:bg-gray-200 rounded-lg"><ArrowLeft size={20} className="text-gray-600" /></button>
                <h3 className="font-bold text-lg">{supplierName}</h3>
                {isBillFullyPaid(Number(bd.billValue), Number(bd.balanceRemaining)) && <PaidBadge />}
                <span className="text-xs text-gray-500">Purchase — {formatDate(bd.purchaseDate as string)}</span>
                {Number(bd.balanceRemaining) > 0 && (
                  <button type="button" onClick={() => { setPaymentModal({ batchId: selectedBatchId, supplierId: selectedSupplierId, billValue: Number(bd.billValue), balanceRemaining: Number(bd.balanceRemaining) }); setPaymentForm({ amount: String(bd.balanceRemaining), paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' }); }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg"><IndianRupee size={16} /> Record Payment</button>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-600"><strong>{bd.total as number}</strong> items</span>
                <span className="text-sm font-bold text-brand ml-2">Bill: ₹{Number(bd.billValue).toLocaleString()}</span>
                {Number(bd.amountPaid) > 0 && <span className="text-sm text-emerald-600 font-medium ml-2">Paid: ₹{Number(bd.amountPaid).toLocaleString()}</span>}
                {Number(bd.balanceRemaining) > 0 && <span className="text-sm text-rose-500 font-medium ml-2">Due: ₹{Number(bd.balanceRemaining).toLocaleString()}</span>}
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">Products</div>
              {((bd.items as Record<string, unknown>[]) || []).map((item, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div><p className="font-medium">{item.productName as string}</p><p className="text-xs text-gray-500">{item.quantity as number} units • ₹{Number(item.costPrice).toLocaleString()}/unit{item.withGst ? ' +GST' : ''}</p></div>
                </div>
              ))}
            </div>
          </div>
          {paymentModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setPaymentModal(null)} />
              <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><IndianRupee size={28} /></div>
                <h3 className="text-lg font-bold text-center mb-1">Record Payment to Supplier</h3>
                <p className="text-sm text-gray-500 text-center mb-4">Bill: ₹{paymentModal.billValue.toLocaleString()} • Due: ₹{paymentModal.balanceRemaining.toLocaleString()}</p>
                <form onSubmit={(e) => { e.preventDefault(); const amt = parseFloat(paymentForm.amount); if (!amt || amt <= 0) { toast('Enter valid amount', 'error'); return; } setPaymentSubmitting(true); fetchApi(`/supplier-finance/${paymentModal.supplierId}/payments`, { method: 'POST', body: JSON.stringify({ amount: amt, paymentDate: paymentForm.paymentDate, paymentMethod: paymentForm.paymentMethod, referenceNumber: paymentForm.referenceNumber || undefined, notes: paymentForm.notes || undefined, batchId: paymentModal.batchId }) }).then(() => { setPaymentModal(null); load(); fetchApi(`/purchases/batch/${selectedBatchId}`).then(d => setBatchDetail(d as Record<string, unknown>)); toast('Payment recorded', 'success'); }).catch(err => toast(err.message, 'error')).finally(() => setPaymentSubmitting(false)); }} className="space-y-3">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label><input type="number" min="1" step="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Date</label><input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Method</label><select value={paymentForm.paymentMethod} onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option></select></div>
                  </div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Reference</label><input value={paymentForm.referenceNumber} onChange={e => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} placeholder="Optional" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" /></div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setPaymentModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm">Cancel</button>
                    <button type="submit" disabled={paymentSubmitting} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-60">{paymentSubmitting ? 'Saving...' : 'Record Payment'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </motion.div>
      );
    }

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
            <button type="button" onClick={() => setSelectedSupplierId(null)} className="p-2 hover:bg-gray-200 rounded-lg"><ArrowLeft size={20} className="text-gray-600" /></button>
            <h3 className="font-bold text-lg">{supplierName}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-6 py-3 text-xs font-bold text-gray-400 uppercase">Purchases ({supplierBatches.length})</div>
            {supplierBatches.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">No purchases from this supplier</div>
            ) : supplierBatches.map(batch => (
              <button key={batch.batchId} type="button" onClick={() => { setSelectedBatchId(batch.batchId); fetchApi(`/purchases/batch/${batch.batchId}`).then(d => setBatchDetail(d as Record<string, unknown>)).catch(err => toast(err.message, 'error')); }}
                className={cn("w-full px-6 py-4 text-left hover:bg-gray-50 flex items-center justify-between gap-4 transition-colors", isBillFullyPaid(batch.billValue, batch.balanceRemaining) && "opacity-60")}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">Purchase — {formatDate(batch.purchaseDate)}</p>
                    {isBillFullyPaid(batch.billValue, batch.balanceRemaining) && <PaidBadge size="sm" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {batch.productNames.join(' • ')} • {batch.total} item{batch.total !== 1 ? 's' : ''} • ₹{batch.billValue.toLocaleString()}
                    {batch.amountPaid > 0 && !isBillFullyPaid(batch.billValue, batch.balanceRemaining) && <span className="text-emerald-600"> • ₹{batch.amountPaid.toLocaleString()} paid</span>}
                    {batch.balanceRemaining > 0 && <span className="text-rose-500"> • ₹{batch.balanceRemaining.toLocaleString()} due</span>}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h2 className="text-xl font-bold flex items-center gap-2"><ShoppingBag size={22} /> Purchases & Expenses</h2><p className="text-sm text-gray-500">Track purchases from suppliers + business expenses</p></div>
        <div className="flex gap-2">
          {section === 'purchases' && canEdit && <>
            <button type="button" onClick={() => setSupplierModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50"><Plus size={16} /> Add Supplier</button>
            <button type="button" onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><ShoppingBag size={16} /> New Purchase</button>
          </>}
          {section === 'expenses' && canEdit && <button type="button" onClick={() => { setExpenseForm({ category: '', description: '', amount: '', expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', notes: '' }); setExpenseModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={16} /> Add Expense</button>}
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <button type="button" onClick={() => setSection('purchases')} className={`px-4 py-2 rounded-xl text-sm font-bold ${section === 'purchases' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>Purchases</button>
        <button type="button" onClick={() => setSection('expenses')} className={`px-4 py-2 rounded-xl text-sm font-bold ${section === 'expenses' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>Expenses</button>
      </div>

      {section === 'expenses' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {expenses.length === 0 ? (
            <div className="py-16 text-center text-gray-400"><Receipt size={40} className="mx-auto mb-3 opacity-30" /><p className="font-medium">No expenses recorded</p></div>
          ) : (<>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b"><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Notes</th>{canEdit && <th className="px-4 py-3 w-10"></th>}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {expenses.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-bold">{e.category}</span></td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{e.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold">₹{e.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm">{formatDate(e.expenseDate)}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{e.paymentMethod}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{e.notes || '—'}</td>
                      {canEdit && <td className="px-4 py-3"><button type="button" onClick={async () => { if (!await confirm({ message: 'Delete this expense? This cannot be undone.' })) return; try { await api.expenses.delete(e.id); toast('Deleted', 'success'); api.expenses.list().then(setExpenses); } catch(err) { toast((err as Error).message, 'error'); } }} className="p-1 text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t text-right font-bold text-sm">Total: ₹{expenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}</div>
          </>)}
        </div>
      )}

      {section === 'purchases' && <><div className="flex items-center gap-3 flex-wrap">
        {(['unpaid', 'paid'] as const).map(tab => (
          <button key={tab} type="button" onClick={() => { setPaymentFilter(tab); setSelectedSupplierId(null); }} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", paymentFilter === tab ? (tab === 'unpaid' ? "bg-rose-500 text-white" : "bg-emerald-500 text-white") : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>{tab === 'unpaid' ? 'Unpaid' : 'Paid'}</button>
        ))}
        <div className="relative flex-1 min-w-[150px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input type="text" placeholder="Search supplier..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm" /></div>
      </div>

      {suppliers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <ShoppingBag size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-2">No suppliers yet</p>
          <p className="text-sm mb-4">Add your first supplier to start recording purchases</p>
          <button type="button" onClick={() => setSupplierModal(true)} className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark transition-colors">+ Add Supplier</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supplierStats.map(s => (
            <button key={s.id} type="button" onClick={() => setSelectedSupplierId(s.id)} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-left hover:shadow-md transition-all">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{s.name}</p>
              {s.totalPurchased > 0 && (
                <div className="mt-2 flex gap-4 text-sm flex-wrap">
                  <span className="text-blue-600"><strong>₹{s.totalPurchased.toLocaleString()}</strong> purchased</span>
                  <span className="text-emerald-600"><strong>₹{s.totalPaid.toLocaleString()}</strong> paid</span>
                  {s.balance > 0 ? <span className="text-rose-600"><strong>₹{s.balance.toLocaleString()}</strong> due</span> : s.totalPurchased > 0 && <PaidBadge size="sm" />}
                </div>
              )}
              {s.batchCount === 0 && <p className="mt-2 text-xs text-gray-400">No purchases yet</p>}
            </button>
          ))}
        </div>
      )}
      </>}

      {/* Expense Modal */}
      <AnimatePresence>
        {expenseModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setExpenseModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">Add Expense</h3>
              <div className="space-y-3">
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Category *</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand">
                    <option value="">Select category</option>
                    {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Description</label><input value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="e.g. July electricity bill" /></div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Amount (₹) *</label><input type="number" min={1} value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="2500" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Date</label><input type="date" value={expenseForm.expenseDate} onChange={e => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" /></div>
                  <div><label className="text-xs font-bold text-gray-400 block mb-1">Method</label><select value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option></select></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 block mb-1">Notes</label><input value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setExpenseModal(false)} className="flex-1 py-2 border border-gray-200 rounded-xl font-bold text-gray-500">Cancel</button>
                <button type="button" onClick={async () => {
                  if (!expenseForm.category) { toast('Select a category', 'error'); return; }
                  if (!expenseForm.amount || Number(expenseForm.amount) <= 0) { toast('Enter valid amount', 'error'); return; }
                  try {
                    await api.expenses.create({ category: expenseForm.category, description: expenseForm.description || undefined, amount: Number(expenseForm.amount), expenseDate: expenseForm.expenseDate, paymentMethod: expenseForm.paymentMethod, notes: expenseForm.notes || undefined });
                    toast('Expense recorded', 'success');
                    setExpenseModal(false);
                    api.expenses.list().then(setExpenses);
                  } catch (e) { toast((e as Error).message, 'error'); }
                }} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">Save Expense</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Purchase Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6">
              <h3 className="text-lg font-bold mb-4">New Purchase from Supplier</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Supplier</label><select value={purchaseForm.supplierId} onChange={e => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"><option value="">Select supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Invoice No.</label><input value={purchaseForm.invoiceNumber} onChange={e => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand font-mono" placeholder="e.g. INV-001" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Date</label><input type="date" value={purchaseForm.date} onChange={e => setPurchaseForm({ ...purchaseForm, date: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" /></div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto mb-4">
                <table className="w-full text-left"><thead className="bg-gray-50"><tr className="text-xs font-bold text-gray-400 uppercase">
                  <th className="px-3 py-3 w-8">#</th><th className="px-3 py-3">Product</th><th className="px-3 py-3 w-20">Qty</th><th className="px-3 py-3 w-24">Cost Price</th><th className="px-3 py-3 w-12 text-center">GST</th><th className="px-3 py-3 w-28 text-right">Billed</th><th className="px-3 py-3 w-10"></th>
                </tr></thead><tbody className="divide-y divide-gray-100">
                  {purchaseRows.map((row, idx) => {
                    const p = products.find(x => x.id === row.productId);
                    const ps = p?.packSize ?? 1;
                    const hasPack = ps > 1;
                    const actualQty = hasPack ? (row.packs * ps) + row.loosePieces : row.quantity;
                    const cost = row.costPrice ? parseFloat(row.costPrice) : (p?.price ?? 0);
                    const gross = cost * (actualQty || 0);
                    const gst = row.withGst ? Math.round(gross * defaultGstRate / 100) : 0;
                    const billed = gross + gst;
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2"><select value={row.productId} onChange={e => setPurchaseRows(purchaseRows.map((r, i) => i === idx ? { ...r, productId: e.target.value } : r))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"><option value="">Select product</option>{products.map(pr => <option key={pr.id} value={pr.id}>{pr.name} (₹{pr.price.toLocaleString()}){(pr.packSize ?? 1) > 1 ? ` [${pr.packName}=${pr.packSize}]` : ''}</option>)}</select></td>
                        <td className="px-3 py-2">{hasPack ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} value={row.packs || ''} onChange={e => setPurchaseRows(purchaseRows.map((r, i) => i === idx ? { ...r, packs: parseInt(e.target.value) || 0 } : r))} className="w-12 px-1 py-1.5 border border-gray-200 rounded-lg text-sm text-center" placeholder="0" />
                            <span className="text-[9px] text-gray-400">{p?.packName}</span>
                            <span className="text-gray-300">+</span>
                            <input type="number" min={0} value={row.loosePieces || ''} onChange={e => setPurchaseRows(purchaseRows.map((r, i) => i === idx ? { ...r, loosePieces: parseInt(e.target.value) || 0 } : r))} className="w-12 px-1 py-1.5 border border-gray-200 rounded-lg text-sm text-center" placeholder="0" />
                            <span className="text-[9px] text-gray-400">pcs</span>
                            {actualQty > 0 && <span className="text-[9px] text-emerald-500">={actualQty}</span>}
                          </div>
                        ) : (
                          <input type="number" min={1} value={row.quantity || ''} onChange={e => setPurchaseRows(purchaseRows.map((r, i) => i === idx ? { ...r, quantity: parseInt(e.target.value) || 0 } : r))} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" />
                        )}</td>
                        <td className="px-3 py-2"><input type="number" min={0} step={0.01} value={row.costPrice} onChange={e => setPurchaseRows(purchaseRows.map((r, i) => i === idx ? { ...r, costPrice: e.target.value } : r))} placeholder={p ? `₹${p.price}` : '—'} className={cn("w-full px-2 py-1.5 border rounded-lg text-sm text-center", row.costPrice ? "border-amber-300 bg-amber-50" : "border-gray-200")} /></td>
                        <td className="px-3 py-2 text-center"><input type="checkbox" checked={row.withGst} onChange={e => setPurchaseRows(purchaseRows.map((r, i) => i === idx ? { ...r, withGst: e.target.checked } : r))} className="rounded text-brand" /></td>
                        <td className="px-3 py-2 text-right text-sm font-bold">{billed > 0 ? `₹${billed.toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2">{purchaseRows.length > 1 && <button type="button" onClick={() => setPurchaseRows(purchaseRows.filter((_, i) => i !== idx))} className="p-1 text-rose-400 hover:text-rose-600 rounded">×</button>}</td>
                      </tr>
                    );
                  })}
                </tbody></table>
              </div>
              <button type="button" onClick={() => setPurchaseRows([...purchaseRows, { productId: '', quantity: 1, packs: 0, loosePieces: 0, costPrice: '', withGst: true }])} className="text-sm font-bold text-brand mb-4">+ Add Product</button>
              <div className="bg-gray-50 rounded-xl p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm text-gray-600">{purchaseTotals.items} items • Gross ₹{purchaseTotals.gross.toLocaleString()} • GST ₹{purchaseTotals.gst.toLocaleString()}</span>
                <span className="text-lg font-bold text-brand">Total: ₹{purchaseTotals.billed.toLocaleString()}</span>
              </div>
              <div className="mb-4"><label className="text-xs font-bold text-gray-400 uppercase">Amount Paid (₹)</label><input type="number" min={0} step={0.01} value={purchaseForm.amountPaid} onChange={e => setPurchaseForm({ ...purchaseForm, amountPaid: e.target.value })} placeholder="0" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" /></div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium">Cancel</button>
                <button type="button" onClick={handleCreatePurchase} disabled={submitting} className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60">{submitting ? 'Saving...' : `Record Purchase (${purchaseTotals.items} Items)`}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Supplier Modal */}
      {supplierModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSupplierModal(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-bold mb-4">Add Supplier</h3>
            <form onSubmit={handleCreateSupplier} className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Name *</label><input required value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Contact Person</label><input value={supplierForm.contactPerson} onChange={e => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">GSTIN</label><input value={supplierForm.gstNumber} onChange={e => setSupplierForm({ ...supplierForm, gstNumber: e.target.value })} placeholder="e.g. 24AABCU9603R1ZM" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Address</label><input value={supplierForm.address} onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSupplierModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium text-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold text-sm disabled:opacity-60">{submitting ? 'Saving...' : 'Add Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmRenderer />
    </motion.div>
  );
}
