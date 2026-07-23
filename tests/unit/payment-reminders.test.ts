import { describe, expect, it } from 'vitest';
import {
  canSendPaymentReminder,
  filterVendorsForReminder,
  isWithinReminderCadence,
  resolveCadenceDays,
  cadenceSelectValue,
  DEFAULT_REMINDER_SETTINGS,
} from '../../src/lib/paymentReminders';

describe('paymentReminders', () => {
  const settings = { ...DEFAULT_REMINDER_SETTINGS, minDueAmount: 1000, cadenceDays: 15, enabled: true };

  it('blocks when reminders disabled', () => {
    const r = canSendPaymentReminder({
      settings: { ...settings, enabled: false },
      balance: 5000,
      phone: '9876543210',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/disabled/i);
  });

  it('blocks below min due amount', () => {
    const r = canSendPaymentReminder({
      settings,
      balance: 500,
      phone: '9876543210',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/below reminder minimum/i);
  });

  it('blocks within cadence window', () => {
    const today = new Date(2026, 6, 23);
    expect(isWithinReminderCadence('2026-07-20', 15, today)).toBe(true);
    const r = canSendPaymentReminder({
      settings,
      balance: 5000,
      phone: '9876543210',
      lastSent: '2026-07-20',
      today,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Already reminded/i);
  });

  it('allows when past cadence and above threshold', () => {
    const today = new Date(2026, 6, 23);
    expect(isWithinReminderCadence('2026-07-01', 15, today)).toBe(false);
    const r = canSendPaymentReminder({
      settings,
      balance: 5000,
      phone: '9876543210',
      lastSent: '2026-07-01',
      today,
    });
    expect(r).toEqual({ ok: true });
  });

  it('filterVendorsForReminder separates eligible vs skipped', () => {
    const { eligible, skipped } = filterVendorsForReminder(
      [
        { balance: 500, vendorPhone: '111', lastSent: null },
        { balance: 5000, vendorPhone: '222', lastSent: null },
        { balance: 5000, vendorPhone: '', lastSent: null },
      ],
      settings,
    );
    expect(eligible).toHaveLength(1);
    expect(eligible[0].vendorPhone).toBe('222');
    expect(skipped.length).toBe(2);
  });

  it('resolveCadenceDays maps presets and custom', () => {
    expect(resolveCadenceDays('7', 99)).toBe(7);
    expect(resolveCadenceDays('15', 99)).toBe(15);
    expect(resolveCadenceDays('30', 99)).toBe(30);
    expect(resolveCadenceDays('custom', 21)).toBe(21);
    expect(cadenceSelectValue(15)).toBe('15');
    expect(cadenceSelectValue(21)).toBe('custom');
  });
});
