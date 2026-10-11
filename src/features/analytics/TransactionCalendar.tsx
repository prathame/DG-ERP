/**
 * Month grid of real transactions (invoices, payments, sales, expenses, dispatches).
 * Fetches its own month window so Analytics range pills stay independent.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../api';
import { useTranslation } from '../../i18n';
import { calendarDateIST } from '../../../shared/dateOnly';
import {
  buildMonthCalendarCells,
  groupActivitiesByDay,
  isActivityOutflow,
  monthDateBounds,
  shiftMonth,
  type DayActivityItem,
} from '../../../shared/dayActivity';

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN');

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const TYPE_DOT: Record<string, string> = {
  payment: 'bg-[color:var(--dg-success)]',
  invoice: 'bg-violet-500',
  sale: 'bg-sky-500',
  distribution: 'bg-orange-500',
  expense: 'bg-[color:var(--dg-error)]',
};

type Props = {
  variant?: 'desktop' | 'mobile';
  activityLabel: (type: string) => string;
};

function monthTitle(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function TransactionCalendar({ variant = 'desktop', activityLabel }: Props) {
  const { t } = useTranslation();
  const mobile = variant === 'mobile';
  const today = calendarDateIST(new Date());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m };
  });
  const [selected, setSelected] = useState(today);
  const [items, setItems] = useState<DayActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = monthDateBounds(cursor.year, cursor.month);
    let cancelled = false;
    setLoading(true);
    api.dashboard
      .calendarActivity(from, to)
      .then(rows => {
        if (cancelled) return;
        setItems(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cursor.year, cursor.month]);

  const byDay = useMemo(() => groupActivitiesByDay(items), [items]);
  const cells = useMemo(
    () => buildMonthCalendarCells(cursor.year, cursor.month, byDay),
    [cursor.year, cursor.month, byDay],
  );
  const daySummary = byDay[selected] || null;

  const moveMonth = (delta: number) => {
    const next = shiftMonth(cursor.year, cursor.month, delta);
    setCursor(next);
    const { from } = monthDateBounds(next.year, next.month);
    const stillInMonth = selected.startsWith(`${next.year}-${String(next.month).padStart(2, '0')}`);
    if (!stillInMonth) setSelected(from);
  };

  const ink = mobile ? 'dg-m-ink' : 'dg-ink';
  const muted = mobile ? 'dg-m-muted' : 'dg-muted';
  const faint = mobile ? 'dg-m-faint' : 'dg-faint';
  const card = mobile ? 'dg-m-glass-card' : 'dg-glass-card';
  const success = mobile ? 'dg-m-success' : 'dg-success';
  const error = mobile ? 'dg-m-error' : 'dg-error';

  return (
    <div className={cn(card, mobile ? 'rounded-2xl p-3.5' : 'rounded-3xl p-8')}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className={cn(mobile ? 'text-[13px]' : 'text-lg', 'font-bold', ink)}>{t('dashboard.dayTransactions')}</h3>
          <p className={cn('text-xs mt-0.5', faint)}>{t('dashboard.dayTransactionsHint')}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            className={cn('p-2 rounded-lg', muted, 'hover:opacity-80')}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className={cn('text-sm font-bold tabular-nums min-w-[8.5rem] text-center', ink)}>
            {monthTitle(cursor.year, cursor.month)}
          </span>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            className={cn('p-2 rounded-lg', muted, 'hover:opacity-80')}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className={cn('text-center text-[10px] font-bold uppercase tracking-wider py-1', faint)}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={i} />;
          const isSelected = cell.date === selected;
          const isToday = cell.date === today;
          const has = Boolean(cell.summary?.count);
          const dayNum = Number(cell.date.slice(8, 10));
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => setSelected(cell.date!)}
              className={cn(
                'relative aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all',
                !cell.inMonth && 'opacity-35',
                isSelected
                  ? 'dg-bg-primary shadow-md'
                  : has
                    ? 'bg-[var(--dg-input)] hover:opacity-90'
                    : 'hover:bg-[var(--dg-input)]',
                isToday && !isSelected && 'ring-1 ring-[color:var(--dg-primary)]',
              )}
            >
              <span
                className={cn(
                  'text-xs font-bold tabular-nums',
                  isSelected ? 'text-white' : ink,
                  !cell.inMonth && !isSelected && faint,
                )}
              >
                {dayNum}
              </span>
              {has ? (
                <span className="flex gap-0.5 max-w-full px-0.5 justify-center flex-wrap">
                  {(cell.summary?.types || []).slice(0, 3).map(type => (
                    <span
                      key={type}
                      className={cn(
                        'w-1 h-1 rounded-full',
                        isSelected ? 'bg-white/90' : TYPE_DOT[type] || 'bg-[color:var(--dg-primary)]',
                      )}
                    />
                  ))}
                </span>
              ) : (
                <span className="h-1" />
              )}
            </button>
          );
        })}
      </div>

      <div className={cn('mt-5 pt-4 border-t border-[var(--dg-card-border)]')}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className={cn('text-sm font-bold', ink)}>{formatDate(selected)}</p>
          {daySummary ? (
            <p className={cn('text-[11px] font-bold tabular-nums', muted)}>
              <span className={success}>+{fmt(daySummary.inflow)}</span>
              {daySummary.outflow > 0 ? (
                <>
                  {' · '}
                  <span className={error}>-{fmt(daySummary.outflow)}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cn('h-10 rounded-xl animate-pulse', mobile ? 'dg-m-glass-card' : 'bg-[var(--dg-input)]')}
              />
            ))}
          </div>
        ) : !daySummary?.items.length ? (
          <p className={cn('text-sm text-center py-6', muted)}>{t('dashboard.noDayActivity')}</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {daySummary.items.map(a => {
              const outflow = isActivityOutflow(a);
              return (
                <div
                  key={`${a.type}-${a.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 bg-[var(--dg-input)]"
                >
                  <div className="min-w-0">
                    <p className={cn('text-[13px] font-bold truncate', ink)}>{a.label}</p>
                    <p className={cn('text-[11px]', muted)}>{activityLabel(a.type)}</p>
                  </div>
                  <span className={cn('text-[13px] font-bold tabular-nums shrink-0', outflow ? error : success)}>
                    {outflow ? '-' : '+'}
                    {fmt(a.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
