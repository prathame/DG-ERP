import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Building2, KeyRound, ArrowRight } from 'lucide-react';
import { api } from '../../../api';
import { resolveApiUrl } from '../../shared/apiBase';
import { saveCompanySlug } from './companyStorage';
import { getStoredSeat, setOfflineEntitled } from './seatStorage';
import { MobileSeatActivation } from './MobileSeatActivation';

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9-]/g, '');
}

function looksLikeInvite(raw: string): boolean {
  const u = raw.trim().toUpperCase();
  // Invite is DG-M-… but not seat keys DG-MS-…
  if (u.startsWith('DG-MS-')) return false;
  return u.startsWith('DG-M-') || /^[A-F0-9]{4}-[A-F0-9]{4}(-[A-F0-9]{4})?$/.test(u);
}

interface Props {
  initialSlug?: string;
  onComplete: (slug: string) => void;
}

/** First-launch: Super Admin invite code or company slug → optional seat → branded login. */
export function MobileOnboarding({ initialSlug = '', onComplete }: Props) {
  const [mode, setMode] = useState<'invite' | 'slug'>('invite');
  const [value, setValue] = useState(initialSlug);
  const [error, setError] = useState('');
  const [companyPreview, setCompanyPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingSeat, setPendingSeat] = useState<{ slug: string; companyName?: string } | null>(null);

  const finish = (slug: string) => {
    saveCompanySlug(slug);
    onComplete(slug);
  };

  const continueOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCompanyPreview(null);
    const raw = value.trim();
    if (!raw) {
      setError(mode === 'invite' ? 'Enter the invite code from Super Admin.' : 'Enter your company code.');
      return;
    }

    setSubmitting(true);
    try {
      let slug = '';
      let companyName = '';
      let requiresSeat = false;

      if (mode === 'invite' || looksLikeInvite(raw)) {
        const code = raw.toUpperCase().startsWith('DG-M') ? raw.toUpperCase() : raw.toUpperCase();
        const res = await fetch(resolveApiUrl('/api/mobile/redeem-invite'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const text = await res.text();
        let data: {
          error?: string;
          slug?: string;
          companyName?: string;
          requiresSeat?: boolean;
          businessType?: string;
        } = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          throw new Error('Server returned an invalid response. Try again in a moment.');
        }
        if (!res.ok) throw new Error(data.error || 'Invalid invite');
        if (!data.slug) throw new Error('Invite worked but no company was returned.');
        slug = data.slug;
        companyName = data.companyName || '';
        requiresSeat = !!data.requiresSeat || data.businessType === 'service';
      } else {
        const clean = normalizeSlug(raw);
        if (clean.length < 2) throw new Error('Enter a valid company code');
        const t = await api.tenantBySlug(clean);
        slug = t.slug;
        companyName = t.companyName;
        requiresSeat =
          !!(t as { requiresSeat?: boolean }).requiresSeat ||
          (t as { businessType?: string }).businessType === 'service';
      }

      setCompanyPreview(companyName || null);
      saveCompanySlug(slug);

      const stored = getStoredSeat();
      if (requiresSeat && (!stored || stored.slug !== slug || !stored.offlineEnabled)) {
        setPendingSeat({ slug, companyName });
        return;
      }
      // Stale local entitlement is not proof — heartbeat re-enables after login.
      if (requiresSeat) setOfflineEntitled(false);
      finish(slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect. Check the code with your admin.');
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingSeat) {
    return (
      <MobileSeatActivation
        slug={pendingSeat.slug}
        companyName={pendingSeat.companyName}
        onComplete={() => finish(pendingSeat.slug)}
        onSkip={() => finish(pendingSeat.slug)}
      />
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-br from-[#151619] via-[#1A1D21] to-[#151619] flex items-center justify-center px-5"
      style={{
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/icons/logo-full.png"
            alt="Dhandho"
            className="h-14 w-auto object-contain mx-auto mb-5"
            style={{ filter: 'drop-shadow(0 0 20px rgba(242,125,38,0.35))' }}
          />
          <h1 className="text-2xl font-bold text-white tracking-tight">Connect your company</h1>
          <p className="text-gray-400 text-sm mt-2 leading-relaxed px-2">
            Use the invite code from Super Admin, or your company code.
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setMode('invite');
              setError('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${mode === 'invite' ? 'bg-brand text-white' : 'bg-white/5 text-gray-400'}`}
          >
            Invite code
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('slug');
              setError('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${mode === 'slug' ? 'bg-brand text-white' : 'bg-white/5 text-gray-400'}`}
          >
            Company code
          </button>
        </div>

        <form
          onSubmit={e => void continueOnboard(e)}
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4"
        >
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block mb-1.5" htmlFor="onboard-code">
              {mode === 'invite' ? 'Invite code' : 'Company code'}
            </label>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 focus-within:border-brand/60 transition-colors">
              {mode === 'invite' ? (
                <KeyRound size={18} className="text-gray-500 shrink-0" />
              ) : (
                <Building2 size={18} className="text-gray-500 shrink-0" />
              )}
              <input
                id="onboard-code"
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={mode === 'invite' ? 'DG-M-XXXX-XXXX-XXXX' : 'your-company'}
                className="flex-1 bg-transparent py-3.5 text-white placeholder-gray-500 text-base outline-none min-h-[48px] font-mono tracking-wide"
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              {mode === 'invite'
                ? 'Shared by Super Admin via WhatsApp / email when your company was created.'
                : 'Same as your web URL: …/company-code'}
            </p>
          </div>

          {error && (
            <p className="text-sm text-rose-400" role="alert">
              {error}
            </p>
          )}
          {companyPreview && <p className="text-sm text-emerald-400">Connected to {companyPreview}</p>}

          <button
            type="submit"
            disabled={submitting || !value.trim()}
            className="w-full py-4 bg-brand hover:bg-brand-dark text-white font-bold rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2 min-h-[52px]"
          >
            {submitting ? (
              'Checking…'
            ) : (
              <>
                Continue <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
