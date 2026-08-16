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

/** Indian financial year bounds (Apr 1 → today, or full FY end if `asOf` is past FY). */
export function indianFyRange(asOf = new Date()): { from: string; to: string; label: string; startYear: number } {
  const y = asOf.getFullYear();
  const m = asOf.getMonth(); // 0-based; Apr = 3
  const startYear = m >= 3 ? y : y - 1;
  const from = `${startYear}-04-01`;
  const fyEnd = `${startYear + 1}-03-31`;
  const today = localDateISO(asOf);
  const to = clampTo(today, fyEnd);
  const label = `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
  return { from, to, label, startYear };
}

/** Previous full Indian FY (Apr 1 → Mar 31). */
export function indianLastFyRange(asOf = new Date()): { from: string; to: string; label: string; startYear: number } {
  const current = indianFyRange(asOf);
  const startYear = current.startYear - 1;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
    label: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
    startYear,
  };
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
): { from?: string; to?: string; label?: string } {
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
  if (preset === 'fy') {
    const fy = indianFyRange(asOf);
    return { from: fy.from, to: fy.to, label: fy.label };
  }
  if (preset === 'lastFy') {
    const fy = indianLastFyRange(asOf);
    return { from: fy.from, to: fy.to, label: fy.label };
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
  writeReportingPeriod({ preset, from: resolved.from, to: resolved.to, label });
  return { from: resolved.from, to: resolved.to, label };
}

/** Seed Accounts/Books date inputs from the last Analytics (or shared) choice. */
export function defaultDateRangeFromReportingPeriod(asOf = new Date()): { from: string; to: string } {
  const saved = readReportingPeriod();
  if (saved?.from && saved?.to) return { from: saved.from, to: saved.to };
  const fy = indianFyRange(asOf);
  return { from: fy.from, to: fy.to };
}
