import React, { useState } from 'react';
import { Cloud, Smartphone, ShieldAlert } from 'lucide-react';
import { BrandMark } from '../components/ui/BrandMark';
import { setPhoneModeOnce, type PhoneMode } from './mobileMode';

type Props = {
  onChosen: (mode: PhoneMode) => void;
};

/**
 * One-time Online vs Offline setup. Modes do not share auth or data.
 */
export function PhoneModePicker({ onChosen }: Props) {
  const [pending, setPending] = useState<PhoneMode | null>(null);
  const [error, setError] = useState('');

  const confirm = (mode: PhoneMode) => {
    setError('');
    const result = setPhoneModeOnce(mode);
    if (!result.ok) {
      setError(result.reason || 'Could not set mode');
      return;
    }
    onChosen(mode);
  };

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center bg-[#0c0f12] px-4"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          <BrandMark relative alt="Dhandho" className="h-14 w-14 mx-auto object-contain rounded-2xl" />
          <h1 className="text-xl font-bold text-white">Choose how this phone works</h1>
          <p className="text-sm text-white/50">
            One-time setup. Online and Offline use different accounts and data — they never mix.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100/90">
          <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-300" />
          <span>You cannot switch later without reinstalling the app. Pick carefully.</span>
        </div>

        {pending == null ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setPending('online')}
              className="w-full text-left rounded-2xl border border-sky-500/35 bg-sky-500/10 p-4 hover:bg-sky-500/15 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Cloud size={18} className="text-sky-300" />
                <span className="font-bold text-white">Online</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/25 text-sky-200 font-bold">CLOUD</span>
              </div>
              <p className="text-sm text-white/55">
                Connect to your company on the cloud. Uses company login and device seats. Needs internet.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPending('offline')}
              className="w-full text-left rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 hover:bg-emerald-500/15 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Smartphone size={18} className="text-emerald-300" />
                <span className="font-bold text-white">Offline</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-200 font-bold">
                  ON DEVICE
                </span>
              </div>
              <p className="text-sm text-white/55">
                Store data on this phone. Uses a separate DG-SM- license. Not the same as cloud seats.
              </p>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
            <p className="text-sm text-white/80">
              Confirm{' '}
              <strong className="text-white">{pending === 'online' ? 'Online (cloud)' : 'Offline (on device)'}</strong>?
              This cannot be changed without reinstalling.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/70 text-sm font-bold"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => confirm(pending)}
                className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-bold"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
      </div>
    </div>
  );
}
