import React, { useCallback, useEffect, useState } from 'react';
import { Bike, IndianRupee, Loader2, Receipt, RefreshCw, UtensilsCrossed, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { hospApi } from './hospApi';
import {
  hospCardClass,
  hospChipActive,
  hospChipIdle,
  hospEyebrowClass,
  hospPageClass,
  hospSecondaryBtn,
  hospSubClass,
  hospTitleClass,
  useHospShell,
} from './hospUi';

type Period = 'today' | 'week';
type Summary = Awaited<ReturnType<typeof hospApi.accountsSummary>>;

const fmtInr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function HospitalityAccountsView() {
  const shell = useHospShell();
  const [period, setPeriod] = useState<Period>('today');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await hospApi.accountsSummary(period);
      setData(next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-20',
          shell === 'desktopGlass' ? 'dg-muted' : shell === 'capGlass' ? 'dg-m-muted' : 'text-gray-400',
        )}
      >
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const sales = data?.sales;
  const expenses = data?.expenses;
  const ink = shell === 'desktopGlass' ? 'dg-ink' : shell === 'capGlass' ? 'dg-m-ink' : 'text-gray-900';

  const kpis: Array<{ label: string; value: string; hint?: string; icon: typeof IndianRupee }> = [
    {
      label: 'Food sales',
      value: fmtInr(sales?.revenue ?? 0),
      hint: `${sales?.orderCount ?? 0} billed / closed orders`,
      icon: IndianRupee,
    },
    {
      label: 'Dine-in',
      value: fmtInr(sales?.dineIn.revenue ?? 0),
      hint: `${sales?.dineIn.orders ?? 0} orders`,
      icon: UtensilsCrossed,
    },
    {
      label: 'Parcel',
      value: fmtInr(sales?.parcel.revenue ?? 0),
      hint: `${sales?.parcel.orders ?? 0} orders`,
      icon: Bike,
    },
    {
      label: 'Expenses',
      value: fmtInr(expenses?.total ?? 0),
      hint: expenses?.count ? `${expenses.count} entries` : 'No expenses in period',
      icon: Wallet,
    },
  ];

  return (
    <div className={hospPageClass(shell)}>
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>Sales summary</h1>
          <p className={hospSubClass(shell)}>
            Food sales and expenses for the floor — not full double-entry accounts or GST statements.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week'] as const).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={period === id ? hospChipActive(shell) : hospChipIdle(shell)}
            >
              {id === 'today' ? 'Today' : 'This week'}
            </button>
          ))}
          <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void load()} aria-label="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <p
          className={cn(
            'text-sm',
            shell === 'desktopGlass' || shell === 'capGlass' ? 'text-rose-400' : 'text-rose-600',
          )}
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={cn(hospCardClass(shell), 'p-4')}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className={hospEyebrowClass(shell)}>{k.label}</p>
                <Icon
                  size={16}
                  className={shell === 'desktopGlass' || shell === 'capGlass' ? 'dg-muted' : 'text-gray-400'}
                />
              </div>
              <p className={cn('text-2xl font-bold tracking-tight', ink)}>{k.value}</p>
              {k.hint && <p className={cn(hospSubClass(shell), 'mt-1 text-xs')}>{k.hint}</p>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={cn(hospCardClass(shell), 'p-4')}>
          <p className={hospEyebrowClass(shell)}>Daily sales</p>
          <h2 className={cn('font-bold mt-1 mb-3', ink)}>{period === 'today' ? 'Today' : 'This week'}</h2>
          {!data?.byDay.length ? (
            <p className={cn('text-sm', hospSubClass(shell))}>No billed orders in this period.</p>
          ) : (
            <ul className="space-y-2">
              {data.byDay.map(d => (
                <li
                  key={d.date}
                  className={cn(
                    'flex justify-between gap-3 text-sm border-b border-dashed pb-2 last:border-0',
                    shell === 'classic' ? 'border-gray-100' : 'border-[var(--dg-card-border)]',
                  )}
                >
                  <div>
                    <p className={cn('font-semibold', ink)}>{d.date}</p>
                    <p className={cn('text-xs', hospSubClass(shell))}>
                      {d.orders} orders · {d.dineIn} dine-in · {d.parcel} parcel
                    </p>
                  </div>
                  <p className={cn('font-bold tabular-nums', ink)}>{fmtInr(d.revenue)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn(hospCardClass(shell), 'p-4 space-y-4')}>
          <div>
            <p className={hospEyebrowClass(shell)}>Expenses by category</p>
            <h2 className={cn('font-bold mt-1 mb-3', ink)}>Outgoings</h2>
            {!expenses?.byCategory.length ? (
              <p className={cn('text-sm', hospSubClass(shell))}>No expenses recorded for this period.</p>
            ) : (
              <ul className="space-y-2">
                {expenses.byCategory.map(c => (
                  <li key={c.category} className="flex justify-between gap-3 text-sm">
                    <span className={hospSubClass(shell)}>
                      {c.category} · {c.count}
                    </span>
                    <span className={cn('font-bold tabular-nums', ink)}>{fmtInr(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div
            className={cn('pt-3 border-t', shell === 'classic' ? 'border-gray-100' : 'border-[var(--dg-card-border)]')}
          >
            <div className="flex items-start gap-2">
              <Receipt
                size={16}
                className={
                  shell === 'desktopGlass' || shell === 'capGlass' ? 'dg-muted mt-0.5' : 'text-gray-400 mt-0.5'
                }
              />
              <div>
                <p className={hospEyebrowClass(shell)}>GST note</p>
                <p className={cn('text-sm mt-1', hospSubClass(shell))}>{data?.gst?.note}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
