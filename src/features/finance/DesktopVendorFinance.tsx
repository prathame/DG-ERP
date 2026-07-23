/**
 * Desktop-only glass Vendor Finance. Cap / phone UX untouched.
 * Logic + modals stay in VendorFinanceView.
 */
import React from 'react';
import { Clock, FileSpreadsheet, IndianRupee, MessageCircle, Plus, Printer, Search, Send, X } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { LoadingSpinner, PaidBadge, isBillFullyPaid } from '../../components/ui';
import { canSendPaymentReminder, type CompanyReminderSettings } from '../../lib/paymentReminders';

export type DesktopVendorSummaryRow = {
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  totalDistributedValue: number;
  totalPaid: number;
  balance: number;
  unitsDistributed: number;
  reminder: { enabled: boolean; days: number; lastSent: string | null };
};

export type DesktopVendorDetail = {
  vendor: { id: string; name: string; phone?: string; email?: string; address?: string; contactPerson?: string };
  totalDistributedValue: number;
  totalPaid: number;
  balance: number;
  payments: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
  }[];
  distributions: { date: string; productName: string; unitPrice: number; quantity: number; total: number }[];
  reminder: { enabled: boolean; days: number; lastSent: string | null };
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
  isVendor: boolean;
  loading: boolean;
  summaryData: DesktopVendorSummaryRow[];
  paymentFilter: 'unpaid' | 'paid';
  onPaymentFilter: (tab: 'unpaid' | 'paid') => void;
  finSearch: string;
  onFinSearch: (v: string) => void;
  totalDistributed: number;
  totalReceived: number;
  totalOutstanding: number;
  selectedVendorId: string | null;
  detail: DesktopVendorDetail | null;
  remindersDue: ReminderDue[];
  reminderSettings: CompanyReminderSettings;
  onSelectVendor: (vendorId: string) => void;
  onClearSelection: () => void;
  onOpenPayment: () => void;
  onSendReminder: (v: ReminderDue) => void;
  onOpenReminderModal: (row: DesktopVendorSummaryRow) => void;
  onPrintStatement: () => void;
  onBankFile: (file: File) => void;
  onRemindAll: (() => void) | null;
  remindAllCount: number;
};

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString()}`;

const fieldInput =
  'w-full pl-9 pr-4 py-2.5 bg-[var(--dg-bg)] border border-[var(--dg-card-border)] rounded-lg text-sm dg-ink focus:ring-2 focus:ring-[var(--dg-primary)] focus:border-transparent';

export function DesktopVendorFinance({
  isAdmin,
  isVendor,
  loading,
  summaryData,
  paymentFilter,
  onPaymentFilter,
  finSearch,
  onFinSearch,
  totalDistributed,
  totalReceived,
  totalOutstanding,
  selectedVendorId,
  detail,
  remindersDue,
  reminderSettings,
  onSelectVendor,
  onClearSelection,
  onOpenPayment,
  onSendReminder,
  onOpenReminderModal,
  onPrintStatement,
  onBankFile,
  onRemindAll,
  remindAllCount,
}: Props) {
  const filtered = summaryData.filter(v => {
    const isPaid = v.balance <= 0;
    if (paymentFilter === 'paid' ? !isPaid : isPaid) return false;
    if (finSearch && !v.vendorName.toLowerCase().includes(finSearch.toLowerCase())) return false;
    return true;
  });

  const kpis = [
    { label: 'Total Distributed', value: totalDistributed, accent: 'dg-ink' as const },
    { label: 'Total Received', value: totalReceived, accent: 'dg-success' as const },
    {
      label: 'Total Outstanding',
      value: totalOutstanding,
      accent: totalOutstanding > 0 ? ('dg-error' as const) : ('dg-success' as const),
      credit: totalOutstanding < 0,
    },
  ];

  const detailPanel = detail ? (
    <aside className="dg-glass-card rounded-2xl flex flex-col min-h-[420px] max-h-[calc(100vh-12rem)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--dg-card-border)] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold dg-ink truncate flex items-center gap-2 flex-wrap">
            {isVendor ? 'My Finance' : detail.vendor.name}
            {isBillFullyPaid(detail.totalDistributedValue, detail.balance) && <PaidBadge size="sm" />}
          </h3>
          <p className="text-xs dg-muted mt-0.5 truncate">
            {detail.vendor.phone || detail.vendor.email || detail.vendor.contactPerson || '—'}
          </p>
        </div>
        {!isVendor && (
          <button
            type="button"
            onClick={onClearSelection}
            className="p-2 rounded-lg dg-muted hover:bg-[var(--dg-input)] shrink-0"
            aria-label="Close vendor detail"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-[var(--dg-card-border)]">
        <div>
          <p className="text-[9px] font-bold dg-faint uppercase tracking-wider">Distributed</p>
          <p className="text-sm font-bold dg-ink tabular-nums mt-0.5">{fmt(detail.totalDistributedValue)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold dg-faint uppercase tracking-wider">Paid</p>
          <p className="text-sm font-bold dg-success tabular-nums mt-0.5">{fmt(detail.totalPaid)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold dg-faint uppercase tracking-wider">Balance</p>
          <p className={cn('text-sm font-bold tabular-nums mt-0.5', detail.balance > 0 ? 'dg-error' : 'dg-success')}>
            {detail.balance < 0
              ? `${fmt(detail.balance)} credit`
              : isBillFullyPaid(detail.totalDistributedValue, detail.balance)
                ? 'Paid'
                : fmt(detail.balance)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-[var(--dg-card-border)]">
        <button
          type="button"
          onClick={onPrintStatement}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)]"
        >
          <Printer size={14} /> Statement
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={onOpenPayment}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold dg-bg-primary hover:opacity-90"
          >
            <Plus size={14} /> Record Payment
          </button>
        )}
        {reminderSettings.enabled &&
          detail.balance > 0 &&
          detail.vendor.phone &&
          (() => {
            const gate = canSendPaymentReminder({
              settings: reminderSettings,
              balance: detail.balance,
              phone: detail.vendor.phone,
              lastSent: detail.reminder?.lastSent,
            });
            return (
              <button
                type="button"
                disabled={!gate.ok}
                title={!gate.ok ? gate.reason || 'Cannot send reminder' : 'Send WhatsApp payment reminder'}
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
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
                  gate.ok
                    ? 'border border-[color-mix(in_srgb,var(--dg-success)_40%,transparent)] dg-success hover:bg-[color-mix(in_srgb,var(--dg-success)_8%,transparent)]'
                    : 'bg-[var(--dg-input)] dg-faint cursor-not-allowed',
                )}
              >
                <MessageCircle size={14} /> Remind
              </button>
            );
          })()}
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[var(--dg-card-border)]">
        <section className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold dg-ink uppercase tracking-wider">Payment History</h4>
            <span className="text-[10px] dg-faint font-bold">
              {detail.payments.length} payment{detail.payments.length !== 1 ? 's' : ''}
            </span>
          </div>
          {detail.payments.length === 0 ? (
            <p className="text-sm dg-muted py-4 text-center">No payments recorded yet</p>
          ) : (
            <div className="space-y-2">
              {detail.payments.map(p => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-2 py-2 border-b border-[var(--dg-card-border)] last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold dg-success tabular-nums">+{fmt(p.amount)}</p>
                    <p className="text-[11px] dg-muted">
                      {formatDate(p.paymentDate)} ·{' '}
                      {p.paymentMethod === 'Bank Statement' ? 'Bank Statement' : p.paymentMethod}
                      {p.referenceNumber ? ` · ${p.referenceNumber}` : ''}
                    </p>
                    {p.notes ? <p className="text-[11px] dg-faint mt-0.5 truncate">{p.notes}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="p-4">
          <h4 className="text-xs font-bold dg-ink uppercase tracking-wider mb-3">Distributions</h4>
          {detail.distributions.length === 0 ? (
            <p className="text-sm dg-muted py-4 text-center">No distributions</p>
          ) : (
            <div className="space-y-2">
              {detail.distributions.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium dg-ink truncate">{d.productName}</p>
                    <p className="text-[11px] dg-muted">
                      {formatDate(d.date)} · {d.quantity} × {fmt(d.unitPrice)}
                    </p>
                  </div>
                  <p className="text-sm font-bold dg-ink tabular-nums shrink-0">{fmt(d.total)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  ) : (
    <aside className="dg-glass-card rounded-2xl flex flex-col items-center justify-center min-h-[420px] p-8 text-center">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)]">
        <IndianRupee size={22} />
      </div>
      <p className="text-sm font-bold dg-ink">Select a vendor</p>
      <p className="text-xs dg-muted mt-1.5 max-w-[220px] leading-relaxed">
        Payment history, distributions, and statement actions appear here.
      </p>
    </aside>
  );

  if (isVendor) {
    return (
      <div className="space-y-6 w-full max-w-none">
        <div>
          <h2 className="text-3xl font-bold dg-ink tracking-tight">My Finance</h2>
          <p className="text-sm dg-muted mt-1.5">Your distributions, payments, and balance</p>
        </div>
        {loading && !detail ? (
          <div className="dg-glass-card rounded-2xl p-12 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          detailPanel
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full max-w-none">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold dg-ink tracking-tight">Vendor Finance</h2>
          <p className="text-sm dg-muted mt-1.5 max-w-xl leading-relaxed">
            Track vendor payments, balances, and send reminders
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer border border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)] transition-colors">
            <FileSpreadsheet size={16} /> Import Bank Statement
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = '';
                onBankFile(file);
              }}
            />
          </label>
          {onRemindAll && (
            <button
              type="button"
              onClick={onRemindAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold dg-bg-primary hover:opacity-90"
            >
              <MessageCircle size={16} /> Remind all ({remindAllCount})
            </button>
          )}
          {isAdmin && selectedVendorId && detail && (
            <button
              type="button"
              onClick={onOpenPayment}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-[color-mix(in_srgb,var(--dg-success)_40%,transparent)] dg-success hover:bg-[color-mix(in_srgb,var(--dg-success)_8%,transparent)]"
            >
              <Plus size={16} /> Record Payment
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="dg-glass-card p-5 rounded-2xl">
            <p className="text-[10px] font-bold dg-faint uppercase tracking-widest">{k.label}</p>
            <p className={cn('text-2xl font-bold tabular-nums mt-2', k.accent)}>
              {fmt(k.value)}
              {k.credit ? ' credit' : ''}
            </p>
          </div>
        ))}
      </div>

      {remindersDue.length > 0 && (
        <div className="dg-glass-card rounded-2xl p-4 border-l-4 border-l-[var(--dg-primary-bright)]">
          <h3 className="font-bold dg-ink flex items-center gap-2 mb-3 text-sm">
            <Clock size={16} className="dg-primary" /> Payment Reminders Due
          </h3>
          <div className="space-y-2">
            {remindersDue.map(r => (
              <div
                key={r.vendorId}
                className="flex items-center justify-between gap-3 rounded-xl p-3 bg-[var(--dg-input)]"
              >
                <div className="min-w-0">
                  <p className="font-medium dg-ink text-sm truncate">{r.vendorName}</p>
                  <p className="text-xs dg-error font-bold tabular-nums">Balance: {fmt(r.balance)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSendReminder(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold dg-bg-primary shrink-0"
                >
                  <Send size={14} /> Send
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex p-1 rounded-xl border border-[var(--dg-card-border)] dg-glass-card gap-0.5">
              {(['unpaid', 'paid'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onPaymentFilter(tab)}
                  className={cn(
                    'px-4 py-1.5 text-xs font-bold rounded-lg transition-all capitalize',
                    paymentFilter === tab ? 'dg-bg-primary shadow-sm' : 'dg-muted hover:opacity-80',
                  )}
                >
                  {tab === 'unpaid' ? 'Unpaid' : 'Paid'}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 dg-faint" size={16} />
              <input
                type="text"
                placeholder="Search vendor..."
                value={finSearch}
                onChange={e => onFinSearch(e.target.value)}
                className={fieldInput}
              />
            </div>
          </div>

          <div className="dg-glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold dg-faint uppercase tracking-wider border-b border-[var(--dg-card-border)]">
                    <th className="px-4 py-3">Vendor Details</th>
                    <th className="px-4 py-3">Distributed</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Reminder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dg-card-border)]">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <LoadingSpinner />
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center dg-muted text-sm">
                        {finSearch
                          ? 'No matching vendors'
                          : paymentFilter === 'paid'
                            ? 'No fully paid vendors'
                            : 'No outstanding balances'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map(v => {
                      const selected = selectedVendorId === v.vendorId;
                      return (
                        <tr
                          key={v.vendorId}
                          onClick={() => onSelectVendor(v.vendorId)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            selected
                              ? 'bg-[color-mix(in_srgb,var(--dg-primary)_8%,transparent)]'
                              : 'hover:bg-[var(--dg-input)]',
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium dg-ink text-sm">{v.vendorName}</p>
                              {isBillFullyPaid(v.totalDistributedValue, v.balance) && <PaidBadge size="sm" />}
                            </div>
                            <p className="text-[11px] dg-muted">{v.unitsDistributed} units</p>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium dg-ink tabular-nums">
                            {fmt(v.totalDistributedValue)}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold dg-success tabular-nums">{fmt(v.totalPaid)}</td>
                          <td className="px-4 py-3 text-sm">
                            {v.balance < 0 ? (
                              <span className="font-bold dg-primary tabular-nums">{fmt(v.balance)} credit</span>
                            ) : isBillFullyPaid(v.totalDistributedValue, v.balance) ? (
                              <PaidBadge size="sm" />
                            ) : (
                              <span className="font-bold dg-error tabular-nums">{fmt(v.balance)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onOpenReminderModal(v)}
                                className={cn(
                                  'text-[10px] font-bold px-2 py-1 rounded-md',
                                  v.reminder.enabled
                                    ? 'bg-[color-mix(in_srgb,var(--dg-success)_15%,transparent)] dg-success'
                                    : 'bg-[var(--dg-input)] dg-muted',
                                )}
                              >
                                {v.reminder.enabled ? `Every ${v.reminder.days}d` : 'Off'}
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectVendor(v.vendorId);
                                    setTimeout(onOpenPayment, 200);
                                  }}
                                  className="text-[10px] font-bold px-2 py-1 rounded-md dg-bg-primary"
                                >
                                  + Pay
                                </button>
                              )}
                              {reminderSettings.enabled &&
                                v.balance > 0 &&
                                v.vendorPhone &&
                                (() => {
                                  const gate = canSendPaymentReminder({
                                    settings: reminderSettings,
                                    balance: v.balance,
                                    phone: v.vendorPhone,
                                    lastSent: v.reminder?.lastSent,
                                  });
                                  return (
                                    <button
                                      type="button"
                                      disabled={!gate.ok}
                                      title={
                                        !gate.ok
                                          ? gate.reason || 'Cannot send reminder'
                                          : 'Send WhatsApp payment reminder'
                                      }
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
                                        'text-[10px] font-bold flex items-center gap-0.5',
                                        gate.ok ? 'dg-success hover:underline' : 'dg-faint cursor-not-allowed',
                                      )}
                                    >
                                      <MessageCircle size={12} />
                                    </button>
                                  );
                                })()}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 xl:sticky xl:top-4">{detailPanel}</div>
      </div>
    </div>
  );
}
