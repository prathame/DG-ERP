import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyReportingPreset,
  defaultDateRangeFromReportingPeriod,
  indianFyRange,
  indianLastFyRange,
  indianQuarterRange,
  localDateISO,
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
    });
    expect(resolveReportingRange('lastFy', undefined, undefined, asOf)).toEqual({
      from: '2025-04-01',
      to: '2026-03-31',
      label: 'FY 2025-26',
    });
    expect(resolveReportingRange('quarter', undefined, undefined, asOf)).toEqual({
      from: '2026-07-01',
      to: '2026-08-16',
      label: 'Q2 FY 2026-27',
    });
    expect(resolveReportingRange('overall')).toEqual({ label: 'Overall' });
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

    writeReportingPeriod({ preset: 'overall', from: '', to: '', label: 'Overall' });
    expect(defaultDateRangeFromReportingPeriod(asOf)).toEqual({
      from: '2026-04-01',
      to: '2026-08-16',
    });
  });
});
