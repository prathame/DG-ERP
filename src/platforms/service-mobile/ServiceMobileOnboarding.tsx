/**
 * First-run: cloud activate → optional restore → set admin password → local provision.
 */
import React, { useState } from 'react';
import { Smartphone, KeyRound, Loader2, Lock } from 'lucide-react';
import { activateLicense } from './cloud';
import { getOrCreateDeviceId } from './deviceId';
import { saveLicense, loadLicense } from './licenseStore';
import { provisionLocalTenant, isLocalProvisioned } from './local/provision';
import { getLocalDb } from './local/db';
import { restoreSameTenantBackup } from './restore';
import { serviceMobileAppVersion } from './mode';

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
  const [companyName, setCompanyName] = useState('');
  const [hasBackup, setHasBackup] = useState(false);

  const activate = async () => {
    setError('');
    const key = licenseKey.trim().toUpperCase();
    if (!key.startsWith('DG-SM-')) {
      setError('Enter a Service Mobile key (starts with DG-SM-)');
      return;
    }
    setBusy(true);
    try {
      await getLocalDb();
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
      setHasBackup(Boolean(result.hasBackup));
      setStep(result.hasBackup ? 'restore' : 'password');
    } catch {
      setError('Cannot reach activation server. Go online and try again.');
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (want: boolean) => {
    setError('');
    if (!want) {
      setStep('password');
      return;
    }
    setBusy(true);
    try {
      const r = await restoreSameTenantBackup();
      if (!r.ok) {
        setError(r.error || 'Restore failed');
        return;
      }
      if (await isLocalProvisioned()) {
        onReady();
        return;
      }
      setStep('password');
    } finally {
      setBusy(false);
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
      // Stash for login screen
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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Smartphone size={24} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Service Mobile setup</h1>
          <p className="text-sm text-gray-500">
            Offline service ERP — one license, one phone. Data stays on this device.
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
              A backup exists for <strong>{companyName}</strong>. Restore it on this phone? (Same license only.)
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doRestore(true)}
              className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin inline" /> : null} Restore backup
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doRestore(false)}
              className="w-full py-3 rounded-xl text-sm font-medium border border-gray-200 text-gray-700"
            >
              Start fresh
            </button>
          </div>
        )}

        {step === 'password' && (
          <>
            <p className="text-sm text-gray-600">
              Set the admin password for <strong>{companyName || 'your company'}</strong>
              {hasBackup ? '' : ''}.
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
      </div>
    </div>
  );
}
