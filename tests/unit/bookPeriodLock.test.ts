import { describe, expect, it } from 'vitest';
import { isDateLocked } from '../../server/services/bookPeriodLock';

describe('bookPeriodLock', () => {
  it('isDateLocked is inclusive on lock date', () => {
    expect(isDateLocked('2026-03-31', '2026-03-31')).toBe(true);
    expect(isDateLocked('2026-03-30', '2026-03-31')).toBe(true);
    expect(isDateLocked('2026-04-01', '2026-03-31')).toBe(false);
    expect(isDateLocked('2026-04-01', null)).toBe(false);
    expect(isDateLocked('', '2026-03-31')).toBe(false);
  });
});
