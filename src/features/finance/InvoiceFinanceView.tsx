import React, { Fragment, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  IndianRupee,
  Clock,
  Search,
  Printer,
  MessageCircle,
  Users,
} from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../api';
import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { useTranslation } from '../../i18n';
import { tb } from '../../i18n/businessLabels';
import {
  useToast,
  LoadingSpinner,
  isBillFullyPaid,
  isBillPartiallyPaid,
  PaidBadge,
  PartialBadge,
  PaidStamp,
  AppModal,
  MobileKpiCard,
  MobileListRow,
} from '../../components/ui';
import { useConfirm } from '../../hooks/useConfirm';
import { CreateInvoiceModal, type InvoicePartyPrefill } from '../invoices/InvoicesView';
import {
  printStandaloneInvoiceById,
  shareStandaloneInvoiceWhatsAppById,
  whatsAppInvoiceShareToast,
} from '../../lib/printStandaloneInvoice';
import { isServiceMobileMode } from '../../platforms/service-mobile/mode';
import { useEscapeKey } from '../../lib/useEscapeKey';

type Summary = Awaited<ReturnType<typeof api.invoiceFinance.summary>>[number];
type ClientDetail = Awaited<ReturnType<typeof api.invoiceFinance.client>>;
type OpenBill = Awaited<ReturnType<typeof api.invoiceFinance.openBills>>[number];
type FinanceBreakdown = Awaited<ReturnType<typeof api.invoiceFinance.breakdown>>;
type CashIncomeRow = Awaited<ReturnType<typeof api.invoiceFinance.cashIncome>>[number];
type PayModal = {
  /** collective = FIFO; invoice = one bill; bills = selected bill-wise; advance = no outstanding */
  mode: 'collective' | 'invoice' | 'bills' | 'advance';
  invoiceId: string | null;
  invoiceNumber: string;
  balance: number;
  /** partyKey when paying from bill-wise list without opening client detail */
  partyKey?: string;
};

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;

function sumBillAllocations(map: Record<string, string>): number {
  let total = 0;
  for (const v of Object.values(map)) total += parseFloat(v) || 0;
  return Math.round(total * 100) / 100;
}

