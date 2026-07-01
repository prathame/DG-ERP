import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Plus, Trash2, AlertCircle, AlertTriangle, ArrowUpDown, Barcode, Download, Upload, Printer } from 'lucide-react';
import { cn, exportToCsv, formatDate } from '../../lib/utils';
import { api } from '../../api';
import type { Product } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { CsvImport } from '../../components/ui/CsvImport';
import { BarcodeLabelPrinter } from '../../components/ui/BarcodeLabelPrinter';
import { useDebounce } from '../../hooks/useDebounce';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { session } from '../../lib/session';

export function InventoryView() {
  const { toast } = useToast();
  const barcodeSystemEnabled = (() => { try { const u = (session.getUser() || {}); return u.barcodeSystemEnabled !== false; } catch { return true; } })();
  const inventoryTrackingEnabled = (() => { try { const u = (session.getUser() || {}); return u.inventoryTrackingEnabled !== false; } catch { return true; } })();
  const warrantyVisible = (() => { try { const u = (session.getUser() || {}); return u.tabConfig?.warranty?.visible !== false; } catch { return true; } })();
  const [sortBy, setSortBy] = useState<keyof Product>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [products, setProducts] = useState<Product[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [labelPrinterId, setLabelPrinterId] = useState<string | null>(null);
  const [labelBarcodeRange, setLabelBarcodeRange] = useState<{ first: string; last: string } | undefined>(undefined);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const debouncedBarcodeSearch = useDebounce(barcodeSearch, 250);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', barcodePrefix: '', quantity: 10, packs: 0, loosePieces: 0, description: '', rewardPointsValue: 0, warrantyApplicable: true, warrantyMonths: 24, price: 0, hsnCode: '', gstRate: 18, packSize: 1, packName: 'Piece', barcodePerBox: true });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addStockModal, setAddStockModal] = useState<Product | null>(null);
  const [addStockForm, setAddStockForm] = useState({ quantity: 10, packs: 0, loosePieces: 0, barcodePerBox: true });
  const [barcodeDetailsModal, setBarcodeDetailsModal] = useState<{ product: Product; batches: { date: string; barcodeFirst: string; barcodeLast: string; count: number }[] } | null>(null);
  useEscapeKey(() => {
    if (productToDelete) setProductToDelete(null);
    else if (barcodeDetailsModal) setBarcodeDetailsModal(null);
    else if (addStockModal) setAddStockModal(null);
    else if (csvImportOpen) setCsvImportOpen(false);
    else if (addModalOpen) setAddModalOpen(false);
  });

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
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand"
              autoComplete="off"
            />
          </div>
          <button type="button" onClick={() => setCsvImportOpen(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50">
            <Upload size={18} /> Import CSV
          </button>
          <button type="button" onClick={() => setAddModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold shadow-lg shadow-brand/20">
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
                  ? "bg-brand text-white shadow-md shadow-brand/20"
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

      {loading ? (
        <div className="py-20"><LoadingSpinner /></div>
      ) : sortedProducts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center">
          <Package className="mx-auto mb-3 text-gray-300" size={48} />
          <p className="text-gray-500 font-medium text-lg">No products in inventory</p>
          <p className="text-gray-400 text-sm mt-1">Add your first product to get started</p>
          <button type="button" onClick={() => setAddModalOpen(true)} className="mt-4 px-6 py-2 bg-brand text-white rounded-xl text-sm font-bold">Add Product</button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Price</th>
                  {inventoryTrackingEnabled && <><th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Total</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Admin</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center hidden lg:table-cell">Vendors</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center hidden lg:table-cell">Sold</th></>}
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedProducts.map((p) => {
                  const isLowStock = (p.remainingInventory ?? p.stock ?? 0) < 10;
                  return (
                    <tr key={p.id} className={cn("hover:bg-gray-50/50 transition-colors", isLowStock && "bg-amber-50/40")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900">{p.name}</span>
                          {isLowStock && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                              <AlertTriangle size={10} /> Low
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-sm text-emerald-600">₹{p.price.toLocaleString()}</span>
                        {(p.packSize || 1) > 1 && <span className="block text-[10px] text-gray-400">per {p.packName || 'Box'}</span>}
                      </td>
                      {inventoryTrackingEnabled && (() => {
                        const rawStock = p.remainingInventory ?? p.stock ?? 0;
                        const rawTotal = p.totalInventory ?? p.stock ?? 0;
                        const ps = p.packSize || 1;
                        const isBoxProduct = ps > 1;
                        const isBoxBarcode = p.barcodeUnitType === 'box';
                        const boxCount = isBoxBarcode ? rawStock : Math.floor(rawStock / ps);
                        const totalBoxCount = isBoxBarcode ? rawTotal : Math.floor(rawTotal / ps);
                        const pcsCount = isBoxBarcode ? rawStock * ps : rawStock;
                        const totalPcsCount = isBoxBarcode ? rawTotal * ps : rawTotal;
                        const loosePcs = isBoxBarcode ? 0 : rawStock % ps;
                        return <><td className="px-4 py-3 text-center">
                          {isBoxProduct ? <>
                            <span className={cn("font-semibold text-sm", isLowStock ? "text-amber-700" : "text-gray-900")}>{totalBoxCount}</span>
                            <span className="block text-[10px] text-gray-500 font-bold">{p.packName || 'Box'}es</span>
                          </> : <>
                            <span className={cn("font-semibold text-sm", isLowStock ? "text-amber-700" : "text-gray-900")}>{rawTotal}</span>
                            <span className="block text-[10px] text-gray-400">pcs</span>
                          </>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isBoxProduct ? <>
                            <span className="font-semibold text-sm text-blue-700">{boxCount}</span>
                            <span className="block text-[10px] text-gray-500 font-bold">{p.packName || 'Box'}es{loosePcs > 0 ? ` + ${loosePcs} pcs` : ''}</span>
                            <span className="block text-[10px] text-emerald-500">({pcsCount} pcs)</span>
                          </> : <>
                            <span className="font-semibold text-sm text-blue-700">{rawStock}</span>
                            <span className="block text-[10px] text-gray-400">pcs</span>
                          </>}
                        </td>
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          <span className="font-semibold text-sm text-purple-700">{p.withVendors ?? 0}</span>
                        </td>
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          <span className="font-semibold text-sm text-emerald-700">{p.soldCount ?? 0}</span>
                        </td></>;
                      })()}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => api.products.barcodeDetails(p.id).then((batches) => setBarcodeDetailsModal({ product: p, batches })).catch(() => setBarcodeDetailsModal({ product: p, batches: [] }))} className="p-1.5 text-brand hover:bg-orange-50 rounded-lg" title="Barcode Details">
                            <Barcode size={16} />
                          </button>
                          {inventoryTrackingEnabled && <button onClick={() => { setAddStockModal(p); setAddStockForm({ quantity: 10, packs: 0, loosePieces: 0, barcodePerBox: true }); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Add Stock">
                            <Plus size={16} />
                          </button>}
                          <button onClick={() => setProductToDelete(p)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile List */}
          <div className="sm:hidden space-y-2">
            {sortedProducts.map((p) => {
              const isLowStock = (p.remainingInventory ?? p.stock ?? 0) < 10;
              return (
                <div key={p.id} className={cn("bg-white rounded-xl border border-gray-100 p-3", isLowStock && "border-amber-200 bg-amber-50/30")}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm text-gray-900 truncate">{p.name}</span>
                      {isLowStock && <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
                    </div>
                    <span className="font-semibold text-sm text-emerald-600 shrink-0">₹{p.price.toLocaleString()}{(p.packSize || 1) > 1 ? `/${p.packName || 'Box'}` : ''}</span>
                  </div>
                  {inventoryTrackingEnabled && <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>Total: <strong className={isLowStock ? "text-amber-700" : "text-gray-900"}>{p.totalInventory ?? p.stock ?? 0}</strong></span>
                    <span>Admin: <strong className="text-blue-700">{p.remainingInventory ?? p.stock ?? 0}</strong></span>
                    <span>Vendors: <strong className="text-purple-700">{p.withVendors ?? 0}</strong></span>
                    <span>Sold: <strong className="text-emerald-700">{p.soldCount ?? 0}</strong></span>
                  </div>}
                  <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-gray-100">
                    <button onClick={() => api.products.barcodeDetails(p.id).then((batches) => setBarcodeDetailsModal({ product: p, batches })).catch(() => setBarcodeDetailsModal({ product: p, batches: [] }))} className="p-1.5 text-brand hover:bg-orange-50 rounded-lg" title="Barcode Details">
                      <Barcode size={16} />
                    </button>
                    {inventoryTrackingEnabled && <button onClick={() => { setAddStockModal(p); setAddStockForm({ quantity: 10, packs: 0, loosePieces: 0, barcodePerBox: true }); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Add Stock">
                      <Plus size={16} />
                    </button>}
                    <button onClick={() => setProductToDelete(p)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

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
                const totalQty = addForm.packSize > 1 ? addForm.packs : addForm.quantity;
                if (!totalQty || totalQty < 1) { toast('Enter quantity', 'error'); return; }
                setAddSubmitting(true);
                try {
                  await api.products.create({
                    name: addForm.name,
                    barcodeMode: 'prefix',
                    barcodePrefix: addForm.barcodePrefix.trim(),
                    quantity: addForm.packSize > 1 ? addForm.packs : addForm.quantity,
                    description: addForm.description || undefined,
                    rewardPointsValue: addForm.rewardPointsValue,
                    warrantyApplicable: addForm.warrantyApplicable,
                    warrantyMonths: addForm.warrantyApplicable ? addForm.warrantyMonths : 0,
                    price: addForm.price,
                    packSize: addForm.packSize > 1 ? addForm.packSize : undefined,
                    packName: addForm.packSize > 1 ? addForm.packName : undefined,
                    barcodePerBox: addForm.packSize > 1 ? addForm.barcodePerBox : undefined,
                  });
                  setAddModalOpen(false);
                  setAddForm({ name: '', barcodePrefix: '', quantity: 10, packs: 0, loosePieces: 0, description: '', rewardPointsValue: 0, warrantyApplicable: true, warrantyMonths: 24, price: 0, hsnCode: '', gstRate: 18, packSize: 1, packName: 'Piece', barcodePerBox: true });
                  api.products.list(debouncedBarcodeSearch || undefined).then(setProducts);
                  toast('Product added successfully', 'success');
                } catch (err) { toast((err as Error).message, 'error'); }
                finally { setAddSubmitting(false); }
              }} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Name</label><input required value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                {inventoryTrackingEnabled && <><div><label className="text-xs font-bold text-gray-400 uppercase">Barcode Prefix</label><input required placeholder="e.g. SP, PUMP, A" value={addForm.barcodePrefix} onChange={(e) => setAddForm({ ...addForm, barcodePrefix: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand font-mono" autoComplete="off" /></div>
                </>}
                <div><label className="text-xs font-bold text-gray-400 uppercase">Description</label><input placeholder="Product description" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-bold text-gray-400 uppercase">HSN Code</label><input value={addForm.hsnCode ?? ''} onChange={(e) => setAddForm({ ...addForm, hsnCode: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand font-mono" placeholder="e.g. 8413" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase">GST Rate (%)</label><input type="number" min={0} max={28} value={addForm.gstRate ?? 18} onChange={(e) => setAddForm({ ...addForm, gstRate: e.target.value === '' ? 18 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                </div>

                {/* Unit Type: Piece or Box */}
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Unit Type</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAddForm({ ...addForm, packSize: 1, packName: 'Piece', packs: 0, loosePieces: 0 })} className={cn("flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all", addForm.packSize <= 1 ? "bg-brand text-white border-brand" : "border-gray-200 text-gray-600 hover:border-brand")}>
                      Piece
                    </button>
                    <button type="button" onClick={() => setAddForm({ ...addForm, packSize: addForm.packSize > 1 ? addForm.packSize : 10, packName: 'Box', quantity: 0 })} className={cn("flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all", addForm.packSize > 1 ? "bg-brand text-white border-brand" : "border-gray-200 text-gray-600 hover:border-brand")}>
                      Box
                    </button>
                  </div>
                </div>

                {addForm.packSize > 1 ? (
                  <>
                    <div><label className="text-xs font-bold text-gray-400 uppercase">Pieces per Box</label><input type="text" inputMode="numeric" pattern="[0-9]*" value={addForm.packSize || ''} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setAddForm({ ...addForm, packSize: v === '' ? 0 : parseInt(v, 10) }); }} onBlur={() => { if (addForm.packSize < 2) setAddForm({ ...addForm, packSize: 2 }); }} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand" placeholder="e.g. 10, 12, 100" /></div>
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase">Number of {addForm.packName || 'Box'}es</label>
                      <input type="number" min={1} max={10000} value={addForm.packs || ''} onChange={(e) => setAddForm({ ...addForm, packs: parseInt(e.target.value) || 0 })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="0" />
                      <p className="text-xs text-emerald-600 font-medium mt-1">= {(addForm.packs || 0) * addForm.packSize} pieces ({addForm.packs || 0} × {addForm.packSize} pcs)</p>
                    </div>
                    {inventoryTrackingEnabled &&
                      <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">📦 {addForm.packs || 0} barcode labels (1 per {addForm.packName || 'box'}): <span className="font-mono font-medium">{addForm.barcodePrefix || 'SP'}001</span> to <span className="font-mono font-medium">{addForm.barcodePrefix || 'SP'}{String(addForm.packs || 1).padStart(3, '0')}</span></p>
                    }
                    <div>
                      <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Price per {addForm.packName || 'Box'} (₹)</label>
                      <input type="number" required value={addForm.price || ''} onChange={(e) => setAddForm({ ...addForm, price: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder={`Price per ${addForm.packName || 'box'}`} />
                      {addForm.price > 0 && addForm.packSize > 0 && <p className="text-[10px] text-gray-400 mt-0.5">= ₹{Math.round(addForm.price / (addForm.packSize || 1))} per piece</p>}
                    </div>
                  </>
                ) : (
                  <>
                    {inventoryTrackingEnabled && <><div><label className="text-xs font-bold text-gray-400 uppercase">Quantity</label><input type="number" required min={1} max={10000} value={addForm.quantity || ''} onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                    <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">Barcodes: <span className="font-mono font-medium">{addForm.barcodePrefix || 'SP'}001</span> to <span className="font-mono font-medium">{addForm.barcodePrefix || 'SP'}{String(addForm.quantity || 10).padStart(3, '0')}</span></p></>}
                    <div><label className="text-xs font-bold text-gray-400 uppercase">Price (₹ per Piece)</label><input type="number" required value={addForm.price || ''} onChange={(e) => setAddForm({ ...addForm, price: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                  </>
                )}

                <div><label className="text-xs font-bold text-gray-400 uppercase">Reward Points</label><input type="number" min={0} value={addForm.rewardPointsValue || ''} onChange={(e) => setAddForm({ ...addForm, rewardPointsValue: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                {warrantyVisible && <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Warranty</label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input type="checkbox" checked={addForm.warrantyApplicable} onChange={(e) => setAddForm({ ...addForm, warrantyApplicable: e.target.checked })} className="rounded text-brand" />
                      <span className={addForm.warrantyApplicable ? "text-emerald-600 font-bold" : "text-gray-400"}>
                        {addForm.warrantyApplicable ? 'Applicable' : 'Not applicable'}
                      </span>
                    </label>
                  </div>
                  {addForm.warrantyApplicable && <input type="number" placeholder="Months" value={addForm.warrantyMonths || ''} onChange={(e) => setAddForm({ ...addForm, warrantyMonths: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" />}
                </div>}
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setAddModalOpen(false)} className="flex-1 py-2 border rounded-xl font-medium">Cancel</button><button type="submit" disabled={addSubmitting} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">{addSubmitting ? 'Saving...' : 'Save'}</button></div>
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
                const hasPack = (addStockModal.packSize || 1) > 1;
                const stockQty = hasPack ? addStockForm.packs : addStockForm.quantity;
                if (!stockQty || stockQty < 1) { toast('Enter quantity', 'error'); return; }
                setAddSubmitting(true);
                try {
                  await api.products.addStock(addStockModal.id, { quantity: stockQty, barcodeMode: 'prefix', barcodePerBox: hasPack, packSize: addStockModal.packSize });
                  setAddStockModal(null);
                  api.products.list(debouncedBarcodeSearch || undefined).then(setProducts);
                  toast('Stock added successfully', 'success');
                } catch (err) { toast((err as Error).message, 'error'); }
                finally { setAddSubmitting(false); }
              }} className="space-y-4">
                {(addStockModal.packSize || 1) > 1 ? (
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase">Number of {addStockModal.packName || 'Box'}es to add</label>
                    <input type="number" min={1} max={10000} value={addStockForm.packs || ''} onChange={(e) => setAddStockForm({ ...addStockForm, packs: parseInt(e.target.value) || 0 })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="0" />
                    <p className="text-xs text-emerald-600 font-medium mt-1">= {(addStockForm.packs || 0) * (addStockModal.packSize || 1)} pieces ({addStockForm.packs || 0} {addStockModal.packName || 'Box'}es × {addStockModal.packSize} pcs)</p>
                    <p className="text-[10px] text-gray-500 bg-gray-50 px-3 py-2 rounded-lg mt-2">📦 {addStockForm.packs || 0} barcode labels (1 per {addStockModal.packName ?? 'box'})</p>
                  </div>
                ) : (
                  <div><label className="text-xs font-bold text-gray-400 uppercase">Quantity to add</label><input type="number" required min={1} max={10000} value={addStockForm.quantity || ''} onChange={(e) => setAddStockForm({ ...addStockForm, quantity: e.target.value === '' ? 0 : parseInt(e.target.value, 10) })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                )}
                {addStockModal.barcodeRange && (
                  <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">Current range: <span className="font-mono font-medium">{addStockModal.barcodeRange.first}</span> to <span className="font-mono font-medium">{addStockModal.barcodeRange.last}</span> — new barcodes will continue after <span className="font-mono font-medium">{addStockModal.barcodeRange.last}</span></p>
                )}
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setAddStockModal(null)} className="flex-1 py-2 border rounded-xl font-medium">Cancel</button><button type="submit" disabled={addSubmitting} className="flex-1 py-2 bg-brand text-white rounded-xl font-bold">{addSubmitting ? 'Adding...' : 'Add stock'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
        {barcodeDetailsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setBarcodeDetailsModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-bold flex items-center gap-2"><Barcode size={22} className="text-brand" /> Barcode details — {barcodeDetailsModal.product.name}</h3>
                <p className="text-sm text-gray-500 mt-1">Ranges added by date</p>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {barcodeDetailsModal.batches.length === 0 ? (
                  <p className="p-6 text-gray-500 text-center">No barcode history yet.</p>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 sticky top-0"><tr className="text-xs font-bold text-gray-400 uppercase"><th className="px-6 py-3">Date</th><th className="px-6 py-3">Barcode range</th><th className="px-6 py-3">Qty</th><th className="px-6 py-3"></th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {barcodeDetailsModal.batches.map((b, i) => (
                        <tr key={i}>
                          <td className="px-6 py-3 text-sm text-gray-600">{formatDate(b.date)}</td>
                          <td className="px-6 py-3 font-mono text-sm">{b.barcodeFirst} – {b.barcodeLast}</td>
                          <td className="px-6 py-3 font-medium">{b.count} units</td>
                          <td className="px-6 py-3"><button type="button" onClick={() => { setLabelPrinterId(barcodeDetailsModal.product.id); setLabelBarcodeRange({ first: b.barcodeFirst, last: b.barcodeLast }); }} className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg"><Printer size={12} /> Print</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="p-4 border-t border-gray-100"><button type="button" onClick={() => setBarcodeDetailsModal(null)} className="w-full py-2 border border-gray-200 rounded-xl font-medium hover:bg-gray-50">Close</button></div>
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
      {labelPrinterId && (
        <BarcodeLabelPrinter productId={labelPrinterId} barcodeRange={labelBarcodeRange} onClose={() => { setLabelPrinterId(null); setLabelBarcodeRange(undefined); }} />
      )}
      {csvImportOpen && (
        <CsvImport
          templateName="products"
          columns={[
            { key: 'name', label: 'Product Name', required: true },
            { key: 'price', label: 'Price', required: true },
            { key: 'barcodePrefix', label: 'Barcode Prefix', required: true },
            { key: 'quantity', label: 'Quantity (total pieces)', required: true },
            { key: 'packSize', label: 'Pack Size (pieces per box, leave empty for single piece)' },
            { key: 'packName', label: 'Pack Name (Box/Carton/Pack, leave empty for Piece)' },
            { key: 'priceType', label: 'Price is per (box or piece, default: as-is)' },
            { key: 'barcodeOn', label: 'Barcode On (box or piece, default: piece)' },
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
                const pSize = Number(r.packSize) || 1;
                const isBox = pSize > 1;
                const rawPrice = Number(r.price) || 0;
                const barcodePerBox = isBox && (r.barcodeOn || '').toLowerCase() === 'box';
                await api.products.create({
                  name: r.name,
                  price: rawPrice,
                  barcodePrefix: r.barcodePrefix,
                  quantity: Number(r.quantity) || 1,
                  barcodeMode: 'prefix' as const,
                  packSize: isBox ? pSize : undefined,
                  packName: isBox ? (r.packName || 'Box') : undefined,
                  barcodePerBox: barcodePerBox || undefined,
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
