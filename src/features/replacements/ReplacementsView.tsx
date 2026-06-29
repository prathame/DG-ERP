import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn, exportToCsv, formatDate } from '../../lib/utils';
import { api, ReplacementRecord } from '../../api';
import { useToast, LoadingSpinner } from '../../components/ui';

export function ReplacementsView({ user }: { user: { id: string; role?: string; vendorId?: string } | null }) {
  const { toast } = useToast();
  const userVendorId = user?.role === 'Vendor' ? user?.vendorId : undefined;
  const [replacements, setReplacements] = useState<ReplacementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ oldBarcode: '', newBarcode: '', customerName: '', customerPhone: '', replacedDate: new Date().toISOString().slice(0, 10), reason: '' });
  const [oldBarcodeValidation, setOldBarcodeValidation] = useState<{ valid: boolean; vendorId?: string; vendorName?: string; productName?: string | null; error?: string } | null>(null);
  const [newBarcodeValidation, setNewBarcodeValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const load = () => {
    api.replacements.list(userVendorId).then(setReplacements).catch(() => []).finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); load(); }, [userVendorId]);

  const handleValidateOld = () => {
    if (!form.oldBarcode.trim()) { setOldBarcodeValidation(null); return; }
    setOldBarcodeValidation(null);
    api.replacements.validateOld(form.oldBarcode.trim(), userVendorId ?? undefined)
      .then((r) => {
        setOldBarcodeValidation(r);
        if (r.valid && (r.customerName || r.customerPhone)) {
          setForm((f) => ({
            ...f,
            customerName: r.customerName ?? f.customerName,
            customerPhone: r.customerPhone ?? f.customerPhone,
          }));
        }
      })
      .catch(() => setOldBarcodeValidation({ valid: false, error: 'Validation failed' }));
    setNewBarcodeValidation(null);
  };

  const handleValidateNew = () => {
    if (!form.newBarcode.trim()) { setNewBarcodeValidation(null); return; }
    const vendorIdToCheck = oldBarcodeValidation?.valid ? oldBarcodeValidation.vendorId : userVendorId;
    if (!vendorIdToCheck) { setNewBarcodeValidation({ valid: false, error: 'Verify old barcode first to get vendor' }); return; }
    setNewBarcodeValidation(null);
    api.replacements.validateNew(form.newBarcode.trim(), vendorIdToCheck)
      .then((r) => setNewBarcodeValidation({ valid: r.valid, error: r.error }))
      .catch(() => setNewBarcodeValidation({ valid: false, error: 'Validation failed' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.oldBarcode.trim() || !form.newBarcode.trim() || !form.customerName.trim() || !form.customerPhone.trim()) {
      toast('Old barcode, new barcode, customer name and phone are required', 'error');
      return;
    }
    if (!oldBarcodeValidation?.valid) {
      toast('Please verify old barcode first', 'error');
      return;
    }
    if (!newBarcodeValidation?.valid) {
      toast('Please verify new barcode is allocated to the vendor', 'error');
      return;
    }
    setSubmitting(true);
    api.replacements.create({
      oldBarcode: form.oldBarcode.trim(),
      newBarcode: form.newBarcode.trim(),
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      replacedDate: form.replacedDate,
      reason: form.reason.trim() || undefined,
      vendorId: oldBarcodeValidation.vendorId,
    })
      .then(() => {
        setModalOpen(false);
        setForm({ oldBarcode: '', newBarcode: '', customerName: '', customerPhone: '', replacedDate: new Date().toISOString().slice(0, 10), reason: '' });
        setOldBarcodeValidation(null);
        setNewBarcodeValidation(null);
        load();
        toast('Replacement recorded successfully', 'success');
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const filtered = search.trim()
    ? replacements.filter((r) =>
        r.oldBarcode.toLowerCase().includes(search.toLowerCase()) ||
        r.newBarcode.toLowerCase().includes(search.toLowerCase()) ||
        (r.productName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (r.vendorName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        r.customerName.toLowerCase().includes(search.toLowerCase())
      )
    : replacements;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Product Replacements</h2>
          <p className="text-sm text-gray-500">Track products replaced under warranty (damaged item → new barcode)</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => replacements.length && exportToCsv(filtered.map((r) => ({ id: r.id, oldBarcode: r.oldBarcode, newBarcode: r.newBarcode, vendorName: r.vendorName ?? '', productName: r.productName ?? '', customerName: r.customerName, customerPhone: r.customerPhone, replacedDate: r.replacedDate, reason: r.reason ?? '' })), 'replacements')} disabled={!replacements.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} /> Export CSV
          </button>
          <button type="button" onClick={() => { setModalOpen(true); setOldBarcodeValidation(null); setNewBarcodeValidation(null); }} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold">
            <Plus size={18} /> Record Replacement
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search by barcode, product or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand" />
          </div>
          <span className="text-sm text-gray-500">{filtered.length} replacement{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                <th className="px-3 py-3 sm:px-6 sm:py-4">Old Barcode</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">New Barcode</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Vendor</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Product</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Customer</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Replaced Date</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No replacements recorded yet. Record one from Warranty details or add manually.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium line-through text-gray-500">{r.oldBarcode}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Replaced</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 font-mono text-sm font-bold text-emerald-600">{r.newBarcode}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{r.vendorName ?? '-'}</span></td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{r.productName ?? '-'}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <div>
                        <p className="text-sm font-medium">{r.customerName}</p>
                        <p className="text-xs text-gray-500">{r.customerPhone}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{formatDate(r.replacedDate)}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-500">{r.reason ?? '-'}</td>
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
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Record Replacement</h3>
              <p className="text-sm text-gray-500 mb-4">Product under warranty was damaged and replaced with new unit. Verify both barcodes before saving.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Old Barcode (damaged)</label>
                  <div className="flex gap-2">
                    <input required value={form.oldBarcode} onChange={(e) => { setForm({ ...form, oldBarcode: e.target.value }); setOldBarcodeValidation(null); setNewBarcodeValidation(null); }} placeholder="Barcode of damaged product" className="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-mono focus:ring-2 focus:ring-brand" />
                    <button type="button" onClick={handleValidateOld} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Verify</button>
                  </div>
                  {oldBarcodeValidation && (
                    <div className={cn("mt-2 p-3 rounded-lg text-sm", oldBarcodeValidation.valid ? "bg-emerald-50 border border-emerald-200" : "bg-rose-50 border border-rose-200")}>
                      {oldBarcodeValidation.valid ? (
                        <div className="text-emerald-800 space-y-0.5">
                          <p><strong>Vendor:</strong> {oldBarcodeValidation.vendorName} {oldBarcodeValidation.productName && <> • {oldBarcodeValidation.productName}</>}</p>
                          {'customerName' in oldBarcodeValidation && oldBarcodeValidation.customerName && (
                            <p><strong>Customer prefetched:</strong> {oldBarcodeValidation.customerName} • {oldBarcodeValidation.customerPhone ?? ''}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-rose-800">{oldBarcodeValidation.error}</p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-1">New Barcode (replacement)</label>
                  <div className="flex gap-2">
                    <input required value={form.newBarcode} onChange={(e) => { setForm({ ...form, newBarcode: e.target.value }); setNewBarcodeValidation(null); }} placeholder="Barcode of new product given" className="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-mono focus:ring-2 focus:ring-brand" />
                    <button type="button" onClick={handleValidateNew} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Verify</button>
                  </div>
                  {newBarcodeValidation && (
                    <div className={cn("mt-2 p-3 rounded-lg text-sm", newBarcodeValidation.valid ? "bg-emerald-50 border border-emerald-200" : "bg-rose-50 border border-rose-200")}>
                      {newBarcodeValidation.valid ? (
                        <p className="text-emerald-800">New barcode is allocated to vendor</p>
                      ) : (
                        <p className="text-rose-800">{newBarcodeValidation.error}</p>
                      )}
                    </div>
                  )}
                </div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Customer Name</label><input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Customer Phone</label><input required value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Replaced Date</label><input type="date" value={form.replacedDate} onChange={(e) => setForm({ ...form, replacedDate: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Reason (optional)</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Damaged, Defect" className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-brand text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Save'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
