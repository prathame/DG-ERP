import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  Mail,
  Download,
  Upload,
  FileText,
  IndianRupee,
  Clock,
  Printer,
} from 'lucide-react';
import { cn, exportToCsv, shareViaWhatsApp, formatDate } from '../../lib/utils';
import { api, fetchApi } from '../../api';
import type { Vendor } from '../../types';
import { useToast, LoadingSpinner, isBillFullyPaid, PaidBadge } from '../../components/ui';
import { useConfirm } from '../../hooks/useConfirm';
import { CsvImport } from '../../components/ui/CsvImport';
import { useDebounce } from '../../hooks/useDebounce';
import { session } from '../../lib/session';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { CreateInvoiceModal, type InvoicePartyPrefill } from '../invoices/InvoicesView';
import {
  printStandaloneInvoiceById,
  shareStandaloneInvoiceWhatsAppById,
  whatsAppInvoiceShareToast,
} from '../../lib/printStandaloneInvoice';
import { isServiceMobileMode } from '../../platforms/service-mobile/mode';

type ClientDetail = Awaited<ReturnType<typeof api.invoiceFinance.client>>;
type PayModal = {
  invoiceId: string | null;
  invoiceNumber: string;
  balance: number;
  isAdvance: boolean;
};

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString()}`;

export function VendorMasterView({
  onBack,
  onRefresh,
  businessType: _businessType = 'manufacturer',
  initialVendorId,
}: {
  onBack: () => void;
  onRefresh: () => void;
  /** @deprecated Label comes from session businessType via useBusinessConfig */
  businessType?: string;
  /** Open this client’s invoice hub immediately (e.g. Masters hub row tap). */
  initialVendorId?: string;
}) {
  const cfg = useBusinessConfig();
  // service → Client | dealer/retail → Customer | manufacturer → Vendor
  const label = (cfg.labels.vendors || 'Vendors').replace(/s$/, '');
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const [list, setList] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [credsModal, setCredsModal] = useState<{
    vendorName: string;
    email: string;
    password: string;
    phone?: string;
  } | null>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' });
  const [submitting, setSubmitting] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [focusedInitial, setFocusedInitial] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<InvoicePartyPrefill | null>(null);
  const [payModal, setPayModal] = useState<PayModal | null>(null);
  const offlineAdvance = isServiceMobileMode();
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });
  const [paySubmitting, setPaySubmitting] = useState(false);

  const load = () => {
    api.vendors
      .list(debouncedSearch || undefined)
      .then(rows => setList(Array.isArray(rows) ? rows : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
    onRefresh();
  };
  useEffect(() => {
    setLoading(true);
    load();
  }, [debouncedSearch]);

  const partyKeyFor = (v: Vendor) => `vendor:${v.id}`;

  const loadDetail = (v: Vendor) => {
    setDetailLoading(true);
    api.invoiceFinance
      .client(partyKeyFor(v))
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
          clientName: d.clientName || v.name || label,
          clientPhone: d.clientPhone || v.phone || null,
          customerAddress: d.customerAddress || v.address || null,
          customerGstin: d.customerGstin || v.gstNumber || null,
        });
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  };

  const selectClient = (v: Vendor) => {
    setSelected(v);
    setDetail(null);
    loadDetail(v);
  };

  // Masters hub → Client row: jump straight into that client’s invoice hub
  useEffect(() => {
    if (focusedInitial || !initialVendorId || loading) return;
    const v = list.find(x => x.id === initialVendorId);
    if (v) {
      selectClient(v);
      setFocusedInitial(true);
    }
  }, [initialVendorId, list, loading, focusedInitial]);

  const backFromDetail = () => {
    setSelected(null);
    setDetail(null);
    setCreateOpen(false);
    setCreatePrefill(null);
    setPayModal(null);
  };

  const openNewInvoice = () => {
    if (!selected) return;
    setCreatePrefill({
      partyType: 'vendor',
      partyId: selected.id,
      customerName: selected.name,
      customerPhone: detail?.clientPhone || selected.phone || '',
      customerAddress: detail?.customerAddress || selected.address || '',
      customerGstin: detail?.customerGstin || selected.gstNumber || '',
    });
    setCreateOpen(true);
  };

  const [whatsappBusyId, setWhatsappBusyId] = useState<string | null>(null);

  const printInvoicePdf = async (invoiceId: string) => {
    try {
      await printStandaloneInvoiceById(invoiceId, { businessType: cfg.type });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Print failed', 'error');
    }
  };

  const shareInvoiceWhatsApp = async (invoiceId: string) => {
    if (whatsappBusyId) return;
    setWhatsappBusyId(invoiceId);
    try {
      const how = await shareStandaloneInvoiceWhatsAppById(invoiceId, { businessType: cfg.type });
      if (how === 'cancelled') return;
      toast(whatsAppInvoiceShareToast(how), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not share invoice', 'error');
    } finally {
      setWhatsappBusyId(null);
    }
  };

  const openPay = (inv: ClientDetail['invoices'][0]) => {
    setPayForm({
      amount: String(inv.balance > 0 ? inv.balance : ''),
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

  /** Hub: pay first unpaid invoice, or (Offline) record advance when none outstanding. */
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
    if (invoices.length === 0) {
      toast('Create an invoice first', 'error');
      return;
    }
    toast('No outstanding balance — payments are already recorded (e.g. Mark Paid)', 'info');
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
    setPaySubmitting(true);
    try {
      await api.invoiceFinance.recordPayment({
        ...(payModal.isAdvance ? { partyKey: partyKeyFor(selected) } : { invoiceId: payModal.invoiceId || undefined }),
        amount,
        paymentDate: payForm.paymentDate,
        paymentMethod: payForm.paymentMethod,
        referenceNumber: payForm.referenceNumber || undefined,
        notes: payForm.notes || (payModal.isAdvance ? 'Advance payment' : undefined),
      });
      toast(payModal.isAdvance ? 'Advance payment recorded' : 'Payment recorded', 'success');
      setPayModal(null);
      loadDetail(selected);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleDeletePayment = async (paymentId: string, amount: number) => {
    if (!selected) return;
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
      loadDetail(selected);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' });
    setModalOpen(true);
  };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name,
      contactPerson: v.contactPerson ?? '',
      phone: v.phone ?? '',
      email: v.email ?? '',
      address: v.address ?? '',
      gstNumber: (v as unknown as Record<string, string>).gstNumber ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (editing) {
      api.vendors
        .update(editing.id, form)
        .then(() => {
          setModalOpen(false);
          load();
          toast(`${label} updated`, 'success');
        })
        .catch(err => toast(err.message, 'error'))
        .finally(() => setSubmitting(false));
    } else {
      api.vendors
        .create(form)
        .then(result => {
          setModalOpen(false);
          load();
          if (result.credentials) {
            setCredsModal({
              vendorName: form.name,
              email: result.credentials.email,
              password: result.credentials.password,
              phone: form.phone || undefined,
            });
          } else {
            toast(`${label} created`, 'success');
          }
        })
        .catch(err => toast(err.message, 'error'))
        .finally(() => setSubmitting(false));
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    api.vendors
      .delete(deleteTarget.id)
      .then(() => {
        if (selected?.id === deleteTarget.id) backFromDetail();
        setDeleteTarget(null);
        load();
      })
      .catch(err => toast(err.message, 'error'));
  };

  // Hub deep-link: wait until the named client is selected (avoid list flash)
  if (initialVendorId && !focusedInitial && !selected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center">
        <LoadingSpinner />
      </motion.div>
    );
  }

  // ── Client detail hub (invoices + payments; Back → list) ──────────────────
  if (selected) {
    const overallPaid = detail ? isBillFullyPaid(detail.totalInvoiced, detail.balance) : false;
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={backFromDetail}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 rounded-lg"
            aria-label={`Back to ${label.toLowerCase()} list`}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold flex items-center gap-2 flex-wrap">
              <span className="truncate">{detail?.clientName || selected.name}</span>
              {overallPaid && <PaidBadge />}
            </h2>
            <p className="text-sm text-gray-500">
              {detailLoading
                ? 'Loading invoices…'
                : detail
                  ? `${detail.invoices.length} invoice${detail.invoices.length !== 1 ? 's' : ''}`
                  : `${label} invoices & payments`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openRecordPayment}
              disabled={!offlineAdvance && !!detail && detail.balance <= 0}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IndianRupee size={16} /> Record Payment
            </button>
            <button
              type="button"
              onClick={openNewInvoice}
              className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-brand text-white rounded-xl text-sm font-bold"
            >
              <Plus size={16} /> New Invoice
            </button>
          </div>
        </div>

        {detailLoading && !detail ? (
          <div className="py-16 text-center">
            <LoadingSpinner />
          </div>
        ) : !detail ? (
          <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center">
            <p className="text-rose-600 font-medium mb-2">Failed to load invoices</p>
            <button
              type="button"
              onClick={() => loadDetail(selected)}
              className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Outstanding</p>
                <p className={cn('text-xl font-bold mt-1', detail.balance > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                  {detail.balance < 0 ? `${fmt(detail.balance)} credit` : fmt(detail.balance)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Received</p>
                <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(detail.totalPaid)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 col-span-2 sm:col-span-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Invoiced</p>
                <p className="text-xl font-bold text-blue-600 mt-1">{fmt(detail.totalInvoiced)}</p>
              </div>
            </div>

            {(selected.phone || selected.contactPerson || selected.gstNumber) && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 space-y-1">
                {selected.contactPerson && <p>Contact: {selected.contactPerson}</p>}
                {selected.phone && <p>{selected.phone}</p>}
                {selected.gstNumber && <p className="font-mono text-xs">GSTIN: {selected.gstNumber}</p>}
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-2">
                <FileText size={14} /> Invoices
              </h3>
              {detail.invoices.length === 0 ? (
                <div className="py-12 text-center text-gray-400 rounded-2xl border border-dashed border-gray-200">
                  <FileText size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-medium text-sm">No invoices yet</p>
                  <p className="text-xs mt-1">Tap “New Invoice” to bill this {label.toLowerCase()}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {detail.invoices.map(inv => {
                    const paid = isBillFullyPaid(inv.grandTotal, inv.balance);
                    return (
                      <li key={inv.id} className="p-3 rounded-xl border border-gray-100 bg-white space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold font-mono text-sm">{inv.invoiceNumber}</p>
                            <p className="text-xs text-gray-500">
                              {formatDate(inv.invoiceDate)}
                              {inv.dueDate ? ` · Due ${formatDate(inv.dueDate)}` : ''}
                            </p>
                            <p className="text-sm font-bold mt-1">{fmt(inv.grandTotal)}</p>
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
                              <span className="text-xs bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                                <Clock size={10} /> Unpaid
                              </span>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => void printInvoicePdf(inv.id)}
                            className="flex items-center gap-1 px-3 py-1.5 min-h-[36px] border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50"
                            title="Print invoice"
                          >
                            <Printer size={12} /> Print
                          </button>
                          <button
                            type="button"
                            disabled={whatsappBusyId === inv.id}
                            onClick={() => void shareInvoiceWhatsApp(inv.id)}
                            className="flex items-center gap-1 px-3 py-1.5 min-h-[36px] border border-green-200 text-green-700 rounded-lg text-xs font-bold hover:bg-green-50 disabled:opacity-50"
                            title="Share on WhatsApp"
                          >
                            <MessageCircle size={12} />
                            {whatsappBusyId === inv.id ? '…' : 'WhatsApp'}
                          </button>
                          {!paid && inv.balance > 0 && (
                            <button
                              type="button"
                              onClick={() => openPay(inv)}
                              className="flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-emerald-600 text-white rounded-lg text-xs font-bold"
                            >
                              <Plus size={12} /> Pay
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {detail.payments.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-2">
                  <IndianRupee size={14} /> Payment History
                </h3>
                <ul className="space-y-2">
                  {detail.payments.map(p => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 bg-white"
                    >
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
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(p.id, p.amount)}
                        className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-rose-400 hover:text-rose-600"
                        aria-label="Delete payment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
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
              loadDetail(selected);
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
                      No outstanding invoice — this cash is held as advance and will apply to the next bill for{' '}
                      <span className="font-bold text-gray-700">{selected?.name}</span>.
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
                      disabled={paySubmitting}
                      className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold"
                    >
                      {paySubmitting ? 'Saving...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <ConfirmRenderer />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">{label} Master</h2>
          <p className="text-sm text-gray-500">Tap a {label.toLowerCase()} for invoices & payments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              list.length &&
              exportToCsv(
                list.map(v => ({
                  id: v.id,
                  name: v.name,
                  contactPerson: v.contactPerson ?? '',
                  phone: v.phone ?? '',
                  email: v.email ?? '',
                  address: v.address ?? '',
                  totalSales: v.totalSales ?? 0,
                  totalRewardPoints: v.totalRewardPoints ?? 0,
                })),
                'vendors',
              )
            }
            disabled={!list.length}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} /> Export CSV
          </button>
          {list.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (
                  !(await confirm({
                    title: `Delete All ${label}s`,
                    message: `This will permanently delete all ${list.length} ${label.toLowerCase()}s and their related data (distributions, payments, price lists). This cannot be undone.`,
                    confirmLabel: `Delete All ${list.length}`,
                    variant: 'danger',
                  }))
                )
                  return;
                try {
                  await fetchApi('/vendors/all', { method: 'DELETE' });
                  load();
                  toast(`All ${label.toLowerCase()}s deleted`, 'success');
                } catch (err) {
                  toast((err as Error).message, 'error');
                }
              }}
              className="hidden sm:flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 rounded-xl text-sm font-medium hover:bg-rose-50"
            >
              <Trash2 size={16} /> Delete All
            </button>
          )}
          <button
            type="button"
            onClick={() => setCsvImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50"
          >
            <Upload size={18} /> Import CSV
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
          >
            <Plus size={18} /> Add {label}
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder={`Search ${label.toLowerCase()}s...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
        />
      </div>

      {loading && (
        <div className="py-16 text-center">
          <LoadingSpinner />
        </div>
      )}

      {/* Client cards — tap opens invoice hub (Edit/Delete do not) */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => selectClient(v)}
              className="text-left p-4 rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-800 truncate">{v.name}</span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      openEdit(v);
                    }}
                    className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-blue-600"
                    aria-label={`Edit ${v.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setDeleteTarget(v);
                    }}
                    className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-400 hover:text-rose-600"
                    aria-label={`Delete ${v.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {v.contactPerson && <p className="text-xs text-gray-500">{v.contactPerson}</p>}
              {v.phone && <p className="text-xs text-gray-400 mt-0.5">{v.phone}</p>}
              {v.gstNumber && <p className="text-[10px] font-mono text-gray-400 mt-1">GSTIN: {v.gstNumber}</p>}
              {label === 'Vendor' && (v.totalSales || v.totalRewardPoints) ? (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                  {typeof v.totalSales === 'number' && v.totalSales > 0 && (
                    <span>
                      Sales: <b>₹{v.totalSales.toLocaleString()}</b>
                    </span>
                  )}
                  {typeof v.totalRewardPoints === 'number' && v.totalRewardPoints > 0 && (
                    <span>
                      Pts: <b className="text-emerald-600">{v.totalRewardPoints}</b>
                    </span>
                  )}
                </div>
              ) : null}
              <p className="text-[10px] text-brand font-medium mt-2">Tap to view invoices</p>
            </button>
          ))}
          {list.length === 0 && !search && (
            <div className="col-span-full py-16 text-center text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No {label.toLowerCase()}s yet</p>
              <p className="text-sm mt-1">Click “Add {label}” to get started</p>
            </div>
          )}
          {list.length === 0 && search && (
            <div className="col-span-full py-12 text-center text-gray-400 text-sm">
              No matching {label.toLowerCase()}s
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-4">{editing ? `Edit ${label}` : `Add ${label}`}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Name</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Contact Person</label>
                  <input
                    value={form.contactPerson}
                    onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div
                  className={
                    !editing && label === 'Vendor' ? 'bg-blue-50 border border-blue-100 rounded-xl p-3 -mx-1' : ''
                  }
                >
                  <label className="text-xs font-bold text-gray-400 uppercase">
                    Email{' '}
                    {label === 'Vendor' ? (
                      <span className="text-brand normal-case font-normal">(optional — vendor login ID)</span>
                    ) : (
                      <span className="text-gray-400 normal-case font-normal">(optional)</span>
                    )}
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder={label === 'Vendor' ? 'vendor@example.com' : 'email@example.com'}
                  />
                  {!editing && label === 'Vendor' && form.email.trim() && (
                    <p className="text-xs text-blue-600 mt-2">
                      Login will be auto-created. Password:{' '}
                      <span className="font-mono font-bold">
                        {form.name ? `${form.name.replace(/\s+/g, '').toLowerCase()}@123` : 'vendorname@123'}
                      </span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">
                    Phone * <span className="text-gray-400 normal-case font-normal">(for WhatsApp)</span>
                  </label>
                  <input
                    required
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Address</label>
                  <input
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">GSTIN (optional)</label>
                  <input
                    value={form.gstNumber}
                    onChange={e => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand font-mono"
                    placeholder="e.g. 24AABCD1234F1Z5"
                    maxLength={15}
                  />
                  {form.gstNumber &&
                    form.gstNumber.length === 15 &&
                    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstNumber) && (
                      <p className="text-[10px] text-rose-500 mt-0.5">Invalid GSTIN format</p>
                    )}
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="flex-1 py-2 border border-gray-200 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2 bg-brand text-white rounded-lg font-bold"
                  >
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
            >
              <p className="text-gray-600 mb-6">
                Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 border rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {credsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setCredsModal(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={28} />
                </div>
                <h3 className="text-xl font-bold">{label} Created Successfully</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Login credentials have been auto-generated for <strong>{credsModal.vendorName}</strong>
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Login URL</p>
                  <p className="font-mono font-medium text-sm mt-0.5 text-brand">
                    {window.location.origin}/{session.getSlug() || ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Login Email</p>
                  <p className="font-mono font-medium text-lg mt-0.5">{credsModal.email}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Password</p>
                  <p className="font-mono font-medium text-lg mt-0.5">{credsModal.password}</p>
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-4 flex items-center gap-2">
                <AlertTriangle size={14} />
                Share these credentials with the {label.toLowerCase()}. They can change the password after first login.
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    const companyName = (() => {
                      try {
                        const u = session.getUser() || {};
                        return u.companyName || 'our platform';
                      } catch {
                        return 'our platform';
                      }
                    })();
                    const slug = session.getSlug() || '';
                    const loginUrl = slug ? `${window.location.origin}/${slug}` : window.location.origin;
                    const msg = `Welcome to ${companyName}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${credsModal.email}\nPassword: ${credsModal.password}\n\nPlease change your password after first login.`;
                    shareViaWhatsApp(credsModal.phone || '', msg);
                  }}
                  disabled={!credsModal.phone}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <MessageCircle size={16} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const companyName = (() => {
                      try {
                        const u = session.getUser() || {};
                        return u.companyName || 'our platform';
                      } catch {
                        return 'our platform';
                      }
                    })();
                    const slug = session.getSlug() || '';
                    const loginUrl = slug ? `${window.location.origin}/${slug}` : window.location.origin;
                    const subject = `Your ${companyName} Login Credentials`;
                    const body = `Welcome to ${companyName}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${credsModal.email}\nPassword: ${credsModal.password}\n\nPlease change your password after first login.\n\nRegards,\n${companyName}`;
                    window.open(
                      `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(credsModal.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
                      '_blank',
                    );
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700"
                >
                  <Mail size={16} /> Email
                </button>
                <button
                  type="button"
                  onClick={() => setCredsModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {csvImportOpen && (
        <CsvImport
          templateName="vendors_template"
          itemLabel={`${label.toLowerCase()}s`}
          columns={[
            { key: 'name', label: `${label} Name`, required: true },
            { key: 'contactPerson', label: 'Contact Person' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email (optional)' },
            { key: 'address', label: 'Address' },
            { key: 'gstNumber', label: 'GSTIN' },
          ]}
          onClose={() => setCsvImportOpen(false)}
          onImport={async rows => {
            const vendors = rows.map(r => ({
              name: r.name,
              contactPerson: r.contactPerson || undefined,
              phone: r.phone || undefined,
              email: r.email || undefined,
              address: r.address || undefined,
              gstNumber: r.gstNumber || undefined,
            }));
            const result = await api.vendors.bulk(vendors);
            if (result.credentials && result.credentials.length > 0) {
              const slug = session.getSlug() || window.location.pathname.split('/')[1] || '';
              const baseUrl = window.location.origin;
              const csvRows = result.credentials.map(c => ({
                [`${label} Name`]: c.name,
                Email: c.email,
                Password: c.password,
                'Login URL': `${baseUrl}/${slug}`,
              }));
              exportToCsv(csvRows, 'vendor_credentials');
              toast(`${result.credentials.length} ${label.toLowerCase()} credentials downloaded`, 'success');
            }
            load();
            return { success: result.success, errors: result.errors };
          }}
        />
      )}
      <ConfirmRenderer />
    </motion.div>
  );
}
