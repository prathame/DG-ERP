import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, ArrowLeft, Clock, MessageCircle, Send } from 'lucide-react';
import { cn, shareViaWhatsApp, formatDate } from '../../lib/utils';
import { api } from '../../api';
import { useToast, LoadingSpinner, PaidBadge, PaidStamp, isBillFullyPaid } from '../../components/ui';

export function VendorFinanceView({ user }: { user: { id: string; role?: string; vendorId?: string | null } | null }) {
  const { toast } = useToast();
  const isAdmin = ['Admin', 'Super Admin'].includes(user?.role ?? '');
  const isVendor = user?.role === 'Vendor' && user?.vendorId;
  const [summaryData, setSummaryData] = useState<{ vendorId: string; vendorName: string; vendorPhone: string; totalDistributedValue: number; totalPaid: number; balance: number; unitsDistributed: number; reminder: { enabled: boolean; days: number; lastSent: string | null } }[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(isVendor ? user.vendorId! : null);
  const [detail, setDetail] = useState<{
    vendor: { id: string; name: string; phone?: string; email?: string; address?: string; contactPerson?: string };
    totalDistributedValue: number; totalPaid: number; balance: number;
    payments: { id: string; amount: number; paymentDate: string; paymentMethod: string; referenceNumber?: string; notes?: string }[];
    distributions: { date: string; productName: string; unitPrice: number; quantity: number; total: number }[];
    reminder: { enabled: boolean; days: number; lastSent: string | null };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [reminderModal, setReminderModal] = useState<{ vendorId: string; vendorName: string; enabled: boolean; days: number } | null>(null);
  const [remindersDue, setRemindersDue] = useState<{ vendorId: string; vendorName: string; vendorPhone: string; balance: number }[]>([]);

  const loadSummary = () => {
    setLoading(true);
    if (isVendor && user?.vendorId) {
      api.vendorFinance.detail(user.vendorId)
        .then((d) => { setDetail(d); setSelectedVendorId(user.vendorId!); })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    api.vendorFinance.summary()
      .then((s) => setSummaryData(s))
      .catch(() => setSummaryData([]));
    api.vendorFinance.remindersDue()
      .then((r) => setRemindersDue(r))
      .catch(() => setRemindersDue([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadSummary(); }, []);

  const loadDetail = (vendorId: string) => {
    if (isVendor && vendorId !== user?.vendorId) return;
    api.vendorFinance.detail(vendorId).then(setDetail).catch(() => setDetail(null));
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorId || !paymentForm.amount) return;
    setSubmitting(true);
    api.vendorFinance.recordPayment(selectedVendorId, {
      amount: parseFloat(paymentForm.amount),
      paymentDate: paymentForm.paymentDate,
      paymentMethod: paymentForm.paymentMethod,
      referenceNumber: paymentForm.referenceNumber || undefined,
      notes: paymentForm.notes || undefined,
    })
      .then(() => {
        setPaymentModal(false);
        setPaymentForm({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '' });
        loadDetail(selectedVendorId!);
        loadSummary();
        toast('Payment recorded', 'success');
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const handleSaveReminder = () => {
    if (!reminderModal) return;
    api.vendorFinance.updateReminder(reminderModal.vendorId, { enabled: reminderModal.enabled, reminderDays: reminderModal.days })
      .then(() => { setReminderModal(null); loadSummary(); toast('Reminder settings updated', 'success'); })
      .catch((err) => toast(err.message, 'error'));
  };

  const handleSendReminder = (v: { vendorId: string; vendorName: string; vendorPhone: string; balance: number }) => {
    const companyName = (() => { try { const u = JSON.parse(sessionStorage.getItem('dg_erp_user') || '{}'); return u.companyName || 'Our Company'; } catch { return 'Our Company'; } })();
    const msg = `🔔 *Payment Reminder*\n━━━━━━━━━━━━━━━━━\nDear ${v.vendorName},\n\nThis is a reminder that you have an outstanding balance of *₹${v.balance.toLocaleString()}*.\n\nPlease arrange the payment at your earliest convenience.\n\nThank you,\n${companyName}`;
    shareViaWhatsApp(v.vendorPhone, msg);
    api.vendorFinance.markReminderSent(v.vendorId).then(() => loadSummary()).catch(() => {});
  };

  const totalOwed = summaryData.reduce((s, v) => s + v.balance, 0);
  const totalPaidAll = summaryData.reduce((s, v) => s + v.totalPaid, 0);
  const totalValue = summaryData.reduce((s, v) => s + v.totalDistributedValue, 0);

  if (selectedVendorId && detail) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-4">
          {isAdmin && <button type="button" onClick={() => { setSelectedVendorId(null); setDetail(null); }} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>}
          <div className="flex-1 flex items-center gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 flex-wrap">
                {isVendor ? 'My Finance' : `${detail.vendor.name} — Finance`}
                {isBillFullyPaid(detail.totalDistributedValue, detail.balance) && <PaidBadge />}
              </h2>
              <p className="text-sm text-gray-500">{detail.vendor.phone || detail.vendor.email || ''}</p>
            </div>
            {isBillFullyPaid(detail.totalDistributedValue, detail.balance) && (
              <PaidStamp className="hidden sm:flex text-xs opacity-80" />
            )}
          </div>
          {isAdmin && <button type="button" onClick={() => setPaymentModal(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"><Plus size={18} /> Record Payment</button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Distributed Value</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">₹{detail.totalDistributedValue.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Paid</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">₹{detail.totalPaid.toLocaleString()}</p>
          </div>
          <div className={cn("p-5 rounded-2xl border shadow-sm relative overflow-hidden", detail.balance > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200")}>
            <p className="text-xs font-bold text-gray-400 uppercase">Balance Remaining</p>
            <p className={cn("text-2xl font-bold mt-1", detail.balance > 0 ? "text-rose-600" : "text-emerald-600")}>
              {isBillFullyPaid(detail.totalDistributedValue, detail.balance) ? (
                <span className="inline-flex items-center gap-2">
                  <PaidBadge size="md" className="text-sm px-3 py-1.5" />
                </span>
              ) : (
                <>₹{detail.balance.toLocaleString()}</>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold">Payment History</h3>
              <span className="text-sm text-gray-500">{detail.payments.length} payment{detail.payments.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {detail.payments.length === 0 ? (
                <p className="p-6 text-center text-gray-500">No payments recorded yet</p>
              ) : detail.payments.map((p) => (
                <div key={p.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-emerald-600">+₹{p.amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{formatDate(p.paymentDate)} &middot; {p.paymentMethod}{p.referenceNumber ? ` &middot; Ref: ${p.referenceNumber}` : ''}</p>
                    {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold">Distributions (Money Owed)</h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {detail.distributions.map((d, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{d.productName}</p>
                    <p className="text-xs text-gray-500">{formatDate(d.date)} &middot; {d.quantity} units &times; ₹{d.unitPrice.toLocaleString()}</p>
                  </div>
                  <p className="font-bold text-sm">₹{d.total.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {paymentModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setPaymentModal(false)} />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold mb-4">Record Payment — {detail.vendor.name}</h3>
                <p className="text-sm text-gray-500 mb-4">Balance: <span className="font-bold text-rose-600">₹{detail.balance.toLocaleString()}</span></p>
                <form onSubmit={handleRecordPayment} className="space-y-4">
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Amount (₹)</label><input type="number" required min={1} step={0.01} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="0.00" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Payment Date</label><input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Payment Method</label><select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Other</option></select></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Reference / Transaction ID</label><input value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="Optional" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Notes</label><input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="Optional" /></div>
                  <div className="flex gap-2 pt-2"><button type="button" onClick={() => setPaymentModal(false)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Record Payment'}</button></div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Vendor Finance</h2>
          <p className="text-sm text-gray-500">Track vendor payments, balances, and send reminders</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Distributed Value</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">₹{totalValue.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Received</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">₹{totalPaidAll.toLocaleString()}</p>
        </div>
        <div className={cn("p-5 rounded-2xl border shadow-sm", totalOwed > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200")}>
          <p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>
          <p className={cn("text-2xl font-bold mt-1", totalOwed > 0 ? "text-rose-600" : "text-emerald-600")}>₹{totalOwed.toLocaleString()}</p>
        </div>
      </div>

      {remindersDue.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="font-bold text-amber-800 flex items-center gap-2 mb-3"><Clock size={18} /> Payment Reminders Due</h3>
          <div className="space-y-2">
            {remindersDue.map((r) => (
              <div key={r.vendorId} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                <div>
                  <p className="font-medium">{r.vendorName}</p>
                  <p className="text-sm text-rose-600 font-bold">Balance: ₹{r.balance.toLocaleString()}</p>
                </div>
                <button type="button" onClick={() => handleSendReminder(r)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700">
                  <Send size={16} /> Send Reminder
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50">
              <th className="px-6 py-4">Vendor</th><th className="px-6 py-4">Distributed Value</th><th className="px-6 py-4">Paid</th><th className="px-6 py-4">Balance</th><th className="px-6 py-4">Reminder</th><th className="px-6 py-4">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr>
              ) : summaryData.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No vendor finance data yet</td></tr>
              ) : summaryData.map((v) => (
                <tr key={v.vendorId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{v.vendorName}</p>
                      {isBillFullyPaid(v.totalDistributedValue, v.balance) && <PaidBadge size="sm" />}
                    </div>
                    <p className="text-xs text-gray-500">{v.unitsDistributed} units</p>
                  </td>
                  <td className="px-6 py-4 font-medium">₹{v.totalDistributedValue.toLocaleString()}</td>
                  <td className="px-6 py-4 font-bold text-emerald-600">₹{v.totalPaid.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    {isBillFullyPaid(v.totalDistributedValue, v.balance) ? (
                      <PaidBadge size="sm" />
                    ) : (
                      <span className="font-bold text-rose-600">₹{v.balance.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" onClick={() => setReminderModal({ vendorId: v.vendorId, vendorName: v.vendorName, enabled: v.reminder.enabled, days: v.reminder.days })} className={cn("text-xs font-bold px-2.5 py-1 rounded-full", v.reminder.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {v.reminder.enabled ? `Every ${v.reminder.days}d` : 'Off'}
                    </button>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button type="button" onClick={() => { setSelectedVendorId(v.vendorId); loadDetail(v.vendorId); }} className="text-sm font-bold text-[#F27D26] hover:underline">View</button>
                    {v.balance > 0 && v.vendorPhone && (
                      <button type="button" onClick={() => handleSendReminder(v)} className="text-sm font-bold text-green-600 hover:underline flex items-center gap-1"><MessageCircle size={14} /> Remind</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {reminderModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setReminderModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6">
              <h3 className="text-lg font-bold mb-4">Reminder — {reminderModal.vendorName}</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Enable auto-reminder</span>
                  <button type="button" onClick={() => setReminderModal({ ...reminderModal, enabled: !reminderModal.enabled })} className={cn("relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors", reminderModal.enabled ? "bg-green-500" : "bg-gray-300")}>
                    <span className={cn("inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform", reminderModal.enabled ? "translate-x-5" : "translate-x-0")} />
                  </button>
                </div>
                {reminderModal.enabled && (
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Send reminder every (days)</label><input type="number" min={1} value={reminderModal.days || ''} onChange={(e) => setReminderModal({ ...reminderModal, days: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                )}
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setReminderModal(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="button" onClick={handleSaveReminder} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">Save</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
