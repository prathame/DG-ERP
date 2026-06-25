import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, LogOut, UserPlus, Phone, MapPin, Building2, UserCog, Shield, Download, MessageCircle, FileText, Settings, Upload, Palette, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import type { Vendor, BillSettings } from '../../types';
import { USER_STORAGE_KEY } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { AuditLogSection } from '../masters/AuditLogSection';
import { generateSalesInvoiceHtml } from '../../lib/billTemplates';

const ADMIN_ROLES = ['Admin', 'Super Admin'];

const BILL_DEFAULTS: BillSettings = {
  logoBase64: null, primaryColor: '#F27D26', tagline: null,
  invoicePrefix: null, challanPrefix: null,
  bankAccountName: null, bankAccountNumber: null, bankName: null, bankBranch: null, bankIfsc: null, bankUpiId: null,
  termsAndConditions: null, signatoryName: null, signatoryDesignation: null, signatureBase64: null,
  showRewards: true, showBarcode: true, showWarranty: true,
  footerText: 'Powered by DG ERP Management',
};

function BillCustomizationSection() {
  const { toast } = useToast();
  const [form, setForm] = useState<BillSettings>(BILL_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings.getBillSettings().then((s) => setForm({ ...BILL_DEFAULTS, ...s })).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleFile = (field: 'logoBase64' | 'signatureBase64') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { toast('Image must be under 500KB', 'error'); return; }
    if (!file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((p) => ({ ...p, [field]: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (form.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(form.primaryColor)) { toast('Invalid color format', 'error'); return; }
    setSaving(true);
    try {
      const saved = await api.settings.updateBillSettings(form);
      setForm({ ...BILL_DEFAULTS, ...saved });
      toast('Bill settings saved', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handlePreview = () => {
    const sampleBill = {
      id: 'SAMPLE-001', barcode: 'ABC12345', productName: 'Sample Product',
      productDescription: 'Product description', hsnCode: '8413', warrantyMonths: 12,
      salePrice: 10000, gstRate: 18, customerName: 'John Doe', customerPhone: '9876543210',
      customerEmail: 'john@example.com', purchaseDate: new Date().toISOString().split('T')[0],
      rewardPointsEarned: 50,
      company: { name: (() => { try { return JSON.parse(sessionStorage.getItem('dg_erp_user') || '{}').companyName || 'Your Company'; } catch { return 'Your Company'; } })(), phone: '9999999999', address: '123 Main St, City', gstNumber: '27AABCU9603R1ZM' },
      vendor: { name: 'Sample Vendor', phone: '8888888888', address: '456 Vendor St' },
      warranty: { status: 'Active', activationDate: new Date().toISOString().split('T')[0], expiryDate: '2027-06-25' },
      billSettings: form,
    };
    const html = generateSalesInvoiceHtml(sampleBill as never);
    const win = window.open('', '_blank', 'width=850,height=900');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const toggleField = (field: 'showRewards' | 'showBarcode' | 'showWarranty') => (
    <button type="button" onClick={() => setForm((p) => ({ ...p, [field]: !p[field] }))}
      className={cn("relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors", form[field] ? "bg-green-500" : "bg-gray-300")}>
      <span className={cn("pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform", form[field] ? "translate-x-5" : "translate-x-0")} />
    </button>
  );

  if (loading) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center"><LoadingSpinner /></div>;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={20} /> Bill Customization</h3>
        <button type="button" onClick={handlePreview} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#F27D26] border border-[#F27D26] rounded-lg hover:bg-[#F27D26]/5">
          <Eye size={14} /> Preview
        </button>
      </div>
      <div className="p-6 space-y-6">
        {/* Branding */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Branding</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Company Logo</label>
              <div className="flex items-center gap-3">
                {form.logoBase64 ? (
                  <img src={form.logoBase64} alt="Logo" className="w-14 h-14 rounded-lg object-contain border border-gray-200" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400"><Upload size={20} /></div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="px-3 py-1.5 text-xs font-bold bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 text-center">
                    Choose File
                    <input type="file" accept="image/*" className="hidden" onChange={handleFile('logoBase64')} />
                  </label>
                  {form.logoBase64 && <button type="button" onClick={() => setForm((p) => ({ ...p, logoBase64: null }))} className="text-xs text-rose-500 hover:underline">Remove</button>}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">PNG/JPG, max 500KB</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Bill Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.primaryColor} onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0" />
                <input value={form.primaryColor} onChange={(e) => setForm((p) => ({ ...p, primaryColor: e.target.value }))} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#F27D26]" maxLength={7} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Tagline / Subtitle</label>
              <input value={form.tagline || ''} onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="e.g. Manufacturers of Premium Pumps" />
            </div>
          </div>
        </div>

        {/* Invoice Numbering */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Invoice Numbering</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Invoice Prefix</label>
              <input value={form.invoicePrefix || ''} onChange={(e) => setForm((p) => ({ ...p, invoicePrefix: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="e.g. SPL-INV-" maxLength={20} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Challan Prefix</label>
              <input value={form.challanPrefix || ''} onChange={(e) => setForm((p) => ({ ...p, challanPrefix: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="e.g. SPL-CH-" maxLength={20} />
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Bank Details (printed on bill)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-gray-500 block mb-1">Account Name</label><input value={form.bankAccountName || ''} onChange={(e) => setForm((p) => ({ ...p, bankAccountName: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="Company Name" /></div>
            <div><label className="text-xs font-bold text-gray-500 block mb-1">Account Number</label><input value={form.bankAccountNumber || ''} onChange={(e) => setForm((p) => ({ ...p, bankAccountNumber: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#F27D26]" placeholder="1234567890" /></div>
            <div><label className="text-xs font-bold text-gray-500 block mb-1">Bank Name</label><input value={form.bankName || ''} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="State Bank of India" /></div>
            <div><label className="text-xs font-bold text-gray-500 block mb-1">Branch</label><input value={form.bankBranch || ''} onChange={(e) => setForm((p) => ({ ...p, bankBranch: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="Main Branch" /></div>
            <div><label className="text-xs font-bold text-gray-500 block mb-1">IFSC Code</label><input value={form.bankIfsc || ''} onChange={(e) => setForm((p) => ({ ...p, bankIfsc: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#F27D26]" placeholder="SBIN0001234" /></div>
            <div><label className="text-xs font-bold text-gray-500 block mb-1">UPI ID</label><input value={form.bankUpiId || ''} onChange={(e) => setForm((p) => ({ ...p, bankUpiId: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="company@upi" /></div>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Terms & Conditions</p>
          <textarea value={form.termsAndConditions || ''} onChange={(e) => setForm((p) => ({ ...p, termsAndConditions: e.target.value || null }))} rows={3} maxLength={2000} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="Enter terms & conditions to appear on bills..." />
          <p className="text-[10px] text-gray-400 mt-1">{(form.termsAndConditions || '').length}/2000</p>
        </div>

        {/* Authorized Signatory */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Authorized Signatory</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs font-bold text-gray-500 block mb-1">Name</label><input value={form.signatoryName || ''} onChange={(e) => setForm((p) => ({ ...p, signatoryName: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="Mr. Rajesh Kumar" /></div>
            <div><label className="text-xs font-bold text-gray-500 block mb-1">Designation</label><input value={form.signatoryDesignation || ''} onChange={(e) => setForm((p) => ({ ...p, signatoryDesignation: e.target.value || null }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="Managing Director" /></div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Signature Image</label>
              <div className="flex items-center gap-2">
                {form.signatureBase64 ? (
                  <img src={form.signatureBase64} alt="Signature" className="h-10 rounded border border-gray-200" />
                ) : (
                  <div className="h-10 w-20 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">No image</div>
                )}
                <label className="px-2 py-1 text-xs font-bold bg-gray-100 rounded cursor-pointer hover:bg-gray-200">
                  Upload <input type="file" accept="image/*" className="hidden" onChange={handleFile('signatureBase64')} />
                </label>
                {form.signatureBase64 && <button type="button" onClick={() => setForm((p) => ({ ...p, signatureBase64: null }))} className="text-xs text-rose-500">Remove</button>}
              </div>
            </div>
          </div>
        </div>

        {/* Bill Section Toggles */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Bill Sections</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><div><p className="font-medium text-sm">Show Barcode</p><p className="text-xs text-gray-500">Display barcode column on bills</p></div>{toggleField('showBarcode')}</div>
            <div className="flex items-center justify-between"><div><p className="font-medium text-sm">Show Warranty</p><p className="text-xs text-gray-500">Display warranty info on sales invoice</p></div>{toggleField('showWarranty')}</div>
            <div className="flex items-center justify-between"><div><p className="font-medium text-sm">Show Rewards</p><p className="text-xs text-gray-500">Display reward points earned on invoice</p></div>{toggleField('showRewards')}</div>
          </div>
        </div>

        {/* Footer */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-3">Footer Text</p>
          <input value={form.footerText} onChange={(e) => setForm((p) => ({ ...p, footerText: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#F27D26]" placeholder="Powered by DG ERP Management" />
        </div>

        <button type="button" onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-[#F27D26] text-white rounded-xl font-bold hover:bg-[#D96A1C] disabled:opacity-60">
          {saving ? 'Saving...' : 'Save Bill Settings'}
        </button>
      </div>
    </div>
  );
}

const PERMISSION_LABELS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Sales Entry' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'warranty', label: 'Warranty' },
  { id: 'replacements', label: 'Replacements' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'masters', label: 'Masters' },
  { id: 'settings', label: 'Settings' },
  { id: 'user_management', label: 'User Management' },
];

export function SettingsView({ user, onUserChange }: { user: { id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; autoWhatsapp?: boolean } | null; onUserChange: (u: typeof user) => void }) {
  const { toast } = useToast();
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '', confirmPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', address: '', role: 'Admin', companyName: '', gstNumber: '', defaultGstRate: 18 });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [users, setUsers] = useState<{ id: string; email: string; name: string; phone?: string; role?: string; permissions?: string[] | null }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<{ id: string; email: string; name: string; role?: string; permissions?: string[] | null; vendorId?: string | null } | null>(null);
  const [addUserForm, setAddUserForm] = useState({ email: '', password: '', name: '', role: 'Staff', permissions: [] as string[], vendorId: '' });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [editUserForm, setEditUserForm] = useState({ role: '', permissions: [] as string[], vendorId: '' });
  const [userSubmitting, setUserSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      const ux = user as Record<string, unknown>;
      setProfileForm({ name: user.name, phone: user.phone ?? '', address: user.address ?? '', role: user.role ?? 'Admin', companyName: user.companyName ?? '', gstNumber: (ux.gstNumber as string) ?? '', defaultGstRate: Number(ux.defaultGstRate) || 18 });
    }
  }, [user]);

  const isAdmin = user && ADMIN_ROLES.includes(user.role ?? '');
  useEffect(() => {
    if (isAdmin && user) {
      setUsersLoading(true);
      api.admin.listUsers(user.id).then(setUsers).catch(() => setUsers([])).finally(() => setUsersLoading(false));
    }
  }, [isAdmin, user?.id]);
  useEffect(() => {
    if (addUserOpen) api.vendors.list().then(setVendors).catch(() => []);
  }, [addUserOpen]);
  useEffect(() => {
    if (editUserTarget) api.vendors.list().then(setVendors).catch(() => []);
  }, [editUserTarget]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const result = await api.auth.login(authForm.email, authForm.password);
      sessionStorage.setItem('auth_token', result.token);
      if (result.tenantId) sessionStorage.setItem('tenant_id', result.tenantId);
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(result.user));
      onUserChange(result.user);
      setAuthForm({ email: '', password: '', name: '', confirmPassword: '' });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authForm.password !== authForm.confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    setAuthSubmitting(true);
    try {
      const result = await api.auth.signup({ email: authForm.email, password: authForm.password, name: authForm.name });
      sessionStorage.setItem('auth_token', result.token);
      if (result.tenantId) sessionStorage.setItem('tenant_id', result.tenantId);
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(result.user));
      onUserChange(result.user);
      setAuthForm({ email: '', password: '', name: '', confirmPassword: '' });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('tenant_id');
    sessionStorage.removeItem(USER_STORAGE_KEY);
    onUserChange(null);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSubmitting(true);
    try {
      const u = await api.settings.updateProfile(user.id, profileForm);
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
      onUserChange(u);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (addUserForm.role === 'Vendor' && !addUserForm.vendorId) { toast('Select vendor for Vendor role', 'error'); return; }
    setUserSubmitting(true);
    try {
      await api.admin.createUser(user.id, { ...addUserForm, permissions: addUserForm.permissions.length ? addUserForm.permissions : undefined, vendorId: addUserForm.role === 'Vendor' ? addUserForm.vendorId : undefined });
      setAddUserOpen(false);
      setAddUserForm({ email: '', password: '', name: '', role: 'Staff', permissions: [], vendorId: '' });
      api.admin.listUsers(user.id).then(setUsers);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create user', 'error');
    } finally {
      setUserSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editUserTarget) return;
    if (editUserForm.role === 'Vendor' && !editUserForm.vendorId) { toast('Select vendor for Vendor role', 'error'); return; }
    setUserSubmitting(true);
    try {
      await api.admin.updateUser(user.id, editUserTarget.id, { role: editUserForm.role, permissions: editUserForm.permissions, vendorId: editUserForm.role === 'Vendor' ? editUserForm.vendorId : undefined });
      setEditUserTarget(null);
      api.admin.listUsers(user.id).then(setUsers);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update user', 'error');
    } finally {
      setUserSubmitting(false);
    }
  };

  const togglePermission = (permissions: string[], id: string) => {
    const has = permissions.includes(id);
    return has ? permissions.filter((p) => p !== id) : [...permissions, id];
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-gray-500">Manage your account and preferences</p>
      </div>

      {/* Auth Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-lg flex items-center gap-2"><LogIn size={20} /> Login & Account</h3>
        </div>
        <div className="p-6">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#F27D26] to-[#FFB347] flex items-center justify-center text-white font-bold text-xl">{user.name.charAt(0)}</div>
                <div>
                  <p className="font-bold text-lg">{user.name}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <p className="text-xs text-amber-600 font-medium">{user.role ?? 'Admin'}</p>
                </div>
              </div>
              <button type="button" onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 rounded-xl font-medium hover:bg-rose-50 transition-colors">
                <LogOut size={18} /> Logout
              </button>
            </div>
          ) : (
            <div className="max-w-md space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => { setAuthMode('login'); setAuthError(''); }} className={cn("flex-1 py-2 rounded-lg font-medium transition-colors", authMode === 'login' ? 'bg-[#F27D26] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>Login</button>
                <button type="button" onClick={() => { setAuthMode('signup'); setAuthError(''); }} className={cn("flex-1 py-2 rounded-lg font-medium transition-colors", authMode === 'signup' ? 'bg-[#F27D26] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>Sign Up</button>
              </div>
              <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-4">
                {authMode === 'signup' && (
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Name</label><input required value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="Full name" /></div>
                )}
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Email</label><input type="email" required value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="you@example.com" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Password</label><input type="password" required value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="••••••••" /></div>
                {authMode === 'signup' && (
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Confirm Password</label><input type="password" required value={authForm.confirmPassword} onChange={(e) => setAuthForm({ ...authForm, confirmPassword: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="••••••••" /></div>
                )}
                {authError && <p className="text-sm text-rose-600">{authError}</p>}
                <button type="submit" disabled={authSubmitting} className="w-full py-3 bg-[#F27D26] text-white rounded-xl font-bold">{authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Sign Up'}</button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Personal Info & Contact - only when logged in */}
      {user && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2"><UserPlus size={20} /> Personal Information</h3>
            </div>
            <form onSubmit={handleProfileSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Full Name</label><input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Email</label><input type="email" value={user.email} disabled className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Role</label><input type="text" value={profileForm.role} disabled className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600" /></div>
              </div>
              <button type="submit" disabled={profileSubmitting} className="px-6 py-2 bg-[#F27D26] text-white rounded-xl font-bold">{profileSubmitting ? 'Saving...' : 'Save'}</button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2"><Phone size={20} /> Contact Details</h3>
            </div>
            <form onSubmit={handleProfileSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1"><Phone size={12} /> Phone</label><input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="+91 98765 43210" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1 flex items-center gap-1"><MapPin size={12} /> Address</label><input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="Street, City, State" /></div>
              </div>
              <button type="submit" disabled={profileSubmitting} className="px-6 py-2 bg-[#F27D26] text-white rounded-xl font-bold">{profileSubmitting ? 'Saving...' : 'Save'}</button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2"><Building2 size={20} /> Company & Other</h3>
            </div>
            <form onSubmit={handleProfileSave} className="p-6 space-y-4">
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Company / Business Name</label><input value={profileForm.companyName} onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="Your Company Name" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">GST Number (GSTIN)</label><input value={profileForm.gstNumber ?? ''} onChange={(e) => setProfileForm({ ...profileForm, gstNumber: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26] font-mono" placeholder="e.g. 27AABCU9603R1ZM" maxLength={15} /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Default GST Rate (%)</label>
                  <div className="flex gap-2 mt-1">
                    {[3, 5, 12, 18, 28].map((rate) => (
                      <button key={rate} type="button" onClick={() => setProfileForm({ ...profileForm, defaultGstRate: rate })} className={cn("px-3 py-2 rounded-lg text-sm font-bold border transition-colors", profileForm.defaultGstRate === rate ? "bg-[#F27D26] text-white border-[#F27D26]" : "bg-white border-gray-200 text-gray-600 hover:border-[#F27D26]")}>{rate}%</button>
                    ))}
                    <input type="number" min={0} max={100} value={profileForm.defaultGstRate || ''} onChange={(e) => setProfileForm({ ...profileForm, defaultGstRate: e.target.value === '' ? 0 : Number(e.target.value) })} className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#F27D26]" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">CGST + SGST will split equally (e.g. 18% = 9% + 9%)</p>
                </div>
              </div>
              <button type="submit" disabled={profileSubmitting} className="px-6 py-2 bg-[#F27D26] text-white rounded-xl font-bold">{profileSubmitting ? 'Saving...' : 'Save'}</button>
            </form>
          </div>

          {/* Appearance / Dark Mode */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} /> Appearance</h3>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Dark Mode</p>
                  <p className="text-xs text-gray-500 mt-0.5">Switch between light and dark theme</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const html = document.documentElement;
                    const nowDark = html.classList.toggle('dark');
                    sessionStorage.setItem('dg_erp_theme', nowDark ? 'dark' : 'light');
                    setIsDarkMode(nowDark);
                  }}
                  className={cn(
                    "relative w-14 h-7 rounded-full transition-colors",
                    isDarkMode ? 'bg-[#F27D26]' : 'bg-gray-300'
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform",
                    isDarkMode ? 'translate-x-7' : 'translate-x-0.5'
                  )} />
                </button>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2"><Shield size={20} /> Change Password</h3>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const current = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
              const newPw = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
              const confirm = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
              if (newPw !== confirm) { toast('New passwords do not match', 'error'); return; }
              if (newPw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
              try {
                await api.settings.changePassword(user!.id, current, newPw);
                toast('Password changed successfully', 'success');
                form.reset();
              } catch (err) { toast(err instanceof Error ? err.message : 'Failed', 'error'); }
            }} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Current Password</label><input type="password" name="currentPassword" required className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">New Password</label><input type="password" name="newPassword" required minLength={6} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Confirm New Password</label><input type="password" name="confirmPassword" required minLength={6} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" /></div>
              </div>
              <button type="submit" className="px-6 py-2 bg-[#F27D26] text-white rounded-xl font-bold">Update Password</button>
            </form>
          </div>

          {/* Feature Toggles */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} /> Feature Toggles</h3>
              </div>
              <div className="p-6 space-y-4">
                {[
                  { key: 'warrantyEnabled', label: 'Warranty Management', desc: 'Auto-create warranties on sale. When OFF, warranty tab is hidden and no warranties are generated.' },
                  { key: 'replacementEnabled', label: 'Replacement Tracking', desc: 'Track product replacements under warranty. When OFF, replacements tab is hidden.' },
                  { key: 'rewardsEnabled', label: 'Rewards & Points', desc: 'Vendor reward points on each sale. When OFF, rewards tab is hidden and no points are earned.' },
                ].map((toggle) => (
                  <div key={toggle.key} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{toggle.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{toggle.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!user) return;
                        const currentVal = (user as Record<string, unknown>)[toggle.key] !== false;
                        const newVal = !currentVal;
                        api.settings.updateProfile(user.id, { [toggle.key]: newVal }).then((u) => {
                          const updated = { ...user, ...u, [toggle.key]: newVal };
                          sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
                          onUserChange(updated);
                          toast(`${toggle.label} ${newVal ? 'enabled' : 'disabled'}`, 'success');
                        }).catch((err) => toast(err instanceof Error ? err.message : 'Failed', 'error'));
                      }}
                      className={cn("relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors", (user as Record<string, unknown>)?.[toggle.key] !== false ? "bg-green-500" : "bg-gray-300")}
                    >
                      <span className={cn("pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform", (user as Record<string, unknown>)?.[toggle.key] !== false ? "translate-x-5" : "translate-x-0")} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bill Customization */}
          {isAdmin && <BillCustomizationSection />}

          {/* WhatsApp Auto-Send */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <h3 className="font-bold text-lg flex items-center gap-2"><MessageCircle size={20} /> WhatsApp Auto-Send</h3>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Automatically send bill via WhatsApp</p>
                  <p className="text-sm text-gray-500 mt-1">When enabled, WhatsApp will open automatically with the bill after each sale is completed. The bill includes a shareable link the customer can open to view/download.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!user) return;
                    const newVal = !user.autoWhatsapp;
                    api.settings.updateProfile(user.id, { autoWhatsapp: newVal } as Record<string, unknown>).then((u) => {
                      const updated = { ...user, ...u, autoWhatsapp: newVal };
                      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
                      onUserChange(updated);
                      toast(newVal ? 'Auto WhatsApp enabled' : 'Auto WhatsApp disabled', 'success');
                    }).catch((err) => toast(err instanceof Error ? err.message : 'Failed', 'error'));
                  }}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors",
                    user?.autoWhatsapp ? "bg-green-500" : "bg-gray-300"
                  )}
                >
                  <span className={cn(
                    "pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform",
                    user?.autoWhatsapp ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", user?.autoWhatsapp ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                  {user?.autoWhatsapp ? 'ON — Bills sent automatically' : 'OFF — Manual send only'}
                </span>
              </div>
            </div>
          </div>

          {/* Data Management - Admin only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <h3 className="font-bold text-lg flex items-center gap-2"><Download size={20} /> Data Management</h3>
              </div>
              <div className="p-6 flex flex-wrap gap-4">
                <button type="button" onClick={() => { window.open('/api/backup', '_blank'); toast('Backup download started', 'success'); }} className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
                  <Download size={18} /> Download Database Backup
                </button>
                <p className="w-full text-xs text-gray-500 mt-1">Backup downloads the full SQLite database file. Keep it safe — it contains all your data.</p>
              </div>
            </div>
          )}

          {/* Audit Log - Admin only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={20} /> Activity Log</h3>
              </div>
              <AuditLogSection />
            </div>
          )}

          {/* User Management - Admin only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2"><UserCog size={20} /> User Management</h3>
                <button type="button" onClick={() => setAddUserOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold">
                  <UserPlus size={16} /> Add User
                </button>
              </div>
              <div className="p-6">
                {usersLoading ? (
                  <div className="py-8"><LoadingSpinner /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead><tr className="text-xs font-bold text-gray-400 uppercase border-b border-gray-50"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Actions</th></tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {users.map((u) => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{u.name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                            <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{u.role ?? 'Staff'}</span></td>
                            <td className="px-4 py-3">
                              <button type="button" onClick={() => { setEditUserTarget(u); setEditUserForm({ role: u.role ?? 'Staff', permissions: u.permissions ?? [], vendorId: (u as Record<string, unknown>).vendorId as string ?? '' }); }} className="text-sm font-bold text-[#F27D26] hover:underline flex items-center gap-1"><Shield size={14} /> Permissions</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add User Modal */}
      <AnimatePresence>
        {addUserOpen && user && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setAddUserOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4">Create New User</h3>
                <form onSubmit={handleAddUser} className="space-y-4">
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Name</label><input required value={addUserForm.name} onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Email</label><input type="email" required value={addUserForm.email} onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Password</label><input type="password" required value={addUserForm.password} onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg" /></div>
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Role</label><select value={addUserForm.role} onChange={(e) => setAddUserForm({ ...addUserForm, role: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg"><option>Super Admin</option><option>Admin</option><option>Manager</option><option>Staff</option><option>Vendor</option></select></div>
                  {addUserForm.role === 'Vendor' && (
                    <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vendor (required)</label><select required value={addUserForm.vendorId} onChange={(e) => setAddUserForm({ ...addUserForm, vendorId: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg"><option value="">Select vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                  )}
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Permissions (optional - leave empty for role defaults)</label><div className="grid grid-cols-2 gap-2 mt-2">{PERMISSION_LABELS.map((p) => (<label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addUserForm.permissions.includes(p.id)} onChange={() => setAddUserForm({ ...addUserForm, permissions: togglePermission(addUserForm.permissions, p.id) })} className="rounded" /><span>{p.label}</span></label>))}</div></div>
                  <div className="flex gap-2 pt-2"><button type="button" onClick={() => setAddUserOpen(false)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={userSubmitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{userSubmitting ? 'Creating...' : 'Create User'}</button></div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
        {editUserTarget && user && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setEditUserTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4">Edit Permissions: {editUserTarget.name}</h3>
                <form onSubmit={handleEditUser} className="space-y-4">
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Role</label><select value={editUserForm.role} onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg"><option>Super Admin</option><option>Admin</option><option>Manager</option><option>Staff</option><option>Vendor</option></select></div>
                  {editUserForm.role === 'Vendor' && (
                    <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Vendor (required)</label><select required value={editUserForm.vendorId} onChange={(e) => setEditUserForm({ ...editUserForm, vendorId: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg"><option value="">Select vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                  )}
                  <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Permissions</label><div className="grid grid-cols-2 gap-2 mt-2">{PERMISSION_LABELS.map((p) => (<label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editUserForm.permissions.includes(p.id)} onChange={() => setEditUserForm({ ...editUserForm, permissions: togglePermission(editUserForm.permissions, p.id) })} className="rounded" /><span>{p.label}</span></label>))}</div></div>
                  <div className="flex gap-2 pt-2"><button type="button" onClick={() => setEditUserTarget(null)} className="flex-1 py-2 border rounded-lg font-medium">Cancel</button><button type="submit" disabled={userSubmitting} className="flex-1 py-2 bg-[#F27D26] text-white rounded-lg font-bold">{userSubmitting ? 'Saving...' : 'Save'}</button></div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!user && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-amber-800 font-medium">Sign in to view and edit your personal information, contact details and company settings.</p>
        </div>
      )}
    </motion.div>
  );
}
