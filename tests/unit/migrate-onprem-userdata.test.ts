import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hasOfflineLicense, migrateLegacyOnPremUserData } from '../../electron/desktop/migrate-onprem-userdata';

describe('migrateLegacyOnPremUserData', () => {
  let root: string;
  let current: string;
  let legacy: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-migrate-'));
    current = path.join(root, 'Dhandho');
    legacy = path.join(root, 'Dhandho On-Prem');
    fs.mkdirSync(current, { recursive: true });
    fs.mkdirSync(legacy, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('no-ops when no legacy license', () => {
    expect(migrateLegacyOnPremUserData(current)).toEqual({
      migrated: false,
      reason: 'no-legacy-license',
    });
  });

  it('copies license and postgres-data from legacy On-Prem folder', () => {
    fs.writeFileSync(path.join(legacy, 'license.dat'), 'enc');
    fs.writeFileSync(path.join(legacy, 'install.key'), 'k');
    fs.mkdirSync(path.join(legacy, 'postgres-data'));
    fs.writeFileSync(path.join(legacy, 'postgres-data', 'PG_VERSION'), '16');

    const r = migrateLegacyOnPremUserData(current);
    expect(r.migrated).toBe(true);
    expect(r.from).toBe(legacy);
    expect(hasOfflineLicense(current)).toBe(true);
    expect(fs.readFileSync(path.join(current, 'install.key'), 'utf8')).toBe('k');
    expect(fs.existsSync(path.join(current, 'postgres-data', 'PG_VERSION'))).toBe(true);

    // Idempotent
    expect(migrateLegacyOnPremUserData(current).reason).toBe('already-migrated');
  });

  it('does not overwrite existing current license', () => {
    fs.writeFileSync(path.join(current, 'license.dat'), 'current');
    fs.writeFileSync(path.join(legacy, 'license.dat'), 'legacy');
    const r = migrateLegacyOnPremUserData(current);
    expect(r.migrated).toBe(false);
    expect(fs.readFileSync(path.join(current, 'license.dat'), 'utf8')).toBe('current');
  });
});
