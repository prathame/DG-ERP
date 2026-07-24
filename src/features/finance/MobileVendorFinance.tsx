/**
 * Cap non-service phone Vendor Finance cards (dealer mock).
 * Service business type uses InvoiceFinanceView — never this chrome.
 */
import React from 'react';
import { ArrowLeft, MessageCircle, Plus, Search } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { LoadingSpinner, PaidBadge, isBillFullyPaid } from '../../components/ui';
import { canSendPaymentReminder, type CompanyReminderSettings } from '../../lib/paymentReminders';
import type { DesktopVendorDetail, DesktopVendorSummaryRow } from './DesktopVendorFinance';

export type MobileFinanceChip = 'all' | 'unpaid' | 'paid';

export type MobileUnpaidBatch = {
  batchId: string;
  distributionDate: string;
  billValue: number;
  balanceRemaining: number;
  productNames: string[];
};

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
  /** Cap glass detail — when set, list is hidden */
  detail: DesktopVendorDetail | null;
  unpaidBatches: MobileUnpaidBatch[];
  batchesLoading: boolean;
  onBack: () => void;
  onPayBatch: (batchId: string) => void;
};

const fmt = (n: number) => `₹ ${Math.abs(n).toLocaleString()}`;

const CHIPS: { id: MobileFinanceChip; label: string }[] = [
  { id: 'all', label: 'All Dealers' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'paid', label: 'Paid' },
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
  detail,
  unpaidBatches,
  batchesLoading,
  onBack,
  onPayBatch,
}: Props) {
  if (detail) {
    const settled = detail.balance <= 0;
    const gate =
      reminderSettings.enabled && detail.balance > 0 && detail.vendor.phone
        ? canSendPaymentReminder({
            settings: reminderSettings,
            balance: detail.balance,
            phone: detail.vendor.phone,
            lastSent: detail.reminder?.lastSent,
          })
        : { ok: false as const, reason: '' };

    return (
      <div className="dg-mobile-glass space-y-3 -mx-3 px-3 pb-2 min-h-full">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 border border-[var(--dg-card-border)] dg-m-surface dg-m-ink"
            aria-label="Back to dealers"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold dg-m-ink truncate">{detail.vendor.name}</h2>
              {isBillFullyPaid(detail.totalDistributedValue, detail.balance) && <PaidBadge size="sm" />}
            </div>
            <p className="text-[12px] dg-m-muted mt-0.5 truncate">
              {detail.vendor.phone || detail.vendor.email || detail.vendor.contactPerson || 'Vendor finance'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="dg-m-glass-card rounded-xl p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider dg-m-faint">Distributed</p>
            <p className="text-[13px] font-bold dg-m-ink tabular-nums mt-0.5">{fmt(detail.totalDistributedValue)}</p>
          </div>
          <div className="dg-m-glass-card rounded-xl p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider dg-m-faint">Paid</p>
            <p className="text-[13px] font-bold dg-m-success tabular-nums mt-0.5">{fmt(detail.totalPaid)}</p>
          </div>
          <div className="dg-m-glass-card rounded-xl p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider dg-m-faint">Outstanding</p>
            <p className={cn('text-[13px] font-bold tabular-nums mt-0.5', settled ? 'dg-m-success' : 'dg-m-error')}>
              {settled ? (detail.balance < 0 ? `${fmt(detail.balance)} credit` : 'Settled') : fmt(detail.balance)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {reminderSettings.enabled && detail.balance > 0 && detail.vendor.phone ? (
            <button
              type="button"
              disabled={!gate.ok}
              title={!gate.ok ? gate.reason || 'Cannot send reminder' : 'WhatsApp payment reminder'}
              onClick={() =>
                onSendReminder({
                  vendorId: detail.vendor.id,
                  vendorName: detail.vendor.name,
                  vendorPhone: detail.vendor.phone!,
                  balance: detail.balance,
                  lastSent: detail.reminder?.lastSent,
                })
              }
              className={cn(
                'h-9 px-3 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 border border-[var(--dg-card-border)]',
                gate.ok ? 'dg-m-success dg-m-surface' : 'dg-m-faint bg-[var(--dg-input)] opacity-50',
              )}
            >
              <MessageCircle size={14} /> Remind
            </button>
          ) : null}
          {isAdmin && !settled ? (
            <button
              type="button"
              onClick={() => onPay(detail.vendor.id)}
              className="h-9 px-3 rounded-full dg-m-bg-primary text-[11px] font-bold inline-flex items-center gap-1"
            >
              <Plus size={14} /> Record Payment
            </button>
          ) : null}
        </div>

        <section className="dg-m-glass-card rounded-2xl overflow-hidden">
          <div className="px-3.5 py-3 border-b border-[var(--dg-card-border)] flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[12px] font-bold dg-m-ink uppercase tracking-wider">Unpaid distributions</h3>
              <p className="text-[11px] dg-m-muted mt-0.5">Pay against a specific distribution batch</p>
            </div>
            {batchesLoading ? <LoadingSpinner /> : null}
          </div>
          {!batchesLoading && unpaidBatches.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-sm dg-m-muted">No unpaid distribution batches</p>
          ) : (
            <div className="divide-y divide-[var(--dg-card-border)]">
              {unpaidBatches.map(b => (
                <div key={b.batchId} className="px-3.5 py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold dg-m-ink truncate">
                      {b.productNames.length ? b.productNames.join(', ') : `Batch ${b.batchId.slice(-6)}`}
                    </p>
                    <p className="text-[11px] dg-m-muted mt-0.5">
                      {formatDate(b.distributionDate)} · Bill {fmt(b.billValue)}
                    </p>
                    <p className="text-[12px] font-bold dg-m-error tabular-nums mt-1">{fmt(b.balanceRemaining)} due</p>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => onPayBatch(b.batchId)}
                      className="h-9 px-3 rounded-full dg-m-bg-primary text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                    >
                      <Plus size={14} /> PAY
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dg-m-glass-card rounded-2xl overflow-hidden">
          <div className="px-3.5 py-3 border-b border-[var(--dg-card-border)]">
            <h3 className="text-[12px] font-bold dg-m-ink uppercase tracking-wider">Payment history</h3>
          </div>
          {detail.payments.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm dg-m-muted">No payments recorded yet</p>
          ) : (
            <div className="divide-y divide-[var(--dg-card-border)]">
              {detail.payments.map(p => (
                <div key={p.id} className="px-3.5 py-3">
                  <p className="text-[13px] font-bold dg-m-success tabular-nums">+{fmt(p.amount)}</p>
                  <p className="text-[11px] dg-m-muted mt-0.5">
                    {formatDate(p.paymentDate)} · {p.paymentMethod}
                    {p.referenceNumber ? ` · ${p.referenceNumber}` : ''}
                  </p>
                  {p.notes ? <p className="text-[11px] dg-m-faint mt-0.5 truncate">{p.notes}</p> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dg-m-glass-card rounded-2xl overflow-hidden">
          <div className="px-3.5 py-3 border-b border-[var(--dg-card-border)]">
            <h3 className="text-[12px] font-bold dg-m-ink uppercase tracking-wider">All distributions</h3>
          </div>
          {detail.distributions.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm dg-m-muted">No distributions</p>
          ) : (
            <div className="divide-y divide-[var(--dg-card-border)]">
              {detail.distributions.map((d, i) => (
                <div
                  key={`${d.date}-${d.productName}-${i}`}
                  className="px-3.5 py-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium dg-m-ink truncate">{d.productName}</p>
                    <p className="text-[11px] dg-m-muted">
                      {formatDate(d.date)} · {d.quantity} × {fmt(d.unitPrice)}
                    </p>
                  </div>
                  <p className="text-[13px] font-bold dg-m-ink tabular-nums shrink-0">{fmt(d.total)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  let rows = summaryData.filter(v => {
    const isPaid = v.balance <= 0;
    if (chip === 'paid' && !isPaid) return false;
    if (chip === 'unpaid' && isPaid) return false;
    if (finSearch && !v.vendorName.toLowerCase().includes(finSearch.toLowerCase())) return false;
    return true;
  });
  if (chip === 'unpaid') {
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
          className="w-full h-10 pl-9 pr-3 rounded-xl dg-m-surface border border-[var(--dg-card-border)] text-sm dg-m-ink focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary-bright)]"
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
                : 'dg-m-surface dg-m-muted border-[var(--dg-card-border)]',
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
                : chip === 'unpaid'
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
                          Unpaid
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
                        gate.ok ? 'dg-m-success dg-m-surface' : 'dg-m-faint bg-[var(--dg-input)] opacity-50',
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
                    className="h-9 px-3 rounded-full text-[11px] font-bold border border-[var(--dg-card-border)] dg-m-ink dg-m-surface ml-auto"
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
