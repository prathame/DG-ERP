import { session } from './session';
import { isServicePhoneUx } from '../platforms/service-cloud/mode';

/** Offline Mobile or online Cap + service — GST opt-in; manufacturer cloud stays opt-out. */
export function isServicePhoneBillUx(): boolean {
  try {
    const user = session.getUser() as { businessType?: string } | null;
    return isServicePhoneUx(user?.businessType);
  } catch {
    return false;
  }
}

export type GstBillSettings = { showGst?: boolean; showHsnSac?: boolean } | null | undefined;

/**
 * Single bill-settings flag: GST invoices (GST %, tax columns, HSN/SAC, Tax Invoice layout).
 * Prefer `showGst`; fall back to legacy `showHsnSac` (same toggle, renamed).
 * Service phone UX: opt-in. Manufacturer / desktop: opt-out (historical default on).
 */
export function isGstBillingEnabled(settings?: GstBillSettings): boolean {
  const flag = settings?.showGst !== undefined ? settings.showGst : settings?.showHsnSac;
  if (isServicePhoneBillUx()) return flag === true;
  return flag !== false;
}

/** Print/PDF: use the invoice’s frozen GST mode; never re-read live bill settings. */
export function invoiceHasGst(inv: { gstEnabled?: boolean | null; taxTotal?: number | null }): boolean {
  if (typeof inv.gstEnabled === 'boolean') return inv.gstEnabled;
  return (Number(inv.taxTotal) || 0) > 0;
}

/**
 * Quotation line `withGst` for save/calc: new quotes follow bill GST toggle (like invoice `gstBilling`);
 * draft edits keep the stored per-line flag.
 */
export function quotationLineWithGst(gstBillingEnabled: boolean, isEditing: boolean, lineWithGst: boolean): boolean {
  if (!gstBillingEnabled && !isEditing) return false;
  return lineWithGst;
}
