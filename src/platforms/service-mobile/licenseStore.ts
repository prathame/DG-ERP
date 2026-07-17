/**
 * Local encrypted-ish license record for Service Mobile (Phase 1: localStorage).
 * Phase 2+ may move to Capacitor Secure Storage.
 */

export type ServiceMobileLicense = {
  licenseKey: string;
  companyName: string;
  adminEmail: string | null;
  validUntil: string | null;
  machineId: string;
  activatedAt: string;
  tabConfig?: Record<string, { label: string; visible: boolean }>;
};

const KEY = 'dg_sm_license';

export function loadLicense(): ServiceMobileLicense | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ServiceMobileLicense;
    if (!parsed?.licenseKey || !parsed?.machineId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLicense(lic: ServiceMobileLicense): void {
  localStorage.setItem(KEY, JSON.stringify(lic));
}

export function clearLicense(): void {
  localStorage.removeItem(KEY);
}
