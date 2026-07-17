import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('../../src/platforms/service-mobile/local/db', () => ({
  localQuery: async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT value FROM sm_meta')) {
      const key = String(params[0]);
      const value = store.get(key);
      return { rows: value != null ? [{ value }] : [] };
    }
    if (sql.includes('INSERT INTO sm_meta')) {
      store.set(String(params[0]), String(params[1]));
      return { rows: [] };
    }
    return { rows: [] };
  },
  dumpLocalDb: async () => new TextEncoder().encode(JSON.stringify({ v: 1, tables: { tenants: [] } })),
  restoreLocalDbFromJson: async () => {},
  wipeLocalDb: async () => {},
  getLocalDb: async () => ({}),
}));

vi.mock('../../src/platforms/service-mobile/licenseStore', () => ({
  loadLicense: () => ({
    licenseKey: 'DG-SM-AAAA-BBBB-CCCC',
    companyName: 'Test Co',
    adminEmail: null,
    validUntil: null,
    machineId: 'm1',
    activatedAt: new Date().toISOString(),
  }),
}));

vi.mock('../../src/platforms/service-mobile/local/crypto', () => ({
  encryptBackup: async (plaintext: Uint8Array) => ({
    ciphertext: Buffer.from(plaintext).toString('base64'),
    nonce: 'bm9uY2U=',
    wrap: 'pbkdf2-aes-gcm-v2-license',
  }),
  decryptBackup: async (ciphertextB64: string) => new Uint8Array(Buffer.from(ciphertextB64, 'base64')),
}));

describe('service-mobile localBackup (user-owned)', () => {
  beforeEach(() => {
    store.clear();
  });

  it('defaults to daily enabled and is due when never run', async () => {
    const { loadLocalBackupSettings, shouldRunLocalBackup } =
      await import('../../src/platforms/service-mobile/localBackup');
    const s = await loadLocalBackupSettings();
    expect(s.enabled).toBe(true);
    expect(s.frequency).toBe('daily');
    expect(await shouldRunLocalBackup()).toBe(true);
  });

  it('builds envelope format for local file restore', async () => {
    const { buildLocalBackupEnvelope } = await import('../../src/platforms/service-mobile/localBackup');
    const { envelope, filename } = await buildLocalBackupEnvelope();
    expect(envelope.format).toBe('dhandho-sm-local-v1');
    expect(envelope.companyName).toBe('Test Co');
    expect(envelope.ciphertext).toBeTruthy();
    expect(filename).toMatch(/^offline-mobile-backup-/);
  });

  it('respects weekly schedule and disabled flag', async () => {
    const mod = await import('../../src/platforms/service-mobile/localBackup');
    await mod.saveLocalBackupSettings({ enabled: true, frequency: 'weekly' });
    await mod.saveLocalBackupSettings({ lastBackupAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() });
    expect(await mod.shouldRunLocalBackup()).toBe(false);

    await mod.saveLocalBackupSettings({ lastBackupAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() });
    expect(await mod.shouldRunLocalBackup()).toBe(true);

    await mod.saveLocalBackupSettings({ enabled: false });
    expect(await mod.shouldRunLocalBackup()).toBe(false);
  });
});
