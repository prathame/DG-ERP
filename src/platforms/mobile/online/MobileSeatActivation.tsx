import React, { useState } from 'react';
import { KeyRound, ArrowRight } from 'lucide-react';
import { resolveApiUrl } from '../../shared/apiBase';
import { getMobileDeviceId } from './mobileSync';
import { clearStoredSeat, saveStoredSeat } from './seatStorage';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || '2.2.0';

interface Props {
  slug: string;
  companyName?: string;
  onComplete: () => void;
  onSkip?: () => void;
}

/** Service tenants: activate DG-MS-… seat before login for offline entitlement. */
export function MobileSeatActivation({ slug, companyName, onComplete, onSkip }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const skip = () => {
    clearStoredSeat();
    onSkip?.();
  };

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const seatKey = value.trim().toUpperCase();
    if (!seatKey.startsWith('DG-MS-')) {
      setError('Enter the offline seat key from Super Admin (starts with DG-MS-).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(resolveApiUrl('/api/mobile/activate-seat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seatKey,
          slug,
          deviceId: getMobileDeviceId(),
          platform: /android/i.test(navigator.userAgent)
            ? 'android'
            : /iphone|ipad|ipod/i.test(navigator.userAgent)
              ? 'ios'
              : 'web-mobile',
          appVersion: APP_VERSION,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        slug?: string;
        companyName?: string;
        offlineEnabled?: boolean;
      };
      if (!res.ok) throw new Error(data.error || 'Could not activate seat');
      if (data.slug && data.slug !== slug) {
        throw new Error('This seat belongs to a different company.');
      }
      saveStoredSeat({
        seatKey,
        slug: data.slug || slug,
        companyName: data.companyName || companyName,
        activatedAt: new Date().toISOString(),
        offlineEnabled: data.offlineEnabled !== false,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center px-6 bg-[#151619] text-white">
      <div className="max-w-md mx-auto w-full space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center">
            <KeyRound className="text-brand" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Activate offline seat</h1>
            <p className="text-sm text-gray-400">{companyName || slug}</p>
          </div>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">
          Service companies need a seat key from Super Admin to use the app offline. You can still log in online without
          it, but offline invoice/payment sync stays locked.
        </p>
        <form onSubmit={e => void activate(e)} className="space-y-4">
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="DG-MS-…"
            autoCapitalize="characters"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-brand text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? 'Activating…' : 'Activate seat'}
            <ArrowRight size={16} />
          </button>
        </form>
        {onSkip && (
          <button type="button" onClick={skip} className="w-full text-sm text-gray-500 hover:text-gray-300">
            Continue without offline (online only)
          </button>
        )}
      </div>
    </div>
  );
}
