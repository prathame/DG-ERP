/**
 * One-shot migrate legacy Electron userData folders into unified "Dhandho".
 * Pure fs helpers — injectable paths for unit tests.
 */
import fs from 'fs';
import path from 'path';

const MIGRATE_ONPREM_MARKER = 'migrated-from-onprem.flag';
const MIGRATE_SPLENDOR_MARKER = 'migrated-from-splendor-erp.flag';

/** Files/dirs that Offline / mode latch need after upgrade. */
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

/** Old package.json name — Electron used this for userData before productName Dhandho. */
export function legacySplendorErpUserDataDir(userDataParent: string): string {
  return path.join(userDataParent, 'splendor-erp');
}

export function hasOfflineLicense(userDataDir: string): boolean {
  return fs.existsSync(path.join(userDataDir, 'license.dat'));
}

function copyMigrateNames(fromDir: string, toDir: string): void {
  fs.mkdirSync(toDir, { recursive: true });
  for (const name of ONPREM_MIGRATE_NAMES) {
    const src = path.join(fromDir, name);
    const dest = path.join(toDir, name);
    if (!fs.existsSync(src) || fs.existsSync(dest)) continue;
    try {
      fs.cpSync(src, dest, { recursive: true });
    } catch (err) {
      console.error(`[migrate] failed to copy ${name}:`, err);
    }
  }
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
  const marker = path.join(currentUserData, MIGRATE_ONPREM_MARKER);
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

  copyMigrateNames(legacy, currentUserData);

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

/**
 * Copy latch + Offline data from legacy `splendor-erp` userData into `Dhandho`.
 * Runs when productName/userData folder was renamed. Idempotent.
 */
export function migrateLegacySplendorErpUserData(currentUserData: string): {
  migrated: boolean;
  from?: string;
  reason?: string;
} {
  const marker = path.join(currentUserData, MIGRATE_SPLENDOR_MARKER);
  if (fs.existsSync(marker)) {
    return { migrated: false, reason: 'already-migrated' };
  }

  const parent = path.dirname(currentUserData);
  const legacy = legacySplendorErpUserDataDir(parent);
  if (path.resolve(legacy) === path.resolve(currentUserData)) {
    return { migrated: false, reason: 'same-dir' };
  }
  if (!fs.existsSync(legacy)) {
    return { migrated: false, reason: 'no-legacy-dir' };
  }

  const hasSomething = ONPREM_MIGRATE_NAMES.some(n => fs.existsSync(path.join(legacy, n)));
  if (!hasSomething) {
    return { migrated: false, reason: 'no-legacy-data' };
  }

  copyMigrateNames(legacy, currentUserData);

  try {
    fs.writeFileSync(marker, JSON.stringify({ from: legacy, at: new Date().toISOString() }), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    /* ignore */
  }

  const migrated = ONPREM_MIGRATE_NAMES.some(n => fs.existsSync(path.join(currentUserData, n)));
  return { migrated, from: legacy, reason: migrated ? undefined : 'copy-failed' };
}
