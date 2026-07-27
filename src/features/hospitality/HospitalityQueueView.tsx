import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { hospApi, type HospTable } from './hospApi';
import {
  hospCardClass,
  hospDangerBtn,
  hospEyebrowClass,
  hospInputClass,
  hospPageClass,
  hospPrimaryBtn,
  hospSecondaryBtn,
  hospSubClass,
  hospTitleClass,
  useHospShell,
} from './hospUi';

type QueueEntry = {
  id: string;
  token: string;
  guest_name: string;
  party_size: number;
  status: string;
  table_name: string | null;
};

export function HospitalityQueueView() {
  const shell = useHospShell();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [nowServing, setNowServing] = useState<string | null>(null);
  const [tables, setTables] = useState<HospTable[]>([]);
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [seatFor, setSeatFor] = useState<QueueEntry | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [q, t] = await Promise.all([hospApi.queue(), hospApi.tables()]);
      setEntries(q.entries as QueueEntry[]);
      setNowServing(q.nowServing);
      setTables(t.tables.filter(x => x.status === 'available'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [load]);

  const waiting = entries.filter(e => e.status === 'waiting');
  const called = entries.filter(e => e.status === 'called');

  const sheetClass = cn(
    'w-full max-w-lg max-h-[80vh] overflow-auto rounded-t-2xl p-4',
    shell === 'desktopGlass' && 'dg-glass-card border border-[var(--dg-card-border)]',
    shell === 'capGlass' && 'dg-m-glass-card border border-[var(--dg-card-border)]',
    shell === 'classic' && 'bg-white',
  );

  return (
    <div className={hospPageClass(shell)}>
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>Entry queue</h1>
          <p className={hospSubClass(shell)}>First come, first enter</p>
        </div>
        <button
          type="button"
          className={hospPrimaryBtn(shell)}
          disabled={waiting.length === 0}
          onClick={async () => {
            await hospApi.callNext();
            await load();
          }}
        >
          Call next
        </button>
      </div>

      {error && <p className={cn('text-sm', shell === 'classic' ? 'text-rose-600' : 'text-rose-500')}>{error}</p>}

      <div className={cn('grid gap-4', shell === 'capGlass' ? 'grid-cols-1' : 'md:grid-cols-2')}>
        <div
          className={cn(
            'rounded-2xl p-6 min-h-[140px] flex flex-col justify-center text-white',
            shell === 'classic' && 'bg-brand shadow-lg shadow-brand/20',
            shell === 'desktopGlass' && 'dg-bg-primary',
            shell === 'capGlass' && 'dg-m-bg-primary',
          )}
        >
          <div className="text-xs uppercase tracking-wider opacity-80">Now serving</div>
          <div className="text-5xl font-bold mt-1 tracking-tight">{nowServing || '—'}</div>
        </div>
        <form
          className={cn(hospCardClass(shell), 'p-4 space-y-3')}
          onSubmit={async e => {
            e.preventDefault();
            try {
              await hospApi.addQueue(guestName, partySize);
              setGuestName('');
              setPartySize(2);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed');
            }
          }}
        >
          <p className={cn('font-semibold', shell === 'desktopGlass' && 'dg-ink', shell === 'capGlass' && 'dg-m-ink')}>
            Add to queue
          </p>
          <input
            className={hospInputClass(shell)}
            placeholder="Guest name"
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            required
          />
          <input
            type="number"
            min={1}
            max={20}
            className={hospInputClass(shell)}
            value={partySize}
            onChange={e => setPartySize(Number(e.target.value))}
          />
          <button type="submit" className={hospPrimaryBtn(shell)}>
            Issue token
          </button>
        </form>
      </div>

      <h3 className={cn('font-semibold', shell === 'desktopGlass' && 'dg-ink', shell === 'capGlass' && 'dg-m-ink')}>
        Called
      </h3>
      {called.length === 0 ? (
        <div className={cn(hospCardClass(shell), 'p-4 text-sm', hospSubClass(shell))}>No one called yet</div>
      ) : (
        <div className="space-y-2">
          {called.map(e => (
            <div key={e.id} className={cn(hospCardClass(shell), 'p-3 flex justify-between items-center gap-2')}>
              <div>
                <strong className={shell === 'desktopGlass' ? 'dg-ink' : shell === 'capGlass' ? 'dg-m-ink' : ''}>
                  {e.token} · {e.guest_name}
                </strong>
                <div className={cn('text-xs', hospSubClass(shell))}>{e.party_size} guests</div>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <button type="button" className={hospPrimaryBtn(shell)} onClick={() => setSeatFor(e)}>
                  Seat
                </button>
                <button
                  type="button"
                  className={hospDangerBtn(shell)}
                  onClick={async () => {
                    await hospApi.noShow(e.id);
                    await load();
                  }}
                >
                  No-show
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className={cn('font-semibold', shell === 'desktopGlass' && 'dg-ink', shell === 'capGlass' && 'dg-m-ink')}>
        Waiting ({waiting.length})
      </h3>
      <div className="space-y-2">
        {waiting.map((e, idx) => (
          <div key={e.id} className={cn(hospCardClass(shell), 'p-3 flex justify-between items-center gap-2')}>
            <div>
              <strong className={shell === 'desktopGlass' ? 'dg-ink' : shell === 'capGlass' ? 'dg-m-ink' : ''}>
                #{idx + 1} · {e.token} · {e.guest_name}
              </strong>
              <div className={cn('text-xs', hospSubClass(shell))}>{e.party_size} guests</div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button
                type="button"
                className={hospSecondaryBtn(shell)}
                onClick={async () => {
                  await hospApi.call(e.id);
                  await load();
                }}
              >
                Call
              </button>
              <button
                type="button"
                className={cn('text-sm px-2', hospSubClass(shell))}
                onClick={async () => {
                  await hospApi.leave(e.id);
                  await load();
                }}
              >
                Leave
              </button>
            </div>
          </div>
        ))}
      </div>

      {seatFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setSeatFor(null)}>
          <div className={sheetClass} onClick={e => e.stopPropagation()}>
            <h2 className={hospTitleClass(shell)}>Seat {seatFor.token}</h2>
            <p className={cn(hospSubClass(shell), 'mb-3')}>
              {seatFor.guest_name} · party of {seatFor.party_size}
            </p>
            {tables.length === 0 ? (
              <p className={hospSubClass(shell)}>No free tables</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {tables.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      'aspect-square rounded-xl p-2 border-2 text-left',
                      shell === 'classic'
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-emerald-400/40 bg-emerald-500/10',
                    )}
                    onClick={async () => {
                      await hospApi.seat(seatFor.id, t.id);
                      setSeatFor(null);
                      await load();
                    }}
                  >
                    <div className="font-bold">{t.name}</div>
                    <div className={cn('text-xs', hospSubClass(shell))}>{t.seats} seats</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
