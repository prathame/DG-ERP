import { calendarDateIST } from './dateOnly';

export type DayActivityItem = {
  type: string;
  id: string;
  label: string;
  amount: number;
  date: string;
};

export type DayActivitySummary = {
  date: string;
  count: number;
  inflow: number;
  outflow: number;
  types: string[];
  items: DayActivityItem[];
};

export type CalendarCell = {
  date: string | null;
  inMonth: boolean;
  summary: DayActivitySummary | null;
};

/** First/last calendar day of a month (1-based month). */
export function monthDateBounds(year: number, month: number): { from: string; to: string } {
  const m = String(month).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${m}-01`,
    to: `${year}-${m}-${String(last).padStart(2, '0')}`,
  };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function isActivityOutflow(item: Pick<DayActivityItem, 'type' | 'amount'>): boolean {
  return item.type === 'expense' || item.amount < 0;
}

/** Group activity rows by IST calendar day. */
export function groupActivitiesByDay(items: DayActivityItem[]): Record<string, DayActivitySummary> {
  const map: Record<string, DayActivitySummary> = {};
  for (const raw of items) {
    const date = calendarDateIST(raw.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const item: DayActivityItem = {
      type: String(raw.type || ''),
      id: String(raw.id || ''),
      label: String(raw.label || ''),
      amount: Number(raw.amount) || 0,
      date,
    };
    let day = map[date];
    if (!day) {
      day = { date, count: 0, inflow: 0, outflow: 0, types: [], items: [] };
      map[date] = day;
    }
    day.items.push(item);
    day.count += 1;
    if (isActivityOutflow(item)) day.outflow += Math.abs(item.amount);
    else day.inflow += Math.abs(item.amount);
    if (item.type && !day.types.includes(item.type)) day.types.push(item.type);
  }
  for (const day of Object.values(map)) {
    day.items.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return Math.abs(b.amount) - Math.abs(a.amount);
    });
  }
  return map;
}

/**
 * Build a Mon–Sun grid for the month. Leading/trailing cells from adjacent months
 * have `inMonth: false` and still carry summaries when activity exists.
 */
export function buildMonthCalendarCells(
  year: number,
  month: number,
  byDay: Record<string, DayActivitySummary>,
): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  const startPad = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];

  const prev = shiftMonth(year, month, -1);
  const prevLast = new Date(prev.year, prev.month, 0).getDate();
  for (let i = startPad - 1; i >= 0; i--) {
    const day = prevLast - i;
    const date = `${prev.year}-${String(prev.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, inMonth: false, summary: byDay[date] || null });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, inMonth: true, summary: byDay[date] || null });
  }

  const next = shiftMonth(year, month, 1);
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const date = `${next.year}-${String(next.month).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
    cells.push({ date, inMonth: false, summary: byDay[date] || null });
    nextDay += 1;
  }

  return cells;
}
