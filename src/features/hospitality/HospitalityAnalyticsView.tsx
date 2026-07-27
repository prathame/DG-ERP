import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, UtensilsCrossed, ChefHat, Bike, Users, IndianRupee } from 'lucide-react';
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

type AnalyticsPayload = Awaited<ReturnType<typeof hospApi.analytics>>;

const fmtInr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export function HospitalityAnalyticsView() {
  const shell = useHospShell();
  const [period, setPeriod] = useState<Period>('today');
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await hospApi.analytics(period);
      setData(next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    void load();
    const t = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(t);
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

  const tables = data?.tables;
  const orders = data?.orders;
  const liveOccupied = (tables?.occupied ?? 0) + (tables?.billing ?? 0);

  const kpis: Array<{ label: string; value: string; hint?: string; icon: typeof IndianRupee }> = [
    {
      label: 'Revenue',
      value: fmtInr(orders?.revenue ?? 0),
      hint: `${orders?.total ?? 0} billed / closed`,
      icon: IndianRupee,
    },
    {
      label: 'Orders',
      value: String(orders?.total ?? 0),
      hint: `${orders?.dineIn ?? 0} dine-in · ${orders?.parcel ?? 0} parcel`,
      icon: UtensilsCrossed,
    },
    {
      label: 'Floor now',
      value: `${liveOccupied}/${tables?.total ?? 0}`,
      hint: `${tables?.available ?? 0} free · ${tables?.billing ?? 0} billing`,
      icon: Users,
    },
    {
      label: 'Kitchen queue',
      value: String(data?.kitchenQueueDepth ?? 0),
      hint: 'Items cooking / ready',
      icon: ChefHat,
    },
    {
      label: 'Open parcels',
      value: String(data?.parcelsOpen ?? 0),
      hint: period === 'today' ? 'Active takeaway' : 'Active takeaway (live)',
      icon: Bike,
    },
  ];

  return (
    <div className={hospPageClass(shell)}>
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>Analytics</h1>
          <p className={hospSubClass(shell)}>
            Restaurant floor & sales — not inventory or warranty KPIs.
            {data?.queueWaiting ? ` · ${data.queueWaiting} waiting at entry` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week'] as const).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={cn(
                'min-h-[36px] px-3 text-xs font-bold',
                period === id ? hospChipActive(shell) : hospChipIdle(shell),
              )}
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

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
              <p
                className={cn(
                  'text-2xl font-bold tracking-tight',
                  shell === 'desktopGlass' && 'dg-ink',
                  shell === 'capGlass' && 'dg-m-ink',
                  shell === 'classic' && 'text-gray-900',
                )}
              >
                {k.value}
              </p>
              {k.hint && <p className={cn(hospSubClass(shell), 'mt-1 text-xs')}>{k.hint}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
