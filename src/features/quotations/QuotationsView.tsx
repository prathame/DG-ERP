import React, { useState, useEffect, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Plus,
  ArrowLeft,
  Send,
  MessageCircle,
  Mail,
  Check,
  X,
  Trash2,
  ArrowRight,
  Download,
  Printer,
  Upload,
} from 'lucide-react';
import {
  cn,
  formatDate,
  shareViaWhatsApp,
  shareViaEmail,
  openPrintWindow,
  printBillInWindow,
  fetchImageAsDataUrl,
  PRINT_POPUP_BLOCKED,
} from '../../lib/utils';
import { isServicePhoneUx } from '../../platforms/service-cloud/mode';
import { api, fetchApi } from '../../api';
import type { BillSettings, Product, Vendor } from '../../types';
import {
  useToast,
  LoadingSpinner,
  AppModal,
  ModalActions,
  ModalActionButton,
  FormGrid,
  FormField,
  formControlClass,
  LineItemCard,
  type LineItemCardField,
  MobilePillTabs,
  MobileFab,
  MobileEmptyState,
  MobileListRow,
} from '../../components/ui';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useConfirm } from '../../hooks/useConfirm';
import { session } from '../../lib/session';
import { generateQuotationHtml } from '../../lib/billTemplates';
import { useTranslation } from '../../i18n';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { CsvImport } from '../../components/ui/CsvImport';
import { importQuotationsFromRows, QUOTATION_IMPORT_COLUMNS } from '../../lib/documentImport';

function asApiList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

interface Quotation {
  id: string;
  quotationNumber: string;
  vendorId?: string;
  vendorName?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  quotationDate: string;
  validUntil?: string;
  status: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    discountPercent: number;
    withGst: boolean;
    lineNet: number;
    lineGst: number;
    lineTotal: number;
    convertedQty?: number;
  }[];
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  notes?: string;
  convertedBatchId?: string;
  convertedInvoiceId?: string | null;
}

