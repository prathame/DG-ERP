import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { assertBooksDatesUnlocked, BooksPeriodLockedError, isDateLocked } from '../../server/services/bookPeriodLock';

describe('bookPeriodLock', () => {
  it('isDateLocked is inclusive on lock date', () => {
    expect(isDateLocked('2026-03-31', '2026-03-31')).toBe(true);
    expect(isDateLocked('2026-03-30', '2026-03-31')).toBe(true);
    expect(isDateLocked('2026-04-01', '2026-03-31')).toBe(false);
    expect(isDateLocked('2026-04-01', null)).toBe(false);
    expect(isDateLocked('', '2026-03-31')).toBe(false);
  });

  it('rejects locked operation dates and allows later dates', async () => {
    const db = { query: async () => ({ rows: [{ lock_date: '2026-03-31' }] }) } as unknown as Pool;
    await expect(assertBooksDatesUnlocked(db, 'T-LOCK', ['2026-03-31'])).rejects.toBeInstanceOf(BooksPeriodLockedError);
    await expect(assertBooksDatesUnlocked(db, 'T-LOCK', ['2026-04-01'])).resolves.toBeUndefined();
  });
});
