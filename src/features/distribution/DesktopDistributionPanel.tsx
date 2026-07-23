/**
 * Desktop-only glass Distribution / Sales list. Cap / phone UX untouched.
 * CRUD + detail navigation stay in DistributionView.
 */
import React from 'react';
import { Download, MessageCircle, Package, Plus, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LoadingSpinner, PaidBadge, isBillFullyPaid } from '../../components/ui';

export type DesktopVendorCard = {
  vendorId: string;
  vendorName: string;
  distributed: number;
  sold: number;
  replaced: number;
  damaged: number;
  availableWithVendor: number;
  billAmount: number;
  paidAmount: number;
  balance: number;
};

type Props = {
  title: string;
  subtitle: string;
  isDirectSell: boolean;
  paymentFilter: 'unpaid' | 'paid';
  onPaymentFilter: (tab: 'unpaid' | 'paid') => void;
  search: string;
  onSearch: (v: string) => void;
  canExport: boolean;
  onExportCsv: () => void;
  canCreate: boolean;
  onCreate: () => void;
  createLabel: string;
  remindAllCount: number;
  onRemindAll: (() => void) | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  vendors: DesktopVendorCard[];
  onSelectVendor: (vendorId: string) => void;
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function DesktopDistributionPanel({
  title,
  subtitle,
  isDirectSell,
  paymentFilter,
  onPaymentFilter,
  search,
  onSearch,
  canExport,
  onExportCsv,
  canCreate,
  onCreate,
  createLabel,
  remindAllCount,
  onRemindAll,
  loading,
  loadError,
  onRetry,
  vendors,
  onSelectVendor,
}: Props) {
  const fieldInput =
    'w-full pl-10 pr-4 py-2.5 bg-[var(--dg-bg)] border border-[var(--dg-card-border)] rounded-lg text-sm dg-ink focus:ring-2 focus:ring-[var(--dg-primary)] focus:border-transparent';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 dg-muted mb-1">
            <Package size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{title}</span>
          </div>
          <h2 className="text-3xl font-bold dg-ink tracking-tight mb-1">{title}</h2>
          <p className="text-sm dg-muted">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={!canExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} /> Export CSV
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="flex items-center gap-2 px-5 py-2.5 dg-bg-primary rounded-lg text-sm font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus size={16} /> {createLabel}
            </button>
          )}
        </div>
      </div>

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
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 dg-faint" size={16} />
          <input
            type="text"
            placeholder="Search vendor or product..."
            value={search}
            onChange={e => onSearch(e.target.value)}
            className={fieldInput}
          />
        </div>
        {onRemindAll && remindAllCount > 0 && (
          <button
            type="button"
            onClick={onRemindAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold dg-bg-primary hover:opacity-90"
          >
            <MessageCircle size={16} /> Remind all ({remindAllCount})
          </button>
        )}
      </div>

      {loading && (
        <div className="dg-glass-card rounded-2xl p-12 flex justify-center">
          <LoadingSpinner />
        </div>
      )}

      {!loading && loadError && (
        <div className="dg-glass-card rounded-2xl p-12 text-center">
          <p className="dg-error font-medium mb-2">Failed to load distribution data</p>
          <p className="text-sm dg-muted mb-4">{loadError}</p>
          <button type="button" onClick={onRetry} className="px-4 py-2 dg-bg-primary rounded-lg text-sm font-bold">
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && vendors.length === 0 && (
        <div className="dg-glass-card rounded-2xl p-12 text-center">
          <Package size={40} className="mx-auto mb-3 dg-faint" />
          <p className="font-medium dg-muted">
            {search
              ? 'No vendors match this search'
              : paymentFilter === 'paid'
                ? 'No fully paid vendors'
                : 'No outstanding vendors'}
          </p>
        </div>
      )}

      {!loading && !loadError && vendors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map(v => {
            const paidOff = isBillFullyPaid(v.billAmount, v.balance) && v.billAmount > 0;
            const qtyValue = isDirectSell ? v.distributed : v.sold;
            return (
              <button
                key={v.vendorId}
                type="button"
                onClick={() => onSelectVendor(v.vendorId)}
                className="dg-glass-card p-6 rounded-2xl flex flex-col gap-4 text-left transition-all hover:scale-[1.01]"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] text-[var(--dg-primary)]">
                    {initials(v.vendorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold dg-ink text-[15px] truncate">{v.vendorName}</h3>
                    <p className="text-xs dg-faint mt-0.5">
                      {isDirectSell
                        ? `${v.distributed} sold`
                        : `${v.distributed} distributed · ${v.availableWithVendor} with vendor`}
                    </p>
                  </div>
                  {paidOff ? (
                    <PaidBadge size="sm" />
                  ) : (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-[color-mix(in_srgb,var(--dg-error)_12%,transparent)] dg-error">
                      Pending
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Quantity sold</p>
                    <p className="text-sm font-bold dg-ink tabular-nums">{qtyValue}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Bill Amount</p>
                    <p className="text-sm font-bold dg-ink tabular-nums">{fmt(v.billAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Paid Amount</p>
                    <p className="text-sm font-bold dg-success tabular-nums">{fmt(v.paidAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">
                      {paidOff ? 'Status' : 'Remaining'}
                    </p>
                    {paidOff ? (
                      <p className="text-sm font-bold dg-success">Paid</p>
                    ) : (
                      <p className="text-sm font-bold dg-error tabular-nums">{fmt(Math.max(0, v.balance))}</p>
                    )}
                  </div>
                </div>

                {(v.replaced > 0 || v.damaged > 0) && (
                  <p className="text-[11px] dg-muted">
                    {v.replaced > 0 && <span className="dg-primary">{v.replaced} replaced</span>}
                    {v.replaced > 0 && v.damaged > 0 && ' · '}
                    {v.damaged > 0 && <span className="dg-error">{v.damaged} damaged</span>}
                  </p>
                )}

                <p className="text-xs dg-muted pt-1 border-t border-[var(--dg-card-border)]">
                  Click to view distributions
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
