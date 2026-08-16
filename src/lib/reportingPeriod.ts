/**
 * Shared reporting period (Indian FY Apr–Mar) for Analytics → Accounts and other date filters.
 * Stored in localStorage so a choice on Analytics can seed other views.
 */
export type ReportingPeriodPreset = 'today' | 'week' | 'month' | 'fy' | 'overall' | 'custom';

export type ReportingPeriod = {
  preset: ReportingPeriodPreset;
  from: string;
  to: string;
  /** Display label e.g. FY 2025-26 */
  label?: string;
};

const STORAGE_KEY = 'dhandho.reportingPeriod';

/** Indian financial year bounds (Apr 1 → today, or full FY end if `asOf` is past FY). */
export function indianFyRange(asOf = new Date()): { from: string; to: string; label: string; startYear: number } {
  const y = asOf.getFullYear();
  const m = asOf.getMonth(); // 0-based; Apr = 3
  const startYear = m >= 3 ? y : y - 1;
  const from = `${startYear}-04-01`;
  const fyEnd = `${startYear + 1}-03-31`;
  const today = asOf.toISOString().slice(0, 10);
  const to = today < fyEnd ? today : fyEnd;
  const label = `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
  return { from, to, label, startYear };
}

export function resolveReportingRange(
  preset: ReportingPeriodPreset,
  customFrom?: string,
  customTo?: string,
  asOf = new Date(),
): { from?: string; to?: string; label?: string } {
  const today = asOf.toISOString().slice(0, 10);
  if (preset === 'today') return { from: today, to: today, label: 'Today' };
  if (preset === 'week') {
    const d = new Date(asOf);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: today, label: 'This Week' };
  }
  if (preset === 'month') {
    return { from: `${today.slice(0, 7)}-01`, to: today, label: 'This Month' };
  }
  if (preset === 'fy') {
    const fy = indianFyRange(asOf);
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

/** Seed Accounts/Books date inputs from the last Analytics (or shared) choice. */
export function defaultDateRangeFromReportingPeriod(asOf = new Date()): { from: string; to: string } {
  const saved = readReportingPeriod();
  if (saved?.from && saved?.to) return { from: saved.from, to: saved.to };
  const fy = indianFyRange(asOf);
  return { from: fy.from, to: fy.to };
}
