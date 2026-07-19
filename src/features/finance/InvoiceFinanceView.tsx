import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Trash2, FileText, IndianRupee, Clock, Search, Printer } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../api';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { useToast, LoadingSpinner, isBillFullyPaid, PaidBadge, PaidStamp } from '../../components/ui';
import { useConfirm } from '../../hooks/useConfirm';
import { CreateInvoiceModal, type InvoicePartyPrefill } from '../invoices/InvoicesView';
import { printStandaloneInvoiceById } from '../../lib/printStandaloneInvoice';
import { isServiceMobileMode } from '../../platforms/service-mobile/mode';

type Summary = Awaited<ReturnType<typeof api.invoiceFinance.summary>>[number];
type ClientDetail = Awaited<ReturnType<typeof api.invoiceFinance.client>>;
type PayModal = {
  invoiceId: string | null;
  invoiceNumber: string;
  balance: number;
  isAdvance: boolean;
};

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString()}`;

export function InvoiceFinanceView({ accessLevel = 'full' }: { accessLevel?: 'hidden' | 'view' | 'print' | 'full' }) {
  const { toast } = useToast();
  const cfg = useBusinessConfig();
  const isService = cfg.type === 'service';
  const { confirm, ConfirmRenderer } = useConfirm();
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /** partyKey from summary (vendor:ID | customer:ID | name:…) */
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<InvoicePartyPrefill | null>(null);
  const [payModal, setPayModal] = useState<PayModal | null>(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const offlineAdvance = isServiceMobileMode();

  const loadSummary = () => {
    setLoading(true);
    api.invoiceFinance
      .summary()
      .then(rows => setSummary(Array.isArray(rows) ? rows : []))
      .catch(() => setSummary([]))
      .finally(() => setLoading(false));
  };

  const loadDetail = (partyKey: string) => {
    setDetailLoading(true);
    api.invoiceFinance
      .client(partyKey)
      .then(d => {
        if (!d || typeof d !== 'object') {
          setDetail(null);
          return;
        }
        setDetail({
          ...d,
          invoices: Array.isArray(d.invoices) ? d.invoices : [],
          payments: Array.isArray(d.payments) ? d.payments : [],
          totalInvoiced: Number(d.totalInvoiced) || 0,
          totalPaid: Number(d.totalPaid) || 0,
          balance: Number(d.balance) || 0,
          clientName: d.clientName || 'Client',
        });
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const openClient = (partyKey: string) => {
    setSelected(partyKey);
    setDetail(null);
    loadDetail(partyKey);
  };

  const closeClient = () => {
    setSelected(null);
    setDetail(null);
    setCreateOpen(false);
    setCreatePrefill(null);
  };

  const printInvoicePdf = async (invoiceId: string) => {
    try {
      await printStandaloneInvoiceById(invoiceId, { businessType: cfg.type });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Print failed', 'error');
    }
  };

  const openNewInvoice = () => {
    if (!detail && !selected) return;
    setCreatePrefill({
      partyType: detail?.partyType ?? null,
      partyId: detail?.partyId ?? null,
      customerName: detail?.clientName || '',
      customerPhone: detail?.clientPhone || '',
      customerAddress: detail?.customerAddress || '',
      customerGstin: detail?.customerGstin || '',
    });
    setCreateOpen(true);
  };

  const openPay = (inv: ClientDetail['invoices'][0]) => {
    setPayForm({
      amount: String(inv.balance),
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      referenceNumber: '',
      notes: '',
    });
    setPayModal({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      balance: inv.balance,
      isAdvance: false,
    });
  };

  const openAdvancePay = () => {
    if (!selected) return;
    setPayForm({
      amount: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      referenceNumber: '',
      notes: 'Advance payment',
    });
    setPayModal({
      invoiceId: null,
      invoiceNumber: 'Advance',
      balance: 0,
      isAdvance: true,
    });
  };

  const openRecordPayment = () => {
    const invoices = detail?.invoices || [];
    const unpaid = invoices.find(i => i.balance > 0);
    if (unpaid) {
      openPay(unpaid);
      return;
    }
    if (offlineAdvance) {
      openAdvancePay();
      return;
    }
    toast('No outstanding balance', 'info');
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal || !selected) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      toast('Enter a valid amount', 'error');
      return;
    }

    if (!payModal.isAdvance) {
      if (payModal.balance <= 0) {
        toast('Invoice is already fully paid', 'error');
        return;
      }
      if (amount > payModal.balance + 0.001) {
        toast(`Amount exceeds remaining balance (${fmt(payModal.balance)})`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      await api.invoiceFinance.recordPayment({
        ...(payModal.isAdvance ? { partyKey: selected } : { invoiceId: payModal.invoiceId || undefined }),
        amount,
        paymentDate: payForm.paymentDate,
        paymentMethod: payForm.paymentMethod,
        referenceNumber: payForm.referenceNumber || undefined,
        notes: payForm.notes || (payModal.isAdvance ? 'Advance payment' : undefined),
      });
      toast(payModal.isAdvance ? 'Advance payment recorded' : 'Payment recorded', 'success');
      setPayModal(null);
      loadDetail(selected);
      loadSummary();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (paymentId: string, amount: number) => {
    if (
      !(await confirm({
        title: 'Delete Payment',
        message: `Delete payment of ${fmt(amount)}? This cannot be undone.`,
        confirmLabel: 'Delete',
        variant: 'danger',
      }))
    )
      return;
    try {
      await api.invoiceFinance.deletePayment(paymentId);
      toast('Payment deleted', 'success');
      if (selected) loadDetail(selected);
      loadSummary();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const isReadOnly = accessLevel === 'view' || accessLevel === 'print';

  const safeSummary = Array.isArray(summary) ? summary : [];
  const filtered = safeSummary.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.clientName || '').toLowerCase().includes(q) || (c.clientPhone || '').includes(search);
  });
  const totalOutstanding = safeSummary.reduce((s, c) => s + Math.max(0, Number(c.balance) || 0), 0);
  const totalReceived = safeSummary.reduce((s, c) => s + (Number(c.totalPaid) || 0), 0);
  const totalInvoiced = safeSummary.reduce((s, c) => s + (Number(c.totalInvoiced) || 0), 0);
  const clientsLabel = cfg.labels.vendors || 'Clients';

  // ── Client detail workspace (Distribution-style drill-down) ───────────────
  if (selected) {
    const overallPaid = detail ? isBillFullyPaid(detail.totalInvoiced, detail.balance) : false;
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={closeClient}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label={`Back to ${clientsLabel.toLowerCase()}`}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold flex items-center gap-2 flex-wrap">
              <span className="truncate">{detail?.clientName || clientsLabel.replace(/s$/, '') || 'Client'}</span>
              {overallPaid && <PaidBadge />}
            </h2>
            <p className="text-sm text-gray-500">
              {detailLoading
                ? 'Loading invoices…'
                : detail
                  ? `${detail.invoices.length} invoice${detail.invoices.length !== 1 ? 's' : ''} · record payments below`
                  : `Could not load ${clientsLabel.replace(/s$/, '').toLowerCase()}`}
            </p>
          </div>
          {!isReadOnly && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={openRecordPayment}
                className="flex items-center gap-1.5 px-3 py-2.5 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-50"
              >
                <IndianRupee size={16} /> Record Payment
              </button>
              <button
                type="button"
                onClick={openNewInvoice}
                className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-bold shadow-lg shadow-brand/20"
              >
                <Plus size={18} /> New Invoice
              </button>
            </div>
          )}
        </div>

        {detailLoading && !detail ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : !detail ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center">
            <p className="text-rose-600 font-medium mb-2">Failed to load invoices</p>
            <button
              type="button"
              onClick={() => loadDetail(selected)}
              className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase">Total Invoiced</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(detail.totalInvoiced)}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase">Total Received</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(detail.totalPaid)}</p>
              </div>
              <div
                className={cn(
                  'p-5 rounded-2xl border shadow-sm',
                  detail.balance > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200',
                )}
              >
                <p className="text-xs font-bold text-gray-400 uppercase">Balance</p>
                <p className={cn('text-2xl font-bold mt-1', detail.balance > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                  {detail.balance < 0 ? `${fmt(detail.balance)} credit` : fmt(detail.balance)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <FileText size={16} /> Invoices
                </h3>
                {detailLoading && <LoadingSpinner />}
              </div>
              {detail.invoices.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">No invoices for this client</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {detail.invoices.map(inv => {
                    const paid = isBillFullyPaid(inv.grandTotal, inv.balance);
                    return (
                      <div key={inv.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <p className="font-bold font-mono text-sm">{inv.invoiceNumber}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(inv.invoiceDate)}
                            {inv.dueDate ? ` · Due ${formatDate(inv.dueDate)}` : ''}
                          </p>
                          {inv.notes && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{inv.notes}</p>}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-right">
                            <p className="text-sm font-bold">{fmt(inv.grandTotal)}</p>
                            {(inv.advanceApplied || 0) > 0 && (
                              <p className="text-xs text-emerald-600">
                                Advance payment: {fmt(inv.advanceApplied || 0)}
                              </p>
                            )}
                            {inv.paid > (inv.advanceApplied || 0) + 0.001 && (
                              <p className="text-xs text-emerald-600">
                                Paid: {fmt(inv.paid - (inv.advanceApplied || 0))}
                              </p>
                            )}
                            {inv.paid > 0.001 && (inv.advanceApplied || 0) <= 0.001 && (
                              <p className="text-xs text-emerald-600">Paid: {fmt(inv.paid)}</p>
                            )}
                            {inv.balance > 0.001 && (
                              <p className="text-xs text-rose-600">Outstanding: {fmt(inv.balance)}</p>
                            )}
                          </div>
                          {paid ? (
                            <PaidBadge size="sm" />
                          ) : (
                            inv.balance > 0 && (
                              <span className="text-xs bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Clock size={10} /> Unpaid
                              </span>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => void printInvoicePdf(inv.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50"
                            title="Print invoice"
                          >
                            <Printer size={12} /> Print
                          </button>
                          {!isReadOnly && !paid && inv.balance > 0 && (
                            <button
                              type="button"
                              onClick={() => openPay(inv)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700"
                            >
                              <Plus size={12} /> Pay
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {detail.payments.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <h3 className="font-bold flex items-center gap-2">
                    <IndianRupee size={16} /> Payment History
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {detail.payments.map(p => (
                    <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-emerald-600">+{fmt(p.amount)}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(p.paymentDate)} · {p.paymentMethod} ·{' '}
                          {p.isAdvance || !p.invoiceId
                            ? p.invoiceNumber && p.invoiceNumber !== 'Advance'
                              ? `Advance → ${p.invoiceNumber}`
                              : 'Advance payment'
                            : `Invoice ${p.invoiceNumber}`}
                        </p>
                        {p.referenceNumber && <p className="text-xs text-gray-400">Ref: {p.referenceNumber}</p>}
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id, p.amount)}
                          className="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {createOpen && (
          <CreateInvoiceModal
            initialParty={createPrefill}
            onClose={() => {
              setCreateOpen(false);
              setCreatePrefill(null);
            }}
            onCreated={() => {
              setCreateOpen(false);
              setCreatePrefill(null);
              if (selected) loadDetail(selected);
              loadSummary();
            }}
          />
        )}

        <AnimatePresence>
          {payModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setPayModal(null)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
              >
                <h3 className="text-lg font-bold mb-1">
                  {payModal.isAdvance ? 'Record Advance Payment' : 'Record Payment'}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {payModal.isAdvance ? (
                    <>
                      No outstanding invoice — cash is held as advance and applies to the next bill for{' '}
                      <span className="font-bold text-gray-700">{detail?.clientName}</span>.
                    </>
                  ) : (
                    <>
                      Invoice {payModal.invoiceNumber} · Balance{' '}
                      <span className="font-bold text-rose-600">{fmt(payModal.balance)}</span>
                    </>
                  )}
                </p>
                <form onSubmit={handlePay} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Amount (₹)</label>
                    <input
                      type="number"
                      required
                      min={0.01}
                      step={0.01}
                      value={payForm.amount}
                      onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Payment Date</label>
                    <input
                      type="date"
                      value={payForm.paymentDate}
                      onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Method</label>
                    <select
                      value={payForm.paymentMethod}
                      onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    >
                      {['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Other'].map(m => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Reference</label>
                    <input
                      value={payForm.referenceNumber}
                      onChange={e => setPayForm(f => ({ ...f, referenceNumber: e.target.value }))}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Notes</label>
                    <input
                      value={payForm.notes}
                      onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPayModal(null)}
                      className="flex-1 py-2 border rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold"
                    >
                      {submitting ? 'Saving...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {ConfirmRenderer}
      </motion.div>
    );
  }

  // ── Client cards (Distribution-style) ─────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">{clientsLabel}</h2>
          <p className="text-sm text-gray-500">
            Click a {clientsLabel.replace(/s$/, '').toLowerCase()} to view their invoices and payments
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Invoiced</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(totalInvoiced)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Received</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalReceived)}</p>
        </div>
        <div
          className={cn(
            'p-5 rounded-2xl border shadow-sm',
            totalOutstanding > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200',
          )}
        >
          <p className="text-xs font-bold text-gray-400 uppercase">Total Outstanding</p>
          <p className={cn('text-2xl font-bold mt-1', totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600')}>
            {fmt(totalOutstanding)}
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${clientsLabel.toLowerCase().replace(/s$/, '')}…`}
          className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <FileText size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-1">
            {search ? `No matching ${clientsLabel.toLowerCase()}` : `No ${clientsLabel.toLowerCase()} invoices yet`}
          </p>
          <p className="text-sm text-gray-400">
            {search
              ? 'Try another name'
              : `Create invoices in the Invoices tab — ${clientsLabel.toLowerCase()} will appear here`}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => {
              const paid = isBillFullyPaid(Number(c.totalInvoiced) || 0, Number(c.balance) || 0);
              const kind =
                c.partyType === 'vendor'
                  ? isService
                    ? 'Client'
                    : 'Vendor'
                  : c.partyType === 'customer'
                    ? isService
                      ? 'Customer'
                      : 'Client'
                    : null;
              return (
                <button
                  key={c.partyKey}
                  type="button"
                  onClick={() => openClient(c.partyKey)}
                  className="relative bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-left transition-all cursor-pointer hover:shadow-md hover:border-brand/40 overflow-hidden"
                >
                  {paid && (
                    <div className="absolute top-2 right-2 z-10">
                      <PaidStamp className="text-[11px] px-2 py-1 scale-90" />
                    </div>
                  )}
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pr-16">
                    {c.clientName || 'Unknown'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {kind && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        {kind}
                      </span>
                    )}
                    {c.clientPhone && <p className="text-xs text-gray-400">{c.clientPhone}</p>}
                  </div>
                  <div className="mt-2 flex gap-4 text-sm flex-wrap">
                    <span>
                      <strong>{c.invoiceCount}</strong> invoice{c.invoiceCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100 flex gap-3 text-xs flex-wrap items-center">
                    <span className="text-gray-500">
                      Invoiced: <strong className="text-gray-700">{fmt(c.totalInvoiced)}</strong>
                    </span>
                    <span className="text-gray-500">
                      Received: <strong className="text-emerald-600">{fmt(c.totalPaid)}</strong>
                    </span>
                    {paid ? (
                      <PaidBadge size="sm" />
                    ) : (
                      <span className="text-gray-500">
                        Due: <strong className="text-rose-600">{fmt(c.balance)}</strong>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Click to view invoices</p>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-gray-500 mb-1">
              Click on a {clientsLabel.replace(/s$/, '').toLowerCase()} card above to see their invoices
            </p>
            <p className="text-sm text-gray-400">
              Each card shows invoiced amount, payments received, and outstanding balance
            </p>
          </div>
        </>
      )}
      {ConfirmRenderer}
    </motion.div>
  );
}
