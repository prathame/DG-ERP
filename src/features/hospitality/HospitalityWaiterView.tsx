import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { session } from '../../lib/session';
import { cn } from '../../lib/utils';
import { compareHospTableName, hospApi, type HospTable } from './hospApi';
import { TableOrderDrawer } from './TableOrderDrawer';
import {
  hospCardClass,
  hospChipActive,
  hospChipIdle,
  hospDangerBtn,
  hospEyebrowClass,
  hospInputClass,
  hospPageClass,
  hospPrimaryBtn,
  hospSecondaryBtn,
  hospSubClass,
  hospTitleClass,
  useHospShell,
  type HospShell,
} from './hospUi';

type FilterId = 'all' | 'occupied' | 'available';

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'occupied', label: 'Occupied' },
  { id: 'available', label: 'Available' },
];

const STATUS_PRIORITY: Record<HospTable['status'], number> = {
  occupied: 0,
  billing: 1,
  cleaning: 2,
  available: 3,
};

const STATUS_CHIP: Record<HospShell, Record<HospTable['status'], string>> = {
  classic: {
    available: 'bg-emerald-100 text-emerald-800',
    occupied: 'bg-orange-100 text-orange-800',
    billing: 'bg-rose-100 text-rose-800',
    cleaning: 'bg-sky-100 text-sky-800',
  },
  desktopGlass: {
    available: 'bg-emerald-500/15 text-emerald-300',
    occupied: 'bg-[var(--dg-primary)]/15 text-[var(--dg-primary)]',
    billing: 'bg-rose-500/15 text-rose-300',
    cleaning: 'bg-sky-500/15 text-sky-300',
  },
  capGlass: {
    available: 'bg-emerald-500/15 text-emerald-700',
    occupied: 'bg-[var(--dg-primary)]/15 text-[var(--dg-primary)]',
    billing: 'bg-rose-500/15 text-rose-700',
    cleaning: 'bg-sky-500/15 text-sky-700',
  },
};

function matchesFilter(table: HospTable, filter: FilterId) {
  if (filter === 'all') return true;
  if (filter === 'available') return table.status === 'available';
  // Occupied = tables that need waiter attention (occupied + billing)
  return table.status === 'occupied' || table.status === 'billing';
}

function isHotelAdminRole(): boolean {
  const role = String((session.getUser() as { role?: string } | null)?.role || '');
  return role === 'Admin' || role === 'Super Admin';
}

