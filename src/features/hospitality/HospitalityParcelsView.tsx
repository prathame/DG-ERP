import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { hospApi, type HospMenuItem, type HospOrderDetail, type HospParcel } from './hospApi';
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
} from './hospUi';

export function HospitalityParcelsView() {
  const shell = useHospShell();
  const [parcels, setParcels] = useState<HospParcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HospOrderDetail | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [menu, setMenu] = useState<HospMenuItem[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [picking, setPicking] = useState<HospMenuItem | null>(null);
  const [selectedMods, setSelectedMods] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const loadParcels = useCallback(async () => {
    try {
      const data = await hospApi.parcels();
      setParcels(data.parcels);
      setError('');
      if (activeId && !data.parcels.some(p => p.id === activeId)) {
        setActiveId(null);
        setDetail(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load parcels');
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    void loadParcels();
    const t = window.setInterval(() => void loadParcels(), 4000);
    return () => window.clearInterval(t);
  }, [loadParcels]);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    setBusy(true);
    Promise.all([hospApi.order(activeId), hospApi.menu()])
      .then(([ord, m]) => {
        setDetail(ord);
        setCategories(m.categories);
        setMenu(m.items.filter(i => i.available !== false));
        setCatId(m.categories[0]?.id ?? null);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setBusy(false));
  }, [activeId]);

  const filtered = useMemo(() => menu.filter(m => (catId == null ? true : m.category_id === catId)), [menu, catId]);

  async function createParcel() {
    setBusy(true);
    try {
      const created = await hospApi.createParcel({
        customerName: guestName.trim(),
        customerPhone: guestPhone.trim(),
      });
      setNewOpen(false);
      setGuestName('');
      setGuestPhone('');
      await loadParcels();
      setActiveId(created.order.id);
      setDetail(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create parcel');
    } finally {
      setBusy(false);
    }
  }

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
      setDetail(next);
      setPicking(null);
      setSelectedMods([]);
      setNotes('');
      setQty(1);
      setError('');
      await loadParcels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 opacity-50">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className={hospPageClass(shell)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={hospEyebrowClass(shell)}>Hospitality</p>
          <h1 className={hospTitleClass(shell)}>Parcels</h1>
          <p className={hospSubClass(shell)}>Takeaway / pickup counter — no table needed</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={hospSecondaryBtn(shell)} onClick={() => void loadParcels()}>
            <RefreshCw size={14} className="mr-1.5" />
            Refresh
          </button>
          <button type="button" className={hospPrimaryBtn(shell)} onClick={() => setNewOpen(true)}>
            <Plus size={14} className="mr-1" /> New parcel
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className={cn('grid gap-4', shell === 'capGlass' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-5')}>
        <section className={cn(hospCardClass(shell), 'p-3 space-y-2 lg:col-span-2')}>
          <h2 className="text-sm font-bold px-1">Open / billed</h2>
          {parcels.length === 0 ? (
            <p className={cn('text-sm py-8 text-center', hospSubClass(shell))}>No open parcels</p>
          ) : (
            <ul className="space-y-2">
              {parcels.map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className={cn(
                      'w-full text-left rounded-xl px-3 py-3 border transition',
                      activeId === p.id
                        ? 'border-[var(--dg-primary)] bg-[var(--dg-primary)]/10'
                        : 'border-black/5 hover:border-black/15',
                    )}
                  >
                    <div className="flex justify-between gap-2">
                      <strong className="text-sm">{p.label}</strong>
                      <span className="text-[10px] font-bold uppercase opacity-60">{p.status}</span>
                    </div>
                    <p className={cn('text-xs mt-0.5', hospSubClass(shell))}>
                      {p.customer_name || 'Guest'}
                      {p.customer_phone ? ` · ${p.customer_phone}` : ''} · {p.item_count} item(s) · ₹
                      {Number(p.total).toLocaleString('en-IN')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cn(hospCardClass(shell), 'p-4 space-y-4 lg:col-span-3 min-h-[320px]')}>
          {!activeId || !detail ? (
            <p className={cn('text-sm py-16 text-center', hospSubClass(shell))}>Select a parcel or create a new one</p>
          ) : (
            <>
              <div className="flex flex-wrap justify-between gap-2 items-start">
                <div>
                  <h2 className="font-bold text-base">{detail.label || detail.order.token}</h2>
                  <p className={cn('text-sm', hospSubClass(shell))}>
                    {detail.order.customer_name || 'Guest'}
                    {detail.order.customer_phone ? ` · ${detail.order.customer_phone}` : ''} · {detail.order.status}
                  </p>
                </div>
                <p className="text-lg font-bold">₹{detail.total.toLocaleString('en-IN')}</p>
              </div>

              <ul className="divide-y divide-black/5">
                {detail.items.map(it => (
                  <li key={it.id} className="py-2 flex justify-between gap-2 text-sm">
                    <div>
                      <p className="font-semibold">
                        {it.qty}× {it.name}
                      </p>
                      {it.modifiers?.length > 0 && (
                        <p className={cn('text-xs', hospSubClass(shell))}>{it.modifiers.map(m => m.name).join(', ')}</p>
                      )}
                      <p className={cn('text-[10px] uppercase font-bold', hospSubClass(shell))}>{it.kitchen_status}</p>
                    </div>
                    <span>₹{it.lineTotal.toLocaleString('en-IN')}</span>
                  </li>
                ))}
                {!detail.items.length && (
                  <li className={cn('py-4 text-sm text-center', hospSubClass(shell))}>No items yet — add from menu</li>
                )}
              </ul>

              {detail.order.status === 'open' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCatId(c.id)}
                        className={catId === c.id ? hospChipActive(shell) : hospChipIdle(shell)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {filtered.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(hospSecondaryBtn(shell), 'flex-col h-auto py-2 items-start text-left')}
                        onClick={() => {
                          setPicking(item);
                          setSelectedMods([]);
                          setQty(1);
                          setNotes('');
                        }}
                      >
                        <span className="font-semibold text-xs">{item.name}</span>
                        <span className="text-[11px] opacity-60">₹{Number(item.price).toLocaleString('en-IN')}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {detail.order.status === 'open' && (
                  <button
                    type="button"
                    className={hospPrimaryBtn(shell)}
                    disabled={busy || !detail.items.length}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const next = await hospApi.bill(detail.order.id);
                        setDetail(next);
                        await loadParcels();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Bill failed');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Bill
                  </button>
                )}
                {(detail.order.status === 'open' || detail.order.status === 'billed') && (
                  <button
                    type="button"
                    className={hospDangerBtn(shell)}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await hospApi.close(detail.order.id);
                        setActiveId(null);
                        setDetail(null);
                        await loadParcels();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Close failed');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Close / handed over
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {newOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          onClick={() => setNewOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#1a1d21] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-base">New parcel</h3>
            <div>
              <label className="block text-xs font-bold opacity-60 mb-1">Guest name</label>
              <input
                className={hospInputClass(shell)}
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs font-bold opacity-60 mb-1">Phone</label>
              <input
                className={hospInputClass(shell)}
                value={guestPhone}
                onChange={e => setGuestPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <button
              type="button"
              className={cn(hospPrimaryBtn(shell), 'w-full')}
              disabled={busy}
              onClick={() => void createParcel()}
            >
              Start parcel
            </button>
          </div>
        </div>
      )}

      {picking && detail?.order.status === 'open' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          onClick={() => setPicking(null)}
        >
          <div
            className="bg-white dark:bg-[#1a1d21] rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold">{picking.name}</h3>
            <p className={cn('text-sm', hospSubClass(shell))}>₹{Number(picking.price).toLocaleString('en-IN')}</p>
            {picking.modifierGroups.map(g => (
              <div key={g.id}>
                <p className="text-xs font-bold opacity-60 mb-1">
                  {g.name}
                  {g.required ? ' (required)' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {g.modifiers.map(m => {
                    const on = selectedMods.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={on ? hospChipActive(shell) : hospChipIdle(shell)}
                        onClick={() => {
                          setSelectedMods(prev => {
                            if (on) return prev.filter(x => x !== m.id);
                            if (g.maxSelect <= 1) {
                              const others = g.modifiers.map(x => x.id);
                              return [...prev.filter(x => !others.includes(x)), m.id];
                            }
                            const inGroup = prev.filter(id => g.modifiers.some(x => x.id === id));
                            if (inGroup.length >= g.maxSelect) return prev;
                            return [...prev, m.id];
                          });
                        }}
                      >
                        {m.name}
                        {Number(m.price_delta) ? ` +₹${Number(m.price_delta)}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex gap-2 items-center">
              <label className="text-xs font-bold opacity-60">Qty</label>
              <input
                className={cn(hospInputClass(shell), 'w-20')}
                inputMode="numeric"
                value={qty}
                onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <input
              className={hospInputClass(shell)}
              placeholder="Notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <button type="button" className={cn(hospPrimaryBtn(shell), 'w-full')} onClick={() => void addItem()}>
              Add to parcel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
