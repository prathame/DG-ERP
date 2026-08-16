/**
 * Books period lock — reject voucher mutations on or before lock_date (close books).
 */
import type { Pool, PoolClient } from 'pg';

export class BooksPeriodLockedError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'BooksPeriodLockedError';
  }
}

type Db = Pool | PoolClient;

function asIsoDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/** True when date is on or before the lock (inclusive). */
export function isDateLocked(dateIso: string, lockDate: string | null | undefined): boolean {
  const d = asIsoDate(dateIso);
  const lock = asIsoDate(lockDate);
  if (!d || !lock) return false;
  return d <= lock;
}

export async function getBooksLockDate(db: Db, tenantId: string): Promise<string | null> {
  const row = (await db.query(`SELECT lock_date FROM book_settings WHERE tenant_id = $1`, [tenantId])).rows[0] as
    { lock_date?: unknown } | undefined;
  const iso = asIsoDate(row?.lock_date);
  return iso || null;
}

export async function setBooksLockDate(db: Db, tenantId: string, lockDate: string | null): Promise<string | null> {
  if (lockDate != null && lockDate !== '') {
    const iso = asIsoDate(lockDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new Error('lockDate must be YYYY-MM-DD or null');
    }
    await db.query(
      `INSERT INTO book_settings (tenant_id, lock_date, updated_at)
       VALUES ($1, $2::date, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET lock_date = EXCLUDED.lock_date, updated_at = NOW()`,
      [tenantId, iso],
    );
    return iso;
  }
  await db.query(
    `INSERT INTO book_settings (tenant_id, lock_date, updated_at)
     VALUES ($1, NULL, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET lock_date = NULL, updated_at = NOW()`,
    [tenantId],
  );
  return null;
}

/** Throw 409 if any of the dates fall on/before the books lock date. */
export async function assertBooksDatesUnlocked(
  db: Db,
  tenantId: string,
  dates: Array<string | null | undefined>,
): Promise<void> {
  const lockDate = await getBooksLockDate(db, tenantId);
  if (!lockDate) return;
  for (const raw of dates) {
    const d = asIsoDate(raw);
    if (d && isDateLocked(d, lockDate)) {
      throw new BooksPeriodLockedError(
        `Books are closed through ${lockDate}. Cannot change vouchers dated on or before that day.`,
      );
    }
  }
}
