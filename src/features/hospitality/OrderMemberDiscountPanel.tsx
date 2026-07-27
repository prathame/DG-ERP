import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { hospApi, type HospMember, type HospOrderDetail } from './hospApi';
import { hospInputClass, hospPrimaryBtn, hospSecondaryBtn, hospSubClass, useHospShell } from './hospUi';

/** Member attach (phone search) + order-level discount (% and/or flat ₹). */
export function OrderMemberDiscountPanel({
  detail,
  onDetail,
  disabled,
}: {
  detail: HospOrderDetail;
  onDetail: (next: HospOrderDetail) => void;
  disabled?: boolean;
}) {
  const shell = useHospShell();
  const [phoneQ, setPhoneQ] = useState('');
  const [hits, setHits] = useState<HospMember[]>([]);
  const [discPct, setDiscPct] = useState(String(detail.order.discount_percent ?? 0));
  const [discAmt, setDiscAmt] = useState(String(detail.order.discount_amount ?? 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const subtotal = detail.subtotal ?? detail.total;
  const discountValue = detail.discount_value ?? 0;

  async function search() {
    const q = phoneQ.trim();
    if (!q) return;
    setBusy(true);
    setErr('');
    try {
      const res = await hospApi.members({ q });
      setHits(res.members);
      if (!res.members.length) setErr('No members found');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  async function attach(memberId: string | null) {
    setBusy(true);
    setErr('');
    try {
      onDetail(await hospApi.setOrderMember(detail.order.id, memberId));
      setHits([]);
      setPhoneQ('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not attach member');
    } finally {
      setBusy(false);
    }
  }

  async function saveDiscount(pct: number, amt: number) {
    setBusy(true);
    setErr('');
    try {
      const next = await hospApi.setOrderDiscount(detail.order.id, {
        discountPercent: pct,
        discountAmount: amt,
      });
      onDetail(next);
      setDiscPct(String(next.order.discount_percent ?? 0));
      setDiscAmt(String(next.order.discount_amount ?? 0));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save discount');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className={cn('text-xs font-bold uppercase mb-1', hospSubClass(shell))}>Member</p>
        {detail.member ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              {detail.member.name} · {detail.member.phone}
              {detail.member.plan_name ? ` · ${detail.member.plan_name}` : ''}
              {detail.member.currently_active === false ? ' (inactive — list prices)' : ''}
            </span>
            {!disabled && (
              <button type="button" className={hospSecondaryBtn(shell)} disabled={busy} onClick={() => void attach(null)}>
                Clear
              </button>
            )}
          </div>
        ) : !disabled ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className={cn(hospInputClass(shell), 'flex-1')}
                placeholder="Search phone or name"
                value={phoneQ}
                onChange={e => setPhoneQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void search();
                }}
              />
              <button type="button" className={hospSecondaryBtn(shell)} disabled={busy} onClick={() => void search()}>
                Find
              </button>
            </div>
            {hits.length > 0 && (
              <ul className="space-y-1">
                {hits.map(m => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={cn(hospSecondaryBtn(shell), 'w-full justify-start text-left')}
                      disabled={busy}
                      onClick={() => void attach(m.id)}
                    >
                      {m.name} · {m.phone}
                      {m.currently_active ? '' : ' (expired)'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className={cn('text-sm', hospSubClass(shell))}>No member attached</p>
        )}
      </div>

      <div>
        <p className={cn('text-xs font-bold uppercase mb-1', hospSubClass(shell))}>Discount</p>
        {!disabled ? (
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">
              %
              <input
                className={cn(hospInputClass(shell), 'mt-1 w-20')}
                inputMode="decimal"
                value={discPct}
                onChange={e => setDiscPct(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Flat ₹
              <input
                className={cn(hospInputClass(shell), 'mt-1 w-24')}
                inputMode="decimal"
                value={discAmt}
                onChange={e => setDiscAmt(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={hospPrimaryBtn(shell)}
              disabled={busy}
              onClick={() => void saveDiscount(Number(discPct) || 0, Number(discAmt) || 0)}
            >
              Apply
            </button>
            <button
              type="button"
              className={hospSecondaryBtn(shell)}
              disabled={busy}
              onClick={() => {
                setDiscPct('0');
                setDiscAmt('0');
                void saveDiscount(0, 0);
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
        <div className={cn('mt-2 space-y-0.5 text-sm', shell === 'desktopGlass' && 'dg-ink', shell === 'capGlass' && 'dg-m-ink')}>
          <div className="flex justify-between">
            <span className={hospSubClass(shell)}>Subtotal</span>
            <span>₹{Number(subtotal).toLocaleString('en-IN')}</span>
          </div>
          {discountValue > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Discount</span>
              <span>−₹{Number(discountValue).toLocaleString('en-IN')}</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>Payable</span>
            <span>₹{Number(detail.total).toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
    </div>
  );
}
