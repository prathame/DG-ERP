import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft, ShoppingBag, Download } from 'lucide-react';
import { cn, exportToCsv, formatDate } from '../../lib/utils';
import { api } from '../../api';
import type { Customer, Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

export function CustomerMasterView({
  onBack,
  onRefresh,
  user,
}: {
  onBack: () => void;
  onRefresh: () => void;
  user?: { role?: string; vendorId?: string } | null;
}) {
  const { toast } = useToast();
  const vendorId = user?.role === 'Vendor' ? user?.vendorId : undefined;
  const [list, setList] = useState<Customer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [purchasesModal, setPurchasesModal] = useState<{
    customer: Customer;
    purchases: { productName: string; vendorName: string; barcode: string; purchaseDate: string }[];
  } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', vendorId: '' as string | '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.vendors
      .list()
      .then(setVendors)
      .catch(() => []);
  }, []);

  const openPurchases = (c: Customer) => {
    api.customers
      .purchases(c.id)
      .then(purchases => {
        setPurchasesModal({ customer: c, purchases });
      })
      .catch(() => setPurchasesModal({ customer: c, purchases: [] }));
  };

  const load = () => {
    api.customers
      .list(debouncedSearch || undefined, vendorId)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
    onRefresh();
  };
  useEffect(() => {
    setLoading(true);
    load();
  }, [debouncedSearch, vendorId]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', phone: '', email: '', address: '', vendorId: vendorId ?? '' });
    setModalOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      vendorId: c.vendorId ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { vendorId, ...rest } = form;
    (editing
      ? api.customers.update(editing.id, { ...rest, vendorId: vendorId || null })
      : api.customers.create({ ...rest, vendorId: vendorId || null })
    )
      .then(() => {
        setModalOpen(false);
        load();
      })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    api.customers
      .delete(deleteTarget.id)
      .then(() => {
        setDeleteTarget(null);
        load();
      })
      .catch(err => toast(err.message, 'error'));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Customer Master</h2>
          <p className="text-sm text-gray-500">Manage customer records</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              list.length &&
              exportToCsv(
                list.map(c => ({
                  id: c.id,
                  name: c.name,
                  phone: c.phone ?? '',
                  email: c.email ?? '',
                  address: c.address ?? '',
                  vendorId: c.vendorId ?? '',
                })),
                'customers',
              )
            }
            disabled={!list.length}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} /> Export CSV
          </button>
          {!vendorId && (
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
            >
              <Plus size={18} /> Add Customer
            </button>
          )}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Email</th>
                {!vendorId && <th className="px-6 py-4">Vendor</th>}
                <th className="px-6 py-4">Products bought</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={vendorId ? 5 : 6} className="px-6 py-12 text-center">
                    <LoadingSpinner />
                  </td>
                </tr>
              ) : (
                list.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{c.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c.phone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c.email || '-'}</td>
                    {!vendorId && (
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-bold',
                            c.vendorId ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {c.vendorId ? (vendors.find(v => v.id === c.vendorId)?.name ?? c.vendorId) : 'Direct'}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => openPurchases(c)}
                        className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                      >
                        <ShoppingBag size={14} /> View purchases
                      </button>
                    </td>
                    <td className="px-6 py-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="p-2 text-brand hover:bg-orange-50 rounded-lg"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(c)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Customer' : 'Add Customer'}</h3>
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
                  <label className="text-xs font-bold text-gray-400 uppercase">Phone</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
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
                {!vendorId && (
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Vendor</label>
                    <select
                      value={form.vendorId}
                      onChange={e => setForm({ ...form, vendorId: e.target.value })}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    >
                      <option value="">Direct (Factory Purchase)</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
        {purchasesModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setPurchasesModal(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-4 sm:p-6 border-b border-gray-100 shrink-0">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <ShoppingBag size={22} className="text-brand" /> Products bought by {purchasesModal.customer.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">Products purchased and the vendor they bought from</p>
              </div>
              <div className="max-h-[60vh] overflow-y-auto overflow-x-auto min-h-0">
                {purchasesModal.purchases.length === 0 ? (
                  <p className="p-6 text-gray-500 text-center">
                    No purchases recorded yet. Sales are matched by customer phone.
                  </p>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-xs font-bold text-gray-400 uppercase">
                        <th className="px-3 py-2 sm:px-6 sm:py-3">Product</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3">Vendor</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3">Barcode</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {purchasesModal.purchases.map((p, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 sm:px-6 sm:py-3 font-medium">{p.productName}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-3 text-sm text-purple-600">{p.vendorName}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-3 text-sm font-mono text-gray-600">{p.barcode}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-3 text-sm text-gray-600">
                            {formatDate(p.purchaseDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="p-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setPurchasesModal(null)}
                  className="w-full py-2 border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
