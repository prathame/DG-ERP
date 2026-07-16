import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, ArrowLeft, Clock, MessageCircle, Send, Search, Printer, Upload, FileSpreadsheet, Check, X, AlertTriangle } from 'lucide-react';
import { cn, shareViaWhatsApp, formatDate, openPrintWindow, printBillInWindow, PRINT_POPUP_BLOCKED } from '../../lib/utils';
import { api, fetchApi } from '../../api';
import { useToast, LoadingSpinner, PaidBadge, PaidStamp, isBillFullyPaid } from '../../components/ui';
import { session } from '../../lib/session';
import { useConfirm } from '../../hooks/useConfirm';

function esc(t: unknown): string {
  return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


export function VendorFinanceView({ user, accessLevel = 'full' }: { user: { id: string; role?: string; vendorId?: string | null } | null; accessLevel?: 'hidden' | 'view' | 'print' | 'full' }) {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
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
  const [paymentFilter, setPaymentFilter] = useState<'unpaid' | 'paid'>('unpaid');
  const [finSearch, setFinSearch] = useState('');
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '', batchId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [vendorBatches, setVendorBatches] = useState<{ batchId: string; distributionDate: string; billValue: number; balanceRemaining: number; productNames: string[] }[]>([]);
  const [bankStatementOpen, setBankStatementOpen] = useState(false);
  const [bankPreview, setBankPreview] = useState<{ matched: { txIdx: number; date: string; description: string; amount: number; reference?: string; vendorId: string; vendorName: string; matchedBy: string; suggestedBatches: { batchId: string; date: string; balance: number; applyAmount: number }[] }[]; unmatched: { txIdx: number; date: string; description: string; amount: number }[]; totalAmount: number } | null>(null);
  const [bankApplying, setBankApplying] = useState(false);
  const [reminderModal, setReminderModal] = useState<{ vendorId: string; vendorName: string; enabled: boolean; days: number } | null>(null);
  const [remindersDue, setRemindersDue] = useState<{ vendorId: string; vendorName: string; vendorPhone: string; balance: number }[]>([]);

  const loadSummary = () => {
    setLoading(true);
    if (isVendor && user?.vendorId) {
      api.vendorFinance.detail(user.vendorId)
        .then((d) => { setDetail({ ...d, totalDistributedValue: Number(d.totalDistributedValue) || 0, totalPaid: Number(d.totalPaid) || 0, balance: Number(d.balance) || 0 }); setSelectedVendorId(user.vendorId!); })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    api.vendorFinance.summary()
      .then((s) => setSummaryData(s.map((v: Record<string, unknown>) => ({ ...v, totalDistributedValue: Number(v.totalDistributedValue) || 0, totalPaid: Number(v.totalPaid) || 0, balance: Number(v.balance) || 0, unitsDistributed: Number(v.unitsDistributed) || 0 }))))
      .catch(() => setSummaryData([]));
    api.vendorFinance.remindersDue()
      .then((r) => setRemindersDue(r))
      .catch(() => setRemindersDue([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadSummary(); }, []);

  const loadDetail = (vendorId: string) => {
    if (isVendor && vendorId !== user?.vendorId) return;
    api.vendorFinance.detail(vendorId).then((d) => setDetail({ ...d, totalDistributedValue: Number(d.totalDistributedValue) || 0, totalPaid: Number(d.totalPaid) || 0, balance: Number(d.balance) || 0 })).catch(() => setDetail(null));
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendorId || !paymentForm.amount) return;
    if (vendorBatches.length > 0 && !paymentForm.batchId) { toast('Select a distribution batch or "All Distributions"', 'error'); return; }

    const amount = parseFloat(paymentForm.amount);

    // Determine the due amount for the selected scope
    let due = detail?.balance ?? 0;
    if (paymentForm.batchId && paymentForm.batchId !== '__ALL__') {
      const batch = vendorBatches.find(b => b.batchId === paymentForm.batchId);
      due = batch?.balanceRemaining ?? due;
    }

    // Overpayment / already-in-credit confirmation
    if (due <= 0) {
      const credit = Math.abs(due);
      const ok = await confirm({
        title: 'Already in Credit',
        message: `This vendor already has ₹${credit.toLocaleString()} in credit. Recording ₹${amount.toLocaleString()} will add ₹${(credit + amount).toLocaleString()} total credit. Continue?`,
        confirmLabel: 'Yes, Record Payment',
        variant: 'info',
      });
      if (!ok) return;
    } else if (amount > due) {
      const extra = amount - due;
      const ok = await confirm({
        title: 'Extra Payment',
        message: `Due is ₹${due.toLocaleString()} but you're recording ₹${amount.toLocaleString()}. ₹${due.toLocaleString()} will clear the balance and ₹${extra.toLocaleString()} will be recorded as credit. Continue?`,
        confirmLabel: `Record ₹${amount.toLocaleString()} (₹${extra.toLocaleString()} extra)`,
        variant: 'info',
      });
      if (!ok) return;
    }

    setSubmitting(true);
    api.vendorFinance.recordPayment(selectedVendorId, {
      amount,
      paymentDate: paymentForm.paymentDate,
      paymentMethod: paymentForm.paymentMethod,
      referenceNumber: paymentForm.referenceNumber || undefined,
      notes: paymentForm.notes || undefined,
      batchId: paymentForm.batchId === '__ALL__' ? undefined : (paymentForm.batchId || undefined),
    })
      .then(() => {
        setPaymentModal(false);
        setPaymentForm({ amount: '', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', referenceNumber: '', notes: '', batchId: '' });
        loadDetail(selectedVendorId!);
        loadSummary();
        toast('Payment recorded', 'success');
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const openPaymentModal = () => {
    setPaymentModal(true);
    if (selectedVendorId) {
      api.distribution.batches(selectedVendorId).then((b) => {
        setVendorBatches(b.filter((x) => x.balanceRemaining > 0));
      }).catch(() => setVendorBatches([]));
    }
  };

  const handleSaveReminder = () => {
    if (!reminderModal) return;
    api.vendorFinance.updateReminder(reminderModal.vendorId, { enabled: reminderModal.enabled, reminderDays: reminderModal.days })
      .then(() => { setReminderModal(null); loadSummary(); toast('Reminder settings updated', 'success'); })
      .catch((err) => toast(err.message, 'error'));
  };

  const handleSendReminder = (v: { vendorId: string; vendorName: string; vendorPhone: string; balance: number }) => {
    const companyName = (() => { try { const u = (session.getUser() || {}); return u.companyName || 'Our Company'; } catch { return 'Our Company'; } })();
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
          <button type="button" onClick={() => {
            const companyName = (() => { try { return (session.getUser() || {} as Record<string, unknown>).companyName || 'Dhandho'; } catch { return 'Dhandho'; } })();
            const w = openPrintWindow();
            if (!w) { toast(PRINT_POPUP_BLOCKED, 'error'); return; }
            printBillInWindow(w, `<!DOCTYPE html><html><head><title>Payment History — ${esc(detail.vendor.name)}</title><style>
              body{font-family:Inter,sans-serif;margin:0;padding:40px;color:#1a1a1a}
              .header{border-bottom:3px solid #F27D26;padding-bottom:16px;margin-bottom:24px}
              .company{font-size:18px;font-weight:700}.vendor{font-size:14px;color:#666;margin-top:4px}
              .stats{display:flex;gap:24px;margin-bottom:24px}
              .stat{padding:12px 16px;background:#f9fafb;border-radius:8px;flex:1}
              .stat-label{font-size:10px;text-transform:uppercase;color:#999;font-weight:700}
              .stat-value{font-size:18px;font-weight:700;margin-top:4px}
              table{width:100%;border-collapse:collapse}
              th{text-align:left;padding:10px 12px;font-size:10px;text-transform:uppercase;color:#666;border-bottom:2px solid #e5e7eb;background:#f3f4f6}
              td{padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px}
              .text-right{text-align:right}
              .footer{margin-top:30px;text-align:center;font-size:10px;color:#999}
              @media print{body{padding:20px}}
            </style></head><body>
            <div class="header"><div class="company">${esc(companyName)}</div><div class="vendor">Payment History — ${esc(detail.vendor.name)}${detail.vendor.phone ? ` • ${esc(detail.vendor.phone)}` : ''}</div></div>
            <div class="stats">
              <div class="stat"><div class="stat-label">Total Value</div><div class="stat-value" style="color:#2563eb">₹${detail.totalDistributedValue.toLocaleString()}</div></div>
              <div class="stat"><div class="stat-label">Total Paid</div><div class="stat-value" style="color:#059669">₹${detail.totalPaid.toLocaleString()}</div></div>
              <div class="stat"><div class="stat-label">Balance</div><div class="stat-value" style="color:${detail.balance > 0 ? '#dc2626' : '#059669'}">₹${Math.abs(detail.balance).toLocaleString()}${detail.balance < 0 ? ' (Credit)' : ''}</div></div>
            </div>
            <table><thead><tr><th>Date</th><th>Method</th><th class="text-right">Amount</th><th>Reference</th><th>Notes</th></tr></thead>
            <tbody>${detail.payments.map((p: Record<string, unknown>) => `<tr><td>${esc(formatDate(p.paymentDate as string))}</td><td>${esc(p.paymentMethod)}</td><td class="text-right" style="font-weight:600">₹${Number(p.amount).toLocaleString()}</td><td>${esc(p.referenceNumber || '—')}</td><td>${esc(p.notes || '—')}</td></tr>`).join('')}</tbody></table>
            <div class="footer">Generated on ${new Date().toLocaleDateString('en-IN')} • ${esc(companyName)}</div>
            </body></html>`, `Payment-History-${detail.vendor.name}`);
          }} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50"><Printer size={16} /> PDF</button>
          {isAdmin && <button type="button" onClick={openPaymentModal} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"><Plus size={18} /> Record Payment</button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Distributed Value</p>
            <p className="text-lg sm:text-2xl font-bold text-blue-600 mt-1">₹{detail.totalDistributedValue.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Paid</p>
            <p className="text-lg sm:text-2xl font-bold text-emerald-600 mt-1">₹{detail.totalPaid.toLocaleString()}</p>
          </div>
          <div className={cn("p-5 rounded-2xl border shadow-sm relative overflow-hidden", detail.balance > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200")}>
            <p className="text-xs font-bold text-gray-400 uppercase">Balance Remaining</p>
            <p className={cn("text-2xl font-bold mt-1", detail.balance > 0 ? "text-rose-600" : "text-emerald-600")}>
              {detail.balance < 0 ? (
                <>₹{Math.abs(detail.balance).toLocaleString()} credit</>
              ) : isBillFullyPaid(detail.totalDistributedValue, detail.balance) ? (
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
            <div className="px-3 py-3 sm:px-6 sm:py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold">Payment History</h3>
              <span className="text-sm text-gray-500">{detail.payments.length} payment{detail.payments.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {detail.payments.length === 0 ? (
                <p className="p-6 text-center text-gray-500">No payments recorded yet</p>
              ) : detail.payments.map((p) => (
                <div key={p.id} className="px-3 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-emerald-600">+₹{p.amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">{formatDate(p.paymentDate)} &middot; {p.paymentMethod === 'Bank Statement' ? <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">Bank Statement</span> : p.paymentMethod}{p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}</p>
                    {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-3 py-3 sm:px-6 sm:py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold">Distributions (Money Owed)</h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
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
                  {vendorBatches.length > 0 && (
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase">Distribution Batch *</label>
                      <select required value={paymentForm.batchId} onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__ALL__') {
                          const totalDue = vendorBatches.reduce((sum, b) => sum + b.balanceRemaining, 0);
                          setPaymentForm({ ...paymentForm, batchId: val, amount: String(totalDue) });
                        } else {
                          const batch = vendorBatches.find((b) => b.batchId === val);
                          setPaymentForm({ ...paymentForm, batchId: val, amount: batch ? String(batch.balanceRemaining) : '' });
                        }
                      }} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand">
                        <option value="">Select distribution</option>
                        <option value="__ALL__">All Distributions — ₹{vendorBatches.reduce((s, b) => s + b.balanceRemaining, 0).toLocaleString()} total due</option>
                        {vendorBatches.map((b) => (
                          <option key={b.batchId} value={b.batchId}>
                            {formatDate(b.distributionDate)} — {b.productNames.join(', ')} — ₹{b.balanceRemaining.toLocaleString()} due
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Amount (₹)</label><input type="number" required min={1} step={0.01} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="0.00" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Payment Date</label><input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Payment Method</label><select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option><option>Other</option></select></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Reference / Transaction ID</label><input value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Notes</label><input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="Optional" /></div>
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
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium cursor-pointer hover:bg-gray-50">
            <FileSpreadsheet size={18} /> Import Bank Statement
            <input type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
              const buf = await file.arrayBuffer();
              const wb = XLSX.read(buf, { type: 'array', cellDates: true });
              const ws = wb.Sheets[wb.SheetNames[0]];
              // Bank statements often have metadata rows before actual headers — find the real header row
              const BANK_KEYWORDS = ['date', 'amount', 'balance', 'narration', 'description', 'transaction', 'withdrawal', 'deposit', 'credit', 'debit', 'remark', 'particular'];
              const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
              const headerRowIdx = rawRows.findIndex(row =>
                row.filter(c => { const s = String(c).toLowerCase(); return BANK_KEYWORDS.some(k => s.includes(k)); }).length >= 2
              );
              if (headerRowIdx < 0) { toast('Could not find column headers in file', 'error'); return; }
              const headers = (rawRows[headerRowIdx] as string[]).map(h => String(h));
              const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false, header: headers, range: headerRowIdx + 1 });
              if (!rows.length) { toast('File must have header + data rows', 'error'); return; }
              // Try each term in priority order across all headers (avoids 'amount' matching 'Withdrawal' before 'Deposit')
              const key = (terms: string[]) => { for (const t of terms) { const h = headers.find(h => h.toLowerCase().includes(t)); if (h) return h; } return undefined; };
              const dateKey = key(['date', 'txn']);
              const descKey = key(['narration', 'remark', 'description', 'particular', 'detail', 'desc']);
              const amtKey = key(['credit', 'deposit', 'amount']);
              const refKey = key(['utr', 'ref', 'cheque', 'chq']);
              if (!descKey && !amtKey) { toast('File must have description/narration and credit/amount columns', 'error'); return; }
              const transactions: { date: string; description: string; amount: number; reference?: string }[] = [];
              for (const row of rows) {
                const amt = amtKey ? parseFloat(row[amtKey]) : 0;
                if (!amt || amt <= 0) continue;
                transactions.push({ date: dateKey ? row[dateKey] : '', description: descKey ? row[descKey] : '', amount: amt, reference: refKey ? row[refKey] : undefined });
              }
              if (!transactions.length) { toast('No credit transactions found', 'error'); return; }
              try {
                const result = await fetchApi<typeof bankPreview>('/vendor-finance/bank-statement/preview', { method: 'POST', body: JSON.stringify({ transactions }) });
                setBankPreview(result); setBankStatementOpen(true);
              } catch (err) { toast((err as Error).message, 'error'); }
            }} />
          </label>
        {(() => {
          const withOutstanding = summaryData.filter(v => v.balance > 0 && v.vendorPhone);
          if (!withOutstanding.length) return null;
          return (
            <button type="button" onClick={async () => {
              if (!await confirm({ title: 'Send Bulk Reminders', message: `Send WhatsApp payment reminders to ${withOutstanding.length} vendor${withOutstanding.length > 1 ? 's' : ''} with outstanding balance?`, confirmLabel: `Send to ${withOutstanding.length}`, variant: 'info' })) return;
              const companyName = (() => { try { return (session.getUser() || {} as Record<string, unknown>).companyName || 'Our Company'; } catch { return 'Our Company'; } })();
              for (const v of withOutstanding) {
                const msg = `🔔 *Payment Reminder*\n━━━━━━━━━━━━━━━━━\nDear ${v.vendorName},\n\nThis is a reminder that you have an outstanding balance of *₹${v.balance.toLocaleString()}*.\n\nPlease arrange the payment at your earliest convenience.\n\nThank you,\n${companyName}`;
                shareViaWhatsApp(v.vendorPhone, msg);
                api.vendorFinance.markReminderSent(v.vendorId).catch(() => {});
              }
              toast(`Opened WhatsApp for ${withOutstanding.length} vendors`, 'success');
              loadSummary();
            }} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700">
              <MessageCircle size={18} /> Send All Reminders ({withOutstanding.length})
            </button>
          );
        })()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Distributed Value</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-600 mt-1">₹{totalValue.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Received</p>
          <p className="text-lg sm:text-2xl font-bold text-emerald-600 mt-1">₹{totalPaidAll.toLocaleString()}</p>
        </div>
        <div className={cn("p-5 rounded-2xl border shadow-sm", totalOwed > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200")}>
          <p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>
          <p className={cn("text-2xl font-bold mt-1", totalOwed > 0 ? "text-rose-600" : "text-emerald-600")}>₹{Math.abs(totalOwed).toLocaleString()}{totalOwed < 0 ? ' credit' : ''}</p>
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

      {/* Payment filter + search */}
      <div className="flex items-center gap-3 flex-wrap">
        {(['unpaid', 'paid'] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => { setPaymentFilter(tab); setSelectedVendorId(null); }} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", paymentFilter === tab ? (tab === 'unpaid' ? "bg-rose-500 text-white" : "bg-emerald-500 text-white") : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
            {tab === 'unpaid' ? 'Unpaid' : 'Paid'}
          </button>
        ))}
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input type="text" placeholder="Search vendor..." value={finSearch} onChange={(e) => setFinSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50">
              <th className="px-3 py-3 sm:px-6 sm:py-4">Vendor</th><th className="px-3 py-3 sm:px-6 sm:py-4">Distributed Value</th><th className="px-3 py-3 sm:px-6 sm:py-4">Paid</th><th className="px-3 py-3 sm:px-6 sm:py-4">Balance</th><th className="px-3 py-3 sm:px-6 sm:py-4">Reminder</th><th className="px-3 py-3 sm:px-6 sm:py-4">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr>
              ) : (() => {
                const filtered = summaryData.filter((v) => {
                  const isPaid = v.balance <= 0;
                  if (paymentFilter === 'paid' ? !isPaid : isPaid) return false;
                  if (finSearch && !v.vendorName.toLowerCase().includes(finSearch.toLowerCase())) return false;
                  return true;
                });
                return filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">{finSearch ? 'No matching vendors' : paymentFilter === 'paid' ? 'No fully paid vendors' : 'No outstanding balances'}</td></tr>
              ) : filtered.map((v) => (
                <tr key={v.vendorId} className="hover:bg-gray-50">
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{v.vendorName}</p>
                      {isBillFullyPaid(v.totalDistributedValue, v.balance) && <PaidBadge size="sm" />}
                    </div>
                    <p className="text-xs text-gray-500">{v.unitsDistributed} units</p>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 font-medium">₹{v.totalDistributedValue.toLocaleString()}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 font-bold text-emerald-600">₹{v.totalPaid.toLocaleString()}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    {v.balance < 0 ? (
                      <span className="font-bold text-blue-600">₹{Math.abs(v.balance).toLocaleString()} credit</span>
                    ) : isBillFullyPaid(v.totalDistributedValue, v.balance) ? (
                      <PaidBadge size="sm" />
                    ) : (
                      <span className="font-bold text-rose-600">₹{v.balance.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <button type="button" onClick={() => setReminderModal({ vendorId: v.vendorId, vendorName: v.vendorName, enabled: v.reminder.enabled, days: v.reminder.days })} className={cn("text-xs font-bold px-2.5 py-1 rounded-full", v.reminder.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {v.reminder.enabled ? `Every ${v.reminder.days}d` : 'Off'}
                    </button>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 flex gap-2 items-center flex-wrap">
                    <button type="button" onClick={() => { setSelectedVendorId(v.vendorId); loadDetail(v.vendorId); }} className="text-sm font-bold text-brand hover:underline">View</button>
                    {isAdmin && (
                      <button type="button" onClick={() => { setSelectedVendorId(v.vendorId); loadDetail(v.vendorId); setTimeout(openPaymentModal, 300); }} className="text-xs font-bold px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">+ Pay</button>
                    )}
                    {v.balance > 0 && v.vendorPhone && (
                      <button type="button" onClick={() => handleSendReminder(v)} className="text-sm font-bold text-green-600 hover:underline flex items-center gap-1"><MessageCircle size={14} /> Remind</button>
                    )}
                  </td>
                </tr>
              )); })()}
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
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Send reminder every (days)</label><input type="number" min={1} value={reminderModal.days || ''} onChange={(e) => setReminderModal({ ...reminderModal, days: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                )}
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setReminderModal(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="button" onClick={handleSaveReminder} className="flex-1 py-2 bg-brand text-white rounded-lg font-bold">Save</button></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Bank Statement Preview Modal */}
      <AnimatePresence>
        {bankStatementOpen && bankPreview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setBankStatementOpen(false); setBankPreview(null); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2"><FileSpreadsheet size={20} className="text-brand" /> Bank Statement Preview</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{bankPreview.matched.length} matched · {bankPreview.unmatched.length} unmatched · ₹{bankPreview.totalAmount.toLocaleString()} total</p>
                </div>
                <button type="button" onClick={() => { setBankStatementOpen(false); setBankPreview(null); }} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
              </div>

              <div className="p-6 space-y-4">
                {/* Matched transactions */}
                {bankPreview.matched.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-emerald-700 flex items-center gap-1.5 mb-2"><Check size={16} /> Matched ({bankPreview.matched.length})</h4>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-left">Vendor</th>
                          <th className="px-3 py-2 text-left">Batch</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                          {bankPreview.matched.map((m, i) => (
                            <tr key={i} className="hover:bg-emerald-50/30">
                              <td className="px-3 py-2 text-gray-600">{m.date || '—'}</td>
                              <td className="px-3 py-2 text-gray-700 text-xs max-w-[200px] truncate" title={m.description}>{m.description}</td>
                              <td className="px-3 py-2 text-right font-semibold text-emerald-700">₹{m.amount.toLocaleString()}</td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-gray-900 text-xs">{m.vendorName}</p>
                                <p className="text-[10px] text-gray-400">{m.matchedBy}</p>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {m.suggestedBatches.length > 0 ? m.suggestedBatches.map((b, j) => (
                                  <span key={j} className="inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-mono mr-1">
                                    {b.batchId.slice(-6)} ₹{b.applyAmount.toLocaleString()}
                                  </span>
                                )) : <span className="text-gray-400">No outstanding batch</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Unmatched transactions */}
                {bankPreview.unmatched.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-amber-700 flex items-center gap-1.5 mb-2"><AlertTriangle size={16} /> Unmatched ({bankPreview.unmatched.length})</h4>
                    <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/30">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-amber-50 border-b border-amber-200 text-xs font-bold text-amber-600 uppercase">
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr></thead>
                        <tbody className="divide-y divide-amber-100">
                          {bankPreview.unmatched.map((u, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 text-gray-600">{u.date || '—'}</td>
                              <td className="px-3 py-2 text-gray-700 text-xs">{u.description}</td>
                              <td className="px-3 py-2 text-right font-semibold">₹{u.amount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1">Unmatched transactions won't be applied. Add vendors with matching phone/name to auto-match.</p>
                  </div>
                )}

                {bankPreview.matched.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="font-medium">No transactions matched any vendor</p>
                    <p className="text-xs mt-1">Make sure vendor phone numbers or names appear in the bank statement description</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-100 flex gap-3">
                <button type="button" onClick={() => { setBankStatementOpen(false); setBankPreview(null); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium">Cancel</button>
                {bankPreview.matched.length > 0 && (
                  <button type="button" disabled={bankApplying} onClick={async () => {
                    setBankApplying(true);
                    try {
                      const payments = bankPreview.matched.flatMap(m =>
                        m.suggestedBatches.length > 0
                          ? m.suggestedBatches.map(b => ({ vendorId: m.vendorId, amount: b.applyAmount, date: m.date, reference: m.reference, batchId: b.batchId, note: `Bank: ${m.description.slice(0, 50)}` }))
                          : [{ vendorId: m.vendorId, amount: m.amount, date: m.date, reference: m.reference, note: `Bank: ${m.description.slice(0, 50)}` }]
                      );
                      const result = await fetchApi<{ applied: number }>('/vendor-finance/bank-statement/apply', { method: 'POST', body: JSON.stringify({ payments }) });
                      toast(`${result.applied} payments applied from bank statement`, 'success');
                      setBankStatementOpen(false); setBankPreview(null); loadSummary();
                    } catch (err) { toast((err as Error).message, 'error'); }
                    finally { setBankApplying(false); }
                  }} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-60">
                    {bankApplying ? 'Applying...' : `Apply ${bankPreview.matched.length} Payments (₹${bankPreview.totalAmount.toLocaleString()})`}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmRenderer />
    </motion.div>
  );
}
