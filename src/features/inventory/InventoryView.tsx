import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Plus, Trash2, AlertCircle, AlertTriangle, ArrowUpDown, Barcode, Download, Upload } from 'lucide-react';
import { cn, exportToCsv } from '../../lib/utils';
import { api } from '../../api';
import type { Product } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { CsvImport } from '../../components/ui/CsvImport';
import { useDebounce } from '../../hooks/useDebounce';

export function InventoryView() {
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<keyof Product>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [products, setProducts] = useState<Product[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const debouncedBarcodeSearch = useDebounce(barcodeSearch, 250);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', barcodePrefix: '', quantity: 10, description: '', rewardPointsValue: 0, warrantyApplicable: true, warrantyMonths: 24, price: 0, hsnCode: '', gstRate: 18 });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addStockModal, setAddStockModal] = useState<Product | null>(null);
  const [addStockForm, setAddStockForm] = useState({ quantity: 10 });
  const [barcodeDetailsModal, setBarcodeDetailsModal] = useState<{ product: Product; batches: { date: string; barcodeFirst: string; barcodeLast: string; count: number }[] } | null>(null);
  useEffect(() => {
    api.products.list(debouncedBarcodeSearch || undefined)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [debouncedBarcodeSearch]);

  const sortedProducts = [...products].sort((a, b) => {
    const valA = a[sortBy];
    const valB = b[sortBy];

    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    }
    return 0;
  });

  const toggleSort = (field: keyof Product) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleDelete = () => {
    if (productToDelete) {
      api.products.delete(productToDelete.id)
        .then(() => {
          setProducts(products.filter(p => p.id !== productToDelete.id));
          setProductToDelete(null);
        })
        .catch((err) => toast(err.message, 'error'));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Inventory Management</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => sortedProducts.length && exportToCsv(sortedProducts.map((p) => ({ id: p.id, name: p.name, price: p.price, totalInventory: p.totalInventory ?? p.stock ?? 0, remainingInventory: p.remainingInventory ?? p.stock ?? 0, soldCount: p.soldCount ?? 0 })), 'inventory')} disabled={!sortedProducts.length} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} /> Export CSV
          </button>
          <div className="relative flex-1 min-w-[150px] sm:min-w-[200px]">
            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Scan or enter barcode..."
              value={barcodeSearch}
              onChange={(e) => setBarcodeSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]"
              autoComplete="off"
            />
          </div>
          <button type="button" onClick={() => setCsvImportOpen(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50">
            <Upload size={18} /> Import CSV
          </button>
          <button type="button" onClick={() => setAddModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold shadow-lg shadow-[#F27D26]/20">
            <Plus size={18} /> Add Product
          </button>
        </div>
      </div>

      {/* Sorting Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2 sm:gap-4 overflow-x-auto">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Sort By:</span>
        <div className="flex items-center gap-2">
          {[
            { label: 'Name', key: 'name' },
            { label: 'Price', key: 'price' },
            { label: 'Stock', key: 'stock' }
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => toggleSort(item.key as keyof Product)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                sortBy === item.key
                  ? "bg-[#F27D26] text-white shadow-md shadow-[#F27D26]/20"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              )}
            >
              {item.label}
              {sortBy === item.key && (
                <ArrowUpDown size={14} className={cn("transition-transform", sortOrder === 'desc' && "rotate-180")} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {loading ? (
          <div className="col-span-full py-20"><LoadingSpinner /></div>
        ) : sortedProducts.length === 0 ? (
          <div className="col-span-full bg-white p-12 rounded-2xl border border-gray-100 text-center">
            <Package className="mx-auto mb-3 text-gray-300" size={48} />
            <p className="text-gray-500 font-medium text-lg">No products in inventory</p>
            <p className="text-gray-400 text-sm mt-1">Add your first product to get started</p>
            <button type="button" onClick={() => setAddModalOpen(true)} className="mt-4 px-6 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold">Add Product</button>
          </div>
        ) : (
        sortedProducts.map((p) => (
          <div key={p.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group">
            <button
              onClick={() => setProductToDelete(p)}
              className="absolute top-4 right-4 p-2 bg-rose-50 text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-100"
            >
              <Trash2 size={18} />
            </button>
            <div className="w-full aspect-square bg-gray-50 rounded-xl mb-4 flex items-center justify-center overflow-hidden">
               <img
                src={`https://picsum.photos/seed/pump${p.id}/400/400`}
                alt={p.name}
                className="w-full h-full object-cover mix-blend-multiply opacity-80"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg">{p.name}</h3>
              <button type="button" onClick={() => api.products.barcodeDetails(p.id).then((batches) => setBarcodeDetailsModal({ product: p, batches })).catch(() => setBarcodeDetailsModal({ product: p, batches: [] }))} className="text-xs font-medium text-[#F27D26] hover:underline flex items-center gap-1">
                <Barcode size={12} /> See barcode
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { setAddStockModal(p); setAddStockForm({ quantity: 10 }); }} className="text-xs font-medium text-[#F27D26] hover:underline">Add stock</button>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className={cn(
                  "px-3 py-2 rounded-xl transition-colors flex-1",
                  (p.remainingInventory ?? p.stock ?? 0) < 10 ? "bg-amber-50 border border-amber-100" : ""
                )}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total inventory</p>
                    {(p.remainingInventory ?? p.stock ?? 0) < 10 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full uppercase tracking-tight">
                        <AlertTriangle size={10} />
                        Low
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "font-bold text-lg leading-none",
                    (p.remainingInventory ?? p.stock ?? 0) < 10 ? "text-amber-700" : "text-gray-900"
                  )}>
                    {p.totalInventory ?? p.stock ?? 0} <span className="text-xs font-normal opacity-60">units</span>
                  </p>
                </div>
                <div className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 flex-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">With Admin</p>
                  <p className="font-bold text-lg text-blue-700 leading-none">
                    {p.remainingInventory ?? p.stock ?? 0} <span className="text-xs font-normal opacity-60">units</span>
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">In warehouse</p>
                </div>
                <div className="px-3 py-2 rounded-xl bg-purple-50 border border-purple-100 flex-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">With Vendors</p>
                  <p className="font-bold text-lg text-purple-700 leading-none">
                    {p.withVendors ?? 0} <span className="text-xs font-normal opacity-60">units</span>
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Not yet sold</p>
                </div>
                <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 flex-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Sold</p>
                  <p className="font-bold text-lg text-emerald-700 leading-none">
                    {p.soldCount ?? 0} <span className="text-xs font-normal opacity-60">units</span>
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">To customers</p>
                </div>
              </div>
              <div className="flex justify-end items-center pt-2 border-t border-gray-50">
                <div className="text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Price</p>
                  <p className="font-bold text-lg text-emerald-600 leading-none">₹{p.price.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        ))
        )}
      </div>

      {/* Add Product Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Add Product</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!addForm.barcodePrefix.trim()) { toast('Enter barcode prefix', 'error'); return; }
                if (!addForm.quantity || addForm.quantity < 1) { toast('Enter quantity', 'error'); return; }
                setAddSubmitting(true);
                try {
                  await api.products.create({
                    name: addForm.name,
                    barcodeMode: 'prefix',
                    barcodePrefix: addForm.barcodePrefix.trim(),
                    quantity: addForm.quantity,
                    description: addForm.description || undefined,
                    rewardPointsValue: addForm.rewardPointsValue,
                    warrantyApplicable: addForm.warrantyApplicable,
                    warrantyMonths: addForm.warrantyApplicable ? addForm.warrantyMonths : 0,
                    price: addForm.price,
                  });
                  setAddModalOpen(false);
                  setAddForm({ name: '', barcodePrefix: '', quantity: 10, description: '', rewardPointsValue: 0, warrantyApplicable: true, warrantyMonths: 24, price: 0, hsnCode: '', gstRate: 18 });
                  api.products.list(debouncedBarcodeSearch || undefined).then(setProducts);
                  toast('Product added successfully', 'success');
                } catch (err) { toast((err as Error).message, 'error'); }
                finally { setAddSubmitting(false); }
              }} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Name</label><input required value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Barcode Prefix</label><input required placeholder="e.g. SP, PUMP, A" value={addForm.barcodePrefix} onChange={(e) => setAddForm({ ...addForm, barcodePrefix: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26] font-mono" autoComplete="off" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Quantity</label><input type="number" required min={1} max={10000} value={addForm.quantity || ''} onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                </div>
                <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">Barcodes auto-generated: <span className="font-mono font-medium">{addForm.barcodePrefix || 'SP'}001</span> to <span className="font-mono font-medium">{addForm.barcodePrefix || 'SP'}{String(addForm.quantity || 10).padStart(3, '0')}</span></p>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Description</label><input placeholder="Product description" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-gray-400 uppercase">HSN Code</label><input value={addForm.hsnCode ?? ''} onChange={(e) => setAddForm({ ...addForm, hsnCode: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26] font-mono" placeholder="e.g. 8413" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">GST Rate (%)</label><input type="number" min={0} max={28} value={addForm.gstRate ?? 18} onChange={(e) => setAddForm({ ...addForm, gstRate: e.target.value === '' ? 18 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                </div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Reward Points</label><input type="number" min={0} value={addForm.rewardPointsValue || ''} onChange={(e) => setAddForm({ ...addForm, rewardPointsValue: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Price (₹)</label><input type="number" required value={addForm.price || ''} onChange={(e) => setAddForm({ ...addForm, price: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Warranty</label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input type="checkbox" checked={addForm.warrantyApplicable} onChange={(e) => setAddForm({ ...addForm, warrantyApplicable: e.target.checked })} className="rounded text-[#F27D26]" />
                      <span className={addForm.warrantyApplicable ? "text-emerald-600 font-bold" : "text-gray-400"}>
                        {addForm.warrantyApplicable ? 'Applicable' : 'Not applicable'}
                      </span>
                    </label>
                  </div>
                  {addForm.warrantyApplicable && <input type="number" placeholder="Months" value={addForm.warrantyMonths || ''} onChange={(e) => setAddForm({ ...addForm, warrantyMonths: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" />}
                </div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={addSubmitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{addSubmitting ? 'Saving...' : 'Save'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
        {addStockModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddStockModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-2">Add stock to {addStockModal.name}</h3>
              <p className="text-sm text-gray-500 mb-4">New barcodes will continue from where the existing range left off — no overlaps.</p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!addStockForm.quantity || addStockForm.quantity < 1) { toast('Enter quantity', 'error'); return; }
                setAddSubmitting(true);
                try {
                  await api.products.addStock(addStockModal.id, { quantity: addStockForm.quantity, barcodeMode: 'prefix' });
                  setAddStockModal(null);
                  api.products.list(debouncedBarcodeSearch || undefined).then(setProducts);
                  toast('Stock added successfully', 'success');
                } catch (err) { toast((err as Error).message, 'error'); }
                finally { setAddSubmitting(false); }
              }} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Quantity to add</label><input type="number" required min={1} max={10000} value={addStockForm.quantity || ''} onChange={(e) => setAddStockForm({ ...addStockForm, quantity: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                {addStockModal.barcodeRange && (
                  <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">Current range: <span className="font-mono font-medium">{addStockModal.barcodeRange.first}</span> to <span className="font-mono font-medium">{addStockModal.barcodeRange.last}</span> — new barcodes will continue after <span className="font-mono font-medium">{addStockModal.barcodeRange.last}</span></p>
                )}
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setAddStockModal(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={addSubmitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{addSubmitting ? 'Adding...' : 'Add stock'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
        {barcodeDetailsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setBarcodeDetailsModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-bold flex items-center gap-2"><Barcode size={22} className="text-[#F27D26]" /> Barcode details — {barcodeDetailsModal.product.name}</h3>
                <p className="text-sm text-gray-500 mt-1">Ranges added by date</p>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {barcodeDetailsModal.batches.length === 0 ? (
                  <p className="p-6 text-gray-500 text-center">No barcode history yet.</p>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 sticky top-0"><tr className="text-xs font-bold text-gray-400 uppercase"><th className="px-6 py-3">Date</th><th className="px-6 py-3">Barcode range</th><th className="px-6 py-3">Quantity added</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {barcodeDetailsModal.batches.map((b, i) => (
                        <tr key={i}><td className="px-6 py-3 text-sm text-gray-600">{b.date}</td><td className="px-6 py-3 font-mono text-sm">{b.barcodeFirst} – {b.barcodeLast}</td><td className="px-6 py-3 font-medium">{b.count} units</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="p-4 border-t border-gray-100"><button type="button" onClick={() => setBarcodeDetailsModal(null)} className="w-full py-2 border border-gray-200 rounded-lg font-medium hover:bg-gray-50">Close</button></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {productToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProductToDelete(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-8"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-2xl font-bold mb-2">Delete Product?</h3>
                <p className="text-gray-500 mb-8">
                  Are you sure you want to delete <span className="font-bold text-gray-900">"{productToDelete.name}"</span>? This action cannot be undone.
                </p>
                <div className="flex gap-4 w-full">
                  <button
                    onClick={() => setProductToDelete(null)}
                    className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {csvImportOpen && (
        <CsvImport
          templateName="products"
          columns={[
            { key: 'name', label: 'Product Name', required: true },
            { key: 'price', label: 'Price', required: true },
            { key: 'barcodePrefix', label: 'Barcode Prefix', required: true },
            { key: 'quantity', label: 'Quantity', required: true },
            { key: 'description', label: 'Description' },
            { key: 'hsnCode', label: 'HSN Code' },
            { key: 'gstRate', label: 'GST Rate (%)' },
            { key: 'warrantyMonths', label: 'Warranty Months' },
            { key: 'rewardPoints', label: 'Reward Points' },
          ]}
          onClose={() => { setCsvImportOpen(false); api.products.list().then(setProducts).catch(() => {}); }}
          onImport={async (rows) => {
            let success = 0;
            const errors: string[] = [];
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i];
              try {
                await api.products.create({
                  name: r.name,
                  price: Number(r.price) || 0,
                  barcodePrefix: r.barcodePrefix,
                  quantity: Number(r.quantity) || 1,
                  barcodeMode: 'prefix' as const,
                  description: r.description || undefined,
                  hsnCode: r.hsnCode || undefined,
                  gstRate: r.gstRate ? Number(r.gstRate) : undefined,
                  warrantyMonths: r.warrantyMonths ? Number(r.warrantyMonths) : undefined,
                  rewardPointsValue: r.rewardPoints ? Number(r.rewardPoints) : undefined,
                });
                success++;
              } catch (err) {
                errors.push(`Row ${i + 1} (${r.name}): ${err instanceof Error ? err.message : 'Failed'}`);
              }
            }
            return { success, errors };
          }}
        />
      )}
    </motion.div>
  );
}