export function InvoiceFinanceView({ accessLevel = 'full' }: { accessLevel?: 'hidden' | 'view' | 'print' | 'full' }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const cfg = useBusinessConfig();
  const isService = cfg.type === 'service';
  const { confirm, ConfirmRenderer } = useConfirm();
  const [summary, setSummary] = useState<Summary[]>([]);
  const [openBills, setOpenBills] = useState<OpenBill[]>([]);
  const [breakdown, setBreakdown] = useState<FinanceBreakdown | null>(null);
  const [cashIncomeRows, setCashIncomeRows] = useState<CashIncomeRow[]>([]);
  const [listView, setListView] = useState<'parties' | 'bills' | 'cash'>('parties');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /** partyKey from summary (vendor:ID | customer:ID | name:…) */
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<InvoicePartyPrefill | null>(null);
  const [cashIncomeOpen, setCashIncomeOpen] = useState(false);
  const [cashForm, setCashForm] = useState({
    incomeHead: '',
    amount: '',
    incomeDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });
  const [payModal, setPayModal] = useState<PayModal | null>(null);
  /** invoiceId → amount when mode === 'bills' */
  const [billAllocations, setBillAllocations] = useState<Record<string, string>>({});
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    referenceNumber: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const offlineAdvance = isServiceMobileMode();
  const isReadOnly = accessLevel === 'view' || accessLevel === 'print';
  /** After opening a party from bill-wise list, open pay once detail loads. */
  const [pendingBillPay, setPendingBillPay] = useState<{
    partyKey: string;
    invoiceId?: string;
    billWise?: boolean;
  } | null>(null);

  // Cap/PWA back: pay/create → client detail → finance list.
  useEscapeKey(() => {
    if (payModal) {
      setPayModal(null);
      setBillAllocations({});
      return true;
    }
    if (cashIncomeOpen) {
      setCashIncomeOpen(false);
      return true;
    }
    if (createOpen) {
      setCreateOpen(false);
      setCreatePrefill(null);
      return true;
    }
    if (selected) {
      setSelected(null);
      setDetail(null);
      return true;
    }
    return false;
  });

  const submitCashIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    const head = cashForm.incomeHead.trim();
    const amt = parseFloat(cashForm.amount);
    if (!head) {
      toast('Enter income head (e.g. Rent Income)', 'error');
      return;
    }
    if (!(amt > 0)) {
      toast('Amount must be greater than zero', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.invoiceFinance.createCashIncome({
        incomeHead: head,
        amount: amt,
        incomeDate: cashForm.incomeDate,
        paymentMethod: cashForm.paymentMethod,
        referenceNumber: cashForm.referenceNumber.trim() || undefined,
        notes: cashForm.notes.trim() || undefined,
      });
      toast(`Cash income recorded — ${head} ₹${amt.toLocaleString('en-IN')}`, 'success');
      setCashIncomeOpen(false);
      setCashForm({
        incomeHead: '',
        amount: '',
        incomeDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Cash',
        referenceNumber: '',
        notes: '',
      });
      setListView('cash');
      loadSummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to record cash income', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const loadOpenBills = () => {
    api.invoiceFinance
      .openBills()
      .then(rows => setOpenBills(Array.isArray(rows) ? rows : []))
      .catch(() => setOpenBills([]));
  };

  const loadBreakdown = () => {
    api.invoiceFinance
      .breakdown()
      .then(d => setBreakdown(d && typeof d === 'object' ? d : null))
      .catch(() => setBreakdown(null));
    api.invoiceFinance
      .cashIncome()
      .then(rows => setCashIncomeRows(Array.isArray(rows) ? rows : []))
      .catch(() => setCashIncomeRows([]));
  };

  const loadSummary = () => {
    setLoading(true);
    loadOpenBills();
    loadBreakdown();
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
      const { how, errorHint } = await shareStandaloneInvoiceWhatsAppById(invoiceId, {
        businessType: cfg.type,
        phone: detail?.clientPhone || undefined,
        onPreparing: () => toast('Preparing PDF…', 'info'),
      });
      if (how === 'cancelled') return;
      toast(whatsAppInvoiceShareToast(how, errorHint), how === 'pdf_fallback' ? 'info' : 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not share invoice';
      toast(msg.length > 100 ? `${msg.slice(0, 99)}…` : msg, 'error');
    } finally {
      setWhatsappBusyId(null);
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

  const openPay = (inv: ClientDetail['invoices'][0], partyKey?: string) => {
    setBillAllocations({});
    setPayForm({
      amount: String(inv.balance),
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      referenceNumber: '',
      notes: '',
    });
    setPayModal({
      mode: 'invoice',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      balance: inv.balance,
      partyKey,
    });
  };

  const openBillWisePay = (partyKey: string, invoices: { id: string; invoiceNumber: string; balance: number }[]) => {
    const open = invoices.filter(i => i.balance > 0.001);
    if (!open.length) {
      toast('No outstanding bills', 'info');
      return;
    }
    const alloc: Record<string, string> = {};
    for (const inv of open) alloc[inv.id] = String(inv.balance);
    const total = open.reduce((s, i) => s + i.balance, 0);
    setBillAllocations(alloc);
    setPayForm({
      amount: String(Math.round(total * 100) / 100),
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      referenceNumber: '',
      notes: '',
    });
    setPayModal({
      mode: 'bills',
      invoiceId: null,
      invoiceNumber: `${open.length} bill(s)`,
      balance: total,
      partyKey,
    });
  };

  const openClientAndPayBill = (partyKey: string, invoiceId: string) => {
    setPendingBillPay({ partyKey, invoiceId });
    openClient(partyKey);
  };

  const openClientAndPayBillWise = (partyKey: string) => {
    setPendingBillPay({ partyKey, billWise: true });
    openClient(partyKey);
  };

  useEffect(() => {
    if (!pendingBillPay || !detail || selected !== pendingBillPay.partyKey || detailLoading) return;
    const unpaid = detail.invoices.filter(i => i.balance > 0);
    if (pendingBillPay.billWise) {
      openBillWisePay(pendingBillPay.partyKey, unpaid);
    } else if (pendingBillPay.invoiceId) {
      const inv =
        unpaid.find(i => i.id === pendingBillPay.invoiceId) ||
        detail.invoices.find(i => i.id === pendingBillPay.invoiceId);
      if (inv && inv.balance > 0) openPay(inv, pendingBillPay.partyKey);
      else toast('Bill is already paid', 'info');
    }
    setPendingBillPay(null);
    // one-shot after detail load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, detailLoading, selected, pendingBillPay]);

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
      mode: 'advance',
      invoiceId: null,
      invoiceNumber: 'Advance',
      balance: 0,
    });
  };

  const openCollectivePay = () => {
    if (!selected || !detail) return;
    const totalDue = Math.max(0, Number(detail.balance) || 0);
    if (totalDue <= 0) {
      if (offlineAdvance) {
        openAdvancePay();
        return;
      }
      toast('No outstanding balance', 'info');
      return;
    }
    setBillAllocations({});
    setPayForm({
      amount: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      referenceNumber: '',
      notes: '',
    });
    setPayModal({
      mode: 'collective',
      invoiceId: null,
      invoiceNumber: 'Total due',
      balance: totalDue,
      partyKey: selected,
    });
  };

  const openRecordPayment = () => {
    const unpaid = (detail?.invoices || []).filter(i => i.balance > 0);
    if (unpaid.length > 0) {
      // Prefer bill-wise when multiple open bills (India day-to-day)
      if (unpaid.length > 1 && selected) {
        openBillWisePay(selected, unpaid);
        return;
      }
      openCollectivePay();
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
    if (!payModal) return;
    const partyKey = payModal.partyKey || selected;
    if (!partyKey && payModal.mode !== 'invoice' && payModal.mode !== 'bills') return;

    if (payModal.mode === 'bills') {
      const allocations = Object.entries(billAllocations)
        .map(([invoiceId, raw]) => ({ invoiceId, amount: parseFloat(String(raw)) }))
        .filter(a => Number.isFinite(a.amount) && a.amount > 0);
      if (!allocations.length) {
        toast('Select at least one bill with an amount', 'error');
        return;
      }
      const amount = sumBillAllocations(billAllocations);
      if (amount > payModal.balance + 0.001) {
        toast(`Amount exceeds selected bills due (${fmt(payModal.balance)})`, 'error');
        return;
      }
      setSubmitting(true);
      try {
        await api.invoiceFinance.recordPayment({
          allocations,
          amount,
          paymentDate: payForm.paymentDate,
          paymentMethod: payForm.paymentMethod,
          referenceNumber: payForm.referenceNumber || undefined,
          notes: payForm.notes || 'Bill-wise payment',
        });
        toast(`Payment applied to ${allocations.length} bill(s)`, 'success');
        setPayModal(null);
        setBillAllocations({});
        if (selected) loadDetail(selected);
        loadSummary();
      } catch (err) {
        toast((err as Error).message, 'error');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) {
      toast('Enter a valid amount', 'error');
      return;
    }

    if (payModal.mode !== 'advance') {
      if (payModal.balance <= 0) {
        toast(payModal.mode === 'collective' ? 'No outstanding balance' : 'Invoice is already fully paid', 'error');
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
        ...(payModal.mode === 'invoice'
          ? { invoiceId: payModal.invoiceId || undefined }
          : { partyKey: partyKey || undefined }),
        amount,
        paymentDate: payForm.paymentDate,
        paymentMethod: payForm.paymentMethod,
        referenceNumber: payForm.referenceNumber || undefined,
        notes:
          payForm.notes ||
          (payModal.mode === 'advance'
            ? 'Advance payment'
            : payModal.mode === 'collective'
              ? 'Collective payment'
              : undefined),
      });
      toast(
        payModal.mode === 'advance'
          ? 'Advance payment recorded'
          : payModal.mode === 'collective'
            ? 'Payment applied toward total due'
            : 'Payment recorded',
        'success',
      );
      setPayModal(null);
      if (selected) loadDetail(selected);
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

  const safeSummary = Array.isArray(summary) ? summary : [];
  const filtered = safeSummary.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.clientName || '').toLowerCase().includes(q) || (c.clientPhone || '').includes(search);
  });
  const filteredBills = openBills.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (b.clientName || '').toLowerCase().includes(q) ||
      (b.clientPhone || '').includes(search) ||
      (b.invoiceNumber || '').toLowerCase().includes(q)
    );
  });
  const filteredCash = cashIncomeRows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.incomeHead || '').toLowerCase().includes(q) ||
      (r.invoiceNumber || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q)
    );
  });
  const totalInvoiced = breakdown
    ? Number(breakdown.partyInvoiced) || 0
    : safeSummary.reduce((s, c) => s + (Number(c.totalInvoiced) || 0), 0);
  const totalReceived = breakdown
    ? Number(breakdown.partyReceived) || 0
    : safeSummary.reduce((s, c) => s + (Number(c.totalPaid) || 0), 0);
  /**
   * Dealer/manufacturer: sum of positive client dues (credits ignored).
   * Service: Miracle advances live in vendor_payments and are folded into totalPaid —
   * Outstanding must be Invoiced − Received so over-collection shows as credit, not
   * “Received > Invoiced” with a still-positive outstanding.
   */
  const totalOutstanding = breakdown
    ? Number(breakdown.partyOutstanding) || 0
    : isService
      ? totalInvoiced - totalReceived
      : safeSummary.reduce((s, c) => s + Math.max(0, Number(c.balance) || 0), 0);
  const totalAdvances = breakdown
    ? Number(breakdown.partyAdvances) || 0
    : isService
      ? safeSummary.reduce((s, c) => s + (Number(c.advanceBalance) || 0), 0)
      : 0;
  const cashIncomeTotal = Number(breakdown?.cashIncome) || 0;
  const clientsLabel = tb(cfg.labels.vendors || 'Clients', t);

  // ── Client detail workspace (Distribution-style drill-down) ───────────────
  if (selected) {
    const overallPaid = detail ? isBillFullyPaid(detail.totalInvoiced, detail.balance) : false;
    const overallPartial = detail ? isBillPartiallyPaid(detail.totalInvoiced, detail.balance, detail.totalPaid) : false;
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
              {overallPaid ? <PaidBadge /> : overallPartial ? <PartialBadge /> : null}
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
                <IndianRupee size={16} /> {t('finance.recordPayment')}
              </button>
              <button
                type="button"
                onClick={openNewInvoice}
                className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-bold shadow-lg shadow-brand/20"
              >
                <Plus size={18} /> {t('invoices.newInvoice')}
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
            <p className="text-rose-600 font-medium mb-2">{t('finance.failedToLoadInvoices')}</p>
            <button
              type="button"
              onClick={() => loadDetail(selected)}
              className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
            >
              {t('finance.retry')}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:hidden">
              <MobileKpiCard label={t('finance.totalInvoiced')} value={fmt(detail.totalInvoiced)} accent="blue" />
              <MobileKpiCard label={t('finance.totalReceived')} value={fmt(detail.totalPaid)} accent="green" />
              <MobileKpiCard
                label={t('finance.balance')}
                value={detail.balance < 0 ? `${fmt(detail.balance)} cr` : fmt(detail.balance)}
                accent={detail.balance > 0 ? 'rose' : 'green'}
              />
            </div>
            <div className="hidden sm:grid sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase">{t('finance.totalInvoiced')}</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(detail.totalInvoiced)}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-xs font-bold text-gray-400 uppercase">{t('finance.totalReceived')}</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(detail.totalPaid)}</p>
              </div>
              <div
                className={cn(
                  'p-5 rounded-2xl border shadow-sm',
                  detail.balance > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200',
                )}
              >
                <p className="text-xs font-bold text-gray-400 uppercase">{t('finance.balance')}</p>
                <p className={cn('text-2xl font-bold mt-1', detail.balance > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                  {detail.balance < 0 ? `${fmt(detail.balance)} credit` : fmt(detail.balance)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2">
                  <FileText size={16} /> {t('finance.invoices')}
                </h3>
                {detailLoading && <LoadingSpinner />}
              </div>
              {detail.invoices.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm">{t('finance.noInvoicesForClient')}</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {detail.invoices.map(inv => {
                    const paid = isBillFullyPaid(inv.grandTotal, inv.balance);
                    const partial = isBillPartiallyPaid(inv.grandTotal, inv.balance, inv.paid);
                    const advance = inv.advanceApplied || 0;
                    const cashPaid = Math.max(0, inv.paid - advance);
                    return (
                      <div key={inv.id} className="px-5 py-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-bold font-mono text-sm">{inv.invoiceNumber}</p>
                            <p className="text-xs text-gray-500">{formatDate(inv.invoiceDate)}</p>
                            {inv.notes && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{inv.notes}</p>}
                            <p className="text-sm font-bold mt-1">{fmt(inv.grandTotal)}</p>
                            {advance > 0.001 && (
                              <p className="text-xs text-emerald-600">Advance payment: {fmt(advance)}</p>
                            )}
                            {cashPaid > 0.001 && <p className="text-xs text-emerald-600">Paid: {fmt(cashPaid)}</p>}
                            {inv.balance > 0.001 && (
                              <p className="text-xs text-rose-600">Outstanding: {fmt(inv.balance)}</p>
                            )}
                          </div>
                          {paid ? (
                            <PaidBadge size="sm" />
                          ) : partial ? (
                            <PartialBadge size="sm" />
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
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50"
                            title="Print invoice"
                          >
                            <Printer size={12} /> {t('common.print')}
                          </button>
                          <button
                            type="button"
                            disabled={whatsappBusyId === inv.id}
                            onClick={() => void shareInvoiceWhatsApp(inv.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-green-200 text-green-700 rounded-lg text-xs font-bold hover:bg-green-50 disabled:opacity-50"
                            title="Share on WhatsApp"
                          >
                            <MessageCircle size={12} />
                            {whatsappBusyId === inv.id ? '…' : 'WhatsApp'}
                          </button>
                          {!isReadOnly && !paid && inv.balance > 0 && (
                            <button
                              type="button"
                              onClick={() => openPay(inv)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700"
                            >
                              <Plus size={12} /> {t('finance.pay')}
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
                    <IndianRupee size={16} /> {t('finance.paymentHistory')}
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

        {payModal && (
          <AppModal
            title={payModal.mode === 'advance' ? t('finance.recordAdvancePayment') : t('finance.recordPayment')}
            subtitle={
              payModal.mode === 'advance' ? (
                <>
                  No outstanding invoice — cash is held as advance and applies to the next bill for{' '}
                  <span className="font-bold text-gray-700">{detail?.clientName}</span>.
                </>
              ) : payModal.mode === 'bills' ? (
                <>
                  Bill-wise · <span className="font-bold text-rose-600">{fmt(Math.max(0, payModal.balance))}</span> on
                  selected bills
                </>
              ) : (
                <>
                  {detail?.clientName || 'Client'} · Open balance{' '}
                  <span className="font-bold text-rose-600">{fmt(Math.max(0, Number(detail?.balance) || 0))}</span>
                </>
              )
            }
            onClose={() => {
              setPayModal(null);
              setBillAllocations({});
            }}
            size={payModal.mode === 'bills' ? 'md' : 'sm'}
            footer={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPayModal(null);
                    setBillAllocations({});
                  }}
                  className="flex-1 py-2 border rounded-lg font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  form="invoice-finance-pay-form"
                  disabled={submitting}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold"
                >
                  {submitting ? t('common.saving') : t('finance.recordPayment')}
                </button>
              </div>
            }
          >
            <form id="invoice-finance-pay-form" onSubmit={handlePay} className="space-y-4">
              {payModal.mode === 'bills' ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Bills (edit amount or uncheck)</label>
                  <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y">
                    {(
                      detail?.invoices
                        ?.filter(i => i.balance > 0)
                        .map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, balance: i.balance })) ||
                      openBills
                        .filter(b => b.partyKey === (payModal.partyKey || selected) && b.balance > 0)
                        .map(b => ({ id: b.invoiceId, invoiceNumber: b.invoiceNumber, balance: b.balance }))
                    ).map(inv => {
                      const checked = billAllocations[inv.id] != null;
                      return (
                        <label key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              setBillAllocations(prev => {
                                const next = { ...prev };
                                if (e.target.checked) next[inv.id] = String(inv.balance);
                                else delete next[inv.id];
                                setPayModal(m =>
                                  m
                                    ? {
                                        ...m,
                                        invoiceNumber: `${Object.keys(next).length} bill(s)`,
                                      }
                                    : m,
                                );
                                setPayForm(f => ({ ...f, amount: String(sumBillAllocations(next)) }));
                                return next;
                              });
                            }}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{inv.invoiceNumber}</span>
                            <span className="text-xs text-gray-400">Due {fmt(inv.balance)}</span>
                          </span>
                          <input
                            type="number"
                            min={0.01}
                            step={0.01}
                            disabled={!checked}
                            value={checked ? billAllocations[inv.id] : ''}
                            onChange={e => {
                              const v = e.target.value;
                              setBillAllocations(prev => {
                                const next = { ...prev, [inv.id]: v };
                                setPayForm(f => ({ ...f, amount: String(sumBillAllocations(next)) }));
                                return next;
                              });
                            }}
                            className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-right disabled:bg-gray-50"
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500">
                    Total this receipt: <strong>{fmt(sumBillAllocations(billAllocations))}</strong>
                  </p>
                </div>
              ) : (
                payModal.mode !== 'advance' &&
                detail && (
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Apply payment</label>
                    <select
                      value={
                        payModal.mode === 'collective'
                          ? '__ALL__'
                          : payModal.mode === 'bills'
                            ? '__BILLS__'
                            : payModal.invoiceId || ''
                      }
                      onChange={e => {
                        const val = e.target.value;
                        const unpaid = (detail?.invoices || []).filter(i => i.balance > 0);
                        const totalDue = Math.max(0, Number(detail?.balance) || 0);
                        if (val === '__ALL__') {
                          setBillAllocations({});
                          setPayModal({
                            mode: 'collective',
                            invoiceId: null,
                            invoiceNumber: 'Total due',
                            balance: totalDue,
                            partyKey: selected || undefined,
                          });
                          return;
                        }
                        if (val === '__BILLS__') {
                          openBillWisePay(selected || '', unpaid);
                          return;
                        }
                        const inv = unpaid.find(i => i.id === val);
                        if (!inv) return;
                        setBillAllocations({});
                        setPayModal({
                          mode: 'invoice',
                          invoiceId: inv.id,
                          invoiceNumber: inv.invoiceNumber,
                          balance: inv.balance,
                          partyKey: selected || undefined,
                        });
                        setPayForm(f => ({ ...f, amount: String(inv.balance) }));
                      }}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    >
                      <option value="__BILLS__">Bill-wise — pick bills & amounts</option>
                      <option value="__ALL__">
                        Pay toward total due — {fmt(Math.max(0, Number(detail?.balance) || 0))} (oldest first)
                      </option>
                      {(detail?.invoices || [])
                        .filter(i => i.balance > 0)
                        .map(inv => (
                          <option key={inv.id} value={inv.id}>
                            Specific: {inv.invoiceNumber} — {fmt(inv.balance)} due
                          </option>
                        ))}
                    </select>
                    {payModal.mode === 'collective' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Any amount is split across open invoices, oldest first.
                      </p>
                    )}
                  </div>
                )
              )}
              {payModal.mode !== 'bills' && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.amount')} (₹)</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step={0.01}
                    value={payForm.amount}
                    onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="e.g. 10000"
                  />
                  {payModal.mode === 'collective' && payModal.balance > 0 && (
                    <button
                      type="button"
                      onClick={() => setPayForm(f => ({ ...f, amount: String(payModal.balance) }))}
                      className="mt-1 text-xs font-medium text-brand"
                    >
                      Use full due ({fmt(payModal.balance)})
                    </button>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.paymentDate')}</label>
                <input
                  type="date"
                  value={payForm.paymentDate}
                  onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.paymentMethod')}</label>
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
                <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.reference')}</label>
                <input
                  value={payForm.referenceNumber}
                  onChange={e => setPayForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.notes')}</label>
                <input
                  value={payForm.notes}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  placeholder="Optional"
                />
              </div>
            </form>
          </AppModal>
        )}
        {ConfirmRenderer}
      </motion.div>
    );
  }

  // ── Client cards / bill-wise outstanding ──────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">
            {listView === 'bills' ? 'Bill-wise outstanding' : listView === 'cash' ? 'Cash income' : clientsLabel}
          </h2>
          <p className="text-sm text-gray-500">
            {listView === 'bills'
              ? 'Open party bills — pay against specific invoice numbers'
              : listView === 'cash'
                ? 'Rent / scrap / misc — money already in, not party bills'
                : `Party sales only — click a ${clientsLabel.replace(/s$/, '').toLowerCase()} for bills & payments`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {listView === 'cash' && !isReadOnly && (
            <button
              type="button"
              onClick={() => setCashIncomeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700"
            >
              <Plus size={16} />
              Record cash income
            </button>
          )}
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-0.5 text-sm font-semibold flex-wrap">
            <button
              type="button"
              onClick={() => setListView('parties')}
              className={cn(
                'px-3 py-1.5 rounded-lg',
                listView === 'parties' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              By party
            </button>
            <button
              type="button"
              onClick={() => setListView('bills')}
              className={cn(
                'px-3 py-1.5 rounded-lg',
                listView === 'bills' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              By bill
            </button>
            <button
              type="button"
              onClick={() => setListView('cash')}
              className={cn(
                'px-3 py-1.5 rounded-lg',
                listView === 'cash' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              Cash income
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <MobileKpiCard label="Party sales" value={fmt(totalInvoiced)} accent="blue" />
        <MobileKpiCard label={t('finance.totalReceived')} value={fmt(totalReceived)} accent="green" />
        <MobileKpiCard
          label={t('finance.outstanding')}
          value={totalOutstanding < 0 ? `${fmt(totalOutstanding)} cr` : fmt(totalOutstanding)}
          accent={totalOutstanding > 0 ? 'rose' : 'green'}
        />
        {cashIncomeTotal > 0.001 && <MobileKpiCard label="Cash income" value={fmt(cashIncomeTotal)} accent="amber" />}
      </div>
      <div className={cn('hidden sm:grid gap-4', cashIncomeTotal > 0.001 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Party sales</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(totalInvoiced)}</p>
          <p className="text-[10px] text-gray-400 mt-1">GT/ and other party bills</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">{t('finance.totalReceived')}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalReceived)}</p>
          {isService && totalAdvances > 0.001 && (
            <p className="text-[10px] text-gray-400 mt-1">Includes {fmt(totalAdvances)} advances / unallocated cash</p>
          )}
        </div>
        <div
          className={cn(
            'p-5 rounded-2xl border shadow-sm',
            totalOutstanding > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200',
          )}
        >
          <p className="text-xs font-bold text-gray-400 uppercase">{t('finance.totalOutstanding')}</p>
          <p className={cn('text-2xl font-bold mt-1', totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600')}>
            {totalOutstanding < 0 ? `${fmt(totalOutstanding)} credit` : fmt(totalOutstanding)}
          </p>
        </div>
        {cashIncomeTotal > 0.001 && (
          <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Cash income</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{fmt(cashIncomeTotal)}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              Rent / scrap / misc · {breakdown?.cashIncomeCount || 0} entries
            </p>
          </div>
        )}
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={
            listView === 'bills'
              ? 'Search party or bill number…'
              : listView === 'cash'
                ? 'Search income head or reference…'
                : `${t('common.search')} ${clientsLabel.toLowerCase().replace(/s$/, '')}…`
          }
          className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : listView === 'cash' ? (
        filteredCash.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 mb-1">{search ? 'No matching cash income' : 'No cash income entries'}</p>
            <p className="text-sm text-gray-400 mb-4">
              {search
                ? 'Try another income head or reference'
                : 'Record rent, scrap, or misc cash — same list for imported and new entries'}
            </p>
            {!search && !isReadOnly && (
              <button
                type="button"
                onClick={() => setCashIncomeOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700"
              >
                <Plus size={16} />
                Record cash income
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Income head</th>
                  <th className="text-left px-4 py-3">Ref</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-right px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCash.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{r.incomeHead || 'Cash income'}</p>
                      {r.notes && <p className="text-xs text-gray-400 truncate max-w-xs">{r.notes}</p>}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {r.invoiceDate ? formatDate(String(r.invoiceDate)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-700">{fmt(r.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
              <span>
                {filteredCash.length} cash income entr{filteredCash.length !== 1 ? 'ies' : 'y'}
              </span>
              <span>
                Total:{' '}
                <strong className="text-amber-700">{fmt(filteredCash.reduce((s, r) => s + r.grandTotal, 0))}</strong>
              </span>
            </div>
          </div>
        )
      ) : listView === 'bills' ? (
        filteredBills.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <FileText size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 mb-1">{search ? 'No matching open bills' : 'No open bills'}</p>
            <p className="text-sm text-gray-400">
              {search
                ? 'Try another name or bill number'
                : 'All invoices are fully paid — or create new invoices first'}
            </p>
          </div>
        ) : (
          <>
            <div className="sm:hidden space-y-2">
              {filteredBills.map(b => (
                <div key={b.invoiceId} className="space-y-1">
                  <MobileListRow
                    icon={<FileText />}
                    title={b.invoiceNumber || 'Bill'}
                    subtitle={`${b.clientName || 'Unknown'} · ${b.invoiceDate ? formatDate(String(b.invoiceDate)) : ''}`}
                    trailing={<span className="text-rose-600">{fmt(b.balance)}</span>}
                    meta="Due"
                    onClick={() => openClient(b.partyKey)}
                  />
                  {!isReadOnly && (
                    <div className="flex gap-1 pl-0.5">
                      <button
                        type="button"
                        onClick={() => openClientAndPayBill(b.partyKey, b.invoiceId)}
                        className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                      >
                        Pay
                      </button>
                      <button
                        type="button"
                        onClick={() => openClientAndPayBillWise(b.partyKey)}
                        className="px-2.5 py-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                        title="Pay multiple bills for this party"
                      >
                        Bills
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3">Party</th>
                    <th className="text-left px-4 py-3">Bill</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-right px-4 py-3">Bill amt</th>
                    <th className="text-right px-4 py-3">Received</th>
                    <th className="text-right px-4 py-3">Due</th>
                    <th className="text-right px-4 py-3"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBills.map(b => (
                    <tr key={b.invoiceId} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openClient(b.partyKey)}
                          className="font-semibold text-left hover:text-brand"
                        >
                          {b.clientName || 'Unknown'}
                        </button>
                        {b.clientPhone && <p className="text-xs text-gray-400">{b.clientPhone}</p>}
                      </td>
                      <td className="px-4 py-3 font-medium">{b.invoiceNumber}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {b.invoiceDate ? formatDate(String(b.invoiceDate)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">{fmt(b.grandTotal)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{fmt(b.paid)}</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">{fmt(b.balance)}</td>
                      <td className="px-4 py-3 text-right">
                        {!isReadOnly && (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => openClientAndPayBill(b.partyKey, b.invoiceId)}
                              className="px-2.5 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50"
                            >
                              Pay
                            </button>
                            <button
                              type="button"
                              onClick={() => openClientAndPayBillWise(b.partyKey)}
                              className="px-2.5 py-1.5 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                              title="Pay multiple bills for this party"
                            >
                              Bills
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
                <span>
                  {filteredBills.length} open bill{filteredBills.length !== 1 ? 's' : ''}
                </span>
                <span>
                  Total due:{' '}
                  <strong className="text-rose-600">{fmt(filteredBills.reduce((s, b) => s + b.balance, 0))}</strong>
                </span>
              </div>
            </div>
          </>
        )
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
          <div className="sm:hidden space-y-2">
            {filtered.map(c => {
              const paid = isBillFullyPaid(Number(c.totalInvoiced) || 0, Number(c.balance) || 0);
              const partial = isBillPartiallyPaid(
                Number(c.totalInvoiced) || 0,
                Number(c.balance) || 0,
                Number(c.totalPaid) || 0,
              );
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
                <Fragment key={c.partyKey}>
                  <MobileListRow
                    icon={<Users />}
                    title={c.clientName || 'Unknown'}
                    subtitle={[kind, c.clientPhone].filter(Boolean).join(' · ') || `${c.invoiceCount} invoice(s)`}
                    trailing={
                      paid ? (
                        <span className="text-emerald-600">Paid</span>
                      ) : (
                        <span className={c.balance > 0 ? 'text-rose-600' : undefined}>{fmt(c.balance)}</span>
                      )
                    }
                    meta={paid ? undefined : partial ? 'Partial' : c.balance > 0 ? 'Due' : undefined}
                    onClick={() => openClient(c.partyKey)}
                  />
                </Fragment>
              );
            })}
          </div>

          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => {
              const paid = isBillFullyPaid(Number(c.totalInvoiced) || 0, Number(c.balance) || 0);
              const partial = isBillPartiallyPaid(
                Number(c.totalInvoiced) || 0,
                Number(c.balance) || 0,
                Number(c.totalPaid) || 0,
              );
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
                  {!paid && partial && (
                    <div className="absolute top-2 right-2 z-10">
                      <PartialBadge size="sm" />
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
                    ) : partial ? (
                      <>
                        <PartialBadge size="sm" />
                        <span className="text-gray-500">
                          Due: <strong className="text-rose-600">{fmt(c.balance)}</strong>
                        </span>
                      </>
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

          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-gray-500 mb-1">
              Click on a {clientsLabel.replace(/s$/, '').toLowerCase()} card above to see their invoices
            </p>
            <p className="text-sm text-gray-400">
              Each card shows invoiced amount, payments received, and outstanding balance
            </p>
          </div>
        </>
      )}

      {cashIncomeOpen && (
        <AppModal
          title="Record cash income"
          subtitle="Money already received — rent, scrap, misc. Not a party bill."
          onClose={() => setCashIncomeOpen(false)}
          size="sm"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCashIncomeOpen(false)}
                className="flex-1 py-2 border rounded-lg font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="cash-income-form"
                disabled={submitting}
                className="flex-1 py-2 bg-amber-600 text-white rounded-lg font-bold"
              >
                {submitting ? t('common.saving') : 'Save'}
              </button>
            </div>
          }
        >
          <form id="cash-income-form" onSubmit={submitCashIncome} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Income head</label>
              <input
                value={cashForm.incomeHead}
                onChange={e => setCashForm(f => ({ ...f, incomeHead: e.target.value }))}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                placeholder="e.g. Rent Income, Scrap Sale"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.amount')}</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={cashForm.amount}
                onChange={e => setCashForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                placeholder="0.00"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Date</label>
                <input
                  type="date"
                  value={cashForm.incomeDate}
                  onChange={e => setCashForm(f => ({ ...f, incomeDate: e.target.value }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.paymentMethod')}</label>
                <select
                  value={cashForm.paymentMethod}
                  onChange={e => setCashForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>Card</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.reference')}</label>
              <input
                value={cashForm.referenceNumber}
                onChange={e => setCashForm(f => ({ ...f, referenceNumber: e.target.value }))}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">{t('finance.notes')}</label>
              <input
                value={cashForm.notes}
                onChange={e => setCashForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                placeholder="Optional"
              />
            </div>
          </form>
        </AppModal>
      )}
      {ConfirmRenderer}
    </motion.div>
  );
}
