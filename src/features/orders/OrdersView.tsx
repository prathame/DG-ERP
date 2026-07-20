import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ClipboardList, Plus, ArrowLeft, Check, X, Truck, Trash2, Search, Upload } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api, fetchApi } from '../../api';
import type { Product, Vendor } from '../../types';
import { useToast, LoadingSpinner, MobilePillTabs, MobileFab } from '../../components/ui';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useConfirm } from '../../hooks/useConfirm';
import { reportActionFailed } from '../../lib/reportActionFailure';
import { CsvImport } from '../../components/ui/CsvImport';
import { importOrdersFromRows, ORDER_IMPORT_COLUMNS } from '../../lib/documentImport';

interface Order {
  id: string;
  orderNumber: string;
  vendorId?: string;
  vendorName?: string;
  customerName?: string;
  customerPhone?: string;
  customerGstNumber?: string;
  orderDate: string;
  requiredDate?: string;
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
  fulfilledBatchId?: string;
}

export function OrdersView() {
  const { toast } = useToast();
  const { confirm, ConfirmRenderer } = useConfirm();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Confirmed' | 'Fulfilled' | 'Cancelled'>('all');
  const [searchText, setSearchText] = useState('');
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  const [form, setForm] = useState({
    vendorId: '',
    customerName: '',
    customerPhone: '',
    customerGstNumber: '',
    date: new Date().toISOString().slice(0, 10),
    requiredDate: '',
    notes: '',
  });
  const [rows, setRows] = useState<
    { productId: string; quantity: number; customPrice: string; discount: number; withGst: boolean }[]
  >([{ productId: '', quantity: 1, customPrice: '', discount: 0, withGst: true }]);

  useEscapeKey(() => {
    if (csvImportOpen) setCsvImportOpen(false);
    else if (modalOpen) setModalOpen(false);
    else if (selectedId) {
      setSelectedId(null);
      setSelected(null);
    }
  });

  const load = () => {
    setLoadError(null);
    Promise.all([fetchApi<Order[]>('/orders'), api.products.list(), api.vendors.list()])
      .then(([o, p, v]) => {
        setOrders(o);
        setProducts(p);
        setVendors(v);
      })
      .catch(err => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchApi<Order>(`/orders/${selectedId}`)
        .then(setSelected)
        .catch(() => setSelected(null));
    }
  }, [selectedId]);

  const defaultGstRate = 18;
  const totals = rows.reduce(
    (acc, r) => {
      const p = products.find(x => x.id === r.productId);
      const price = r.customPrice ? parseFloat(r.customPrice) : (p?.price ?? 0);
      const gross = price * (r.quantity || 0);
      const disc = Math.round((gross * (r.discount || 0)) / 100);
      const net = gross - disc;
      const gst = r.withGst ? Math.round((net * defaultGstRate) / 100) : 0;
      acc.net += net;
      acc.gst += gst;
      acc.total += net + gst;
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
      await fetchApi('/orders', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: form.vendorId || undefined,
          customerName: form.customerName || undefined,
          customerPhone: form.customerPhone || undefined,
          customerGstNumber: form.customerGstNumber || undefined,
          orderDate: form.date,
          requiredDate: form.requiredDate || undefined,
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
      setForm({
        vendorId: '',
        customerName: '',
        customerPhone: '',
        customerGstNumber: '',
        date: new Date().toISOString().slice(0, 10),
        requiredDate: '',
        notes: '',
      });
      setRows([{ productId: '', quantity: 1, customPrice: '', discount: 0, withGst: true }]);
      load();
      toast('Order created', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetchApi(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      load();
      if (selectedId === id) fetchApi<Order>(`/orders/${id}`).then(setSelected);
      toast(`Order ${status.toLowerCase()}`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const fulfillOrder = async (id: string) => {
    if (
      !(await confirm({
        title: 'Fulfill Order',
        message: 'This will deduct stock and create a distribution batch.',
        confirmLabel: 'Fulfill',
        variant: 'warning',
      }))
    )
      return;
    try {
      const result = await fetchApi<{ batchId: string; total: number; billValue: number }>(`/orders/${id}/fulfill`, {
        method: 'POST',
      });
      load();
      toast(`Order fulfilled — ${result.total} items distributed (Batch ${result.batchId})`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
      void reportActionFailed('order.fulfill', err, { orderId: id });
    }
  };

  const deleteOrder = async (id: string) => {
    if (!(await confirm({ message: 'Delete this order? This cannot be undone.', confirmLabel: 'Delete' }))) return;
    try {
      await fetchApi(`/orders/${id}`, { method: 'DELETE' });
      setSelectedId(null);
      setSelected(null);
      load();
      toast('Order deleted', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
      void reportActionFailed('order.delete', err, { orderId: id });
    }
  };

  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      return (
        o.orderNumber?.toLowerCase().includes(s) ||
        o.vendorName?.toLowerCase().includes(s) ||
        o.customerName?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case 'Pending':
        return 'bg-amber-100 text-amber-700';
      case 'Confirmed':
        return 'bg-blue-100 text-blue-700';
      case 'Fulfilled':
        return 'bg-emerald-100 text-emerald-700';
      case 'Cancelled':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-gray-100 text-gray-600';
    }
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
        <p className="text-rose-600 font-medium mb-2">Failed to load orders</p>
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

  // Detail view
  if (selectedId && selected) {
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setSelected(null);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{selected.orderNumber}</h2>
              <p className="text-sm text-gray-500">
                {selected.vendorName || selected.customerName} — {formatDate(selected.orderDate)}
              </p>
            </div>
            <span className={cn('px-3 py-1 rounded-full text-xs font-bold', statusColor(selected.status))}>
              {selected.status}
            </span>
            {selected.status === 'Pending' && (
              <>
                <button
                  type="button"
                  onClick={() => updateStatus(selected.id, 'Confirmed')}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold"
                >
                  <Check size={14} className="inline mr-1" />
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(selected.id, 'Cancelled')}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold"
                >
                  <X size={14} className="inline mr-1" />
                  Cancel
                </button>
              </>
            )}
            {selected.status === 'Confirmed' && (
              <button
                type="button"
                onClick={() => fulfillOrder(selected.id)}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold"
              >
                <Truck size={14} className="inline mr-1" />
                Fulfill
              </button>
            )}
            {(selected.status === 'Pending' || selected.status === 'Cancelled') && (
              <button
                type="button"
                onClick={() => deleteOrder(selected.id)}
                className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-sm font-bold"
              >
                <Trash2 size={14} className="inline mr-1" />
                Delete
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Disc%</th>
                    <th className="px-4 py-3">GST</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selected.items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-sm text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">{item.productName}</td>
                      <td className="px-4 py-3 text-sm">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm">₹{item.price.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">
                        {item.discountPercent > 0 ? `${item.discountPercent}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">{item.withGst ? '✓' : '-'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-right">₹{item.lineTotal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-bold">₹{selected.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">GST ({selected.gstRate}%)</span>
                <span className="font-bold">₹{selected.gstAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-200 pt-1">
                <span className="font-medium">Total</span>
                <span className="font-bold text-lg text-brand">₹{selected.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
          {selected.notes && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-1">Notes</p>
              <p className="text-sm">{selected.notes}</p>
            </div>
          )}
          {selected.fulfilledBatchId && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm text-emerald-700 font-medium">
                Fulfilled as Distribution Batch: <span className="font-mono">{selected.fulfilledBatchId}</span>
              </p>
            </div>
          )}
        </motion.div>
        <ConfirmRenderer />
      </>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 sm:space-y-6 pb-14 sm:pb-0">
      <div className="hidden sm:flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Orders</h2>
          <p className="text-sm text-gray-500">Manage customer and vendor orders</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCsvImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50"
          >
            <Upload size={18} /> Import
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
          >
            <Plus size={18} /> New Order
          </button>
        </div>
      </div>

      {/* Phone: status pills + Import on one row */}
      <div className="sm:hidden flex items-center gap-2">
        <MobilePillTabs
          className="min-w-0 flex-1"
          items={(['all', 'Pending', 'Confirmed', 'Fulfilled', 'Cancelled'] as const).map(s => ({
            id: s,
            label: s === 'all' ? 'All' : s,
          }))}
          value={statusFilter}
          onChange={id => setStatusFilter(id as typeof statusFilter)}
        />
        <button
          type="button"
          onClick={() => setCsvImportOpen(true)}
          className="dg-compact shrink-0 inline-flex items-center gap-1 h-8 min-h-8 max-h-8 !min-h-8 px-2.5 rounded-full border border-gray-200 bg-white text-gray-600 text-[11px] font-bold"
          title="Import orders"
        >
          <Upload size={12} /> Import
        </button>
      </div>

      <div className="hidden sm:flex items-center gap-3 flex-wrap">
        {(['all', 'Pending', 'Confirmed', 'Fulfilled', 'Cancelled'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-all',
              statusFilter === s
                ? s === 'Pending'
                  ? 'bg-amber-500 text-white'
                  : s === 'Confirmed'
                    ? 'bg-blue-500 text-white'
                    : s === 'Fulfilled'
                      ? 'bg-emerald-500 text-white'
                      : s === 'Cancelled'
                        ? 'bg-gray-500 text-white'
                        : 'bg-brand text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search orders..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Phone search */}
      <div className="sm:hidden relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
        <input
          type="text"
          placeholder="Search orders..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full pl-8 pr-3 h-9 bg-white border border-gray-200 rounded-xl text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 sm:p-12 text-center text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-2">No orders yet</p>
          <p className="text-sm mb-4 hidden sm:block">Create your first order to track customer requests</p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="hidden sm:inline-flex px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark"
          >
            + New Order
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id)}
              className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md transition-all flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm">{o.orderNumber}</span>
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', statusColor(o.status))}>
                    {o.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 truncate">
                  {o.vendorName || o.customerName || 'Walk-in'} — {o.items.length} item{o.items.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-400">
                  {formatDate(o.orderDate)}
                  {o.requiredDate ? ` • Due: ${formatDate(o.requiredDate)}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-brand">₹{o.total.toLocaleString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <MobileFab label="Order" onClick={() => setModalOpen(true)} />

      {/* Create Order Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4">New Order</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vendor / Customer</label>
                      <select
                        value={form.vendorId}
                        onChange={e => setForm({ ...form, vendorId: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                      >
                        <option value="">Select vendor (optional)</option>
                        {vendors.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Customer Name</label>
                      <input
                        value={form.customerName}
                        onChange={e => setForm({ ...form, customerName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                        placeholder="Or enter customer name"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Order Date</label>
                      <input
                        type="date"
                        value={form.date}
                        onChange={e => setForm({ ...form, date: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Required By</label>
                      <input
                        type="date"
                        value={form.requiredDate}
                        onChange={e => setForm({ ...form, requiredDate: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left min-w-[640px]">
                      <thead>
                        <tr className="text-xs font-bold text-gray-400 uppercase bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2 w-20">Qty</th>
                          <th className="px-3 py-2 w-24">Price</th>
                          <th className="px-3 py-2 w-20">Disc%</th>
                          <th className="px-3 py-2 w-12">GST</th>
                          <th className="px-3 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((row, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <select
                                value={row.productId}
                                onChange={e =>
                                  setRows(rows.map((r, i) => (i === idx ? { ...r, productId: e.target.value } : r)))
                                }
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                              >
                                <option value="">Select</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} (₹{Number(p.price).toLocaleString()})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={row.quantity || ''}
                                onChange={e => {
                                  const v = e.target.value.replace(/[^0-9]/g, '');
                                  setRows(
                                    rows.map((r, i) => (i === idx ? { ...r, quantity: v ? parseInt(v) : 0 } : r)),
                                  );
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.customPrice}
                                onChange={e => {
                                  const v = e.target.value.replace(/[^0-9.]/g, '');
                                  setRows(rows.map((r, i) => (i === idx ? { ...r, customPrice: v } : r)));
                                }}
                                placeholder={products.find(p => p.id === row.productId)?.price?.toString() || '—'}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.discount || ''}
                                onChange={e => {
                                  const v = e.target.value.replace(/[^0-9.]/g, '');
                                  setRows(
                                    rows.map((r, i) => (i === idx ? { ...r, discount: v ? parseFloat(v) : 0 } : r)),
                                  );
                                }}
                                placeholder="0"
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
                                className="rounded text-brand"
                              />
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
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() =>
                        setRows([...rows, { productId: '', quantity: 1, customPrice: '', discount: 0, withGst: true }])
                      }
                      className="w-full py-2 text-sm font-bold text-brand hover:bg-gray-50 border-t border-gray-200"
                    >
                      + Add Product Row
                    </button>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Items</span>
                      <span className="font-bold">{totals.items}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-bold">₹{totals.net.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">GST ({defaultGstRate}%)</span>
                      <span className="font-bold">₹{totals.gst.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-gray-200 pt-1">
                      <span className="font-medium">Total</span>
                      <span className="font-bold text-lg text-brand">₹{totals.total.toLocaleString()}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Notes</label>
                    <textarea
                      rows={2}
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm resize-none"
                      placeholder="Optional notes..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="flex-1 py-2.5 border rounded-xl font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={submitting}
                      className="flex-1 py-2.5 bg-brand text-white rounded-xl font-bold disabled:opacity-60"
                    >
                      {submitting ? 'Creating...' : 'Create Order'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {csvImportOpen && (
        <CsvImport
          templateName="orders"
          itemLabel="orders"
          columns={[...ORDER_IMPORT_COLUMNS]}
          requireAnyOf={[['productName', 'barcode']]}
          onClose={() => setCsvImportOpen(false)}
          onImport={async rows => {
            const result = await importOrdersFromRows(rows, {
              products,
              vendors,
              requireProduct: true,
              gstRate: 18,
              post: body => fetchApi('/orders', { method: 'POST', body: JSON.stringify(body) }),
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
