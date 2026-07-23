/** Company-level payment reminder policy (Distribution / Vendor Finance). */

export type CompanyReminderSettings = {
  enabled: boolean;
  minDueAmount: number;
  cadenceDays: number;
};

export const DEFAULT_REMINDER_SETTINGS: CompanyReminderSettings = {
  enabled: true,
  minDueAmount: 1000,
  cadenceDays: 15,
};

/** Preset cadence options (days). Custom = any other positive integer. */
export const REMINDER_CADENCE_PRESETS = [7, 15, 30] as const;

export type ReminderGateResult = { ok: true } | { ok: false; reason: string };

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** True if lastSent is within the cadence window (not yet due again). */
export function isWithinReminderCadence(
  lastSent: string | null | undefined,
  cadenceDays: number,
  today: Date = new Date(),
): boolean {
  if (!lastSent) return false;
  const days = Math.max(1, Math.floor(Number(cadenceDays) || 1));
  const last = new Date(lastSent);
  if (Number.isNaN(last.getTime())) return false;
  const nextDue = startOfDay(last);
  nextDue.setDate(nextDue.getDate() + days);
  return startOfDay(today) < nextDue;
}

export function canSendPaymentReminder(opts: {
  settings: CompanyReminderSettings;
  balance: number;
  phone?: string | null;
  lastSent?: string | null;
  today?: Date;
}): ReminderGateResult {
  const { settings, balance, phone, lastSent, today } = opts;
  if (!settings.enabled) {
    return { ok: false, reason: 'Payment reminders are disabled in Settings' };
  }
  if (!phone) {
    return { ok: false, reason: 'Vendor has no phone number' };
  }
  if (!(balance > 0)) {
    return { ok: false, reason: 'No outstanding balance' };
  }
  const min = Number(settings.minDueAmount) || 0;
  if (balance < min) {
    return {
      ok: false,
      reason: `Balance ₹${balance.toLocaleString()} is below reminder minimum ₹${min.toLocaleString()}`,
    };
  }
  if (isWithinReminderCadence(lastSent, settings.cadenceDays, today)) {
    return {
      ok: false,
      reason: `Already reminded within the last ${settings.cadenceDays} day${settings.cadenceDays === 1 ? '' : 's'}`,
    };
  }
  return { ok: true };
}

export function filterVendorsForReminder<
  T extends { balance: number; vendorPhone?: string | null; lastSent?: string | null },
>(
  vendors: T[],
  settings: CompanyReminderSettings,
  today?: Date,
): { eligible: T[]; skipped: { vendor: T; reason: string }[] } {
  const eligible: T[] = [];
  const skipped: { vendor: T; reason: string }[] = [];
  for (const v of vendors) {
    const gate = canSendPaymentReminder({
      settings,
      balance: v.balance,
      phone: v.vendorPhone,
      lastSent: v.lastSent,
      today,
    });
    if (gate.ok) eligible.push(v);
    else skipped.push({ vendor: v, reason: gate.reason });
  }
  return { eligible, skipped };
}

export function cadenceSelectValue(cadenceDays: number): string {
  if (REMINDER_CADENCE_PRESETS.includes(cadenceDays as (typeof REMINDER_CADENCE_PRESETS)[number])) {
    return String(cadenceDays);
  }
  return 'custom';
}

export function resolveCadenceDays(selectValue: string, customDays: number): number {
  if (selectValue === 'custom') return Math.max(1, Math.floor(Number(customDays) || 1));
  const n = parseInt(selectValue, 10);
  if (REMINDER_CADENCE_PRESETS.includes(n as (typeof REMINDER_CADENCE_PRESETS)[number])) return n;
  return 15;
}
