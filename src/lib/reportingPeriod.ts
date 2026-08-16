/**
 * Shared reporting period (Indian FY Apr–Mar) for Analytics → Accounts and other date filters.
 * Stored in localStorage so a choice on Analytics can seed other views.
 */
export type ReportingPeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'fy' | 'lastFy' | 'overall' | 'custom';

export type ReportingPeriod = {
  preset: ReportingPeriodPreset;
  from: string;
  to: string;
  /** Display label e.g. FY 2025-26 */
  label?: string;
  /** When preset is fy / lastFy — which Apr-start year was chosen in the FY dropdown */
  fyStartYear?: number;
};

export type IndianFyOption = {
  from: string;
  to: string;
  label: string;
  startYear: number;
};

const STORAGE_KEY = 'dhandho.reportingPeriod';

/** Local calendar YYYY-MM-DD (avoids UTC day shift from toISOString). */
export function localDateISO(asOf = new Date()): string {
  const y = asOf.getFullYear();
  const m = String(asOf.getMonth() + 1).padStart(2, '0');
  const d = String(asOf.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clampTo(asOfIso: string, endIso: string): string {
  return asOfIso < endIso ? asOfIso : endIso;
}

function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

/** Bounds for a specific Indian FY start year (Apr). Current FY caps `to` at asOf. */
export function indianFyRangeForStartYear(startYear: number, asOf = new Date()): IndianFyOption {
  const from = `${startYear}-04-01`;
  const fyEnd = `${startYear + 1}-03-31`;
  const today = localDateISO(asOf);
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  const currentStart = m >= 3 ? y : y - 1;
  const to = startYear === currentStart ? clampTo(today, fyEnd) : fyEnd;
  return { from, to, label: fyLabel(startYear), startYear };
}

/** Indian financial year bounds (Apr 1 → today, or full FY end if `asOf` is past FY). */
export function indianFyRange(asOf = new Date()): IndianFyOption {
  const y = asOf.getFullYear();
  const m = asOf.getMonth(); // 0-based; Apr = 3
  const startYear = m >= 3 ? y : y - 1;
  return indianFyRangeForStartYear(startYear, asOf);
}

/** Previous full Indian FY (Apr 1 → Mar 31). */
export function indianLastFyRange(asOf = new Date()): IndianFyOption {
  return indianFyRangeForStartYear(indianFyRange(asOf).startYear - 1, asOf);
}

/** Dropdown options: current FY first, then prior years (default 12). */
export function listIndianFinancialYears(asOf = new Date(), count = 12): IndianFyOption[] {
  const current = indianFyRange(asOf).startYear;
  const n = Math.max(1, Math.min(count, 40));
  const out: IndianFyOption[] = [];
  for (let i = 0; i < n; i++) {
    out.push(indianFyRangeForStartYear(current - i, asOf));
  }
  return out;
}

/** Match a date range back to an FY start year for the dropdown selection. */
export function matchFyStartYear(from?: string, to?: string, asOf = new Date()): number | null {
  if (!from || !/^(\d{4})-04-01$/.test(from)) return null;
  const startYear = Number(from.slice(0, 4));
  if (!Number.isFinite(startYear)) return null;
  const expected = indianFyRangeForStartYear(startYear, asOf);
  if (to === expected.to) return startYear;
  if (to === `${startYear + 1}-03-31`) return startYear;
  return null;
}

/**
 * Current Indian FY quarter (Q1 Apr–Jun … Q4 Jan–Mar), capped to asOf within the quarter.
 */
export function indianQuarterRange(asOf = new Date()): {
  from: string;
  to: string;
  label: string;
  quarter: 1 | 2 | 3 | 4;
} {
  const fy = indianFyRange(asOf);
  const today = localDateISO(asOf);
  const month = asOf.getMonth(); // 0-based
  let quarter: 1 | 2 | 3 | 4;
  let from: string;
  let end: string;
  if (month >= 3 && month <= 5) {
    quarter = 1;
    from = `${fy.startYear}-04-01`;
    end = `${fy.startYear}-06-30`;
  } else if (month >= 6 && month <= 8) {
    quarter = 2;
    from = `${fy.startYear}-07-01`;
    end = `${fy.startYear}-09-30`;
  } else if (month >= 9 && month <= 11) {
    quarter = 3;
    from = `${fy.startYear}-10-01`;
    end = `${fy.startYear}-12-31`;
  } else {
    quarter = 4;
    from = `${fy.startYear + 1}-01-01`;
    end = `${fy.startYear + 1}-03-31`;
  }
  return {
    from,
    to: clampTo(today, end),
    label: `Q${quarter} FY ${fy.startYear}-${String(fy.startYear + 1).slice(-2)}`,
    quarter,
  };
}

export function resolveReportingRange(
  preset: ReportingPeriodPreset,
  customFrom?: string,
  customTo?: string,
  asOf = new Date(),
  fyStartYear?: number,
): { from?: string; to?: string; label?: string; fyStartYear?: number } {
  const today = localDateISO(asOf);
  if (preset === 'today') return { from: today, to: today, label: 'Today' };
  if (preset === 'week') {
    const d = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() - 6);
    return { from: localDateISO(d), to: today, label: 'This Week' };
  }
  if (preset === 'month') {
    return { from: `${today.slice(0, 7)}-01`, to: today, label: 'This Month' };
  }
  if (preset === 'quarter') {
    const q = indianQuarterRange(asOf);
    return { from: q.from, to: q.to, label: q.label };
  }
  if (preset === 'fy' || preset === 'lastFy') {
    const start =
      typeof fyStartYear === 'number' && Number.isFinite(fyStartYear)
        ? fyStartYear
        : preset === 'lastFy'
          ? indianFyRange(asOf).startYear - 1
          : indianFyRange(asOf).startYear;
    const fy = indianFyRangeForStartYear(start, asOf);
    return { from: fy.from, to: fy.to, label: fy.label, fyStartYear: fy.startYear };
  }
  if (preset === 'custom') {
    return { from: customFrom || undefined, to: customTo || undefined, label: 'Custom' };
  }
  // overall — no date bounds
  return { label: 'Overall' };
}

export function readReportingPeriod(): ReportingPeriod | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReportingPeriod;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.preset) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeReportingPeriod(period: ReportingPeriod): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(period));
  } catch {
    /* private mode / quota */
  }
}

