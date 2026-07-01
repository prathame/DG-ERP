import React, { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import { USER_STORAGE_KEY } from '../../types';
import { session } from '../../lib/session';

type LoginMode = 'login' | 'signup' | 'forgot' | 'reset';

interface LoginResult {
  token: string;
  tenantId?: string;
  tenantSlug?: string;
  user: { id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; vendorId?: string | null; autoWhatsapp?: boolean; planName?: string; barcodeSystemEnabled?: boolean; multiLanguageEnabled?: boolean; vendorPortalEnabled?: boolean; tabConfig?: Record<string, { label: string; visible: boolean }> | null };
}

interface TenantBranding {
  tenantId: string;
  companyName: string;
  slug: string;
  logoBase64: string | null;
  primaryColor: string;
  tagline: string | null;
}

interface LoginScreenProps {
  onLogin: (u: LoginResult['user']) => void;
  tenant?: TenantBranding | null;
}

export function LoginScreen({ onLogin, tenant }: LoginScreenProps) {
  const urlToken = new URLSearchParams(window.location.search).get('token');
  const [mode, setMode] = useState<LoginMode>(urlToken ? 'reset' : 'login');
  const [form, setForm] = useState({ email: '', password: '', name: '', confirmPassword: '', companyName: '', phone: '' });
  const [resetToken, setResetToken] = useState(urlToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const accentColor = tenant?.primaryColor || '#F27D26';
  const isBranded = !!tenant;

  const storeAuthAndLogin = (result: LoginResult) => {
    session.setToken(result.token);
    if (result.tenantId) session.setTenantId(result.tenantId);
    session.setUser(result.user);
    const slug = result.tenantSlug || tenant?.slug;
    if (slug) session.setSlug(slug);
    onLogin(result.user);
    if (slug && window.location.pathname !== `/${slug}`) {
      window.history.replaceState(null, '', `/${slug}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (mode === 'signup' && form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        await api.auth.forgotPassword(form.email);
        setSuccessMessage('If this email exists, a password reset has been initiated. Contact your admin for the reset link.');
      } else if (mode === 'reset') {
        if (newPassword !== confirmNewPassword) { setError('Passwords do not match'); setSubmitting(false); return; }
        await api.auth.resetPassword(resetToken, newPassword);
        setSuccessMessage('Password reset successfully! You can now login with your new password.');
        setTimeout(() => { setMode('login'); setSuccessMessage(''); }, 2000);
      } else if (mode === 'login') {
        const r = await api.auth.login(form.email, form.password);
        storeAuthAndLogin({
          token: r.token,
          tenantId: r.tenantId,
          tenantSlug: r.tenantSlug,
          user: { id: r.id, email: r.email, name: r.name, phone: r.phone, address: r.address, role: r.role, companyName: r.companyName, vendorId: r.vendorId, autoWhatsapp: r.autoWhatsapp, planName: (r as Record<string, unknown>).planName as string, barcodeSystemEnabled: (r as Record<string, unknown>).barcodeSystemEnabled as boolean, multiLanguageEnabled: (r as Record<string, unknown>).multiLanguageEnabled as boolean, vendorPortalEnabled: (r as Record<string, unknown>).vendorPortalEnabled as boolean, tabConfig: (r as Record<string, unknown>).tabConfig as Record<string, { label: string; visible: boolean }> | null },
        });
      } else {
        const result = await api.auth.signup({ email: form.email, password: form.password, name: form.name });
        storeAuthAndLogin(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const showTabs = !isBranded && (mode === 'login' || mode === 'signup');

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#151619] via-[#1A1D21] to-[#151619] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          {tenant?.logoBase64 ? (
            <img src={tenant.logoBase64} alt={tenant.companyName} className="w-16 h-16 rounded-2xl object-contain mx-auto mb-4" />
          ) : (
            <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center font-bold text-2xl text-white mb-4" style={{ backgroundColor: accentColor }}>
              {isBranded ? (tenant.companyName || 'C').substring(0, 2).toUpperCase() : 'DG'}
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{isBranded ? tenant.companyName : 'DG ERP'}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {isBranded ? (tenant.tagline || '') : 'Enterprise Resource Planning'}
          </p>
          {isBranded && (
            <p className="text-gray-600 text-[10px] mt-2">Powered by DG ERP</p>
          )}
        </div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {showTabs && (
            <div className="flex gap-2 mb-6">
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className={cn("flex-1 py-3 rounded-xl font-bold transition-all", mode === 'login' ? 'text-white' : 'bg-white/5 text-gray-400 hover:text-white')} style={mode === 'login' ? { backgroundColor: accentColor } : undefined}>Login</button>
              <button type="button" onClick={() => { setMode('signup'); setError(''); }} className={cn("flex-1 py-3 rounded-xl font-bold transition-all", mode === 'signup' ? 'text-white' : 'bg-white/5 text-gray-400 hover:text-white')} style={mode === 'signup' ? { backgroundColor: accentColor } : undefined}>Sign Up</button>
            </div>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <button type="button" onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }} className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">&larr; Back to login</button>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:border-transparent" style={{ '--tw-ring-color': accentColor } as React.CSSProperties} placeholder="Full name" /></div>
            )}
            {mode !== 'reset' && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Email</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:border-transparent" style={{ '--tw-ring-color': accentColor } as React.CSSProperties} placeholder="you@example.com" /></div>
            )}
            {(mode === 'login' || mode === 'signup') && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Password</label><input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:border-transparent" style={{ '--tw-ring-color': accentColor } as React.CSSProperties} placeholder="••••••••" /></div>
            )}
            {mode === 'signup' && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Confirm Password</label><input type="password" required value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:border-transparent" style={{ '--tw-ring-color': accentColor } as React.CSSProperties} placeholder="••••••••" /></div>
            )}
            {mode === 'reset' && (
              <>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Reset Token</label><input required value={resetToken} onChange={(e) => setResetToken(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:border-transparent font-mono text-sm" style={{ '--tw-ring-color': accentColor } as React.CSSProperties} placeholder="Paste reset token from admin" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">New Password</label><input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:border-transparent" style={{ '--tw-ring-color': accentColor } as React.CSSProperties} placeholder="Min 8 characters" /></div>
                <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Confirm New Password</label><input type="password" required minLength={8} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:border-transparent" style={{ '--tw-ring-color': accentColor } as React.CSSProperties} placeholder="Repeat new password" /></div>
              </>
            )}
            {mode === 'login' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-white/20 bg-white/5 text-brand" style={{ accentColor }} />
                <span className="text-sm text-gray-400">Remember me</span>
              </label>
            )}
            {mode === 'forgot' && <p className="text-xs text-gray-500">Enter your email and we'll send you a password reset. Contact your admin if you don't receive it.</p>}
            {successMessage && <p className="text-sm text-emerald-400">{successMessage}</p>}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full py-4 text-white rounded-xl font-bold text-lg transition-colors disabled:opacity-60" style={{ backgroundColor: accentColor }}>
              {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : mode === 'forgot' ? 'Send Reset Request' : 'Reset Password'}
            </button>
          </form>
          {mode === 'login' && (
            <div className="flex justify-between mt-4">
              <button type="button" onClick={() => { setMode('forgot'); setError(''); setSuccessMessage(''); }} className="text-xs text-gray-500 hover:text-white transition-colors">Forgot Password?</button>
              <button type="button" onClick={() => { setMode('reset'); setError(''); setSuccessMessage(''); }} className="text-xs text-gray-500 hover:text-white transition-colors">Have a reset token?</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
