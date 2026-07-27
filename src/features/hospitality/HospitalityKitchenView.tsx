import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { hospApi } from './hospApi';
import {
  hospCardClass,
  hospEyebrowClass,
  hospPageClass,
  hospPrimaryBtn,
  hospSecondaryBtn,
  hospSubClass,
  hospTitleClass,
  useHospShell,
} from './hospUi';

type Ticket = {
  id: string;
  name: string;
  qty: number;
  notes: string;
  kitchen_status: string;
  table_name: string;
  waiter_name: string | null;
  fired_at: string | null;
  modifiers: Array<{ name: string }>;
};

export function HospitalityKitchenView() {
  const shell = useHospShell();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await hospApi.kitchen();
      setTickets(data.tickets as Ticket[]);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [load]);

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
      <div className="flex justify-between items-end gap-3">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>Kitchen</h1>
          <p className={hospSubClass(shell)}>Live KOT queue — oldest first</p>
        </div>
        <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && <p className={cn('text-sm', shell === 'classic' ? 'text-rose-600' : 'text-rose-500')}>{error}</p>}

      {tickets.length === 0 ? (
        <div className={cn(hospCardClass(shell), 'p-8 text-center', hospSubClass(shell))}>No open kitchen tickets</div>
      ) : (
        <div
          className={cn(
            'grid gap-3',
            shell === 'capGlass' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
          )}
        >
          {tickets.map(t => (
            <article key={t.id} className={cn(hospCardClass(shell), 'p-4 space-y-2')}>
              <div className="flex justify-between text-sm">
                <strong className={shell === 'desktopGlass' ? 'dg-ink' : shell === 'capGlass' ? 'dg-m-ink' : ''}>
                  {t.table_name}
                </strong>
                <span
                  className={cn(
                    'uppercase text-[10px] font-bold',
                    shell === 'classic' ? 'text-brand' : 'text-[var(--dg-primary)]',
                  )}
                >
                  {t.kitchen_status}
                </span>
              </div>
              <h3
                className={cn(
                  'text-lg font-bold tracking-tight',
                  shell === 'desktopGlass' && 'dg-ink',
                  shell === 'capGlass' && 'dg-m-ink',
                )}
              >
                {t.qty}× {t.name}
              </h3>
              {t.modifiers?.length > 0 && (
                <ul className={cn('text-sm list-disc pl-4', hospSubClass(shell))}>
                  {t.modifiers.map((m, i) => (
                    <li key={i}>{m.name}</li>
                  ))}
                </ul>
              )}
              {t.notes && <p className={cn('text-sm', hospSubClass(shell))}>Note: {t.notes}</p>}
              <div className="flex gap-2 pt-1 flex-wrap">
                {t.kitchen_status === 'queued' && (
                  <button
                    type="button"
                    className={hospPrimaryBtn(shell)}
                    onClick={async () => {
                      await hospApi.setItemStatus(t.id, 'preparing');
                      await load();
                    }}
                  >
                    Start
                  </button>
                )}
                {t.kitchen_status === 'preparing' && (
                  <button
                    type="button"
                    className={cn(
                      hospPrimaryBtn(shell),
                      shell === 'classic' && 'bg-orange-600 shadow-orange-600/20 hover:bg-orange-700',
                    )}
                    onClick={async () => {
                      await hospApi.setItemStatus(t.id, 'ready');
                      await load();
                    }}
                  >
                    Mark ready
                  </button>
                )}
                {t.kitchen_status === 'ready' && (
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-bold text-white',
                      shell === 'desktopGlass' && 'rounded-lg bg-emerald-600',
                      shell === 'capGlass' && 'rounded-full h-9 px-3 text-[11px] bg-emerald-600',
                      shell === 'classic' && 'rounded-xl bg-emerald-700',
                    )}
                    onClick={async () => {
                      await hospApi.setItemStatus(t.id, 'served');
                      await load();
                    }}
                  >
                    Served
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
