/** Membership line pricing + order-level discount helpers (hotel_restaurant). */

export type MemberPriceInput = {
  listPrice: number;
  memberPrice?: number | null;
  /** True when member status is active and valid_until is not past. */
  memberActive: boolean;
  useMemberPrices: boolean;
  discountPercent: number;
};

/**
 * Resolve unit_price when adding an order line with a member attached.
 * inactive/expired → list; else member_price if plan flag; else % off; else list.
 */
export function resolveMemberUnitPrice(input: MemberPriceInput): number {
  const list = Math.round((Number(input.listPrice) || 0) * 100) / 100;
  if (!input.memberActive) return list;

  if (input.useMemberPrices && input.memberPrice != null) {
    const mp = Number(input.memberPrice);
    if (Number.isFinite(mp) && mp >= 0) return Math.round(mp * 100) / 100;
  }

  const pct = Number(input.discountPercent) || 0;
  if (pct > 0) {
    const clamped = Math.max(0, Math.min(100, pct));
    return Math.round(list * (1 - clamped / 100) * 100) / 100;
  }

  return list;
}

/** Order discount: % of subtotal + flat ₹, capped at subtotal. Applied after line totals. */
export function computeOrderDiscount(
  subtotal: number,
  discountPercent: number,
  discountAmount: number,
): number {
  const sub = Math.max(0, Number(subtotal) || 0);
  const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  const flat = Math.max(0, Number(discountAmount) || 0);
  const fromPct = Math.round(((sub * pct) / 100) * 100) / 100;
  return Math.min(sub, Math.round((fromPct + flat) * 100) / 100);
}

export function isMemberCurrentlyActive(
  status: string,
  validUntil: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== 'active') return false;
  if (!validUntil) return false;
  const end = validUntil instanceof Date ? validUntil : new Date(validUntil);
  if (Number.isNaN(end.getTime())) return false;
  // Compare calendar days in local time: valid through end date
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  return endDay.getTime() >= now.getTime();
}
