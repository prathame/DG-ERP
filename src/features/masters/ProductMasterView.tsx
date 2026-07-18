import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { api } from '../../api';
import type { Product } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

/** Catalog-only product master (no stock/barcodes) — used by Offline Mobile service. */
export function ProductMasterView({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: '', sku: '', price: 0, gstPercent: 18 });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api.products
      .list(debouncedSearch || undefined)
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
    onRefresh();
  };
  useEffect(() => {
    setLoading(true);
    load();
  }, [debouncedSearch]);

  const gstOf = (p: Product) => Number((p as Product & { gstPercent?: number }).gstPercent ?? p.gstRate ?? 18) || 18;

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', sku: '', price: 0, gstPercent: 18 });
    setModalOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: (p as Product & { sku?: string | null }).sku ?? '',
      price: p.price ?? 0,
      gstPercent: gstOf(p),
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('Product name is required', 'error');
      return;
    }
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      price: Number(form.price) || 0,
      gstPercent: Number(form.gstPercent) || 18,
    };
    (editing
      ? api.products.update(editing.id, payload as Partial<Product>)
      : api.products.create(payload as Parameters<typeof api.products.create>[0])
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
    api.products
      .delete(deleteTarget.id)
      .then(() => {
        setDeleteTarget(null);
        load();
      })
      .catch(err => toast(err.message, 'error'));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-xl font-bold">Products</h2>
          <p className="text-xs sm:text-sm text-gray-500">Catalog for price lists &amp; invoices (no stock)</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"
        >
          <Plus size={18} /> Add Product
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-gray-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search products..."
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
                <th className="px-3 py-3 sm:px-6 sm:py-4">Name</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">SKU</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Price</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">GST %</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <LoadingSpinner />
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    No products yet — add one for price lists and invoices
                  </td>
                </tr>
              ) : (
                list.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 sm:px-6 sm:py-4 font-medium">{p.name}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600 font-mono">
                      {(p as Product & { sku?: string | null }).sku || '—'}
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm">₹{(p.price ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{gstOf(p)}%</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="p-2 text-brand hover:bg-orange-50 rounded-lg"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
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
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Product' : 'Add Product'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    placeholder="e.g. AMC Service"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">SKU</label>
                  <input
                    value={form.sku}
                    onChange={e => setForm({ ...form, sku: e.target.value })}
                    className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Price</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.price || ''}
                      onChange={e => setForm({ ...form, price: e.target.value === '' ? 0 : Number(e.target.value) })}
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">GST %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.gstPercent || ''}
                      onChange={e =>
                        setForm({
                          ...form,
                          gstPercent: e.target.value === '' ? 0 : Number(e.target.value),
                        })
                      }
                      className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand"
                    />
                  </div>
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
              className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6"
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
      </AnimatePresence>
    </motion.div>
  );
}
