import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Pencil, Trash2, ArrowLeft, CheckCircle2, AlertTriangle, MessageCircle, Mail, Download } from 'lucide-react';
import { cn, exportToCsv, shareViaWhatsApp } from '../../lib/utils';
import { api } from '../../api';
import type { Vendor } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { useDebounce } from '../../hooks/useDebounce';

export function VendorMasterView({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [credsModal, setCredsModal] = useState<{ vendorName: string; email: string; password: string; phone?: string } | null>(null);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api.vendors.list(debouncedSearch || undefined).then(setList).catch(() => setList([])).finally(() => setLoading(false));
    onRefresh();
  };
  useEffect(() => { setLoading(true); load(); }, [debouncedSearch]);

  const openAdd = () => { setEditing(null); setForm({ name: '', contactPerson: '', phone: '', email: '', address: '' }); setModalOpen(true); };
  const openEdit = (v: Vendor) => { setEditing(v); setForm({ name: v.name, contactPerson: v.contactPerson ?? '', phone: v.phone ?? '', email: v.email ?? '', address: v.address ?? '' }); setModalOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (editing) {
      api.vendors.update(editing.id, form)
        .then(() => { setModalOpen(false); load(); toast('Vendor updated', 'success'); })
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
            toast(form.email ? 'Vendor created (login account already exists for this email)' : 'Vendor created — add email to auto-create login', form.email ? 'success' : 'info');
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
        <div className="flex-1"><h2 className="text-xl font-bold">Vendor Master</h2><p className="text-sm text-gray-500">Manage vendor records</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => list.length && exportToCsv(list.map((v) => ({ id: v.id, name: v.name, contactPerson: v.contactPerson ?? '', phone: v.phone ?? '', email: v.email ?? '', address: v.address ?? '', totalSales: v.totalSales ?? 0, totalRewardPoints: v.totalRewardPoints ?? 0 })), 'vendors')} disabled={!list.length} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={18} /> Export CSV
          </button>
          <button type="button" onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold"><Plus size={18} /> Add Vendor</button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-6 py-4">Name</th><th className="px-6 py-4">Contact</th><th className="px-6 py-4">Phone</th><th className="px-6 py-4">Email</th><th className="px-6 py-4">Sales</th><th className="px-6 py-4">Reward Pts</th><th className="px-6 py-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={7} className="px-6 py-12 text-center"><LoadingSpinner /></td></tr> :
                list.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{v.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{v.contactPerson || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{v.phone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{v.email || '-'}</td>
                    <td className="px-6 py-4 text-sm font-medium">{v.totalSales ?? 0}</td>
                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">{v.totalRewardPoints ?? 0}</td>
                    <td className="px-6 py-4 flex gap-2">
                      <button type="button" onClick={() => openEdit(v)} className="p-2 text-[#F27D26] hover:bg-orange-50 rounded-lg"><Pencil size={16} /></button>
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
              <h3 className="text-lg font-bold mb-4">{editing ? 'Edit Vendor' : 'Add Vendor'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Contact Person</label><input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div className={!editing ? 'bg-blue-50 border border-blue-100 rounded-xl p-3 -mx-1' : ''}>
                  <label className="text-xs font-bold text-gray-400 uppercase">Email * <span className="text-[#F27D26] normal-case font-normal">(vendor login ID)</span></label>
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="vendor@example.com" />
                  {!editing && <p className="text-xs text-blue-600 mt-2">Login will be auto-created. Password: <span className="font-mono font-bold">{form.name ? `${form.name.replace(/\s+/g, '').toLowerCase()}@123` : 'vendorname@123'}</span></p>}
                </div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Phone * <span className="text-gray-400 normal-case font-normal">(for WhatsApp)</span></label><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="+91 98765 43210" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase">Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div className="flex gap-2 pt-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2 border border-gray-200 rounded-lg font-medium">Cancel</button><button type="submit" disabled={submitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{submitting ? 'Saving...' : 'Save'}</button></div>
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
                  <p className="font-mono font-medium text-sm mt-0.5 text-[#F27D26]">{window.location.origin}/{sessionStorage.getItem('tenant_slug') || ''}</p>
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
                  const companyName = (() => { try { const u = JSON.parse(sessionStorage.getItem('dg_erp_user') || '{}'); return u.companyName || 'our platform'; } catch { return 'our platform'; } })();
                  const slug = sessionStorage.getItem('tenant_slug') || '';
                  const loginUrl = slug ? `${window.location.origin}/${slug}` : window.location.origin;
                  const msg = `Welcome to ${companyName}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${credsModal.email}\nPassword: ${credsModal.password}\n\nPlease change your password after first login.`;
                  shareViaWhatsApp(credsModal.phone || '', msg);
                }} disabled={!credsModal.phone} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <MessageCircle size={16} /> WhatsApp
                </button>
                <button type="button" onClick={() => {
                  const companyName = (() => { try { const u = JSON.parse(sessionStorage.getItem('dg_erp_user') || '{}'); return u.companyName || 'our platform'; } catch { return 'our platform'; } })();
                  const slug = sessionStorage.getItem('tenant_slug') || '';
                  const loginUrl = slug ? `${window.location.origin}/${slug}` : window.location.origin;
                  const subject = encodeURIComponent(`Your ${companyName} Login Credentials`);
                  const body = encodeURIComponent(`Welcome to ${companyName}!\n\nYour login credentials:\n\nLogin URL: ${loginUrl}\nEmail: ${credsModal.email}\nPassword: ${credsModal.password}\n\nPlease change your password after first login.\n\nRegards,\n${companyName}`);
                  window.open(`mailto:${credsModal.email}?subject=${subject}&body=${body}`, '_self');
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
    </motion.div>
  );
}
