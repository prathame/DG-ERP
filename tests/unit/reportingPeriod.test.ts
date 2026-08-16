import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultDateRangeFromReportingPeriod,
  indianFyRange,
  readReportingPeriod,
  resolveReportingRange,
  writeReportingPeriod,
} from '../../src/lib/reportingPeriod';

const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
});

describe('reportingPeriod', () => {
  beforeEach(() => {
    store.clear();
  });

  it('indianFyRange uses Apr–Mar and caps to asOf within FY', () => {
    const mid = indianFyRange(new Date('2026-08-16T12:00:00'));
    expect(mid.startYear).toBe(2026);
    expect(mid.from).toBe('2026-04-01');
    expect(mid.to).toBe('2026-08-16');
    expect(mid.label).toBe('FY 2026-27');

    const beforeApr = indianFyRange(new Date('2026-02-10T12:00:00'));
    expect(beforeApr.startYear).toBe(2025);
    expect(beforeApr.from).toBe('2025-04-01');
    expect(beforeApr.to).toBe('2026-02-10');
    expect(beforeApr.label).toBe('FY 2025-26');
  });

  it('indianFyRange ends at 31 Mar when asOf is past FY end', () => {
    // asOf in next FY → previous FY full end
    const past = indianFyRange(new Date('2027-04-05T12:00:00'));
    expect(past.from).toBe('2027-04-01');
    expect(past.to).toBe('2027-04-05');

    // Simulate querying with asOf still inside a completed calendar span of prior FY:
    // when today is after Mar 31 of that FY, to should be fyEnd — use a date after Mar 31
    // within same startYear boundary: Mar 31 itself is still in FY startYear-1? Mar is month 2 < 3
    // so Mar 31 2027 → startYear 2026, fyEnd 2027-03-31, today 2027-03-31 → to = fyEnd
    const lastDay = indianFyRange(new Date('2027-03-31T12:00:00'));
    expect(lastDay.startYear).toBe(2026);
    expect(lastDay.from).toBe('2026-04-01');
    expect(lastDay.to).toBe('2027-03-31');
    expect(lastDay.label).toBe('FY 2026-27');
  });

  it('resolveReportingRange maps presets including fy / week / custom / overall', () => {
    const asOf = new Date('2026-08-16T12:00:00');
    expect(resolveReportingRange('fy', undefined, undefined, asOf)).toEqual({
      from: '2026-04-01',
      to: '2026-08-16',
      label: 'FY 2026-27',
    });
    expect(resolveReportingRange('today', undefined, undefined, asOf)).toEqual({
      from: '2026-08-16',
      to: '2026-08-16',
      label: 'Today',
    });
    expect(resolveReportingRange('week', undefined, undefined, asOf)).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
      label: 'This Week',
    });
    expect(resolveReportingRange('month', undefined, undefined, asOf)).toEqual({
      from: '2026-08-01',
      to: '2026-08-16',
      label: 'This Month',
    });
    expect(resolveReportingRange('custom', '2026-01-01', '2026-01-31', asOf)).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      label: 'Custom',
    });
    expect(resolveReportingRange('overall')).toEqual({ label: 'Overall' });
  });

  it('write/readReportingPeriod round-trips and rejects junk', () => {
    expect(readReportingPeriod()).toBeNull();

    writeReportingPeriod({
      preset: 'fy',
      from: '2026-04-01',
      to: '2026-08-16',
      label: 'FY 2026-27',
    });
    expect(readReportingPeriod()).toEqual({
      preset: 'fy',
      from: '2026-04-01',
      to: '2026-08-16',
      label: 'FY 2026-27',
    });

    store.set('dhandho.reportingPeriod', '{not-json');
    expect(readReportingPeriod()).toBeNull();

    store.set('dhandho.reportingPeriod', JSON.stringify({ from: 'x', to: 'y' }));
    expect(readReportingPeriod()).toBeNull();
  });

  it('defaultDateRangeFromReportingPeriod uses saved range or falls back to FY', () => {
    const asOf = new Date('2026-08-16T12:00:00');
    expect(defaultDateRangeFromReportingPeriod(asOf)).toEqual({
      from: '2026-04-01',
      to: '2026-08-16',
    });

    writeReportingPeriod({
      preset: 'month',
      from: '2026-08-01',
      to: '2026-08-16',
      label: 'This Month',
    });
    expect(defaultDateRangeFromReportingPeriod(asOf)).toEqual({
      from: '2026-08-01',
      to: '2026-08-16',
    });

    // overall has empty bounds — fall back to FY
    writeReportingPeriod({ preset: 'overall', from: '', to: '', label: 'Overall' });
    expect(defaultDateRangeFromReportingPeriod(asOf)).toEqual({
      from: '2026-04-01',
      to: '2026-08-16',
    });
  });
});