export function HospitalityWaiterView() {
  const shell = useHospShell();
  const { toast } = useToast();
  const isAdmin = isHotelAdminRole();
  const [tables, setTables] = useState<HospTable[]>([]);
  const [selected, setSelected] = useState<HospTable | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await hospApi.tables();
      setTables(data.tables);
      setSelected(prev => (prev ? data.tables.find(t => t.id === prev.id) || null : null));
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tables
      .filter(t => matchesFilter(t, filter))
      .filter(t => !q || t.name.toLowerCase().includes(q) || t.zone.toLowerCase().includes(q))
      .sort((a, b) => {
        const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        if (byStatus !== 0) return byStatus;
        const byZone = (a.zone || '').localeCompare(b.zone || '', undefined, { sensitivity: 'base' });
        if (byZone !== 0) return byZone;
        return compareHospTableName(a.name, b.name);
      });
  }, [tables, filter, query]);

  const occupiedCount = tables.filter(t => t.status === 'occupied' || t.status === 'billing').length;
  const availableCount = tables.filter(t => t.status === 'available').length;
  const selectedBusy = useMemo(
    () => tables.filter(t => selectedIds.has(t.id) && (t.status === 'occupied' || t.status === 'billing')),
    [tables, selectedIds],
  );

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setSelectingMode(on: boolean) {
    setSelecting(on);
    setSelectedIds(new Set());
  }

  async function runBulkCancel() {
    try {
      const r = await hospApi.bulkCancelOrders({ tableIds: selectedBusy.map(t => t.id) });
      const msg =
        r.errors.length > 0
          ? `Cancelled ${r.cancelled}; ${r.errors.length} failed`
          : `Cancelled ${r.cancelled} order(s)`;
      toast(msg, r.errors.length ? 'error' : 'success');
      setSelectedIds(new Set());
      setSelecting(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Bulk cancel failed', 'error');
    } finally {
      setConfirmBulk(false);
    }
  }

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
      <div
        className={cn(
          'sticky top-0 z-10 -mx-3 px-3 pb-3 pt-1 space-y-3',
          shell === 'capGlass' && 'bg-[var(--dg-bg)]/95 backdrop-blur-md',
          shell === 'desktopGlass' && 'bg-[var(--dg-bg)]/90 backdrop-blur-md',
          shell === 'classic' && 'bg-[#F8F9FA]/95 backdrop-blur-md',
        )}
      >
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <p className={hospEyebrowClass(shell)}>Hospitality</p>
            <h1 className={hospTitleClass(shell)}>Waiter Orders</h1>
            <p className={hospSubClass(shell)}>
              {availableCount} free · {occupiedCount} busy
            </p>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {isAdmin && occupiedCount > 0 && (
              <button
                type="button"
                className={selecting ? hospPrimaryBtn(shell) : hospSecondaryBtn(shell)}
                onClick={() => setSelectingMode(!selecting)}
              >
                {selecting ? 'Done selecting' : 'Select to cancel'}
              </button>
            )}
            {selecting && selectedBusy.length > 0 && (
              <button type="button" className={hospDangerBtn(shell)} onClick={() => setConfirmBulk(true)}>
                Cancel selected ({selectedBusy.length})
              </button>
            )}
            <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void load()} aria-label="Refresh">
              <RefreshCw className="w-4 h-4" />
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <div className="relative">
          <Search
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none',
              shell === 'desktopGlass' ? 'dg-faint' : shell === 'capGlass' ? 'dg-m-faint' : 'text-gray-400',
            )}
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tables or zone…"
            className={cn(hospInputClass(shell), 'pl-9 min-h-[44px]')}
            aria-label="Search tables"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? hospChipActive(shell) : hospChipIdle(shell)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {selecting && (
          <p className={cn('text-xs', hospSubClass(shell))}>
            Select busy tables, then Cancel selected to void their orders (Admin).
          </p>
        )}
      </div>

      {error && <p className={cn('text-sm', shell === 'classic' ? 'text-rose-600' : 'text-rose-500')}>{error}</p>}

      {filtered.length === 0 ? (
        <div className={cn(hospCardClass(shell), 'p-8 text-center', hospSubClass(shell))}>
          {empty ? 'No tables yet — hotel owner adds them on Floor.' : 'No tables match'}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(t => {
            const busy = t.status === 'occupied' || t.status === 'billing';
            return (
              <li key={t.id}>
                <div
                  className={cn(
                    hospCardClass(shell),
                    'w-full min-h-[64px] px-4 py-3 flex items-center gap-3 text-left',
                    selecting && selectedIds.has(t.id) && 'ring-2 ring-[var(--dg-primary)]',
                  )}
                >
                  {selecting && (
                    <input
                      type="checkbox"
                      className="shrink-0"
                      disabled={!busy}
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelected(t.id)}
                      aria-label={`Select ${t.name}`}
                    />
                  )}
                  <button
                    type="button"
                    disabled={selecting}
                    onClick={() => setSelected(t)}
                    className={cn(
                      'flex-1 min-w-0 flex items-center gap-3 text-left transition',
                      !selecting && 'active:scale-[0.99]',
                      selecting && 'opacity-90 cursor-default',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'text-lg font-bold tracking-tight',
                            shell === 'desktopGlass' && 'dg-ink',
                            shell === 'capGlass' && 'dg-m-ink',
                          )}
                        >
                          {t.name}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5',
                            STATUS_CHIP[shell][t.status],
                          )}
                        >
                          {t.status}
                        </span>
                      </div>
                      <p className={cn('text-xs mt-0.5', hospSubClass(shell))}>
                        {t.zone} · {t.seats} seats
                        {t.open_items > 0 ? ` · ${t.open_items} open item${t.open_items === 1 ? '' : 's'}` : ''}
                      </p>
                    </div>
                    {!selecting && (
                      <ChevronRight
                        className={cn(
                          'w-5 h-5 shrink-0',
                          shell === 'desktopGlass' ? 'dg-faint' : shell === 'capGlass' ? 'dg-m-faint' : 'text-gray-300',
                        )}
                      />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected && !selecting && (
        <TableOrderDrawer table={selected} onClose={() => setSelected(null)} onChanged={() => void load()} />
      )}

      {confirmBulk && (
        <ConfirmDialog
          title="Cancel selected orders?"
          message={`Void orders on ${selectedBusy.length} table(s) and free them?`}
          confirmLabel="Cancel orders"
          variant="danger"
          onConfirm={() => void runBulkCancel()}
          onCancel={() => setConfirmBulk(false)}
        />
      )}
    </div>
  );
}
