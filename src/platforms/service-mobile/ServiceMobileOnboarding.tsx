/**
 * First-run: cloud activate → optional restore from staff's backup file → set admin password.
 * We never host ERP backups — staff keep the file (Downloads / their Gmail).
 */
import React, { useRef, useState } from 'react';
import { Smartphone, KeyRound, Loader2, Lock, FileUp } from 'lucide-react';
import { activateLicense } from './cloud';
import { getOrCreateDeviceId } from './deviceId';
import { saveLicense, loadLicense } from './licenseStore';
import { provisionLocalTenant, isLocalProvisioned } from './local/provision';
import { getLocalDb } from './local/db';
import { restoreFromLocalBackupFile } from './restore';
import { serviceMobileAppVersion } from './mode';
import { shareBugReport } from '../../lib/bugReport';
import { PercentProgressBar } from '../../components/ui';
import type { RestoreProgress } from './restoreProgress';

type Props = {
  onReady: () => void;
};

export function ServiceMobileOnboarding({ onReady }: Props) {
  const [step, setStep] = useState<'license' | 'restore' | 'password'>('license');
  const [licenseKey, setLicenseKey] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restorePct, setRestorePct] = useState<RestoreProgress | null>(null);
  const [companyName, setCompanyName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const activate = async () => {
    setError('');
    const key = licenseKey.trim().toUpperCase();
    if (!key.startsWith('DG-SM-')) {
      setError('Enter a Service Mobile key (starts with DG-SM-)');
      return;
    }
    setBusy(true);
    try {
      const machineId = await getOrCreateDeviceId();
      const osInfo =
        typeof navigator !== 'undefined'
          ? `${navigator.platform || 'phone'} ${navigator.userAgent.slice(0, 80)}`
          : 'mobile';
      const result = await activateLicense({
        licenseKey: key,
        machineId,
        osInfo,
        appVersion: serviceMobileAppVersion(),
      });
      if (!result.valid) {
        setError(result.error || 'Activation failed');
        return;
      }
      try {
        await getLocalDb();
      } catch (dbErr) {
        console.error('[service-mobile] local DB open failed', dbErr);
        const detail = import.meta.env.DEV && dbErr instanceof Error && dbErr.message ? ` (${dbErr.message})` : '';
        setError(`Could not open local database on this phone. Free some storage and try again.${detail}`);
        return;
      }
      saveLicense({
        licenseKey: result.licenseKey || key,
        companyName: result.companyName,
        adminEmail: result.adminEmail,
        validUntil: result.validUntil,
        machineId,
        activatedAt: new Date().toISOString(),
        tabConfig: result.tabConfig,
      });
      setCompanyName(result.companyName);
      // Always offer file restore — we do not store backups in the cloud
      setStep('restore');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort|timeout/i.test(msg)) {
        setError('Activation timed out. Check internet and try again.');
      } else {
        setError('Cannot reach activation server. Go online and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const onPickBackup = async (file: File | null) => {
    if (!file) return;
    setError('');
    setBusy(true);
    setRestorePct({ percent: 0, stage: 'reading', label: 'Reading backup file…' });
    try {
      const r = await restoreFromLocalBackupFile(file, p => setRestorePct(p));
      if (!r.ok) {
        setError(r.error || 'Restore failed');
        return;
      }
      setRestorePct({ percent: 100, stage: 'done', label: 'Restore complete' });
      if (await isLocalProvisioned()) {
        onReady();
        return;
      }
      setStep('password');
    } finally {
      setBusy(false);
      setRestorePct(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const provision = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match');
      return;
    }
    const lic = loadLicense();
    if (!lic) {
      setError('License missing — restart setup');
      return;
    }
    setBusy(true);
    try {
      await getLocalDb();
      const { slug, adminEmail } = await provisionLocalTenant(lic, password);
      try {
        sessionStorage.setItem('sm_slug', slug);
        sessionStorage.setItem('sm_email', adminEmail);
      } catch {
        /* ignore */
      }
      onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provision failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-emerald-50 to-white flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto"
      style={{
        paddingTop: 'max(1.5rem, var(--safe-top))',
        paddingBottom: 'max(1.5rem, var(--safe-bottom))',
      }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4 my-auto">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Smartphone size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Offline Mobile setup</h1>
          <p className="text-sm text-gray-500 leading-snug">
            Service business type — data stays on this phone. We do not store your backups in the cloud.
          </p>
        </div>

        {step === 'license' && (
          <>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <KeyRound size={12} /> License key
              </span>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase"
                placeholder="DG-SM-…"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void activate()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              Activate this phone
            </button>
          </>
        )}

        {step === 'restore' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Setting up <strong>{companyName}</strong>. If you have a backup file from your old phone (Downloads or
              Gmail), restore it here. Same <span className="font-mono text-xs">DG-SM-</span> key required.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={e => void onPickBackup(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              {busy && restorePct ? `Restoring… ${restorePct.percent}%` : 'Restore from backup file'}
            </button>
            {restorePct && (
              <PercentProgressBar percent={restorePct.percent} label={restorePct.label} barClassName="bg-emerald-500" />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('password')}
              className="w-full py-3 rounded-xl text-sm font-medium border border-gray-200 text-gray-700"
            >
              Start fresh (no backup)
            </button>
          </div>
        )}

        {step === 'password' && (
          <>
            <p className="text-sm text-gray-600">
              Set the admin password for <strong>{companyName || 'your company'}</strong>.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <Lock size={12} /> Admin password
              </span>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-gray-500">Confirm password</span>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void provision()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              Finish setup
            </button>
          </>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                await shareBugReport({ lastError: error || undefined, note: `Offline setup step: ${step}` });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not create bug report');
              } finally {
                setBusy(false);
              }
            })();
          }}
          className="w-full py-2.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-xl disabled:opacity-50"
        >
          Share bug report
        </button>
      </div>
    </div>
  );
}
