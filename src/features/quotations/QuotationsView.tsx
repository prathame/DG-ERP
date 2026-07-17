import React, { useState, useEffect, useRef } from 'react';
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
  Printer,
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
import { api, fetchApi } from '../../api';
import type { BillSettings, Product, Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useConfirm } from '../../hooks/useConfirm';
import { session } from '../../lib/session';
import { generateQuotationHtml } from '../../lib/billTemplates';

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
  }[];
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  notes?: string;
  convertedBatchId?: string;
}

export function QuotationsView() {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Draft' | 'Sent' | 'Accepted' | 'Converted'>('all');

  const [form, setForm] = useState({
    vendorId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    date: new Date().toISOString().slice(0, 10),
    validUntil: '',
    notes: '',
  });
  const [rows, setRows] = useState<
    { productId: string; quantity: number; customPrice: string; discount: number; withGst: boolean }[]
  >([{ productId: '', quantity: 1, customPrice: '', discount: 0, withGst: true }]);
  const [billSettings, setBillSettings] = useState<BillSettings | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const sessionUser = session.getUser() as Record<string, unknown> | null;
  const companyName = String(sessionUser?.companyName || '');

  useEscapeKey(() => {
    if (modalOpen) setModalOpen(false);
    else if (selectedId) {
      setSelectedId(null);
      setSelected(null);
    }
  });

  const load = () => {
    setLoadError(null);
    Promise.all([
      fetchApi<Quotation[]>('/quotations'),
      api.products.list(),
      api.vendors.list(),
      api.settings.getBillSettings().catch(() => null),
    ])
      .then(([q, p, v, bill]) => {
        setQuotations(q);
        setProducts(p);
        setVendors(v);
        if (bill) setBillSettings(bill);
      })
      .catch(err => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const printQuotation = async (q: Quotation) => {
    const w = openPrintWindow();
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
          notes: q.notes,
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
    fetch(`/api/price-lists/resolve?${qs}`, {
      headers: {
        Authorization: `Bearer ${session.getToken()}`,
        'X-Tenant-ID': session.getTenantId() || '',
      },
    })
      .then(r => r.json())
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

  const handleCreate = async () => {
    const validRows = rows.filter(r => r.productId && r.quantity > 0);
    if (validRows.length === 0) {
      toast('Add at least one product', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await fetchApi('/quotations', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: form.vendorId || undefined,
          customerName: form.customerName || undefined,
          customerPhone: form.customerPhone || undefined,
          customerEmail: form.customerEmail || undefined,
          quotationDate: form.date,
          validUntil: form.validUntil || undefined,
          gstRate: defaultGstRate,
          notes: form.notes || undefined,
          items: validRows.map(r => ({
            productId: r.productId,
            quantity: r.quantity,
            customPrice: r.customPrice ? parseFloat(r.customPrice) : undefined,
            discountPercent: r.discount > 0 ? r.discount : undefined,
            withGst: r.withGst,
          })),
        }),
      });
      setModalOpen(false);
      setRows([{ productId: '', quantity: 1, customPrice: '', discount: 0, withGst: true }]);
      setForm({
        vendorId: '',
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        date: new Date().toISOString().slice(0, 10),
        validUntil: '',
        notes: '',
      });
      load();
      toast('Quotation created', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvert = async (q: Quotation) => {
    if (
      !(await confirm({
        title: 'Convert to Distribution',
        message: `Convert ${q.quotationNumber}? This will deduct stock.`,
        confirmLabel: 'Convert',
        variant: 'warning',
      }))
    )
      return;
    try {
      const result = await fetchApi<{ batchId: string; total: number; billValue: number }>(
        `/quotations/${q.id}/convert`,
        { method: 'POST' },
      );
      toast(
        `Converted! Distribution ${result.batchId} created — ${result.total} items, ₹${result.billValue}`,
        'success',
      );
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
        <p className="text-rose-600 font-medium mb-2">Failed to load quotations</p>
        <p className="text-sm text-gray-500 mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
        >
          Retry
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
              <span
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-bold',
                  statusColors[selected.status] || 'bg-gray-100',
                )}
              >
                {selected.status}
              </span>
              {selected.status === 'Draft' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(selected, 'Sent')}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg"
                >
                  <Send size={14} /> Mark Sent
                </button>
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
              {(selected.status === 'Accepted' || selected.status === 'Draft') && selected.vendorId && (
                <button
                  type="button"
                  onClick={() => handleConvert(selected)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg"
                >
                  <ArrowRight size={14} /> Convert to Distribution
                </button>
              )}
              <button
                type="button"
                onClick={() => printQuotation(selected)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <Printer size={14} /> Print / PDF
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
                Vendor: <strong>{selected.vendorName}</strong>
              </p>
            )}
            <table className="w-full text-sm mb-4">
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
                {selected.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2">{item.productName}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">₹{item.price.toLocaleString()}</td>
                    <td className="py-2 text-right">{item.discountPercent}%</td>
                    <td className="py-2 text-right">₹{item.lineNet.toLocaleString()}</td>
                    <td className="py-2 text-right">₹{item.lineGst.toLocaleString()}</td>
                    <td className="py-2 text-right font-bold">₹{item.lineTotal.toLocaleString()}</td>
                  </tr>
                ))}
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText size={22} /> Quotations
          </h2>
          <p className="text-sm text-gray-500">Create quotes, share with customers, convert to distribution</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
        >
          <Plus size={16} /> New Quotation
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
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
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">{quotations.length === 0 ? 'No quotations yet' : 'No matching quotations'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
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
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', statusColors[q.status])}>
                    {q.status}
                  </span>
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
      )}

      {/* Create Quotation Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6"
            >
              <h3 className="text-lg font-bold mb-4">New Quotation</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Vendor / Customer</label>
                  <select
                    value={form.vendorId}
                    onChange={e => {
                      const nextVendor = e.target.value;
                      const v = vendors.find(x => x.id === nextVendor);
                      setForm({
                        ...form,
                        vendorId: nextVendor,
                        customerName: v?.name || form.customerName,
                        customerPhone: v?.phone || form.customerPhone,
                      });
                      rows.forEach((row, idx) => {
                        if (row.productId && (row.quantity || 0) > 0) {
                          resolveQuoteRowPrice(idx, row.productId, nextVendor, row.quantity || 1);
                        }
                      });
                    }}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                  >
                    <option value="">Select or type below</option>
                    {vendors
                      .filter(v => v.id !== 'OWNER')
                      .map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Customer Name</label>
                  <input
                    value={form.customerName}
                    onChange={e => setForm({ ...form, customerName: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                    placeholder="If not a vendor"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Phone</label>
                  <input
                    value={form.customerPhone}
                    onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Valid Until</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={e => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Defaults: vendor/client price list → generic → inventory. Edit any line to negotiate; saved quote keeps
                that price on convert.
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto mb-4">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr className="text-xs font-bold text-gray-400 uppercase">
                      <th className="px-3 py-3 w-8">#</th>
                      <th className="px-3 py-3">Product</th>
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
                          <td className="px-3 py-2">
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
                                          customPrice: sel ? String(sel.price) : '',
                                        }
                                      : r,
                                  ),
                                );
                                if (pid) resolveQuoteRowPrice(idx, pid, form.vendorId, row.quantity || 1);
                              }}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                            >
                              <option value="">Select</option>
                              {products.map(pr => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.name} (₹{pr.price.toLocaleString()})
                                </option>
                              ))}
                            </select>
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
                onClick={() =>
                  setRows([...rows, { productId: '', quantity: 1, customPrice: '', discount: 0, withGst: true }])
                }
                className="text-sm font-bold text-brand mb-4"
              >
                + Add Product
              </button>
              <div className="bg-gray-50 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {totals.items} items • Net ₹{totals.net.toLocaleString()} • GST ₹{totals.gst.toLocaleString()}
                </span>
                <span className="text-lg font-bold text-brand">Total: ₹{totals.total.toLocaleString()}</span>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Terms, conditions, remarks..."
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60"
                >
                  {submitting ? 'Creating...' : 'Create Quotation'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmRenderer />
    </motion.div>
  );
}
