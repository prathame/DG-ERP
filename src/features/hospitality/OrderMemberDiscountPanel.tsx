import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { hospApi, type HospOrderDetail } from './hospApi';
import { hospInputClass, hospPrimaryBtn, hospSecondaryBtn, hospSubClass, useHospShell } from './hospUi';

type LookupUi =
  | { kind: 'idle' }
  | { kind: 'none'; message: string }
  | { kind: 'invalid'; message: string; name?: string }
  | { kind: 'valid'; message: string };

/** Guest name/mobile (optional) + membership validity check + order-level discount. */
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
  const [guestName, setGuestName] = useState(detail.order.customer_name || '');
  const [guestPhone, setGuestPhone] = useState(detail.order.customer_phone || '');
  const [lookupUi, setLookupUi] = useState<LookupUi>({ kind: 'idle' });
  const [discPct, setDiscPct] = useState(String(detail.order.discount_percent ?? 0));
  const [discAmt, setDiscAmt] = useState(String(detail.order.discount_amount ?? 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setGuestName(detail.order.customer_name || '');
    setGuestPhone(detail.order.customer_phone || '');
    setDiscPct(String(detail.order.discount_percent ?? 0));
    setDiscAmt(String(detail.order.discount_amount ?? 0));
  }, [
    detail.order.id,
    detail.order.customer_name,
    detail.order.customer_phone,
    detail.order.discount_percent,
    detail.order.discount_amount,
    detail.member?.id,
  ]);

  const subtotal = detail.subtotal ?? detail.total;
  const discountValue = detail.discount_value ?? 0;
  const memberValid = detail.member?.currently_active !== false && !!detail.member;

  async function saveGuest(name = guestName, phone = guestPhone) {
    return hospApi.setOrderGuest(detail.order.id, {
      customerName: name.trim(),
      customerPhone: phone.trim(),
    });
  }

  /** Save guest fields, lookup membership validity, attach only when valid. */
  async function checkMember() {
    const phone = guestPhone.trim();
    setBusy(true);
    setErr('');
    setLookupUi({ kind: 'idle' });
    try {
      let next = await saveGuest();
      if (!phone) {
        if (detail.member) next = await hospApi.setOrderMember(detail.order.id, null);
        onDetail(next);
        setLookupUi({ kind: 'none', message: 'Guest saved (no mobile — list prices)' });
        return;
      }
      const lookup = await hospApi.lookupMember(phone);
      if (!lookup.found || !lookup.member) {
        if (detail.member) next = await hospApi.setOrderMember(detail.order.id, null);
        onDetail(next);
        setLookupUi({ kind: 'none', message: lookup.reason || 'No membership' });
        return;
      }
      if (!lookup.valid) {
        // Keep guest phone; do not apply member prices
        if (detail.member) next = await hospApi.setOrderMember(detail.order.id, null);
        onDetail(next);
        setLookupUi({
          kind: 'invalid',
          message: lookup.reason || 'Membership expired / not valid',
          name: lookup.member.name,
        });
        return;
      }
      next = await hospApi.setOrderMember(detail.order.id, lookup.member.id);
      onDetail(next);
      const until = String(lookup.member.valid_until || '').slice(0, 10);
      setLookupUi({
        kind: 'valid',
        message: `Member: ${lookup.member.name}${lookup.member.plan_name ? ` · ${lookup.member.plan_name}` : ''}${until ? ` · valid until ${until}` : ''}`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not check membership');
    } finally {
      setBusy(false);
    }
  }

  async function attach(memberId: string | null) {
    setBusy(true);
    setErr('');
    try {
      onDetail(await hospApi.setOrderMember(detail.order.id, memberId));
      setLookupUi(memberId ? { kind: 'idle' } : { kind: 'none', message: 'Member cleared — list prices' });
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
        <p className={cn('text-xs font-bold uppercase mb-1', hospSubClass(shell))}>Guest (optional)</p>
        {!disabled ? (
          <div className="space-y-2">
            <input
              className={cn(hospInputClass(shell), 'w-full')}
              placeholder="Guest name"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              onBlur={() => {
                if ((detail.order.customer_name || '') !== guestName.trim()) {
                  void saveGuest()
                    .then(onDetail)
                    .catch(e => setErr(e instanceof Error ? e.message : 'Could not save guest'));
                }
              }}
            />
            <div className="flex gap-2">
              <input
                className={cn(hospInputClass(shell), 'flex-1')}
                placeholder="Mobile"
                inputMode="tel"
                value={guestPhone}
                onChange={e => setGuestPhone(e.target.value)}
                onBlur={() => {
                  const phone = guestPhone.trim();
                  if (!phone && !(detail.order.customer_phone || '')) return;
                  if (phone && phone === (detail.order.customer_phone || '') && detail.member && memberValid) return;
                  void checkMember();
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') void checkMember();
                }}
              />
              <button
                type="button"
                className={hospSecondaryBtn(shell)}
                disabled={busy}
                onClick={() => void checkMember()}
              >
                Check member
              </button>
            </div>
          </div>
        ) : (
          <p className={cn('text-sm', hospSubClass(shell))}>
            {detail.order.customer_name || detail.order.customer_phone
              ? `${detail.order.customer_name || 'Guest'}${detail.order.customer_phone ? ` · ${detail.order.customer_phone}` : ''}`
              : 'No guest details'}
          </p>
        )}
      </div>

      <div>
        <p className={cn('text-xs font-bold uppercase mb-1', hospSubClass(shell))}>Membership</p>
        {detail.member && memberValid ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                'inline-flex items-center px-2 py-1 rounded-md text-xs font-bold',
                shell === 'classic' ? 'bg-emerald-50 text-emerald-800' : 'bg-emerald-500/15 text-emerald-300',
              )}
            >
              {lookupUi.kind === 'valid'
                ? lookupUi.message
                : `Member: ${detail.member.name}${detail.member.plan_name ? ` · ${detail.member.plan_name}` : ''}${detail.member.valid_until ? ` · valid until ${String(detail.member.valid_until).slice(0, 10)}` : ''}`}
            </span>
            {!disabled && (
              <button
                type="button"
                className={hospSecondaryBtn(shell)}
                disabled={busy}
                onClick={() => void attach(null)}
              >
                Clear
              </button>
            )}
          </div>
        ) : lookupUi.kind === 'invalid' ? (
          <p className={cn('text-sm font-medium', shell === 'classic' ? 'text-amber-700' : 'text-amber-400')}>
            {lookupUi.name ? `${lookupUi.name}: ` : ''}
            {lookupUi.message} — list prices apply. Guest mobile kept on bill.
          </p>
        ) : lookupUi.kind === 'none' ? (
          <p className={cn('text-sm', hospSubClass(shell))}>{lookupUi.message} — order continues at list price</p>
        ) : (
          <p className={cn('text-sm', hospSubClass(shell))}>Enter mobile and Check member for membership pricing</p>
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
        <div
          className={cn(
            'mt-2 space-y-0.5 text-sm',
            shell === 'desktopGlass' && 'dg-ink',
            shell === 'capGlass' && 'dg-m-ink',
          )}
        >
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
