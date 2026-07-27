import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { session } from '../../lib/session';
import { cn } from '../../lib/utils';
import { compareHospTablesByZoneThenName, hospApi, type HospTable } from './hospApi';
import { TableOrderDrawer } from './TableOrderDrawer';
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
  type HospShell,
} from './hospUi';

function isHotelAdminRole(): boolean {
  const role = String((session.getUser() as { role?: string } | null)?.role || '');
  return role === 'Admin' || role === 'Super Admin';
}

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

type TableForm = { id?: string; name: string; seats: string; zone: string };

export function HospitalityFloorView() {
  const shell = useHospShell();
  const { toast } = useToast();
  const isAdmin = isHotelAdminRole();
  const [tables, setTables] = useState<HospTable[]>([]);
  const [selected, setSelected] = useState<HospTable | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [tableForm, setTableForm] = useState<TableForm | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onYes: () => void } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await hospApi.tables();
      setTables(data.tables);
      setSelected(prev => (prev ? data.tables.find(t => t.id === prev.id) || null : null));
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

  const empty = tables.length === 0;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...tables].sort(compareHospTablesByZoneThenName);
    if (!q) return list;
    return list.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        (t.zone || '').toLowerCase().includes(q) ||
        (t.status || '').toLowerCase().includes(q),
    );
  }, [tables, query]);

  const byZone = useMemo(() => {
    const map = new Map<string, HospTable[]>();
    for (const table of filtered) {
      const list = map.get(table.zone) || [];
      list.push(table);
      map.set(table.zone, list);
    }
    return [...map.entries()];
  }, [filtered]);

  function openAdd(presetName = '') {
    setTableForm({ name: presetName, seats: '4', zone: 'Main' });
  }

  async function saveTable() {
    if (!tableForm) return;
    if (!tableForm.name.trim()) {
      toast('Table name required', 'error');
      return;
    }
    setSaving(true);
    const body = {
      name: tableForm.name.trim(),
      seats: Number(tableForm.seats) || 4,
      zone: tableForm.zone.trim() || 'Main',
    };
    try {
      if (tableForm.id) await hospApi.updateTable(tableForm.id, body);
      else await hospApi.createTable(body);
      toast(tableForm.id ? 'Table updated' : 'Table added', 'success');
      setTableForm(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
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
            <h1 className={hospTitleClass(shell)}>Floor</h1>
            <p className={hospSubClass(shell)}>
              {empty
                ? isAdmin
                  ? 'Add tables to start seating guests'
                  : 'Waiting for hotel owner to add tables'
                : `${tables.filter(t => t.status === 'available').length} free · ${tables.filter(t => t.status === 'occupied' || t.status === 'billing').length} busy`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {isAdmin && (
              <>
                <button type="button" className={hospPrimaryBtn(shell)} onClick={() => openAdd(empty ? 'T1' : '')}>
                  <Plus size={14} className="mr-1" /> Add table
                </button>
                {!empty && (
                  <button
                    type="button"
                    className={managing ? hospPrimaryBtn(shell) : hospSecondaryBtn(shell)}
                    onClick={() => setManaging(m => !m)}
                  >
                    {managing ? 'Done managing' : 'Manage tables'}
                  </button>
                )}
                {empty && (
                  <button
                    type="button"
                    className={hospSecondaryBtn(shell)}
                    onClick={async () => {
                      await hospApi.seed();
                      await load();
                    }}
                  >
                    Seed demo
                  </button>
                )}
              </>
            )}
            {!empty && (
              <button
                type="button"
                className={hospSecondaryBtn(shell)}
                aria-label="Focus search"
                onClick={() => searchRef.current?.focus()}
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void load()} aria-label="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!empty && (
          <div className="relative">
            <Search
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none',
                shell === 'desktopGlass' ? 'dg-faint' : shell === 'capGlass' ? 'dg-m-faint' : 'text-gray-400',
              )}
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, zone, or status…"
              className={cn(hospInputClass(shell), 'pl-9 min-h-[44px]')}
              aria-label="Search tables"
            />
          </div>
        )}

        {managing && isAdmin && !empty && (
          <p className={cn('text-xs', hospSubClass(shell))}>
            Manage mode — edit or delete tables. Tap Done managing to take orders again.
          </p>
        )}
      </div>

      {error && <p className={cn('text-sm', shell === 'classic' ? 'text-rose-600' : 'text-rose-500')}>{error}</p>}

      {empty ? (
        <div className={cn(hospCardClass(shell), 'p-8 text-center space-y-4')}>
          <div>
            <p
              className={cn(
                'font-bold text-lg',
                shell === 'desktopGlass' && 'dg-ink',
                shell === 'capGlass' && 'dg-m-ink',
                shell === 'classic' && 'text-gray-900',
              )}
            >
              No tables yet
            </p>
            <p className={cn('text-sm mt-1 max-w-sm mx-auto', hospSubClass(shell))}>
              {isAdmin
                ? 'Add your first table (T1, Garden-2, Window-1…). Waiters will see them here immediately.'
                : 'Ask the hotel owner (Admin) to add tables on Floor.'}
            </p>
          </div>
          {isAdmin && (
            <button type="button" className={cn(hospPrimaryBtn(shell), 'min-w-[10rem]')} onClick={() => openAdd('T1')}>
              <Plus size={16} className="mr-1.5" /> Add table
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className={cn(hospCardClass(shell), 'p-8 text-center', hospSubClass(shell))}>No tables match</div>
      ) : (
        byZone.map(([zone, zoneTables]) => (
          <section key={zone}>
            <h2 className={cn(hospEyebrowClass(shell), 'mb-2')}>{zone}</h2>
            <div
              className={cn(
                'grid gap-3',
                shell === 'capGlass' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
              )}
            >
              {zoneTables.map(t => (
                <div
                  key={t.id}
                  className={cn(
                    'aspect-square border-2 p-3 text-left flex flex-col justify-between transition',
                    'rounded-2xl',
                    STATUS_CLASS[shell][t.status] || '',
                  )}
                >
                  <button
                    type="button"
                    className="flex-1 text-left active:scale-[0.98] min-h-0"
                    onClick={() => {
                      if (managing && isAdmin) {
                        setTableForm({
                          id: t.id,
                          name: t.name,
                          seats: String(t.seats),
                          zone: t.zone || 'Main',
                        });
                      } else {
                        setSelected(t);
                      }
                    }}
                  >
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
                    <div
                      className={cn(
                        'text-[10px] font-bold uppercase mt-2',
                        shell === 'classic' ? 'text-brand-dark' : 'text-[var(--dg-primary)]',
                      )}
                    >
                      {t.status}
                    </div>
                    {t.open_items > 0 && (
                      <div className={cn('text-xs', hospSubClass(shell))}>{t.open_items} open items</div>
                    )}
                  </button>
                  {isAdmin && managing && (
                    <div className="flex gap-1.5 mt-2">
                      <button
                        type="button"
                        className={cn(hospSecondaryBtn(shell), 'flex-1 h-9 min-h-0 px-2')}
                        aria-label={`Edit ${t.name}`}
                        onClick={() =>
                          setTableForm({
                            id: t.id,
                            name: t.name,
                            seats: String(t.seats),
                            zone: t.zone || 'Main',
                          })
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className={cn(hospDangerBtn(shell), 'h-9 min-h-0 px-2')}
                        aria-label={`Delete ${t.name}`}
                        onClick={() =>
                          setConfirm({
                            title: 'Delete table?',
                            message: `Remove “${t.name}”?`,
                            onYes: () => {
                              void hospApi
                                .deleteTable(t.id)
                                .then(() => {
                                  toast('Table deleted', 'success');
                                  void load();
                                })
                                .catch(e => toast(e instanceof Error ? e.message : 'Delete failed', 'error'));
                            },
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {selected && !managing && (
        <TableOrderDrawer table={selected} onClose={() => setSelected(null)} onChanged={() => void load()} />
      )}

      {tableForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          onClick={() => setTableForm(null)}
        >
          <div
            className={cn(hospCardClass(shell), 'w-full max-w-md p-5 max-h-[90vh] overflow-y-auto shadow-2xl')}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3
                className={cn(
                  'font-bold text-base',
                  shell === 'desktopGlass' && 'dg-ink',
                  shell === 'capGlass' && 'dg-m-ink',
                )}
              >
                {tableForm.id ? 'Edit table' : 'Add table'}
              </h3>
              <button type="button" className={cn('text-sm', hospSubClass(shell))} onClick={() => setTableForm(null)}>
                Close
              </button>
            </div>
            <label className={cn('block text-xs font-bold mb-1', hospSubClass(shell))}>Name / number</label>
            <input
              className={hospInputClass(shell)}
              value={tableForm.name}
              onChange={e => setTableForm({ ...tableForm, name: e.target.value })}
              placeholder="e.g. T1, Garden-2"
              autoFocus
            />
            <label className={cn('block text-xs font-bold mb-1 mt-3', hospSubClass(shell))}>Seats</label>
            <input
              className={hospInputClass(shell)}
              inputMode="numeric"
              value={tableForm.seats}
              onChange={e => setTableForm({ ...tableForm, seats: e.target.value })}
            />
            <label className={cn('block text-xs font-bold mb-1 mt-3', hospSubClass(shell))}>Zone</label>
            <input
              className={hospInputClass(shell)}
              value={tableForm.zone}
              onChange={e => setTableForm({ ...tableForm, zone: e.target.value })}
              placeholder="e.g. Main, Garden"
            />
            <button
              type="button"
              className={cn(hospPrimaryBtn(shell), 'w-full mt-4')}
              disabled={saving}
              onClick={() => void saveTable()}
            >
              {saving ? 'Saving…' : 'Save table'}
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            confirm.onYes();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
