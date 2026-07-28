import { describe, it, expect, afterEach } from 'vitest';
import { mustPreserveLocalDb } from '../../src/platforms/service-mobile/local/db';

type FakeIdb = { databases?: () => Promise<Array<{ name?: string }>> };

function setLocalStorage(store: Record<string, string>) {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    length: 0,
  } as Storage;
}

function setIndexedDb(fake: FakeIdb | undefined) {
  if (fake === undefined) {
    delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
  } else {
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = fake;
  }
}

describe('mustPreserveLocalDb', () => {
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
  });

  it('preserves when an activation license key is present', async () => {
    setLocalStorage({ dg_sm_license: 'DG-SM-TEST' });
    setIndexedDb({ databases: async () => [] });
    expect(await mustPreserveLocalDb()).toBe(true);
  });

  it('preserves when the DB-bootstrapped flag is set, even if databases() falsely reports empty', async () => {
    // Some WebViews stub indexedDB.databases() to always resolve [] instead of
    // throwing/being undefined — the bootstrap flag is an independent signal
    // that must still block a wipe in that case.
    setLocalStorage({ dg_sm_db_bootstrapped: '1' });
    setIndexedDb({ databases: async () => [] });
    expect(await mustPreserveLocalDb()).toBe(true);
  });

  it('preserves when indexedDB.databases is unsupported entirely', async () => {
    setLocalStorage({});
    setIndexedDb({});
    expect(await mustPreserveLocalDb()).toBe(true);
  });

  it('preserves when indexedDB.databases() throws', async () => {
    setLocalStorage({});
    setIndexedDb({
      databases: async () => {
        throw new Error('boom');
      },
    });
    expect(await mustPreserveLocalDb()).toBe(true);
  });

  it('preserves when the PGlite store is already registered in databases()', async () => {
    setLocalStorage({});
    setIndexedDb({ databases: async () => [{ name: '/pglite/dhandho-service-mobile' }] });
    expect(await mustPreserveLocalDb()).toBe(true);
  });

  it('allows wipe only when no license, no bootstrap flag, and the store is genuinely absent', async () => {
    setLocalStorage({});
    setIndexedDb({ databases: async () => [{ name: '/pglite/some-other-db' }] });
    expect(await mustPreserveLocalDb()).toBe(false);
  });

  it('allows wipe when indexedDB is entirely undefined and no localStorage signal is present', async () => {
    setLocalStorage({});
    setIndexedDb(undefined);
    expect(await mustPreserveLocalDb()).toBe(false);
  });
});
