import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { session } from '../../lib/session';
import { cn } from '../../lib/utils';
import { hospApi, type HospMenuItem, type HospOrderDetail, type HospParcel } from './hospApi';
import { OrderMemberDiscountPanel } from './OrderMemberDiscountPanel';
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

function isHotelAdminRole(): boolean {
  const role = String((session.getUser() as { role?: string } | null)?.role || '');
  return role === 'Admin' || role === 'Super Admin';
}

export function HospitalityParcelsView() {
  const shell = useHospShell();
  const { toast } = useToast();
  const canMarkPaid = isHotelAdminRole();
  const isAdmin = canMarkPaid;
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
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

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
      const phone = guestPhone.trim();
      let created = await hospApi.createParcel({
        customerName: guestName.trim(),
        customerPhone: phone,
      });
      // Attach only when membership is currently valid (active + date + plan)
      if (phone) {
        try {
          const lookup = await hospApi.lookupMember(phone);
          if (lookup.valid && lookup.member) {
            created = await hospApi.setOrderMember(created.order.id, lookup.member.id);
          }
        } catch {
          /* guest fields already saved on create */
        }
      }
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
        <div className="flex gap-2 flex-wrap">
          {isAdmin && parcels.length > 0 && (
            <button
              type="button"
              className={selecting ? hospPrimaryBtn(shell) : hospSecondaryBtn(shell)}
              onClick={() => {
                setSelecting(s => !s);
                setSelectedIds(new Set());
              }}
            >
              {selecting ? 'Done selecting' : 'Select to cancel'}
            </button>
          )}
          {selecting && selectedIds.size > 0 && (
            <button type="button" className={hospDangerBtn(shell)} onClick={() => setConfirmBulk(true)}>
              Cancel selected ({selectedIds.size})
            </button>
          )}
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
                  <div
                    className={cn(
                      'w-full rounded-xl px-3 py-3 border transition flex items-start gap-2',
                      activeId === p.id
                        ? 'border-[var(--dg-primary)] bg-[var(--dg-primary)]/10'
                        : 'border-black/5 hover:border-black/15',
                      selecting && selectedIds.has(p.id) && 'ring-2 ring-[var(--dg-primary)]',
                    )}
                  >
                    {selecting && (
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selectedIds.has(p.id)}
                        onChange={() => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${p.label}`}
                      />
                    )}
                    <button
                      type="button"
                      disabled={selecting}
                      onClick={() => setActiveId(p.id)}
                      className="flex-1 text-left min-w-0"
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
                  </div>
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

              <OrderMemberDiscountPanel
                detail={detail}
                onDetail={setDetail}
                disabled={detail.order.status !== 'open'}
              />

              <ul className="divide-y divide-black/5">
                {detail.items.map(it => (
                  <li key={it.id} className="py-2 flex justify-between gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {it.qty}× {it.name}
                      </p>
                      {it.modifiers?.length > 0 && (
                        <p className={cn('text-xs', hospSubClass(shell))}>{it.modifiers.map(m => m.name).join(', ')}</p>
                      )}
                      <p className={cn('text-[10px] uppercase font-bold', hospSubClass(shell))}>{it.kitchen_status}</p>
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <span>₹{it.lineTotal.toLocaleString('en-IN')}</span>
                      {detail.order.status === 'open' && it.kitchen_status === 'queued' && (
                        <button
                          type="button"
                          className={cn(hospDangerBtn(shell), 'h-8 min-h-0 px-2')}
                          aria-label={`Remove ${it.name}`}
                          onClick={() => {
                            void hospApi
                              .removeItem(it.id)
                              .then(next => {
                                setDetail(next);
                                void loadParcels();
                              })
                              .catch(e => setError(e instanceof Error ? e.message : 'Could not remove item'));
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
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
                {(detail.order.status === 'open' || detail.order.status === 'billed') &&
                  (canMarkPaid ? (
                    <button
                      type="button"
                      className={cn(
                        'inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-bold text-white',
                        shell === 'desktopGlass' && 'rounded-lg bg-emerald-600',
                        shell === 'capGlass' && 'rounded-full h-9 px-3 text-[11px] bg-emerald-600',
                        shell === 'classic' && 'rounded-xl bg-emerald-700',
                      )}
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
                      Payment done
                    </button>
                  ) : (
                    <p className={cn('text-xs self-center', hospSubClass(shell))}>
                      Waiting for Admin to mark payment done…
                    </p>
                  ))}
                {(detail.order.status === 'open' || detail.order.status === 'billed') &&
                  (isAdmin || (detail.order.status === 'open' && detail.items.length === 0)) && (
                    <button
                      type="button"
                      className={hospDangerBtn(shell)}
                      disabled={busy}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel order
                    </button>
                  )}
              </div>
            </>
          )}
        </section>
      </div>

      {confirmCancel && detail && (
        <ConfirmDialog
          title="Cancel parcel?"
          message={
            detail.items.length > 0
              ? 'Void this parcel order? Kitchen tickets for it will stop showing.'
              : 'Close this empty parcel?'
          }
          confirmLabel="Cancel order"
          variant="danger"
          onConfirm={() => {
            void (async () => {
              setBusy(true);
              try {
                await hospApi.cancelOrder(detail.order.id);
                toast('Parcel cancelled', 'success');
                setActiveId(null);
                setDetail(null);
                await loadParcels();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Cancel failed');
              } finally {
                setBusy(false);
                setConfirmCancel(false);
              }
            })();
          }}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {confirmBulk && (
        <ConfirmDialog
          title="Cancel selected parcels?"
          message={`Void ${selectedIds.size} parcel order(s)?`}
          confirmLabel="Cancel selected"
          variant="danger"
          onConfirm={() => {
            void (async () => {
              const ids = [...selectedIds];
              try {
                const r = await hospApi.bulkCancelOrders({ orderIds: ids });
                const msg =
                  r.errors.length > 0
                    ? `Cancelled ${r.cancelled}; ${r.errors.length} failed`
                    : `Cancelled ${r.cancelled} parcel(s)`;
                toast(msg, r.errors.length ? 'error' : 'success');
                setSelectedIds(new Set());
                setSelecting(false);
                if (activeId && ids.includes(activeId)) {
                  setActiveId(null);
                  setDetail(null);
                }
                await loadParcels();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Bulk cancel failed', 'error');
              } finally {
                setConfirmBulk(false);
              }
            })();
          }}
          onCancel={() => setConfirmBulk(false)}
        />
      )}

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
