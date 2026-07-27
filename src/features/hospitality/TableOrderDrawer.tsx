import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { hospApi, type HospMenuItem, type HospOrderDetail, type HospTable } from './hospApi';
import {
  hospCardClass,
  hospChipActive,
  hospChipIdle,
  hospInputClass,
  hospPrimaryBtn,
  hospSecondaryBtn,
  hospSubClass,
  hospTitleClass,
  useHospShell,
} from './hospUi';

export function TableOrderDrawer({
  table,
  onClose,
  onChanged,
}: {
  table: HospTable;
  onClose: () => void;
  onChanged: () => void;
}) {
  const shell = useHospShell();
  const [detail, setDetail] = useState<HospOrderDetail | null>(null);
  const [tableStatus, setTableStatus] = useState(table.status);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [menu, setMenu] = useState<HospMenuItem[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [picking, setPicking] = useState<HospMenuItem | null>(null);
  const [selectedMods, setSelectedMods] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function applyDetail(next: HospOrderDetail) {
    setDetail(next);
    if (next.table?.status) setTableStatus(next.table.status as HospTable['status']);
  }

  useEffect(() => {
    setBusy(true);
    setTableStatus(table.status);
    Promise.all([hospApi.openTable(table.id), hospApi.menu()])
      .then(([opened, m]) => {
        applyDetail(opened);
        setCategories(m.categories);
        setMenu(m.items);
        setCatId(m.categories[0]?.id ?? null);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setBusy(false));
  }, [table.id, table.status]);

  const filtered = useMemo(
    () => menu.filter(m => m.available !== false && (catId == null ? true : m.category_id === catId)),
    [menu, catId],
  );

  async function addItem() {
    if (!detail || !picking) return;
    for (const g of picking.modifierGroups) {
      if (!g.required) continue;
      if (!selectedMods.some(id => g.modifiers.some(m => m.id === id))) {
        setError(`Choose ${g.name}`);
        return;
      }
    }
    try {
      const next = await hospApi.addItem(detail.order.id, {
        menuItemId: picking.id,
        qty,
        notes,
        modifierIds: selectedMods,
      });
      applyDetail(next);
      setPicking(null);
      setSelectedMods([]);
      setNotes('');
      setQty(1);
      setError('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    }
  }

  const sheetClass = cn(
    'w-full max-w-xl max-h-[92vh] overflow-auto rounded-t-2xl p-4 shadow-xl',
    shell === 'desktopGlass' && 'dg-glass-card border border-[var(--dg-card-border)]',
    shell === 'capGlass' && 'dg-m-glass-card border border-[var(--dg-card-border)]',
    shell === 'classic' && 'bg-white',
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className={sheetClass} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className={hospTitleClass(shell)}>{table.name}</h2>
            <p className={hospSubClass(shell)}>
              {table.seats} seats · {tableStatus}
            </p>
          </div>
          <button type="button" className={cn('text-sm', hospSubClass(shell))} onClick={onClose}>
            Close
          </button>
        </div>

        {busy && !detail && <p className={cn('text-sm', hospSubClass(shell))}>Opening table…</p>}
        {error && (
          <p className={cn('text-sm mb-2', shell === 'classic' ? 'text-rose-600' : 'text-rose-500')}>{error}</p>
        )}

        {detail && (
          <>
            <div className={cn(hospCardClass(shell), 'p-3 mb-3')}>
              <p
                className={cn(
                  'font-semibold mb-2',
                  shell === 'desktopGlass' && 'dg-ink',
                  shell === 'capGlass' && 'dg-m-ink',
                )}
              >
                Current order
              </p>
              {detail.items.length === 0 ? (
                <p className={cn('text-sm', hospSubClass(shell))}>No items yet</p>
              ) : (
                detail.items.map(item => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex justify-between py-1.5 border-b border-dashed last:border-0',
                      shell === 'classic' ? 'border-gray-100' : 'border-[var(--dg-card-border)]',
                    )}
                  >
                    <div>
                      <div className={shell === 'desktopGlass' ? 'dg-ink' : shell === 'capGlass' ? 'dg-m-ink' : ''}>
                        {item.qty}× {item.name}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className={cn('text-xs', hospSubClass(shell))}>
                          {item.modifiers.map(m => m.name).join(', ')}
                        </div>
                      )}
                      <div
                        className={cn(
                          'text-[10px] uppercase font-bold',
                          shell === 'classic' ? 'text-brand' : 'text-[var(--dg-primary)]',
                        )}
                      >
                        {item.kitchen_status}
                      </div>
                    </div>
                    <div className={shell === 'desktopGlass' ? 'dg-ink' : shell === 'capGlass' ? 'dg-m-ink' : ''}>
                      ₹{item.lineTotal.toFixed(0)}
                    </div>
                  </div>
                ))
              )}
              <div
                className={cn(
                  'flex justify-between font-bold mt-2',
                  shell === 'desktopGlass' && 'dg-ink',
                  shell === 'capGlass' && 'dg-m-ink',
                )}
              >
                <span>Total</span>
                <span>₹{detail.total.toFixed(0)}</span>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {detail.order.status === 'open' && (
                  <button
                    type="button"
                    className={cn(
                      hospPrimaryBtn(shell),
                      shell === 'classic' && 'bg-orange-600 shadow-orange-600/20 hover:bg-orange-700',
                    )}
                    onClick={async () => {
                      applyDetail(await hospApi.bill(detail.order.id));
                      setTableStatus('billing');
                      onChanged();
                    }}
                  >
                    Bill table
                  </button>
                )}
                {(tableStatus === 'billing' || detail.order.status === 'billed') && (
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-bold text-white',
                      shell === 'desktopGlass' && 'rounded-lg bg-emerald-600',
                      shell === 'capGlass' && 'rounded-full h-9 px-3 text-[11px] bg-emerald-600',
                      shell === 'classic' && 'rounded-xl bg-emerald-700',
                    )}
                    onClick={async () => {
                      await hospApi.close(detail.order.id);
                      onChanged();
                      onClose();
                    }}
                  >
                    Payment done
                  </button>
                )}
                {tableStatus === 'cleaning' && (
                  <button
                    type="button"
                    className={hospPrimaryBtn(shell)}
                    onClick={async () => {
                      await hospApi.clear(table.id);
                      onChanged();
                      onClose();
                    }}
                  >
                    Mark available
                  </button>
                )}
              </div>
            </div>

            {!picking ? (
              <>
                <div className="flex gap-2 overflow-x-auto mb-3 pb-1">
                  {categories.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCatId(c.id)}
                      className={cn(
                        'px-3 py-1.5 text-sm whitespace-nowrap font-semibold',
                        catId === c.id ? hospChipActive(shell) : hospChipIdle(shell),
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {filtered.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        hospCardClass(shell),
                        'p-3 text-left transition',
                        shell === 'classic' ? 'hover:border-brand border border-transparent' : 'hover:opacity-90',
                      )}
                      onClick={() => {
                        setPicking(item);
                        setSelectedMods([]);
                        setNotes('');
                        setQty(1);
                        setError('');
                      }}
                    >
                      <div
                        className={cn(
                          'font-semibold text-sm',
                          shell === 'desktopGlass' && 'dg-ink',
                          shell === 'capGlass' && 'dg-m-ink',
                        )}
                      >
                        {item.name}
                      </div>
                      <div className={cn('text-xs line-clamp-2', hospSubClass(shell))}>{item.description}</div>
                      <div
                        className={cn(
                          'font-bold mt-1',
                          shell === 'classic' ? 'text-brand' : 'text-[var(--dg-primary)]',
                        )}
                      >
                        ₹{item.price}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className={cn(hospCardClass(shell), 'p-3 space-y-3')}>
                <p
                  className={cn(
                    'font-semibold',
                    shell === 'desktopGlass' && 'dg-ink',
                    shell === 'capGlass' && 'dg-m-ink',
                  )}
                >
                  Customize {picking.name} · ₹{picking.price}
                </p>
                {picking.modifierGroups.map(g => (
                  <div key={g.id}>
                    <p className={cn('text-xs mb-1', hospSubClass(shell))}>
                      {g.name}
                      {g.required ? ' (required)' : ''}
                    </p>
                    <div className="space-y-1">
                      {g.modifiers.map(m => (
                        <label
                          key={m.id}
                          className={cn(
                            'flex gap-2 items-center px-2 py-1.5 text-sm rounded-lg border',
                            shell === 'classic' ? 'border-gray-200' : 'border-[var(--dg-card-border)]',
                            shell === 'desktopGlass' && 'dg-ink',
                            shell === 'capGlass' && 'dg-m-ink',
                          )}
                        >
                          <input
                            type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                            name={`g-${g.id}`}
                            checked={selectedMods.includes(m.id)}
                            onChange={() => {
                              setSelectedMods(prev => {
                                const inGroup = g.modifiers.map(x => x.id);
                                const without = prev.filter(id => !inGroup.includes(id));
                                if (prev.includes(m.id)) return without;
                                if (g.maxSelect === 1) return [...without, m.id];
                                const cur = prev.filter(id => inGroup.includes(id));
                                if (cur.length >= g.maxSelect) return prev;
                                return [...without, ...cur, m.id];
                              });
                            }}
                          />
                          <span>
                            {m.name}
                            {m.price_delta > 0 ? ` (+₹${m.price_delta})` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <label
                  className={cn(
                    'block text-sm',
                    shell === 'desktopGlass' && 'dg-ink',
                    shell === 'capGlass' && 'dg-m-ink',
                  )}
                >
                  Qty
                  <input
                    type="number"
                    min={1}
                    className={cn(hospInputClass(shell), 'mt-1')}
                    value={qty}
                    onChange={e => setQty(Number(e.target.value) || 1)}
                  />
                </label>
                <label
                  className={cn(
                    'block text-sm',
                    shell === 'desktopGlass' && 'dg-ink',
                    shell === 'capGlass' && 'dg-m-ink',
                  )}
                >
                  Special note
                  <textarea
                    className={cn(hospInputClass(shell), 'mt-1')}
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </label>
                <div className="flex gap-2">
                  <button type="button" className={hospPrimaryBtn(shell)} onClick={() => void addItem()}>
                    Send to kitchen
                  </button>
                  <button type="button" className={hospSecondaryBtn(shell)} onClick={() => setPicking(null)}>
                    Back
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
