import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isJsonTablesDump } from '../../src/platforms/service-mobile/local/backupPayload';

describe('isJsonTablesDump', () => {
  it('detects JSON table dumps and rejects gzip / non-table JSON', () => {
    const json = new TextEncoder().encode(JSON.stringify({ v: 1, tables: { tenants: [] } }));
    expect(isJsonTablesDump(json)).toBe(true);
    expect(isJsonTablesDump(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]))).toBe(false);
    expect(isJsonTablesDump(new TextEncoder().encode('not-json'))).toBe(false);
    expect(isJsonTablesDump(new TextEncoder().encode(JSON.stringify({ v: 1 })))).toBe(false);
  });
});

describe('restoreFromLocalBackupJson error paths', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('blames license key only when decrypt fails', async () => {
    vi.doMock('../../src/platforms/service-mobile/licenseStore', () => ({
      loadLicense: () => ({
        licenseKey: 'DG-SM-AAAA-BBBB-CCCC',
        companyName: 'Test Co',
        adminEmail: null,
        validUntil: null,
        machineId: 'm1',
        activatedAt: new Date().toISOString(),
      }),
    }));
    vi.doMock('../../src/platforms/service-mobile/local/db', () => ({
      dumpLocalDb: async () => new Uint8Array(),
      wipeLocalDb: async () => {},
      restoreLocalDbPlaintext: async () => {},
      localQuery: async () => ({ rows: [] }),
      getLocalDb: async () => ({}),
    }));
    vi.doMock('../../src/platforms/service-mobile/local/crypto', () => ({
      encryptBackup: async () => ({ ciphertext: '', nonce: '', wrap: '' }),
      decryptBackup: async () => {
        throw new Error('OperationError');
      },
    }));
    const { restoreFromLocalBackupJson } = await import('../../src/platforms/service-mobile/localBackup');
    const r = await restoreFromLocalBackupJson(
      JSON.stringify({
        format: 'dhandho-sm-local-v1',
        companyName: 'Test',
        exportedAt: new Date().toISOString(),
        ciphertext: 'YQ==',
        nonce: 'bm9uY2UxMjM0NTY=',
        wrap: 'pbkdf2-aes-gcm-v2-license',
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/same DG-SM license key/);
  });

  it('reports import failure separately when decrypt succeeds', async () => {
    vi.doMock('../../src/platforms/service-mobile/licenseStore', () => ({
      loadLicense: () => ({
        licenseKey: 'DG-SM-AAAA-BBBB-CCCC',
        companyName: 'Test Co',
        adminEmail: null,
        validUntil: null,
        machineId: 'm1',
        activatedAt: new Date().toISOString(),
      }),
    }));
    vi.doMock('../../src/platforms/service-mobile/local/db', () => ({
      dumpLocalDb: async () => new Uint8Array(),
      wipeLocalDb: async () => {},
      restoreLocalDbPlaintext: async () => {
        throw new Error('loadDataDir failed');
      },
      localQuery: async () => ({ rows: [] }),
      getLocalDb: async () => ({}),
    }));
    vi.doMock('../../src/platforms/service-mobile/local/crypto', () => ({
      encryptBackup: async () => ({ ciphertext: '', nonce: '', wrap: '' }),
      decryptBackup: async () => new TextEncoder().encode(JSON.stringify({ v: 1, tables: { tenants: [] } })),
    }));
    const { restoreFromLocalBackupJson } = await import('../../src/platforms/service-mobile/localBackup');
    const r = await restoreFromLocalBackupJson(
      JSON.stringify({
        format: 'dhandho-sm-local-v1',
        companyName: 'Test',
        exportedAt: new Date().toISOString(),
        ciphertext: 'YQ==',
        nonce: 'bm9uY2UxMjM0NTY=',
        wrap: 'pbkdf2-aes-gcm-v2-license',
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/decrypted but restore failed/);
    expect(r.error).toMatch(/loadDataDir failed/);
  });
});
