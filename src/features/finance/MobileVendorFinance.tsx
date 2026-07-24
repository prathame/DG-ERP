/**
 * Cap non-service phone Vendor Finance cards (dealer mock).
 * Service business type uses InvoiceFinanceView — never this chrome.
 */
import React from 'react';
import { MessageCircle, Plus, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LoadingSpinner, PaidBadge, isBillFullyPaid } from '../../components/ui';
import { canSendPaymentReminder, type CompanyReminderSettings } from '../../lib/paymentReminders';
import type { DesktopVendorSummaryRow } from './DesktopVendorFinance';

export type MobileFinanceChip = 'all' | 'high' | 'paid';

type ReminderDue = {
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  balance: number;
  lastSent?: string | null;
};

type Props = {
  isAdmin: boolean;
  loading: boolean;
  summaryData: DesktopVendorSummaryRow[];
  chip: MobileFinanceChip;
  onChip: (c: MobileFinanceChip) => void;
  finSearch: string;
  onFinSearch: (v: string) => void;
  reminderSettings: CompanyReminderSettings;
  onDetails: (vendorId: string) => void;
  onPay: (vendorId: string) => void;
  onSendReminder: (v: ReminderDue) => void;
};

const fmt = (n: number) => `₹ ${Math.abs(n).toLocaleString()}`;

const CHIPS: { id: MobileFinanceChip; label: string }[] = [
  { id: 'all', label: 'All Dealers' },
  { id: 'high', label: 'High Balance' },
  { id: 'paid', label: 'Recent Payments' },
  // ponytail: drop Pending Approval — product has no such state
];

export function MobileVendorFinance({
  isAdmin,
  loading,
  summaryData,
  chip,
  onChip,
  finSearch,
  onFinSearch,
  reminderSettings,
  onDetails,
  onPay,
  onSendReminder,
}: Props) {
  let rows = summaryData.filter(v => {
    const isPaid = v.balance <= 0;
    if (chip === 'paid' && !isPaid) return false;
    if (chip === 'high' && isPaid) return false;
    if (finSearch && !v.vendorName.toLowerCase().includes(finSearch.toLowerCase())) return false;
    return true;
  });
  if (chip === 'high') {
    rows = [...rows].sort((a, b) => b.balance - a.balance);
  }

  return (
    <div className="dg-mobile-glass space-y-3 -mx-3 px-3 pb-2 min-h-full">
      <div>
        <h2 className="text-xl font-bold dg-m-ink tracking-tight">Finance & Reports</h2>
        <p className="text-[12px] dg-m-muted mt-0.5">Vendor balances, payments, and reminders</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 dg-m-faint" />
        <input
          type="search"
          value={finSearch}
          onChange={e => onFinSearch(e.target.value)}
          placeholder="Search dealers…"
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/80 border border-[var(--dg-card-border)] text-sm dg-m-ink focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary-bright)]"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {CHIPS.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChip(c.id)}
            className={cn(
              'dg-pill-tab shrink-0 h-8 px-3 rounded-full text-[11px] font-bold border border-solid',
              chip === c.id
                ? 'dg-m-chip-active border-transparent'
                : 'bg-white/70 dg-m-muted border-[var(--dg-card-border)]',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16">
          <LoadingSpinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="dg-m-glass-card rounded-2xl py-12 text-center">
          <p className="text-sm font-bold dg-m-ink">
            {finSearch
              ? 'No matching vendors'
              : chip === 'paid'
                ? 'No fully paid vendors'
                : chip === 'high'
                  ? 'No outstanding balances'
                  : 'No vendors yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(v => {
            const settled = v.balance <= 0;
            const gate =
              reminderSettings.enabled && v.balance > 0 && v.vendorPhone
                ? canSendPaymentReminder({
                    settings: reminderSettings,
                    balance: v.balance,
                    phone: v.vendorPhone,
                    lastSent: v.reminder?.lastSent,
                  })
                : { ok: false as const, reason: '' };
            return (
              <div key={v.vendorId} className="dg-m-glass-card rounded-2xl p-3.5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-bold dg-m-ink truncate">{v.vendorName}</h3>
                      {isBillFullyPaid(v.totalDistributedValue, v.balance) && <PaidBadge size="sm" />}
                      {!settled && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--dg-error)_12%,transparent)] dg-m-error">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] dg-m-muted mt-0.5">
                      Vendor ID: #{v.vendorId.slice(0, 8)}
                      {v.unitsDistributed ? ` · ${v.unitsDistributed} units` : ''}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider dg-m-faint">Distributed</p>
                    <p className="text-[13px] font-bold dg-m-ink tabular-nums mt-0.5">{fmt(v.totalDistributedValue)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider dg-m-faint">Paid</p>
                    <p className="text-[13px] font-bold dg-m-success tabular-nums mt-0.5">{fmt(v.totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider dg-m-faint">Outstanding</p>
                    <p
                      className={cn(
                        'text-[13px] font-bold tabular-nums mt-0.5',
                        settled ? 'dg-m-success' : 'dg-m-error',
                      )}
                    >
                      {settled ? (v.balance < 0 ? `${fmt(v.balance)} credit` : 'Settled') : fmt(v.balance)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {reminderSettings.enabled && v.balance > 0 && v.vendorPhone ? (
                    <button
                      type="button"
                      disabled={!gate.ok}
                      title={!gate.ok ? gate.reason || 'Cannot send reminder' : 'WhatsApp payment reminder'}
                      onClick={() =>
                        onSendReminder({
                          vendorId: v.vendorId,
                          vendorName: v.vendorName,
                          vendorPhone: v.vendorPhone,
                          balance: v.balance,
                          lastSent: v.reminder?.lastSent,
                        })
                      }
                      className={cn(
                        'h-9 w-9 rounded-full flex items-center justify-center shrink-0 border border-[var(--dg-card-border)]',
                        gate.ok ? 'dg-m-success bg-white' : 'dg-m-faint bg-[var(--dg-input)] opacity-50',
                      )}
                    >
                      <MessageCircle size={16} />
                    </button>
                  ) : null}
                  {isAdmin && !settled ? (
                    <button
                      type="button"
                      onClick={() => onPay(v.vendorId)}
                      className="h-9 px-3 rounded-full dg-m-bg-primary text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <Plus size={14} /> PAY
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDetails(v.vendorId)}
                    className="h-9 px-3 rounded-full text-[11px] font-bold border border-[var(--dg-card-border)] dg-m-ink bg-white/70 ml-auto"
                  >
                    DETAILS
                  </button>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] dg-m-faint text-center py-2">End of Dealer List</p>
        </div>
      )}
    </div>
  );
}
