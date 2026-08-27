import { describe, expect, it } from 'vitest';
import { calendarDateIST, isProductExpired } from '../../shared/dateOnly';
import { formatDate } from '../../src/lib/utils';

describe('calendarDateIST', () => {
  it('keeps a plain YYYY-MM-DD string', () => {
    expect(calendarDateIST('2026-08-27')).toBe('2026-08-27');
  });

  it('uses IST calendar day for UTC midnight of the previous IST morning', () => {
    // 2026-08-26T18:30:00.000Z is 27 Aug 2026 00:00 IST
    expect(calendarDateIST(new Date('2026-08-26T18:30:00.000Z'))).toBe('2026-08-27');
  });

  it('does not UTC-slice an IST midnight stored as timestamptz', () => {
    expect(calendarDateIST('2026-08-26T18:30:00.000Z')).toBe('2026-08-27');
  });
});

describe('formatDate', () => {
  it('formats a date-only string on the local calendar (no UTC shift)', () => {
    expect(formatDate('2026-08-27')).toBe('27 Aug 2026');
  });
});

describe('isProductExpired', () => {
  it('blocks sale after the expiry date, allows sale on the expiry day', () => {
    expect(isProductExpired('2026-08-26', '2026-08-27')).toBe(true);
    expect(isProductExpired('2026-08-27', '2026-08-27')).toBe(false);
    expect(isProductExpired('2026-08-28', '2026-08-27')).toBe(false);
  });

  it('allows sale when expiry is blank', () => {
    expect(isProductExpired(null, '2026-08-27')).toBe(false);
    expect(isProductExpired('', '2026-08-27')).toBe(false);
  });
});
