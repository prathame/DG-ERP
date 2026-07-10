import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft, CheckCircle2, AlertTriangle, MessageCircle, Mail, Download, Upload } from 'lucide-react';
import { cn, exportToCsv, shareViaWhatsApp } from '../../lib/utils';
import { api } from '../../api';
import type { Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { CsvImport } from '../../components/ui/CsvImport';
import { useDebounce } from '../../hooks/useDebounce';
import { session } from '../../lib/session';

export function VendorMasterView({ onBack, onRefresh, businessType = 'manufacturer' }: { onBack: () => void; onRefresh: () => void; businessType?: string }) {
  const label = businessType === 'dealer' || businessType === 'retail' ? 'Customer' : 'Vendor';
  const { toast } = useToast();
  const [list, setList] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [credsModal, setCredsModal] = useState<{ vendorName: string; email: string; password: string; phone?: string } | null>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' });
  const [submitting, setSubmitting] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  const load = () => {
    api.vendors.list(debouncedSearch || undefined).then(setList).catch(() => setList([])).finally(() => setLoading(false));
    onRefresh();
  };
  useEffect(() => { setLoading(true); load(); }, [debouncedSearch]);

  const openAdd = () => { setEditing(null); setForm({ name: '', contactPerson: '', phone: '', email: '', address: '' }); setModalOpen(true); };
  const openEdit = (v: Vendor) => { setEditing(v); setForm({ name: v.name, contactPerson: v.contactPerson ?? '', phone: v.phone ?? '', email: v.email ?? '', address: v.address ?? '', gstNumber: (v as unknown as Record<string, string>).gstNumber ?? '' }); setModalOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (editing) {
      api.vendors.update(editing.id, form)
        .then(() => { setModalOpen(false); load(); toast(`${label} updated`, 'success'); })
        .catch((err) => toast(err.message, 'error'))
        .finally(() => setSubmitting(false));
    } else {
      api.vendors.create(form)
        .then((result) => {
          setModalOpen(false);
          load();
          if (result.credentials) {
            setCredsModal({ vendorName: form.name, email: result.credentials.email, password: result.credentials.password, phone: form.phone || undefined });
          } else {
            toast(`${label} created`, 'success');
          }
        })
        .catch((err) => toast(err.message, 'error'))
        .finally(() => setSubmitting(false));
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    api.vendors.delete(deleteTarget.id).then(() => { setDeleteTarget(null); load(); }).catch((err) => toast(err.message, 'error'));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button type="button" onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /></button>
        <div className="flex-1"><h2 className="text-xl font-bold">{label} Master</h2><p className="text-sm text-gray-500">Manage {label.toLowerCase()} records</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => list.length && exportToCsv(list.map((v) => ({ id: v.id, name: v.name, contactPerson: v.contactPerson ?? '', phone: v.phone ?? '', email: v.email ?? '', address: v.address ?? '', totalSales: v.totalSales ?? 0, totalRewardPoints: v.totalRewardPoints ?? 0 })), 'vendors')} disabled={!list.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} /> Export CSV
          </button>
          <button type="button" onClick={() => setCsvImportOpen(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50"><Upload size={18} /> Import CSV</button>
          <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold"><Plus size={18} /> Add {label}</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder={`Search ${label.toLowerCase()}s...`} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-3 py-3 sm:px-6 sm:py-4">Name</th><th className="px-3 py-3 sm:px-6 sm:py-4">Contact</th><th className="px-3 py-3 sm:px-6 sm:py-4">Phone</th><th className="px-3 py-3 sm:px-6 sm:py-4">GSTIN</th>{label === 'Vendor' && <><th className="px-3 py-3 sm:px-6 sm:py-4">Sales</th><th className="px-3 py-3 sm:px-6 sm:py-4">Reward Pts</th></>}<th className="px-3 py-3 sm:px-6 sm:py-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={7} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr> :
                list.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 sm:px-6 sm:py-4 font-medium">{v.name}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{v.contactPerson || '-'}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600">{v.phone || '-'}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm text-gray-600 font-mono">{(v as Record<string, unknown>).gstNumber as string || '-'}</td>
                    {label === 'Vendor' && <><td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-medium">{v.totalSales ?? 0}</td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-emerald-600">{v.totalRewardPoints ?? 0}</td></>}
                    <td className="px-3 py-3 sm:px-6 sm:py-4 flex gap-2">
                      <button type="button" onClick={() => openEdit(v)} className="p-2 text-brand hover:bg-orange-50 rounded-lg"><Pencil size={16} /></button>
                      <button type="button" onClick={() => setDeleteTarget(v)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">{editing ? `Edit ${label}` : `Add ${label}`}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Contact Person</label><input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div className={!editing ? 'bg-blue-50 border border-blue-100 rounded-xl p-3 -mx-1' : ''}>
                  <label className="text-xs font-bold text-gray-400 uppercase">Email * <span className="text-brand normal-case font-normal">(vendor login ID)</span></label>
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="vendor@example.com" />
                  {!editing && <p className="text-xs text-blue-600 mt-2">Login will be auto-created. Password: <span className="font-mono font-bold">{form.name ? `${form.name.replace(/\s+/g, '').toLowerCase()}@123` : 'vendorname@123'}</span></p>}
                </div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Phone * <span className="text-gray-400 normal-case font-normal">(for WhatsApp)</span></label><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" placeholder="+91 98765 43210" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">GSTIN (optional)</label><input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand font-mono" placeholder="e.g. 24AABCD1234F1Z5" maxLength={15} />{form.gstNumber && form.gstNumber.length === 15 && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstNumber) && <p className="text-[10px] text-rose-500 mt-0.5">Invalid GSTIN format</p>}</div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-brand text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Save'}</button></div>
              </form>
            </motion.div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <p className="text-gray-600 mb-6">Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</p>
              <div className="flex gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="button" onClick={handleDelete} className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold">Delete</button></div>
            </motion.div>
          </div>
        )}
        {credsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setCredsModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={28} /></div>
                <h3 className="text-xl font-bold">Vendor Created Successfully</h3>
                <p className="text-sm text-gray-500 mt-1">Login credentials have been auto-generated for <strong>{credsModal.vendorName}</strong></p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Login URL</p>
                  <p className="font-mono font-medium text-sm mt-0.5 text-brand">{window.location.origin}/{session.getSlug() || ''}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Login Email</p>
                  <p className="font-mono font-medium text-lg mt-0.5">{credsModal.email}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Password</p>
                  <p className="font-mono font-medium text-lg mt-0.5">{credsModal.password}</p>
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-4 flex items-center gap-2">
                <AlertTriangle size={14} />
                Share these credentials with the vendor. They can change the password after first login.
              </p>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => {
                  const companyName = (() => { try { const u = (session.getUser() || {}); return u.companyName || 'our platform'; } catch { return 'our platform'; } })();
                  const slug = session.getSlug() || '';
                  const loginUrl = slug ? `${window.location.origin}/${slug}` : window.location.origin;
                  const msg = `Welcome to ${companyName}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${credsModal.email}\nPassword: ${credsModal.password}\n\nPlease change your password after first login.`;
                  shareViaWhatsApp(credsModal.phone || '', msg);
                }} disabled={!credsModal.phone} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <MessageCircle size={16} /> WhatsApp
                </button>
                <button type="button" onClick={() => {
                  const companyName = (() => { try { const u = (session.getUser() || {}); return u.companyName || 'our platform'; } catch { return 'our platform'; } })();
                  const slug = session.getSlug() || '';
                  const loginUrl = slug ? `${window.location.origin}/${slug}` : window.location.origin;
                  const subject = `Your ${companyName} Login Credentials`;
                  const body = `Welcome to ${companyName}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${credsModal.email}\nPassword: ${credsModal.password}\n\nPlease change your password after first login.\n\nRegards,\n${companyName}`;
                  window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(credsModal.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
                }} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">
                  <Mail size={16} /> Email
                </button>
                <button type="button" onClick={() => setCredsModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl font-bold text-sm">
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {csvImportOpen && (
        <CsvImport
          templateName="vendors_template"
          columns={[
            { key: 'name', label: `${label} Name`, required: true },
            { key: 'contactPerson', label: 'Contact Person' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'address', label: 'Address' },
          ]}
          onClose={() => setCsvImportOpen(false)}
          onImport={async (rows) => {
            const vendors = rows.map(r => ({ name: r.name, contactPerson: r.contactPerson || undefined, phone: r.phone || undefined, email: r.email || undefined, address: r.address || undefined }));
            const result = await api.vendors.bulk(vendors);
            if (result.credentials && result.credentials.length > 0) {
              const slug = session.getSlug() || window.location.pathname.split('/')[1] || '';
              const baseUrl = window.location.origin;
              const csvRows = result.credentials.map(c => ({ 'Vendor Name': c.name, 'Email': c.email, 'Password': c.password, 'Login URL': `${baseUrl}/${slug}` }));
              exportToCsv(csvRows, 'vendor_credentials');
              toast(`${result.credentials.length} vendor credentials downloaded`, 'success');
            }
            load();
            return { success: result.success, errors: result.errors };
          }}
        />
      )}
    </motion.div>
  );
}
