import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, LogOut, UserPlus, Phone, MapPin, Building2, UserCog, Shield, Download, MessageCircle, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import type { Vendor } from '../../types';
import { USER_STORAGE_KEY } from '../../types';
import { useToast, LoadingSpinner } from '../../components/ui';
import { AuditLogSection } from '../masters/AuditLogSection';

const ADMIN_ROLES = ['Admin', 'Super Admin'];
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
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '', confirmPassword: '' });
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', address: '', role: 'Admin', companyName: '', gstNumber: '' });
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
      setProfileForm({ name: user.name, phone: user.phone ?? '', address: user.address ?? '', role: user.role ?? 'Admin', companyName: user.companyName ?? '', gstNumber: (user as Record<string, unknown>).gstNumber as string ?? '' });
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
      const u = await api.auth.login(authForm.email, authForm.password);
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
      onUserChange(u);
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
      const u = await api.auth.signup({ email: authForm.email, password: authForm.password, name: authForm.name });
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
      onUserChange(u);
      setAuthForm({ email: '', password: '', name: '', confirmPassword: '' });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
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
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Company / Business Name</label><input value={profileForm.companyName} onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26]" placeholder="Splendor Pump LLP" /></div>
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">GST Number (GSTIN)</label><input value={profileForm.gstNumber ?? ''} onChange={(e) => setProfileForm({ ...profileForm, gstNumber: e.target.value })} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#F27D26] font-mono" placeholder="e.g. 27AABCU9603R1ZM" maxLength={15} /></div>
              <button type="submit" disabled={profileSubmitting} className="px-6 py-2 bg-[#F27D26] text-white rounded-xl font-bold">{profileSubmitting ? 'Saving...' : 'Save'}</button>
            </form>
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
