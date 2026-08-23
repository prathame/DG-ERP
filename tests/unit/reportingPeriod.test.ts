import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFinancialYear,
  applyReportingPreset,
  defaultDateRangeFromReportingPeriod,
  indianFyRange,
  indianFyRangeForStartYear,
  indianLastFyRange,
  indianQuarterRange,
  listIndianFinancialYears,
  localDateISO,
  matchFyStartYear,
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

  it('localDateISO uses local calendar day', () => {
    expect(localDateISO(new Date(2026, 7, 16, 0, 30))).toBe('2026-08-16');
  });

  it('indianFyRange uses Apr–Mar and caps to asOf within FY', () => {
    const mid = indianFyRange(new Date(2026, 7, 16, 12));
    expect(mid.startYear).toBe(2026);
    expect(mid.from).toBe('2026-04-01');
    expect(mid.to).toBe('2026-08-16');
    expect(mid.label).toBe('FY 2026-27');

    const beforeApr = indianFyRange(new Date(2026, 1, 10, 12));
    expect(beforeApr.startYear).toBe(2025);
    expect(beforeApr.from).toBe('2025-04-01');
    expect(beforeApr.to).toBe('2026-02-10');
    expect(beforeApr.label).toBe('FY 2025-26');
  });

  it('indianLastFyRange returns previous full FY', () => {
    const last = indianLastFyRange(new Date(2026, 7, 16, 12));
    expect(last).toEqual({
      from: '2025-04-01',
      to: '2026-03-31',
      label: 'FY 2025-26',
      startYear: 2025,
    });
  });

  it('indianQuarterRange maps FY quarters', () => {
    const q2 = indianQuarterRange(new Date(2026, 7, 16, 12)); // Aug → Q2
    expect(q2.quarter).toBe(2);
    expect(q2.from).toBe('2026-07-01');
    expect(q2.to).toBe('2026-08-16');

    const q4 = indianQuarterRange(new Date(2026, 1, 10, 12)); // Feb → Q4 of FY25-26
    expect(q4.quarter).toBe(4);
    expect(q4.from).toBe('2026-01-01');
    expect(q4.to).toBe('2026-02-10');
  });

  it('resolveReportingRange maps presets including lastFy / quarter', () => {
    const asOf = new Date(2026, 7, 16, 12);
    expect(resolveReportingRange('fy', undefined, undefined, asOf)).toEqual({
      from: '2026-04-01',
      to: '2026-08-16',
      label: 'FY 2026-27',
      fyStartYear: 2026,
    });
    expect(resolveReportingRange('lastFy', undefined, undefined, asOf)).toEqual({
      from: '2025-04-01',
      to: '2026-03-31',
      label: 'FY 2025-26',
      fyStartYear: 2025,
    });
    expect(resolveReportingRange('fy', undefined, undefined, asOf, 2023)).toEqual({
      from: '2023-04-01',
      to: '2024-03-31',
      label: 'FY 2023-24',
      fyStartYear: 2023,
    });
    expect(resolveReportingRange('quarter', undefined, undefined, asOf)).toEqual({
      from: '2026-07-01',
      to: '2026-08-16',
      label: 'Q2 FY 2026-27',
    });
    expect(resolveReportingRange('overall')).toEqual({ label: 'Overall' });
  });

  it('listIndianFinancialYears and applyFinancialYear cover older years', () => {
    const asOf = new Date(2026, 7, 16, 12);
    const list = listIndianFinancialYears(asOf, 5);
    expect(list.map(x => x.startYear)).toEqual([2026, 2025, 2024, 2023, 2022]);
    expect(list[2]).toEqual({
      from: '2024-04-01',
      to: '2025-03-31',
      label: 'FY 2024-25',
      startYear: 2024,
    });

    const applied = applyFinancialYear(2023, asOf);
    expect(applied.label).toBe('FY 2023-24');
    expect(readReportingPeriod()?.fyStartYear).toBe(2023);
    expect(matchFyStartYear(applied.from, applied.to, asOf)).toBe(2023);
    expect(indianFyRangeForStartYear(2026, asOf).to).toBe('2026-08-16');
  });

  it('applyReportingPreset persists and seeds defaults', () => {
    const asOf = new Date(2026, 7, 16, 12);
    const applied = applyReportingPreset('lastFy', asOf);
    expect(applied?.from).toBe('2025-04-01');
    expect(readReportingPeriod()?.preset).toBe('lastFy');
    expect(defaultDateRangeFromReportingPeriod(asOf)).toEqual({
      from: '2025-04-01',
      to: '2026-03-31',
    });

    applyFinancialYear(2023, asOf);
    expect(defaultDateRangeFromReportingPeriod(asOf)).toEqual({
      from: '2023-04-01',
      to: '2024-03-31',
    });

    writeReportingPeriod({ preset: 'overall', from: '', to: '', label: 'Overall' });
    expect(defaultDateRangeFromReportingPeriod(asOf)).toEqual({
      from: '2026-04-01',
      to: '2026-08-16',
    });
  });
});
