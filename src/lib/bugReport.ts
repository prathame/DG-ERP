/**
 * Build a shareable bug-report text (no passwords / tokens).
 * Offline Mobile + Capacitor: Share sheet; web: clipboard / download.
 */
import { ensureCorrelationId, getRecentClientLogs } from './logger';
import { session } from './session';

export type BugReportExtras = {
  /** What the user was doing / saw (optional). */
  note?: string;
  /** e.g. login error string */
  lastError?: string;
};

function redactLicenseKey(key: string | null | undefined): string {
  if (!key) return '(none)';
  const k = key.trim();
  if (k.length <= 12) return `${k.slice(0, 4)}…`;
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

async function isNativeCapacitor(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function buildBugReportText(extras: BugReportExtras = {}): Promise<string> {
  const lines: string[] = ['Dhando bug report', '=================', ''];

  const mode = (import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined) || 'web';
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'unknown';
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`Mode: ${mode}`);
  lines.push(`App version: ${appVersion}`);
  lines.push(`Vite mode: ${import.meta.env.MODE}`);
  lines.push(`URL: ${typeof location !== 'undefined' ? location.href : '(n/a)'}`);
  lines.push(`Correlation: ${ensureCorrelationId()}`);

  let platform = 'web';
  let native = false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    native = Capacitor.isNativePlatform();
    platform = native ? Capacitor.getPlatform() : 'web';
  } catch {
    /* web */
  }
  lines.push(`Platform: ${platform}${native ? ' (native)' : ''}`);
  if (typeof navigator !== 'undefined') {
    lines.push(`User-Agent: ${navigator.userAgent.slice(0, 240)}`);
    lines.push(`Online: ${navigator.onLine ? 'yes' : 'no'}`);
    lines.push(`Language: ${navigator.language}`);
  }

  try {
    lines.push(`Tenant slug: ${session.getSlug() || '(none)'}`);
    lines.push(`Logged in: ${session.getToken() ? 'yes' : 'no'}`);
    const user = session.getUser() as { email?: string; role?: string } | null;
    if (user?.email) lines.push(`User email: ${user.email}`);
    if (user?.role) lines.push(`Role: ${user.role}`);
  } catch {
    lines.push('Session: (unavailable)');
  }

  if (mode === 'service-mobile') {
    try {
      const { loadLicense } = await import('../platforms/service-mobile/licenseStore');
      const { isLocalProvisioned, getLocalSlug } = await import('../platforms/service-mobile/local/provision');
      const lic = loadLicense();
      lines.push(`Product: Offline Service Mobile`);
      lines.push(`API origin: ${(import.meta.env.VITE_API_ORIGIN as string | undefined) || '(default/fallback)'}`);
      lines.push(`License: ${redactLicenseKey(lic?.licenseKey)}`);
      lines.push(`Company: ${lic?.companyName || '(none)'}`);
      lines.push(`Admin email (license): ${lic?.adminEmail || '(none)'}`);
      lines.push(`Activated at: ${lic?.activatedAt || '(none)'}`);
      lines.push(`Machine id: ${lic?.machineId ? `${lic.machineId.slice(0, 8)}…` : '(none)'}`);
      lines.push(`Provisioned: ${(await isLocalProvisioned()) ? 'yes' : 'no'}`);
      lines.push(`Local slug: ${(await getLocalSlug()) || '(none)'}`);
    } catch (e) {
      lines.push(`Offline diagnostics error: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (native || mode === 'service-cloud') {
    try {
      const { isServiceCloudMobile, serviceCloudClientKind } = await import('../platforms/service-cloud/mode');
      if (isServiceCloudMobile() || mode === 'service-cloud') {
        lines.push(`Product: Service Cloud ONLINE (Capacitor)`);
        lines.push(`Client kind: ${serviceCloudClientKind() || 'mobile'}`);
        lines.push(`API origin: ${(import.meta.env.VITE_API_ORIGIN as string | undefined) || '(same-origin)'}`);
      }
    } catch (e) {
      lines.push(`Online diagnostics error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (extras.lastError) {
    lines.push('');
    lines.push(`Last error: ${extras.lastError}`);
  }
  if (extras.note?.trim()) {
    lines.push('');
    lines.push('User note:');
    lines.push(extras.note.trim());
  }

  const logs = getRecentClientLogs(40);
  lines.push('');
  lines.push(`Recent client logs (${logs.length}):`);
  if (logs.length === 0) lines.push('(empty — reproduce the issue once, then share again)');
  else lines.push(...logs);

  lines.push('');
  lines.push('— end —');
  return lines.join('\n');
}

/** Share via native sheet, else clipboard, else download .txt */
export async function shareBugReport(extras: BugReportExtras = {}): Promise<'shared' | 'copied' | 'downloaded'> {
  const text = await buildBugReportText(extras);
  const title = 'Dhando bug report';
  const filename = `dhandho-bug-report-${new Date().toISOString().slice(0, 10)}.txt`;

  if (await isNativeCapacitor()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    } catch {
      /* fall through */
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    /* fall through */
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
