import React, { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { api } from '../../api';
import { USER_STORAGE_KEY } from '../../types';

type LoginMode = 'login' | 'signup' | 'register';

interface LoginResult {
  token: string;
  tenantId?: string;
  user: { id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; vendorId?: string | null; autoWhatsapp?: boolean };
}

export function LoginScreen({ onLogin }: { onLogin: (u: LoginResult['user']) => void }) {
  const [mode, setMode] = useState<LoginMode>('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', confirmPassword: '', companyName: '', phone: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const storeAuthAndLogin = (result: LoginResult) => {
    sessionStorage.setItem('auth_token', result.token);
    if (result.tenantId) {
      sessionStorage.setItem('tenant_id', result.tenantId);
    }
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(result.user));
    onLogin(result.user);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if ((mode === 'signup' || mode === 'register') && form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const result = await api.tenantRegister({
          companyName: form.companyName,
          adminEmail: form.email,
          adminName: form.name,
          password: form.password,
          phone: form.phone || undefined,
        });
        storeAuthAndLogin(result);
      } else if (mode === 'login') {
        const result = await api.auth.login(form.email, form.password);
        storeAuthAndLogin(result);
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

  const showTabs = mode === 'login' || mode === 'signup';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#151619] via-[#1A1D21] to-[#151619] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 bg-[#F27D26] rounded-2xl items-center justify-center font-bold text-2xl text-white mb-4">DG</div>
          <h1 className="text-2xl font-bold text-white">DG ERP</h1>
          <p className="text-gray-400 text-sm mt-1">
            {mode === 'register' ? 'Register Your Company' : 'Enterprise Resource Planning'}
          </p>
        </div>
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {showTabs && (
            <div className="flex gap-2 mb-6">
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className={cn("flex-1 py-3 rounded-xl font-bold transition-all", mode === 'login' ? 'bg-[#F27D26] text-white' : 'bg-white/5 text-gray-400 hover:text-white')}>Login</button>
              <button type="button" onClick={() => { setMode('signup'); setError(''); }} className={cn("flex-1 py-3 rounded-xl font-bold transition-all", mode === 'signup' ? 'bg-[#F27D26] text-white' : 'bg-white/5 text-gray-400 hover:text-white')}>Sign Up</button>
            </div>
          )}
          {(mode === 'super_admin' || mode === 'register') && (
            <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">
              &larr; Back to login
            </button>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Company Name</label><input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F27D26] focus:border-transparent" placeholder="Your Company Ltd." /></div>
            )}
            {(mode === 'signup' || mode === 'register') && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F27D26] focus:border-transparent" placeholder="Full name" /></div>
            )}
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Email</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F27D26] focus:border-transparent" placeholder="you@example.com" /></div>
            {mode === 'register' && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Phone (optional)</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F27D26] focus:border-transparent" placeholder="+91 98765 43210" /></div>
            )}
            <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Password</label><input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F27D26] focus:border-transparent" placeholder="••••••••" /></div>
            {(mode === 'signup' || mode === 'register') && (
              <div><label className="text-xs font-bold text-gray-400 uppercase block mb-1">Confirm Password</label><input type="password" required value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F27D26] focus:border-transparent" placeholder="••••••••" /></div>
            )}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full py-4 bg-[#F27D26] text-white rounded-xl font-bold text-lg hover:bg-[#D96A1C] transition-colors disabled:opacity-60">
              {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : mode === 'register' ? 'Register Company' : 'Admin Login'}
            </button>
          </form>
        </div>
        {showTabs && (
          <p className="text-center text-gray-500 text-sm mt-6">
            <button type="button" onClick={() => { setMode('register'); setError(''); setForm({ email: '', password: '', name: '', confirmPassword: '', companyName: '', phone: '' }); }} className="text-[#F27D26] hover:text-[#FFB347] font-medium underline underline-offset-2">
              Register your company
            </button>
          </p>
        )}
      </motion.div>
    </div>
  );
}
