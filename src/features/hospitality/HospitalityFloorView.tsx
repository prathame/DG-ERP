import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { hospApi, type HospTable } from './hospApi';
import { TableOrderDrawer } from './TableOrderDrawer';
import {
  hospCardClass,
  hospEyebrowClass,
  hospPageClass,
  hospPrimaryBtn,
  hospSecondaryBtn,
  hospSubClass,
  hospTitleClass,
  useHospShell,
  type HospShell,
} from './hospUi';

const STATUS_CLASS: Record<HospShell, Record<string, string>> = {
  classic: {
    available: 'bg-emerald-50 border-emerald-200',
    occupied: 'bg-orange-50 border-brand/30',
    billing: 'bg-rose-50 border-rose-200',
    cleaning: 'bg-sky-50 border-sky-200',
  },
  desktopGlass: {
    available: 'bg-emerald-500/10 border-emerald-400/40',
    occupied: 'bg-[var(--dg-primary)]/10 border-[var(--dg-primary)]/40',
    billing: 'bg-rose-500/10 border-rose-400/40',
    cleaning: 'bg-sky-500/10 border-sky-400/40',
  },
  capGlass: {
    available: 'bg-emerald-500/10 border-emerald-400/40',
    occupied: 'bg-[var(--dg-primary)]/10 border-[var(--dg-primary)]/40',
    billing: 'bg-rose-500/10 border-rose-400/40',
    cleaning: 'bg-sky-500/10 border-sky-400/40',
  },
};

export function HospitalityFloorView({ title = 'Floor' }: { title?: string }) {
  const shell = useHospShell();
  const [tables, setTables] = useState<HospTable[]>([]);
  const [selected, setSelected] = useState<HospTable | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await hospApi.tables();
      setTables(data.tables);
      setEmpty(data.tables.length === 0);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [load]);

  const byZone = useMemo(() => {
    const map = new Map<string, HospTable[]>();
    for (const table of tables) {
      const list = map.get(table.zone) || [];
      list.push(table);
      map.set(table.zone, list);
    }
    return [...map.entries()];
  }, [tables]);

  if (loading) {
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

  return (
    <div className={hospPageClass(shell)}>
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>{title}</h1>
          <p className={hospSubClass(shell)}>
            {tables.filter(t => t.status === 'available').length} free ·{' '}
            {tables.filter(t => t.status === 'occupied').length} occupied
          </p>
        </div>
        <div className="flex gap-2">
          {empty && (
            <button
              type="button"
              className={hospPrimaryBtn(shell)}
              onClick={async () => {
                await hospApi.seed();
                await load();
              }}
            >
              Seed demo floor
            </button>
          )}
          <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && <p className={cn('text-sm', shell === 'classic' ? 'text-rose-600' : 'text-rose-500')}>{error}</p>}

      {byZone.map(([zone, zoneTables]) => (
        <section key={zone}>
          <h2 className={cn(hospEyebrowClass(shell), 'mb-2')}>{zone}</h2>
          <div
            className={cn(
              'grid gap-3',
              shell === 'capGlass' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
            )}
          >
            {zoneTables.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className={cn(
                  'aspect-square border-2 p-3 text-left flex flex-col justify-between transition active:scale-[0.98]',
                  shell === 'capGlass' ? 'rounded-2xl' : 'rounded-2xl',
                  STATUS_CLASS[shell][t.status] || '',
                )}
              >
                <div>
                  <div
                    className={cn(
                      'text-xl font-bold tracking-tight',
                      shell === 'desktopGlass' && 'dg-ink',
                      shell === 'capGlass' && 'dg-m-ink',
                    )}
                  >
                    {t.name}
                  </div>
                  <div className={cn('text-xs', hospSubClass(shell))}>{t.seats} seats</div>
                </div>
                <div>
                  <div
                    className={cn(
                      'text-[10px] font-bold uppercase',
                      shell === 'classic' ? 'text-brand-dark' : 'text-[var(--dg-primary)]',
                    )}
                  >
                    {t.status}
                  </div>
                  {t.open_items > 0 && (
                    <div className={cn('text-xs', hospSubClass(shell))}>{t.open_items} open items</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {!empty && tables.length === 0 && (
        <div className={cn(hospCardClass(shell), 'p-8 text-center', hospSubClass(shell))}>No tables yet</div>
      )}

      {selected && (
        <TableOrderDrawer table={selected} onClose={() => setSelected(null)} onChanged={() => void load()} />
      )}
    </div>
  );
}

export function HospitalityWaiterView() {
  return <HospitalityFloorView title="Waiter Orders" />;
}