export function QuotationsView() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { confirm, ConfirmRenderer } = useConfirm();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Draft' | 'Sent' | 'Accepted' | 'Converted'>('all');
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [partialConvert, setPartialConvert] = useState<{
    quote: Quotation;
    lines: { lineIndex: number; productId: string; productName: string; remaining: number; qty: number }[];
  } | null>(null);

  const [form, setForm] = useState({
    vendorId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    date: new Date().toISOString().slice(0, 10),
    validUntil: '',
    notes: '',
  });
  type QuoteLineRow = {
    productId: string;
    description: string;
    quantity: number;
    customPrice: string;
    discount: number;
    withGst: boolean;
  };
  const emptyQuoteRow = (): QuoteLineRow => ({
    productId: '',
    description: '',
    quantity: 1,
    customPrice: '',
    discount: 0,
    withGst: true,
  });
  const [rows, setRows] = useState<QuoteLineRow[]>([emptyQuoteRow()]);
  const [billSettings, setBillSettings] = useState<BillSettings | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const sessionUser = session.getUser() as Record<string, unknown> | null;
  const companyName = String(sessionUser?.companyName || '');
  const isService = String(sessionUser?.businessType || '') === 'service';
  const offlinePdf = isServicePhoneUx(String(sessionUser?.businessType || ''));
  const partyLabel = isService ? 'Client' : 'Vendor';
  const convertLabel = isService ? 'Convert to Invoice' : 'Convert to Distribution';

  useEscapeKey(() => {
    if (csvImportOpen) setCsvImportOpen(false);
    else if (partialConvert) setPartialConvert(null);
    else if (modalOpen) {
      setModalOpen(false);
      setEditingId(null);
    } else if (selectedId) {
      setSelectedId(null);
      setSelected(null);
    }
  });

  const load = () => {
    setLoadError(null);
    // allSettled: products failure must not wipe vendors (empty Client dropdown)
    Promise.allSettled([
      fetchApi<Quotation[]>('/quotations'),
      api.products.list(),
      api.vendors.list(),
      api.settings.getBillSettings(),
    ])
      .then(results => {
        const q = asApiList<Quotation>(results[0].status === 'fulfilled' ? results[0].value : []);
        const p = asApiList<Product>(results[1].status === 'fulfilled' ? results[1].value : []);
        const v = asApiList<Vendor>(results[2].status === 'fulfilled' ? results[2].value : []);
        setQuotations(q);
        setProducts(p);
        setVendors(v.filter(x => x && x.id && x.id !== 'OWNER'));
        if (results[3].status === 'fulfilled' && results[3].value) {
          setBillSettings(results[3].value as BillSettings);
        }
        if (results[0].status === 'rejected') {
          setLoadError(results[0].reason instanceof Error ? results[0].reason.message : 'Failed to load quotations');
        }
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const refreshVendors = () => {
    void api.vendors
      .list()
      .then(rows => setVendors(asApiList<Vendor>(rows).filter(x => x && x.id && x.id !== 'OWNER')))
      .catch(() => {});
  };

  const printQuotation = async (q: Quotation) => {
    // Same A4 preview chrome as invoice bills (system Print → Save as PDF)
    const w = openPrintWindow('Preparing quotation…', { hidePdfDownload: true });
    if (!w) {
      toast(PRINT_POPUP_BLOCKED, 'error');
      return;
    }
    try {
      const user = session.getUser() as Record<string, unknown> | null;
      const bs = (billSettings || {}) as Record<string, unknown>;
      let qrDataUrl: string | undefined;
      if (bs.bankUpiId) {
        qrDataUrl =
          (await fetchImageAsDataUrl(
            `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
              `upi://pay?pa=${bs.bankUpiId}&pn=${bs.bankAccountName || 'Business'}&cu=INR`,
            )}`,
          )) || undefined;
      }
      const html = generateQuotationHtml(
        {
          quotationNumber: q.quotationNumber,
          quotationDate: q.quotationDate,
          validUntil: q.validUntil,
          status: q.status,
          customerName: q.customerName,
          customerPhone: q.customerPhone,
          customerEmail: q.customerEmail,
          vendorName: q.vendorName,
          items: q.items,
          subtotal: q.subtotal,
          gstRate: q.gstRate,
          gstAmount: q.gstAmount,
          total: q.total,
          // Offline: do not print per-quote notes; bank/T&C come from bill settings
          notes: offlinePdf ? undefined : q.notes,
          company: {
            name: String(user?.companyName || 'Dhandho'),
            phone: (user?.phone as string) || null,
            address: (user?.address as string) || null,
            gstNumber: (user?.gstNumber as string) || null,
            email: (user?.email as string) || null,
          },
          billSettings: bs,
        },
        { qrDataUrl },
      );
      printBillInWindow(w, html, `Quotation-${q.quotationNumber}`);
    } catch (err) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
      toast((err as Error).message || 'Print failed', 'error');
    }
  };

  const defaultGstRate = 18;

  const resolveTokenRef = useRef<Record<number, number>>({});

  /** Default line price: vendor slab → generic → inventory (same as dist / invoice). */
  const resolveQuoteRowPrice = (idx: number, productId: string, vendorId: string, quantity: number) => {
    if (!productId || quantity <= 0) return;
    const token = (resolveTokenRef.current[idx] = (resolveTokenRef.current[idx] || 0) + 1);
    const qs = new URLSearchParams({
      productId,
      quantity: String(quantity),
    });
    if (vendorId) qs.set('vendorId', vendorId);
    fetchApi<{ price: number }>(`/price-lists/resolve?${qs}`)
      .then(d => {
        if (resolveTokenRef.current[idx] !== token) return;
        if (!d || typeof d.price !== 'number') return;
        setRows(prev => {
          const row = prev[idx];
          if (!row || row.productId !== productId || (row.quantity || 0) !== quantity) return prev;
          return prev.map((r, i) => (i === idx ? { ...r, customPrice: String(d.price) } : r));
        });
      })
      .catch(() => {});
  };

  /** Match server unitPricesAfterDiscount (inclusive MRP supported). */
  const lineAmounts = (r: (typeof rows)[0]) => {
    const p = products.find(x => x.id === r.productId);
    const basePrice = r.customPrice ? parseFloat(r.customPrice) : (p?.price ?? 0);
    const qty = r.quantity || 0;
    const disc = Math.min(100, Math.max(0, r.discount || 0));
    const afterDisc = Math.round(((basePrice * (100 - disc)) / 100) * 100) / 100;
    const inclGst = !!p?.priceIncludesGst;
    let netPer = afterDisc;
    let billedPer = afterDisc;
    if (r.withGst && inclGst) {
      billedPer = afterDisc;
      netPer = Math.round((afterDisc / (1 + defaultGstRate / 100)) * 100) / 100;
    } else if (r.withGst) {
      netPer = afterDisc;
      billedPer = Math.round((afterDisc * (100 + defaultGstRate)) / 100);
    }
    const net = Math.round(netPer * qty * 100) / 100;
    const total = Math.round(billedPer * qty * 100) / 100;
    return { net, gst: Math.round((total - net) * 100) / 100, total };
  };

  const totals = rows.reduce(
    (acc, r) => {
      const a = lineAmounts(r);
      acc.net += a.net;
      acc.gst += a.gst;
      acc.total += a.total;
      acc.items += r.quantity || 0;
      return acc;
    },
    { net: 0, gst: 0, total: 0, items: 0 },
  );

  const resetForm = () => {
    setEditingId(null);
    setRows([emptyQuoteRow()]);
    setForm({
      vendorId: '',
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      date: new Date().toISOString().slice(0, 10),
      validUntil: '',
      notes: '',
    });
  };

  const openEditDraft = (q: Quotation) => {
    setEditingId(q.id);
    setForm({
      vendorId: q.vendorId || '',
      customerName: q.customerName || '',
      customerPhone: q.customerPhone || '',
      customerEmail: q.customerEmail || '',
      date: String(q.quotationDate).slice(0, 10),
      validUntil: q.validUntil ? String(q.validUntil).slice(0, 10) : '',
      notes: q.notes || '',
    });
    setRows(
      q.items.map(i => ({
        productId: i.productId || '',
        description: i.productId ? '' : i.productName || '',
        quantity: i.quantity,
        customPrice: String(i.price),
        discount: i.discountPercent || 0,
        withGst: i.withGst !== false,
      })),
    );
    refreshVendors();
    setModalOpen(true);
  };

  const handleCreate = async () => {
    const validRows = rows.filter(r => {
      if (!(r.quantity > 0)) return false;
      if (r.productId) return true;
      // Offline (and service): custom free-text line with rate
      return Boolean(r.description.trim() && parseFloat(r.customPrice) > 0);
    });
    if (validRows.length === 0) {
      toast(offlinePdf ? 'Add at least one line (Price List item or custom)' : 'Add at least one product', 'error');
      return;
    }
    if (!offlinePdf && validRows.some(r => !r.productId)) {
      toast('Select a product for each line', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        vendorId: form.vendorId || undefined,
        customerName: form.customerName || undefined,
        customerPhone: form.customerPhone || undefined,
        customerEmail: form.customerEmail || undefined,
        quotationDate: form.date,
        validUntil: form.validUntil || undefined,
        gstRate: defaultGstRate,
        // Offline: notes / T&C / bank details come from Bill Customization settings
        notes: offlinePdf ? undefined : form.notes || undefined,
        items: validRows.map(r => ({
          ...(r.productId ? { productId: r.productId } : { description: r.description.trim() }),
          quantity: r.quantity,
          customPrice: r.customPrice ? parseFloat(r.customPrice) : undefined,
          discountPercent: r.discount > 0 ? r.discount : undefined,
          withGst: r.withGst,
        })),
      };
      if (editingId) {
        await fetchApi(`/quotations/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('Quotation updated', 'success');
      } else {
        await fetchApi('/quotations', { method: 'POST', body: JSON.stringify(body) });
        toast('Quotation created', 'success');
      }
      setModalOpen(false);
      resetForm();
      load();
      if (editingId && selectedId === editingId) {
        const refreshed = await fetchApi<Quotation>(`/quotations/${editingId}`);
        setSelected(refreshed);
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openConvert = (q: Quotation) => {
    const lines = q.items
      .map((i, lineIndex) => {
        const remaining = i.quantity - (Number(i.convertedQty) || 0);
        return {
          lineIndex,
          productId: i.productId,
          productName: i.productName,
          remaining,
          qty: remaining,
        };
      })
      .filter(l => l.remaining > 0);
    if (lines.length === 0) {
      toast('Nothing left to convert', 'error');
      return;
    }
    setPartialConvert({ quote: q, lines });
  };

  const handleConvertSubmit = async (full: boolean) => {
    if (!partialConvert) return;
    const q = partialConvert.quote;
    const items = full
      ? undefined
      : partialConvert.lines
          .filter(l => l.qty > 0)
          .map(l => ({ productId: l.productId, quantity: l.qty, lineIndex: l.lineIndex }));
    if (!full && (!items || items.length === 0)) {
      toast('Select at least one quantity to convert', 'error');
      return;
    }
    const msg = isService
      ? `Convert ${q.quotationNumber} to a standalone invoice?`
      : `Convert ${q.quotationNumber}? This will deduct stock.`;
    if (!(await confirm({ title: convertLabel, message: msg, confirmLabel: 'Convert', variant: 'warning' }))) return;
    try {
      const result = await fetchApi<{
        batchId?: string;
        invoiceId?: string;
        invoiceNumber?: string;
        total?: number;
        billValue?: number;
        grandTotal?: number;
        fullyConverted?: boolean;
        target?: string;
      }>(`/quotations/${q.id}/convert`, {
        method: 'POST',
        body: JSON.stringify(items ? { items } : {}),
      });
      if (result.target === 'invoice') {
        toast(
          `Invoice ${result.invoiceNumber} created${result.fullyConverted ? '' : ' (partial)'} — ₹${result.grandTotal}`,
          'success',
        );
      } else {
        toast(
          `Distribution ${result.batchId} — ${result.total} items, ₹${result.billValue}${result.fullyConverted ? '' : ' (partial)'}`,
          'success',
        );
      }
      setPartialConvert(null);
      load();
      setSelectedId(null);
      setSelected(null);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleStatusChange = async (q: Quotation, status: string) => {
    try {
      await fetchApi(`/quotations/${q.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      load();
      if (selected) setSelected({ ...selected, status });
      toast(`Status updated to ${status}`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const handleDelete = async (q: Quotation) => {
    if (!(await confirm({ message: `Delete ${q.quotationNumber}? This cannot be undone.`, confirmLabel: 'Delete' })))
      return;
    try {
      await fetchApi(`/quotations/${q.id}`, { method: 'DELETE' });
      load();
      setSelectedId(null);
      setSelected(null);
      toast('Deleted', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const formatQuotationText = (q: Quotation) => {
    let text = `📋 *QUOTATION ${q.quotationNumber}*\n${companyName ? `From: ${companyName}\n` : ''}${q.customerName ? `To: ${q.customerName}\n` : ''}Date: ${formatDate(q.quotationDate)}\n${q.validUntil ? `Valid until: ${formatDate(q.validUntil)}\n` : ''}\n`;
    text += `*Items:*\n`;
    for (const item of q.items) {
      text += `• ${item.productName} × ${item.quantity} — ₹${item.lineTotal.toLocaleString()}\n`;
    }
    text += `\n*Subtotal:* ₹${q.subtotal.toLocaleString()}\n*GST:* ₹${q.gstAmount.toLocaleString()}\n*Total:* ₹${q.total.toLocaleString()}`;
    if (q.notes) text += `\n\n_${q.notes}_`;
    return text;
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  if (loadError)
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-12 text-center">
        <p className="text-rose-600 font-medium mb-2">{t('quotations.loadFailed')}</p>
        <p className="text-sm text-gray-500 mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
        >
          {t('common.retry')}
        </button>
      </div>
    );

  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-600',
    Sent: 'bg-blue-50 text-blue-600',
    Accepted: 'bg-emerald-50 text-emerald-600',
    Rejected: 'bg-rose-50 text-rose-600',
    Expired: 'bg-amber-50 text-amber-600',
    Converted: 'bg-purple-50 text-purple-600',
  };
  const statusBadge = (status: string) => (
    <span
      className={cn(
        'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
        statusColors[status] || 'bg-gray-100 text-gray-600',
      )}
    >
      {status}
    </span>
  );
  const filtered = statusFilter === 'all' ? quotations : quotations.filter(q => q.status === statusFilter);

  if (selectedId && selected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setSelected(null);
                }}
                className="p-2 hover:bg-gray-200 rounded-lg"
              >
                <ArrowLeft size={20} className="text-gray-600" />
              </button>
              <h3 className="font-bold text-lg">{selected.quotationNumber}</h3>
              {statusBadge(selected.status)}
              {selected.status === 'Draft' && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditDraft(selected)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    Edit Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selected, 'Sent')}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                  >
                    <Send size={14} /> Mark Sent
                  </button>
                </>
              )}
              {selected.status === 'Sent' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(selected, 'Accepted')}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                >
                  <Check size={14} /> Accepted
                </button>
              )}
              {selected.status === 'Accepted' && (isService || selected.vendorId) && (
                <button
                  type="button"
                  onClick={() => openConvert(selected)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg"
                >
                  <ArrowRight size={14} /> {convertLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => printQuotation(selected)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                {offlinePdf ? (
                  <>
                    <Download size={14} /> {t('common.downloadPdf')}
                  </>
                ) : (
                  <>
                    <Printer size={14} /> Print / PDF
                  </>
                )}
              </button>
              {selected.customerPhone && (
                <button
                  type="button"
                  onClick={() => shareViaWhatsApp(selected.customerPhone!, formatQuotationText(selected))}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg"
                >
                  <MessageCircle size={14} /> WhatsApp
                </button>
              )}
              {selected.customerEmail && (
                <button
                  type="button"
                  onClick={() =>
                    shareViaEmail(
                      selected.customerEmail!,
                      `Quotation ${selected.quotationNumber}`,
                      formatQuotationText(selected),
                    )
                  }
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Mail size={14} /> Email
                </button>
              )}
              {(selected.status === 'Draft' || selected.status === 'Rejected') && (
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
            <div className="text-right">
              <span className="text-sm text-gray-600">Date: {formatDate(selected.quotationDate)}</span>
              {selected.validUntil && (
                <span className="text-sm text-gray-500 ml-2">Valid until: {formatDate(selected.validUntil)}</span>
              )}
            </div>
          </div>
          <div className="p-6">
            {selected.customerName && (
              <p className="text-sm text-gray-600 mb-1">
                To: <strong>{selected.customerName}</strong> {selected.customerPhone && `• ${selected.customerPhone}`}
              </p>
            )}
            {selected.vendorName && (
              <p className="text-sm text-gray-600 mb-4">
                {partyLabel}: <strong>{selected.vendorName}</strong>
              </p>
            )}
            <div className="overflow-x-auto -mx-1 mb-4">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-bold text-gray-400 uppercase">
                    <th className="py-2 text-left">Product</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Price</th>
                    <th className="py-2 text-right">Disc%</th>
                    <th className="py-2 text-right">Net</th>
                    <th className="py-2 text-right">GST</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selected.items.map((item, i) => {
                    const converted = Number(item.convertedQty) || 0;
                    const remaining = item.quantity - converted;
                    return (
                      <tr key={i}>
                        <td className="py-2">
                          {item.productName}
                          {converted > 0 && (
                            <span className="block text-xs text-gray-400">
                              Converted {converted} · Remaining {remaining}
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right">{item.quantity}</td>
                        <td className="py-2 text-right">₹{item.price.toLocaleString()}</td>
                        <td className="py-2 text-right">{item.discountPercent}%</td>
                        <td className="py-2 text-right">₹{item.lineNet.toLocaleString()}</td>
                        <td className="py-2 text-right">₹{item.lineGst.toLocaleString()}</td>
                        <td className="py-2 text-right font-bold">₹{item.lineTotal.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td colSpan={4}>Total</td>
                    <td className="py-2 text-right">₹{selected.subtotal.toLocaleString()}</td>
                    <td className="py-2 text-right">₹{selected.gstAmount.toLocaleString()}</td>
                    <td className="py-2 text-right text-brand">₹{selected.total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {selected.notes && <p className="text-sm text-gray-500 italic">Notes: {selected.notes}</p>}
            {selected.convertedBatchId && (
              <p className="text-sm text-purple-600 font-medium mt-2">
                Converted to distribution: {selected.convertedBatchId}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  const openCreate = () => {
    resetForm();
    refreshVendors();
    setModalOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 sm:space-y-6 pb-14 sm:pb-0">
      <div className="hidden sm:flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText size={22} /> Quotations
          </h2>
          <p className="text-sm text-gray-500">Create quotes, share with customers, convert to distribution</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCsvImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50"
          >
            <Upload size={16} /> Import
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
          >
            <Plus size={16} /> New Quotation
          </button>
        </div>
      </div>

      {/* Phone: status pills + Import on one row */}
      <div className="sm:hidden flex items-center gap-2">
        <MobilePillTabs
          className="min-w-0 flex-1"
          items={(['all', 'Draft', 'Sent', 'Accepted', 'Converted'] as const).map(s => ({
            id: s,
            label:
              s === 'all'
                ? t('common.all')
                : s === 'Draft'
                  ? t('common.draft')
                  : s === 'Sent'
                    ? t('common.sent')
                    : s === 'Accepted'
                      ? t('common.accepted')
                      : t('common.converted'),
          }))}
          value={statusFilter}
          onChange={id => setStatusFilter(id as typeof statusFilter)}
        />
        <button
          type="button"
          onClick={() => setCsvImportOpen(true)}
          className="dg-compact shrink-0 inline-flex items-center gap-1 h-8 min-h-8 max-h-8 !min-h-8 px-2.5 rounded-full border border-gray-200 bg-white text-gray-600 text-[11px] font-bold"
          title="Import quotations"
        >
          <Upload size={12} /> Import
        </button>
      </div>

      {/* Desktop filters */}
      <div className="hidden sm:flex gap-2 flex-wrap">
        {(['all', 'Draft', 'Sent', 'Accepted', 'Converted'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-all',
              statusFilter === s ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {s === 'all'
              ? t('common.all')
              : s === 'Draft'
                ? t('common.draft')
                : s === 'Sent'
                  ? t('common.sent')
                  : s === 'Accepted'
                    ? t('common.accepted')
                    : t('common.converted')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <>
          <div className="sm:hidden">
            <MobileEmptyState
              icon={<FileText />}
              title={quotations.length === 0 ? t('quotations.noQuotationsYet') : t('quotations.noMatching')}
              actionLabel={quotations.length === 0 ? t('quotations.newQuote') : undefined}
              onAction={quotations.length === 0 ? openCreate : undefined}
            />
          </div>
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">
              {quotations.length === 0 ? t('quotations.noQuotationsYet') : t('quotations.noMatching')}
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Phone dense rows */}
          <div className="sm:hidden space-y-1.5">
            {filtered.map(q => (
              <Fragment key={q.id}>
                <MobileListRow
                  icon={<FileText />}
                  title={
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{q.quotationNumber}</span>
                      {statusBadge(q.status)}
                    </span>
                  }
                  subtitle={`${q.customerName || q.vendorName || 'No customer'} · ${formatDate(q.quotationDate)}`}
                  trailing={`₹${q.total.toLocaleString()}`}
                  onClick={() => {
                    setSelectedId(q.id);
                    fetchApi<Quotation>(`/quotations/${q.id}`)
                      .then(setSelected)
                      .catch(err => toast(err.message, 'error'));
                  }}
                />
              </Fragment>
            ))}
          </div>

          {/* Desktop list */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            {filtered.map(q => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setSelectedId(q.id);
                  fetchApi<Quotation>(`/quotations/${q.id}`)
                    .then(setSelected)
                    .catch(err => toast(err.message, 'error'));
                }}
                className="w-full px-6 py-4 text-left hover:bg-gray-50 flex items-center justify-between gap-4 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold">{q.quotationNumber}</p>
                    {statusBadge(q.status)}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {q.customerName || q.vendorName || 'No customer'} • {formatDate(q.quotationDate)} • {q.items.length}{' '}
                    item{q.items.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-brand shrink-0">₹{q.total.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {quotations.length > 0 && <MobileFab label="Quote" onClick={openCreate} />}

      {/* Create Quotation Modal */}
      <AnimatePresence>
        {modalOpen && (
          <AppModal
            title={editingId ? 'Edit Draft Quotation' : 'New Quotation'}
            onClose={() => {
              setModalOpen(false);
              resetForm();
            }}
            zIndex={100}
            size="lg"
            footer={
              <ModalActions>
                <ModalActionButton
                  variant="ghost"
                  onClick={() => {
                    setModalOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </ModalActionButton>
                <ModalActionButton variant="primary" disabled={submitting} onClick={handleCreate}>
                  {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Create Quotation'}
                </ModalActionButton>
              </ModalActions>
            }
          >
            <div className="space-y-4">
              <FormGrid>
                <FormField label="Customer Name" required className="sm:col-span-2">
                  <SearchSelect
                    allowCustom
                    value={form.vendorId}
                    inputValue={form.customerName}
                    onInputChange={text => setForm(f => ({ ...f, customerName: text }))}
                    placeholder={isService ? 'Type client name…' : 'Type vendor or customer name…'}
                    emptyHint={
                      vendors.length === 0
                        ? `No ${isService ? 'clients' : 'vendors'} yet — type a name, or add in Masters`
                        : 'Type a name — pick a match or leave as custom'
                    }
                    customLabel={isService ? 'client' : 'customer'}
                    options={vendors.map(v => ({
                      value: v.id,
                      label: v.name,
                      sublabel: v.phone || undefined,
                    }))}
                    onChange={nextVendor => {
                      if (!nextVendor) {
                        setForm(f => ({ ...f, vendorId: '' }));
                        return;
                      }
                      const v = vendors.find(x => x.id === nextVendor);
                      setForm(f => ({
                        ...f,
                        vendorId: nextVendor,
                        customerName: v?.name || f.customerName,
                        customerPhone: v?.phone || f.customerPhone,
                      }));
                      rows.forEach((row, idx) => {
                        if (row.productId && (row.quantity || 0) > 0) {
                          resolveQuoteRowPrice(idx, row.productId, nextVendor, row.quantity || 1);
                        }
                      });
                    }}
                    className="w-full [&_input]:min-h-11 [&_input]:rounded-xl [&_input]:px-3 [&_input]:sm:px-4 [&_button]:min-h-11 [&_button]:rounded-xl"
                  />
                </FormField>
                <FormField label="Phone">
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                    className={formControlClass}
                  />
                </FormField>
                <FormField label="Date">
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className={formControlClass}
                  />
                </FormField>
                <FormField label="Valid Until">
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={e => setForm({ ...form, validUntil: e.target.value })}
                    className={formControlClass}
                  />
                </FormField>
              </FormGrid>
              <p className="text-xs text-gray-500">
                {offlinePdf
                  ? 'Pick a Price List item (Catalog / Clients rates) or type a custom line.'
                  : 'Defaults: vendor/client price list → generic → inventory. Edit any line to negotiate.'}
              </p>

              <div className="sm:hidden space-y-3">
                {rows.map((row, idx) => {
                  const p = products.find(x => x.id === row.productId);
                  const { total: lineTotal } = lineAmounts(row);
                  const qFields: LineItemCardField[] = [
                    {
                      key: 'product',
                      label: offlinePdf ? 'Price List item' : 'Product',
                      wide: true,
                      node: (
                        <select
                          value={row.productId}
                          onChange={e => {
                            const pid = e.target.value;
                            const sel = products.find(x => x.id === pid);
                            setRows(
                              rows.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      productId: pid,
                                      description: pid ? '' : r.description,
                                      customPrice: sel ? String(sel.price) : r.customPrice,
                                    }
                                  : r,
                              ),
                            );
                            if (pid) resolveQuoteRowPrice(idx, pid, form.vendorId, row.quantity || 1);
                          }}
                          className={formControlClass}
                        >
                          <option value="">{offlinePdf ? 'Custom item' : 'Select'}</option>
                          {products.map(pr => (
                            <option key={pr.id} value={pr.id}>
                              {pr.name} (₹{pr.price.toLocaleString()})
                            </option>
                          ))}
                        </select>
                      ),
                    },
                    ...(offlinePdf && !row.productId
                      ? [
                          {
                            key: 'description',
                            label: 'Description',
                            wide: true as const,
                            node: (
                              <input
                                value={row.description}
                                onChange={e =>
                                  setRows(rows.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))
                                }
                                className={formControlClass}
                                placeholder="Type custom service"
                              />
                            ),
                          },
                        ]
                      : []),
                    {
                      key: 'qty',
                      label: 'Quantity',
                      node: (
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={row.quantity || ''}
                          onChange={e => {
                            const newQty = parseInt(e.target.value) || 0;
                            setRows(rows.map((r, i) => (i === idx ? { ...r, quantity: newQty } : r)));
                            if (row.productId && newQty > 0) {
                              resolveQuoteRowPrice(idx, row.productId, form.vendorId, newQty);
                            }
                          }}
                          className={formControlClass}
                        />
                      ),
                    },
                    {
                      key: 'price',
                      label: 'Price',
                      node: (
                        <input
                          type="number"
                          inputMode="decimal"
                          value={row.customPrice}
                          onChange={e =>
                            setRows(rows.map((r, i) => (i === idx ? { ...r, customPrice: e.target.value } : r)))
                          }
                          placeholder={p ? `₹${p.price}` : offlinePdf ? 'Rate' : '—'}
                          className={formControlClass}
                        />
                      ),
                    },
                    {
                      key: 'disc',
                      label: 'Discount %',
                      node: (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          inputMode="decimal"
                          value={row.discount || ''}
                          onChange={e =>
                            setRows(
                              rows.map((r, i) => (i === idx ? { ...r, discount: parseFloat(e.target.value) || 0 } : r)),
                            )
                          }
                          className={formControlClass}
                        />
                      ),
                    },
                    {
                      key: 'gst',
                      label: 'GST',
                      node: (
                        <label className="flex items-center gap-2 min-h-11 text-sm">
                          <input
                            type="checkbox"
                            checked={row.withGst}
                            onChange={e =>
                              setRows(rows.map((r, i) => (i === idx ? { ...r, withGst: e.target.checked } : r)))
                            }
                            className="rounded w-5 h-5"
                          />
                          Include GST
                        </label>
                      ),
                    },
                  ];
                  return (
                    <div key={idx}>
                      <LineItemCard
                        index={idx}
                        title={p?.name || row.description || `Item ${idx + 1}`}
                        amountLabel={lineTotal > 0 ? `₹${lineTotal.toLocaleString()}` : undefined}
                        canRemove={rows.length > 1}
                        onRemove={() => setRows(rows.filter((_, i) => i !== idx))}
                        fields={qFields}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr className="text-xs font-bold text-gray-400 uppercase">
                      <th className="px-3 py-3 w-8">#</th>
                      <th className="px-3 py-3">{offlinePdf ? 'Item' : 'Product'}</th>
                      <th className="px-3 py-3 w-16">Qty</th>
                      <th className="px-3 py-3 w-24">Price</th>
                      <th className="px-3 py-3 w-16">Disc%</th>
                      <th className="px-3 py-3 w-12 text-center">GST</th>
                      <th className="px-3 py-3 w-24 text-right">Total</th>
                      <th className="px-3 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, idx) => {
                      const p = products.find(x => x.id === row.productId);
                      const { total: lineTotal } = lineAmounts(row);
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2 space-y-1.5">
                            <select
                              value={row.productId}
                              onChange={e => {
                                const pid = e.target.value;
                                const sel = products.find(x => x.id === pid);
                                setRows(
                                  rows.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          productId: pid,
                                          description: pid ? '' : r.description,
                                          customPrice: sel ? String(sel.price) : r.customPrice,
                                        }
                                      : r,
                                  ),
                                );
                                if (pid) resolveQuoteRowPrice(idx, pid, form.vendorId, row.quantity || 1);
                              }}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                            >
                              <option value="">{offlinePdf ? 'Custom item' : 'Select'}</option>
                              {products.map(pr => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.name} (₹{pr.price.toLocaleString()})
                                </option>
                              ))}
                            </select>
                            {offlinePdf && !row.productId && (
                              <input
                                value={row.description}
                                onChange={e =>
                                  setRows(rows.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))
                                }
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                                placeholder="Type custom service"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              value={row.quantity || ''}
                              onChange={e => {
                                const newQty = parseInt(e.target.value) || 0;
                                setRows(rows.map((r, i) => (i === idx ? { ...r, quantity: newQty } : r)));
                                if (row.productId && newQty > 0) {
                                  resolveQuoteRowPrice(idx, row.productId, form.vendorId, newQty);
                                }
                              }}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={row.customPrice}
                              onChange={e =>
                                setRows(rows.map((r, i) => (i === idx ? { ...r, customPrice: e.target.value } : r)))
                              }
                              placeholder={p ? `₹${p.price}` : '—'}
                              className={cn(
                                'w-full px-2 py-1.5 border rounded-lg text-sm text-center',
                                row.customPrice ? 'border-amber-300 bg-amber-50' : 'border-gray-200',
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={row.discount || ''}
                              onChange={e =>
                                setRows(
                                  rows.map((r, i) =>
                                    i === idx ? { ...r, discount: parseFloat(e.target.value) || 0 } : r,
                                  ),
                                )
                              }
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={row.withGst}
                              onChange={e =>
                                setRows(rows.map((r, i) => (i === idx ? { ...r, withGst: e.target.checked } : r)))
                              }
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-bold">
                            {lineTotal > 0 ? `₹${lineTotal.toLocaleString()}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {rows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                                className="text-rose-400 hover:text-rose-600"
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => setRows([...rows, emptyQuoteRow()])}
                className="text-sm font-bold text-brand min-h-11 inline-flex items-center"
              >
                {offlinePdf ? '+ Add Line' : '+ Add Product'}
              </button>
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs sm:text-sm text-gray-600">
                  {totals.items} items · Net ₹{totals.net.toLocaleString()} · GST ₹{totals.gst.toLocaleString()}
                </span>
                <span className="text-lg font-bold text-brand tabular-nums">₹{totals.total.toLocaleString()}</span>
              </div>
              {/* Offline: Notes / T&C / bank details come from Settings → Bill Customization */}
              {!offlinePdf && (
                <FormField label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className={cn(formControlClass, 'min-h-[4.5rem]')}
                    placeholder="Terms, conditions, remarks..."
                  />
                </FormField>
              )}
            </div>
          </AppModal>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {partialConvert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-1">{convertLabel}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {partialConvert.quote.quotationNumber} — adjust quantities for a partial convert, or convert all
                remaining.
              </p>
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {partialConvert.lines.map((line, idx) => (
                  <div key={line.lineIndex} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{line.productName}</div>
                      <div className="text-xs text-gray-400">Remaining {line.remaining}</div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={line.remaining}
                      value={line.qty || ''}
                      onChange={e => {
                        const qty = Math.min(line.remaining, Math.max(0, parseInt(e.target.value) || 0));
                        setPartialConvert(pc =>
                          pc
                            ? {
                                ...pc,
                                lines: pc.lines.map((l, i) => (i === idx ? { ...l, qty } : l)),
                              }
                            : pc,
                        );
                      }}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-center"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setPartialConvert(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleConvertSubmit(false)}
                  className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold"
                >
                  Convert selected
                </button>
                <button
                  type="button"
                  onClick={() => handleConvertSubmit(true)}
                  className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold"
                >
                  Convert all remaining
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {csvImportOpen && (
        <CsvImport
          templateName="quotations"
          itemLabel="quotations"
          columns={[...QUOTATION_IMPORT_COLUMNS]}
          requireAnyOf={[['productName', 'barcode']]}
          onClose={() => setCsvImportOpen(false)}
          onImport={async rows => {
            const result = await importQuotationsFromRows(rows, {
              products,
              vendors,
              allowCustomLines: offlinePdf,
              gstRate: 18,
              post: body => fetchApi('/quotations', { method: 'POST', body: JSON.stringify(body) }),
            });
            if (result.success > 0) load();
            return result;
          }}
        />
      )}
      <ConfirmRenderer />
    </motion.div>
  );
}
