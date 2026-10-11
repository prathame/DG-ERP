/**
 * Compact month grid of real transactions (invoices, payments, sales, expenses, dispatches).
 * Desktop: calendar + day list side-by-side (reference fiscal-calendar density).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
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

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

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
  onOpenActivity?: (activity: DayActivityItem) => void;
};

function monthShort(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();
}

export function TransactionCalendar({ variant = 'desktop', activityLabel, onOpenActivity }: Props) {
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

  const dayList = (
    <div className={cn('flex flex-col min-h-0', mobile ? 'mt-3' : '')}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className={cn('text-[11px] font-bold uppercase tracking-wider', faint)}>{formatDate(selected)}</p>
        {daySummary ? (
          <p className={cn('text-[10px] font-bold tabular-nums', muted)}>
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
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={cn('h-8 rounded-lg animate-pulse', 'bg-[var(--dg-input)]')} />
          ))}
        </div>
      ) : !daySummary?.items.length ? (
        <p className={cn('text-xs text-center py-4', muted)}>{t('dashboard.noDayActivity')}</p>
      ) : (
        <div className={cn('space-y-1 overflow-y-auto', mobile ? 'max-h-40' : 'max-h-44')}>
          {daySummary.items.map(a => {
            const outflow = isActivityOutflow(a);
            const body = (
              <>
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                    TYPE_DOT[a.type] || 'bg-[color:var(--dg-primary)]',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-[12px] font-semibold truncate', ink)}>{a.label}</p>
                    <span className={cn('text-[11px] font-bold tabular-nums shrink-0', outflow ? error : success)}>
                      {outflow ? '-' : '+'}
                      {fmt(a.amount)}
                    </span>
                  </div>
                  <p className={cn('text-[10px] tabular-nums', faint)}>{activityLabel(a.type)}</p>
                </div>
              </>
            );
            const rowClass = 'flex items-start gap-2 rounded-lg px-2 py-1.5 bg-[var(--dg-input)] w-full text-left';
            return onOpenActivity ? (
              <button
                key={`${a.type}-${a.id}`}
                type="button"
                onClick={() => onOpenActivity(a)}
                className={cn(rowClass, 'hover:opacity-90 transition-opacity')}
              >
                {body}
              </button>
            ) : (
              <div key={`${a.type}-${a.id}`} className={rowClass}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const calendarGrid = (
    <div className={cn(mobile ? '' : 'rounded-xl bg-[var(--dg-input)]/60 p-2')}>
      <div className="grid grid-cols-7 text-center mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className={cn('text-[10px] font-bold uppercase tracking-wider py-0.5', faint)}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
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
                'relative py-1 rounded-lg text-[11px] font-semibold tabular-nums transition-all',
                !cell.inMonth && 'opacity-40',
                isSelected
                  ? 'dg-bg-primary text-white shadow-sm'
                  : has
                    ? 'bg-[var(--dg-card-bg,var(--dg-input))] hover:opacity-90'
                    : 'hover:bg-[var(--dg-input)]',
                isToday && !isSelected && 'ring-1 ring-[color:var(--dg-primary)]',
                !isSelected && ink,
              )}
            >
              {dayNum}
              {has ? (
                <span
                  className={cn(
                    'absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full',
                    isSelected ? 'bg-white/90' : TYPE_DOT[cell.summary!.types[0]] || 'bg-[color:var(--dg-primary)]',
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cn(card, mobile ? 'rounded-2xl p-3.5' : 'rounded-2xl p-5')}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              mobile ? 'bg-[var(--dg-input)]' : 'bg-[var(--dg-input)]',
            )}
          >
            <CalendarDays size={16} className={mobile ? 'dg-m-bright' : 'dg-primary'} />
          </div>
          <div className="min-w-0">
            <h3 className={cn('text-[13px] font-bold', ink)}>{t('dashboard.dayTransactions')}</h3>
            <p className={cn('text-[11px] truncate', faint)}>{t('dashboard.dayTransactionsHint')}</p>
          </div>
        </div>
        <div className="flex items-center rounded-xl bg-[var(--dg-input)] p-0.5">
          <button
            type="button"
            onClick={() => moveMonth(-1)}
            className={cn('p-1 rounded-lg', muted, 'hover:opacity-80')}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className={cn('px-2 text-[11px] font-bold tabular-nums select-none', ink)}>
            {monthShort(cursor.year, cursor.month)}
          </span>
          <button
            type="button"
            onClick={() => moveMonth(1)}
            className={cn('p-1 rounded-lg', muted, 'hover:opacity-80')}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {mobile ? (
        <>
          {calendarGrid}
          {dayList}
        </>
      ) : (
        <div className="grid grid-cols-12 gap-3 items-start">
          <div className="col-span-7">{calendarGrid}</div>
          <div className="col-span-5">{dayList}</div>
        </div>
      )}
    </div>
  );
}
