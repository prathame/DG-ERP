import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Search, Plus, X, Package, Download, Barcode } from 'lucide-react';
import { cn, exportToCsv, formatDate } from '../../lib/utils';
import { api } from '../../api';
import type { Warranty } from '../../types';
import { useToast, LoadingSpinner, DateRangeFilter, PaginationControls } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

export function WarrantyView({ user }: { user: { id: string; role?: string; vendorId?: string } | null }) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsWarranty, setDetailsWarranty] = useState<Warranty | null>(null);
  const [detailsForm, setDetailsForm] = useState({ status: '' as string, replacedBarcode: '' });
  const [detailsSubmitting, setDetailsSubmitting] = useState(false);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [formData, setFormData] = useState({ barcode: '', customerName: '', customerPhone: '' });
  const [submitting, setSubmitting] = useState(false);

  const vendorId = user?.role === 'Vendor' ? user?.vendorId : undefined;
  const [warrantyPage, setWarrantyPage] = useState(1);
  const [warrantyTotalPages, setWarrantyTotalPages] = useState(1);
  const [warrantyTotal, setWarrantyTotal] = useState(0);
  const [warrantyDateFilter, setWarrantyDateFilter] = useState({ range: 'all', from: '', to: '' });

  const loadWarranties = (page = 1) => {
    api.warranties.list({ search: debouncedSearch || undefined, status: statusFilter !== 'All Status' ? statusFilter : undefined, vendorId, page, dateRange: warrantyDateFilter.range !== 'all' && warrantyDateFilter.range !== 'custom' ? warrantyDateFilter.range : undefined, dateFrom: warrantyDateFilter.range === 'custom' ? warrantyDateFilter.from : undefined, dateTo: warrantyDateFilter.range === 'custom' ? warrantyDateFilter.to : undefined })
      .then((r) => { setWarranties(r.data); setWarrantyPage(r.page); setWarrantyTotalPages(r.totalPages); setWarrantyTotal(r.total); })
      .catch(() => setWarranties([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadWarranties(1); }, [debouncedSearch, statusFilter, vendorId, warrantyDateFilter]);

  const refreshWarranties = () => loadWarranties(warrantyPage);

  const handleActivateWarranty = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    api.warranties.create(formData)
      .then(() => {
        setIsModalOpen(false);
        setFormData({ barcode: '', customerName: '', customerPhone: '' });
        refreshWarranties();
        toast('Warranty activated successfully', 'success');
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const openDetails = (w: Warranty) => {
    setDetailsWarranty(w);
    setDetailsForm({ status: w.status, replacedBarcode: w.replacedBarcode ?? '' });
  };

  const handleDetailsSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailsWarranty) return;
    setDetailsSubmitting(true);
    api.warranties.update(detailsWarranty.id, {
      status: detailsForm.status,
      replacedBarcode: detailsForm.replacedBarcode || null,
    })
      .then((updated) => {
        setDetailsWarranty(updated);
        setDetailsForm({ status: updated.status, replacedBarcode: updated.replacedBarcode ?? '' });
        refreshWarranties();
        toast('Warranty updated', 'success');
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setDetailsSubmitting(false));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Warranty Management</h2>
          <p className="text-sm text-gray-500">Track and manage product warranties and claims</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => warranties.length && exportToCsv(warranties.map((w) => ({ id: w.id, barcode: w.barcode ?? w.id, productName: w.productName ?? '', customerName: w.customerName, customerPhone: w.customerPhone, activationDate: w.activationDate, expiryDate: w.expiryDate, status: w.status })), 'warranties')} disabled={!warranties.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark transition-colors shadow-lg shadow-brand/20"
          >
            <Plus size={18} />
            Activate New Warranty
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 bg-gray-50/50 space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search by Barcode or Customer Name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand transition-all"
              />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand"
          >
            <option>All Status</option>
            <option>Active</option>
            <option>Expired</option>
            <option>Under Claim</option>
          </select>
          </div>
          <DateRangeFilter value={warrantyDateFilter} onChange={(v) => { setWarrantyDateFilter(v); setWarrantyPage(1); }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                <th className="px-3 py-3 sm:px-6 sm:py-4">Barcode</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Customer</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Activation Date</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Expiry Date</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Status</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr>
              ) : warranties.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center">
                  <ShieldCheck className="mx-auto mb-3 text-gray-300" size={40} />
                  <p className="text-gray-500 font-medium">No warranties found</p>
                  <p className="text-gray-400 text-sm mt-1">Warranties are auto-created when sales are recorded</p>
                </td></tr>
              ) : (
              warranties.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                        <Package size={16} className="text-gray-400" />
                      </div>
                      <span className="text-sm font-bold">{w.barcode || w.id}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <div>
                      <p className="text-sm font-bold">{w.customerName}</p>
                      <p className="text-xs text-gray-500">{w.customerPhone}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{formatDate(w.activationDate)}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{formatDate(w.expiryDate)}</td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <span className={cn(
                      "text-xs font-bold px-2.5 py-1 rounded-full",
                      w.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                      w.status === 'Expired' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'
                    )}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <button type="button" onClick={() => openDetails(w)} className="text-xs font-bold text-brand hover:underline">View Details</button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls page={warrantyPage} totalPages={warrantyTotalPages} total={warrantyTotal} onPageChange={loadWarranties} />
      </div>

      {/* Activation Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">Activate Warranty</h3>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <form className="space-y-6" onSubmit={handleActivateWarranty}>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Barcode (scan or enter)</label>
                    <div className="relative">
                      <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        placeholder="Scan product barcode or enter"
                        value={formData.barcode}
                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-brand outline-none transition-all font-mono"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Customer Name</label>
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={formData.customerName}
                        onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-brand outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Phone Number</label>
                      <input
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={formData.customerPhone}
                        onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-brand outline-none transition-all"
                      />
                    </div>
                  </div>

<button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-brand text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-brand/20 hover:bg-brand-dark transition-all transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {submitting ? 'Activating...' : 'Activate Warranty'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
        {detailsWarranty && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDetailsWarranty(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">Warranty Details</h3>
                  <button type="button" onClick={() => setDetailsWarranty(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-xs font-bold text-gray-400 uppercase">Product</p><p className="font-medium">{detailsWarranty.productName ?? '-'}</p></div>
                    <div><p className="text-xs font-bold text-gray-400 uppercase">Barcode</p><p className="font-mono font-medium">{detailsWarranty.barcode ?? '-'}</p></div>
                    <div><p className="text-xs font-bold text-gray-400 uppercase">Customer</p><p className="font-medium">{detailsWarranty.customerName}</p></div>
                    <div><p className="text-xs font-bold text-gray-400 uppercase">Phone</p><p className="font-medium">{detailsWarranty.customerPhone}</p></div>
                    <div><p className="text-xs font-bold text-gray-400 uppercase">Activation</p><p className="font-medium">{formatDate(detailsWarranty.activationDate)}</p></div>
                    <div><p className="text-xs font-bold text-gray-400 uppercase">Expiry</p><p className="font-medium">{formatDate(detailsWarranty.expiryDate)}</p></div>
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Item Replaced</p>
                  {detailsWarranty.replacedBarcode ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <p className="text-sm text-emerald-800 flex items-center gap-2"><Package size={14} /> New barcode: <span className="font-mono font-bold">{detailsWarranty.replacedBarcode}</span></p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No replacement recorded</p>
                  )}
                </div>
                <form onSubmit={handleDetailsSave} className="space-y-4 border-t border-gray-100 pt-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Status</label>
                      <select value={detailsForm.status} onChange={(e) => setDetailsForm({ ...detailsForm, status: e.target.value })} className="w-full px-6 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand">
                        <option value="Active">Active</option>
                        <option value="Under Claim">Under Claim (Under Repair)</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Replaced Barcode</label>
                      <input type="text" placeholder="New barcode if item replaced" value={detailsForm.replacedBarcode} onChange={(e) => setDetailsForm({ ...detailsForm, replacedBarcode: e.target.value })} className="w-full px-6 py-2 border border-gray-200 rounded-lg font-mono focus:ring-2 focus:ring-brand" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setDetailsWarranty(null)} className="flex-1 py-2 border border-gray-200 rounded-lg font-medium">Close</button>
                    <button type="submit" disabled={detailsSubmitting} className="flex-1 py-2 bg-brand text-white rounded-lg font-bold">{detailsSubmitting ? 'Saving...' : 'Save Changes'}</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
