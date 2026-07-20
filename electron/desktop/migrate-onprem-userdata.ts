/**
 * One-shot migrate from legacy "Dhandho On-Prem" userData into unified "Dhandho".
 * Pure fs helpers — injectable paths for unit tests.
 */
import fs from 'fs';
import path from 'path';

const MIGRATE_MARKER = 'migrated-from-onprem.flag';

/** Files/dirs that Offline mode needs to keep working after upgrade. */
export const ONPREM_MIGRATE_NAMES = [
  'license.dat',
  'install.key',
  'jwt.key',
  'pg-credentials.json',
  'postgres-data',
  'desktop-mode.json',
] as const;

export function legacyOnPremUserDataDir(userDataParent: string): string {
  return path.join(userDataParent, 'Dhandho On-Prem');
}

export function hasOfflineLicense(userDataDir: string): boolean {
  return fs.existsSync(path.join(userDataDir, 'license.dat'));
}

/**
 * If current userData has no license but legacy On-Prem folder does, copy key files
 * and return true. Idempotent via marker file. Never overwrites existing license.dat.
 */
export function migrateLegacyOnPremUserData(currentUserData: string): {
  migrated: boolean;
  from?: string;
  reason?: string;
} {
  const marker = path.join(currentUserData, MIGRATE_MARKER);
  if (fs.existsSync(marker)) {
    return { migrated: false, reason: 'already-migrated' };
  }
  if (hasOfflineLicense(currentUserData)) {
    try {
      fs.writeFileSync(marker, new Date().toISOString(), { encoding: 'utf8', mode: 0o600 });
    } catch {
      /* ignore */
    }
    return { migrated: false, reason: 'current-has-license' };
  }

  const parent = path.dirname(currentUserData);
  const legacy = legacyOnPremUserDataDir(parent);
  if (!hasOfflineLicense(legacy)) {
    return { migrated: false, reason: 'no-legacy-license' };
  }

  fs.mkdirSync(currentUserData, { recursive: true });
  for (const name of ONPREM_MIGRATE_NAMES) {
    const src = path.join(legacy, name);
    const dest = path.join(currentUserData, name);
    if (!fs.existsSync(src) || fs.existsSync(dest)) continue;
    try {
      fs.cpSync(src, dest, { recursive: true });
    } catch (err) {
      console.error(`[migrate] failed to copy ${name}:`, err);
    }
  }

  try {
    fs.writeFileSync(marker, JSON.stringify({ from: legacy, at: new Date().toISOString() }), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    /* ignore */
  }

  return { migrated: hasOfflineLicense(currentUserData), from: legacy };
}