/** Apply a preset: resolve dates and persist for other views. */
export function applyReportingPreset(
  preset: ReportingPeriodPreset,
  asOf = new Date(),
): { from: string; to: string; label: string } | null {
  const resolved = resolveReportingRange(preset, undefined, undefined, asOf);
  if (!resolved.from || !resolved.to) return null;
  const label = resolved.label || preset;
  writeReportingPeriod({
    preset,
    from: resolved.from,
    to: resolved.to,
    label,
    fyStartYear: resolved.fyStartYear,
  });
  return { from: resolved.from, to: resolved.to, label };
}

/** Apply a specific Indian FY from the year dropdown. */
export function applyFinancialYear(
  startYear: number,
  asOf = new Date(),
): { from: string; to: string; label: string; startYear: number } {
  const fy = indianFyRangeForStartYear(startYear, asOf);
  writeReportingPeriod({
    preset: 'fy',
    from: fy.from,
    to: fy.to,
    label: fy.label,
    fyStartYear: fy.startYear,
  });
  return fy;
}

/** Seed Accounts/Books date inputs from the last Analytics (or shared) choice. */
export function defaultDateRangeFromReportingPeriod(asOf = new Date()): { from: string; to: string } {
  const saved = readReportingPeriod();
  if (saved?.from && saved?.to) return { from: saved.from, to: saved.to };
  const fy = indianFyRange(asOf);
  return { from: fy.from, to: fy.to };
}
