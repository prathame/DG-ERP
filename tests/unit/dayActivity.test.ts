import { describe, it, expect } from 'vitest';
import {
  buildMonthCalendarCells,
  groupActivitiesByDay,
  isActivityOutflow,
  monthDateBounds,
  shiftMonth,
} from '../../shared/dayActivity';

describe('dayActivity', () => {
  it('computes month bounds and shifts months across year', () => {
    expect(monthDateBounds(2026, 4)).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(monthDateBounds(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
  });

  it('groups mixed activity by day with inflow/outflow', () => {
    const byDay = groupActivitiesByDay([
      { type: 'payment', id: 'p1', label: 'A', amount: 1000, date: '2026-04-07' },
      { type: 'invoice', id: 'i1', label: 'B', amount: 500, date: '2026-04-07T10:00:00.000Z' },
      { type: 'expense', id: 'e1', label: 'Travel', amount: 200, date: '2026-04-07' },
      { type: 'sale', id: 's1', label: 'C', amount: 50, date: '2026-04-08' },
    ]);
    expect(byDay['2026-04-07'].count).toBe(3);
    expect(byDay['2026-04-07'].inflow).toBe(1500);
    expect(byDay['2026-04-07'].outflow).toBe(200);
    expect(byDay['2026-04-07'].types).toEqual(expect.arrayContaining(['payment', 'invoice', 'expense']));
    expect(byDay['2026-04-08'].count).toBe(1);
    expect(isActivityOutflow({ type: 'expense', amount: 10 })).toBe(true);
    expect(isActivityOutflow({ type: 'payment', amount: 10 })).toBe(false);
  });

  it('builds a Monday-start grid with adjacent-month padding', () => {
    // April 2026 starts on Wednesday
    const cells = buildMonthCalendarCells(2026, 4, {
      '2026-04-07': {
        date: '2026-04-07',
        count: 1,
        inflow: 100,
        outflow: 0,
        types: ['payment'],
        items: [{ type: 'payment', id: 'p', label: 'X', amount: 100, date: '2026-04-07' }],
      },
    });
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBeGreaterThanOrEqual(35);
    const leading = cells.filter(c => !c.inMonth && c.date && c.date.startsWith('2026-03'));
    expect(leading.length).toBe(2); // Mon Tue before Wed Apr 1
    expect(leading.map(c => c.date)).toEqual(['2026-03-30', '2026-03-31']);
    const apr7 = cells.find(c => c.date === '2026-04-07');
    expect(apr7?.inMonth).toBe(true);
    expect(apr7?.summary?.count).toBe(1);
  });
});
