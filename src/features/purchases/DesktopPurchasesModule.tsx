/**
 * Desktop-only glass Purchases module (Purchases + Expenses tabs).
 * Cap / service-phone UX stays in PurchasesView.
 */
import React from 'react';
import {
  Banknote,
  Building2,
  CreditCard,
  FileText,
  MapPin,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { PaidBadge, isBillFullyPaid } from '../../components/ui';

export type DesktopExpenseRow = {
  id: string;
  category: string;
  description?: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  notes?: string;
};

export type DesktopSupplierCard = {
  id: string;
  name: string;
  address?: string;
  totalPurchased: number;
  totalPaid: number;
  balance: number;
  batchCount: number;
  lastOrderDate?: string | null;
};

type PaymentFilter = 'all' | 'unpaid' | 'paid';

type Props = {
  section: 'purchases' | 'expenses';
  onSectionChange: (s: 'purchases' | 'expenses') => void;
  expenseCount: number;
  expenses: DesktopExpenseRow[];
  canEdit: boolean;
  onAddExpense: () => void;
  onDeleteExpense: (id: string) => void;
  paymentFilter: PaymentFilter;
  onPaymentFilter: (f: PaymentFilter) => void;
  searchText: string;
  onSearchText: (v: string) => void;
  suppliers: DesktopSupplierCard[];
  onSelectSupplier: (id: string) => void;
  onAddSupplier: () => void;
  onNewPurchase: () => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function MethodIcon({ method }: { method: string }) {
  const m = method.toLowerCase();
  if (m.includes('upi')) return <Smartphone size={14} className="dg-muted shrink-0" />;
  if (m.includes('bank') || m.includes('transfer')) return <Building2 size={14} className="dg-muted shrink-0" />;
  if (m.includes('cheque') || m.includes('check')) return <FileText size={14} className="dg-muted shrink-0" />;
  if (m.includes('card')) return <CreditCard size={14} className="dg-muted shrink-0" />;
  return <Banknote size={14} className="dg-muted shrink-0" />;
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function DesktopPurchasesModule({
  section,
  onSectionChange,
  expenseCount,
  expenses,
  canEdit,
  onAddExpense,
  onDeleteExpense,
  paymentFilter,
  onPaymentFilter,
  searchText,
  onSearchText,
  suppliers,
  onSelectSupplier,
  onAddSupplier,
  onNewPurchase,
}: Props) {
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const fieldInput =
    'w-full pl-10 pr-4 py-2.5 bg-[var(--dg-bg)] border border-[var(--dg-card-border)] rounded-lg text-sm dg-ink focus:ring-2 focus:ring-[var(--dg-primary)] focus:border-transparent';

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 dg-muted mb-1">
            <ShoppingBag size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Purchases Module</span>
          </div>
          <h2 className="text-3xl font-bold dg-primary tracking-tight mb-5">Purchases</h2>
          <div className="flex gap-1 p-1 rounded-xl border border-[var(--dg-card-border)] dg-glass-card w-fit">
            {(
              [
                { id: 'purchases' as const, label: 'Purchases' },
                { id: 'expenses' as const, label: 'Expenses', badge: expenseCount },
              ] as const
            ).map(tab => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSectionChange(tab.id)}
                  className={cn(
                    'relative px-5 py-2 rounded-lg text-sm font-bold transition-all',
                    active ? 'dg-bg-primary shadow-sm' : 'dg-muted hover:opacity-80',
                  )}
                >
                  {tab.label}
                  {'badge' in tab && tab.badge > 0 && (
                    <span
                      className={cn(
                        'absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
                        active ? 'bg-[var(--dg-primary-bright)] text-white' : 'bg-[var(--dg-primary)] text-white',
                      )}
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {section === 'purchases' && (
            <>
              <div className="relative min-w-[200px] flex-1 sm:flex-none sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 dg-faint" size={16} />
                <input
                  type="text"
                  placeholder="Search suppliers..."
                  value={searchText}
                  onChange={e => onSearchText(e.target.value)}
                  className={fieldInput}
                />
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={onNewPurchase}
                  className="flex items-center gap-2 px-5 py-2.5 dg-bg-primary rounded-lg text-sm font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all"
                >
                  <Plus size={16} /> New Purchase
                </button>
              )}
            </>
          )}
          {section === 'expenses' && canEdit && (
            <button
              type="button"
              onClick={onAddExpense}
              className="flex items-center gap-2 px-5 py-2.5 dg-bg-primary rounded-lg text-sm font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus size={16} /> Add Expense
            </button>
          )}
        </div>
      </div>

      {section === 'purchases' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { id: 'all' as const, label: 'All Purchases' },
                { id: 'unpaid' as const, label: 'Unpaid' },
                { id: 'paid' as const, label: 'Paid' },
              ] as const
            ).map(chip => {
              const active = paymentFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onPaymentFilter(chip.id)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-bold border transition-all',
                    active &&
                      chip.id === 'all' &&
                      'bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] border-[color-mix(in_srgb,var(--dg-primary)_35%,transparent)] dg-primary',
                    active &&
                      chip.id === 'unpaid' &&
                      'bg-[color-mix(in_srgb,var(--dg-error)_12%,transparent)] border-[color-mix(in_srgb,var(--dg-error)_35%,transparent)] dg-error',
                    active &&
                      chip.id === 'paid' &&
                      'bg-[color-mix(in_srgb,var(--dg-success)_12%,transparent)] border-[color-mix(in_srgb,var(--dg-success)_35%,transparent)] dg-success',
                    !active && 'border-[var(--dg-card-border)] dg-muted hover:bg-[var(--dg-input)]',
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {suppliers.length === 0 && !canEdit ? (
            <div className="dg-glass-card rounded-2xl p-12 text-center">
              <ShoppingBag size={40} className="mx-auto mb-3 dg-faint" />
              <p className="font-medium dg-muted">No suppliers match this filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {suppliers.map(s => {
                const paidOff = isBillFullyPaid(s.totalPurchased, s.balance) && s.totalPurchased > 0;
                return (
                  <div key={s.id} className="dg-glass-card p-6 rounded-2xl flex flex-col gap-4 transition-all">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] text-[var(--dg-primary)]">
                        {initials(s.name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold dg-ink text-[15px] truncate">{s.name}</h3>
                        {s.address ? (
                          <p className="text-xs dg-muted mt-0.5 flex items-center gap-1 truncate">
                            <MapPin size={12} className="shrink-0 opacity-70" />
                            <span className="truncate">{s.address}</span>
                          </p>
                        ) : (
                          <p className="text-xs dg-faint mt-0.5">
                            {s.batchCount === 0 ? 'No purchases yet' : `${s.batchCount} purchase(s)`}
                          </p>
                        )}
                      </div>
                      {paidOff && (
                        <div className="ml-auto shrink-0">
                          <PaidBadge size="sm" />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Total Purchased</p>
                        <p className="text-sm font-bold dg-ink tabular-nums">{fmt(s.totalPurchased)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Amount Paid</p>
                        <p className="text-sm font-bold dg-success tabular-nums">{fmt(s.totalPaid)}</p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'p-4 rounded-xl flex justify-between items-center gap-3',
                        paidOff ? 'bg-[color-mix(in_srgb,var(--dg-success)_8%,transparent)]' : 'bg-[var(--dg-input)]',
                      )}
                    >
                      <div>
                        <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Remaining Balance</p>
                        <p
                          className={cn(
                            'text-2xl font-bold tabular-nums mt-0.5',
                            s.balance > 0 ? 'dg-error' : 'dg-success',
                          )}
                        >
                          {fmt(Math.max(0, s.balance))}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Last Order</p>
                        <p className="text-sm dg-ink mt-0.5">{s.lastOrderDate ? formatDate(s.lastOrderDate) : '—'}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectSupplier(s.id)}
                      className="w-full py-2.5 rounded-lg text-sm font-bold border border-[var(--dg-primary)] text-[var(--dg-primary)] hover:bg-[color-mix(in_srgb,var(--dg-primary)_10%,transparent)] transition-all"
                    >
                      View Ledger
                    </button>
                  </div>
                );
              })}

              {canEdit && (
                <button
                  type="button"
                  onClick={onAddSupplier}
                  className="rounded-2xl border-2 border-dashed border-[var(--dg-card-border)] flex flex-col items-center justify-center p-6 min-h-[300px] hover:border-[var(--dg-primary)] hover:bg-[var(--dg-input)] transition-all group"
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)] group-hover:scale-110 transition-transform">
                    <UserPlus size={28} />
                  </div>
                  <h3 className="font-bold dg-ink">Add Supplier</h3>
                  <p className="text-sm dg-muted text-center mt-2 max-w-[200px] leading-relaxed">
                    Register a new vendor and manage procurement
                  </p>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {section === 'expenses' && (
        <div className="dg-glass-card rounded-2xl overflow-hidden">
          {expenses.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt size={40} className="mx-auto mb-3 dg-faint" />
              <p className="font-medium dg-muted">No expenses recorded</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={onAddExpense}
                  className="mt-4 px-4 py-2 dg-bg-primary rounded-lg text-sm font-bold"
                >
                  + Add Expense
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold dg-faint uppercase tracking-wider border-b border-[var(--dg-card-border)] bg-[var(--dg-input)]">
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                      {canEdit && <th className="px-6 py-4 text-center">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--dg-card-border)]">
                    {expenses.map(e => (
                      <tr key={e.id} className="group hover:bg-[var(--dg-input)] transition-colors">
                        <td className="px-6 py-5 text-sm dg-ink tabular-nums whitespace-nowrap">
                          {formatDate(e.expenseDate)}
                        </td>
                        <td className="px-6 py-5">
                          <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)]">
                            {e.category}
                          </span>
                        </td>
                        <td className="px-6 py-5 min-w-[160px]">
                          <p className="text-sm font-medium dg-ink">{e.description || '—'}</p>
                          {e.notes ? <p className="text-xs dg-muted mt-1">Note: {e.notes}</p> : null}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <MethodIcon method={e.paymentMethod} />
                            <span className="text-sm dg-muted">{e.paymentMethod}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <p className="text-lg font-bold dg-primary tabular-nums">{fmt(e.amount)}</p>
                        </td>
                        {canEdit && (
                          <td className="px-6 py-5">
                            <div className="flex justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => onDeleteExpense(e.id)}
                                className="p-2 rounded-lg dg-error hover:bg-[color-mix(in_srgb,var(--dg-error)_10%,transparent)]"
                                aria-label="Delete expense"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-5 border-t border-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] bg-[color-mix(in_srgb,var(--dg-primary)_5%,transparent)] flex items-center gap-4">
                <div className="p-3 rounded-xl bg-[var(--dg-card)] border border-[var(--dg-card-border)] shadow-sm">
                  <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold dg-ink tabular-nums">{fmt(expenseTotal)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
