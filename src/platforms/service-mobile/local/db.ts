/**
 * PGlite local database for Service Mobile (source of truth on device).
 */
import { PGlite } from '@electric-sql/pglite';
import { SERVICE_MOBILE_MIGRATIONS_SQL, SERVICE_MOBILE_SCHEMA_SQL } from './schema';
import { isJsonTablesDump } from './backupPayload';

export { isJsonTablesDump } from './backupPayload';

let db: PGlite | null = null;
let ready: Promise<PGlite> | null = null;

/** Run each ALTER separately so one failure does not skip the rest (and is logged). */
async function runMigrations(instance: PGlite): Promise<void> {
  const statements = SERVICE_MOBILE_MIGRATIONS_SQL.split(';')
    .map(s => s.trim())
    .filter(Boolean);
  const failures: string[] = [];
  for (const sql of statements) {
    try {
      await instance.exec(`${sql};`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${sql.slice(0, 72)}… → ${msg}`);
      console.warn('[service-mobile] migration statement failed:', sql.slice(0, 100), err);
    }
  }
  if (failures.length) {
    console.warn(
      `[service-mobile] ${failures.length}/${statements.length} migration statement(s) failed — app will continue; some features may error until DB is reset`,
      failures,
    );
  }
}

async function createAndMigrate(): Promise<PGlite> {
  const instance = await PGlite.create('idb://dhandho-service-mobile');
  await instance.exec(SERVICE_MOBILE_SCHEMA_SQL);
  await runMigrations(instance);
  return instance;
}

/** After `db` is assigned — remaps legacy convert line/party shape (idempotent). */
async function runDataRepairs(): Promise<void> {
  try {
    const { repairLegacyConvertedInvoices } = await import('./repairConvertedInvoices');
    await repairLegacyConvertedInvoices();
  } catch (err) {
    console.warn('[service-mobile] convert-invoice repair skipped', err);
  }
}

async function deleteIdbStore(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('/pglite/dhandho-service-mobile');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function getLocalDb(): Promise<PGlite> {
  if (db) return db;
  if (!ready) {
    ready = (async () => {
      try {
        const instance = await createAndMigrate();
        db = instance;
        await runDataRepairs();
        return instance;
      } catch (first) {
        // Corrupted IDB or interrupted first boot (common after Vite/WASM hiccups) — wipe once and retry.
        console.warn('[service-mobile] PGlite open failed, wiping IndexedDB and retrying', first);
        await deleteIdbStore();
        const instance = await createAndMigrate();
        db = instance;
        await runDataRepairs();
        return instance;
      }
    })().catch(err => {
      ready = null;
      db = null;
      throw err;
    });
  }
  return ready;
}

export async function localQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const d = await getLocalDb();
  const result = await d.query<T>(sql, params);
  return { rows: result.rows ?? [], rowCount: result.affectedRows ?? result.rows?.length ?? 0 };
}

export async function localExec(sql: string): Promise<void> {
  const d = await getLocalDb();
  await d.exec(sql);
}

/** ERP tables dumped/restored for Offline Mobile JSON fallback backup. */
const LOCAL_ERP_TABLES = [
  'plans',
  'tenants',
  'users',
  'vendors',
  'customers',
  'categories',
  'products',
  'banks',
  'expenses',
  'quotations',
  'orders',
  'standalone_invoices',
  'invoice_payments',
  'price_lists',
  'bill_settings',
  'tenant_notifications',
  'staff_members',
  'staff_payments',
  'suppliers',
  'product_purchases',
  'supplier_payments',
  'audit_log',
] as const;

const RESTORE_TABLE_ALLOWLIST = new Set<string>([...LOCAL_ERP_TABLES, 'sm_meta']);

/** Dump raw SQL dump for encrypted backup (pg_dump-style text). */
export async function dumpLocalDb(): Promise<Uint8Array> {
  const d = await getLocalDb();
  // PGlite dump API — fall back to JSON export of key tables
  try {
    const dumpFn = (d as unknown as { dumpDataDir?: () => Promise<Blob | File> }).dumpDataDir;
    if (typeof dumpFn === 'function') {
      const blob = await dumpFn.call(d);
      return new Uint8Array(await blob.arrayBuffer());
    }
  } catch {
    /* fall through */
  }
  const payload: Record<string, unknown[]> = {};
  for (const t of LOCAL_ERP_TABLES) {
    try {
      const { rows } = await localQuery(`SELECT * FROM ${t}`);
      payload[t] = rows;
    } catch {
      payload[t] = [];
    }
  }
  return new TextEncoder().encode(JSON.stringify({ v: 1, tables: payload }));
}

const IDENT = /^[a-z_][a-z0-9_]*$/i;

export async function restoreLocalDbFromJson(
  bytes: Uint8Array,
  onProgress?: (info: { tablesDone: number; tablesTotal: number; table: string }) => void | Promise<void>,
): Promise<void> {
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as {
    v?: number;
    tables?: { [table: string]: Array<Record<string, unknown>> };
  };
  if (!parsed.tables) throw new Error('Invalid backup format');
  const d = await getLocalDb();
  await d.exec(SERVICE_MOBILE_SCHEMA_SQL);
  await runMigrations(d);
  const entries = Object.entries(parsed.tables).filter(
    ([table, rows]) => RESTORE_TABLE_ALLOWLIST.has(table) && IDENT.test(table) && rows?.length,
  );
  const tablesTotal = Math.max(1, entries.length);
  let tablesDone = 0;
  for (const [table, rows] of entries) {
    for (const row of rows) {
      const cols = Object.keys(row).filter(c => IDENT.test(c));
      if (!cols.length) continue;
      const vals = cols.map(c => row[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      try {
        await d.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
      } catch {
        /* skip incompatible rows */
      }
    }
    tablesDone += 1;
    await onProgress?.({ tablesDone, tablesTotal, table });
  }
  await runDataRepairs();
}

/**
 * Restore a PGlite `dumpDataDir()` tarball (what encryptBackup usually stores).
 * Caller must wipe IndexedDB first; this opens a fresh IDB with loadDataDir.
 */
export async function restoreLocalDbFromPgliteDump(bytes: Uint8Array): Promise<void> {
  db = null;
  ready = null;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/x-tar' });
  const instance = await PGlite.create('idb://dhandho-service-mobile', { loadDataDir: blob });
  await runMigrations(instance);
  db = instance;
  ready = Promise.resolve(instance);
  await runDataRepairs();
}

/** Dispatch JSON table dump vs PGlite tar after decrypt. DB must already be wiped. */
export async function restoreLocalDbPlaintext(
  bytes: Uint8Array,
  onProgress?: (info: { tablesDone: number; tablesTotal: number; table: string }) => void | Promise<void>,
): Promise<void> {
  if (isJsonTablesDump(bytes)) {
    await getLocalDb();
    await restoreLocalDbFromJson(bytes, onProgress);
    return;
  }
  // Tar restore is one opaque step — report coarse apply progress for UI.
  await onProgress?.({ tablesDone: 0, tablesTotal: 1, table: 'database' });
  await restoreLocalDbFromPgliteDump(bytes);
  await onProgress?.({ tablesDone: 1, tablesTotal: 1, table: 'database' });
}

export async function wipeLocalDb(): Promise<void> {
  db = null;
  ready = null;
  await deleteIdbStore();
}
