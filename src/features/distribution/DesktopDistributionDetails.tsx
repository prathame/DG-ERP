/**
 * Desktop-only glass shells for Distribution drill-downs (vendor → batch → barcodes).
 * Cap / phone keep DistributionView layouts. No fake warehouse / ZPL / insight fluff.
 */
import React from 'react';
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Plus,
  Truck,
} from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { PaidBadge, isBillFullyPaid } from '../../components/ui';
import type { DistributionBatch } from '../../api';
import { deliveryDocKind, deliveryDocLabel, deliveryDocNos } from '../../lib/deliveryDocKind';

const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function batchDocMeta(batch: DistributionBatch): { docNo: string | null; label: string } {
  const gstUnits = typeof batch.gstUnits === 'number' ? batch.gstUnits : batch.gstApplied ? batch.total : 0;
  const nonGstUnits = typeof batch.nonGstUnits === 'number' ? batch.nonGstUnits : batch.gstApplied ? 0 : batch.total;
  const nos =
    batch.deliverySet?.gstDocNo || batch.deliverySet?.nonGstDocNo
      ? { gstDocNo: batch.deliverySet.gstDocNo, nonGstDocNo: batch.deliverySet.nonGstDocNo }
      : deliveryDocNos(batch.batchId, gstUnits, nonGstUnits);
  const kind = deliveryDocKind(gstUnits, nonGstUnits);
  const label = deliveryDocLabel(kind) || 'Distribution';
  const docNo = nos.gstDocNo || nos.nonGstDocNo;
  return { docNo, label };
}

function dispatchLabel(status: string): string {
  if (status === 'dispatched') return 'Dispatched';
  if (status === 'delivered') return 'Delivered';
  return 'Pending Dispatch';
}

function dispatchBadgeClass(status: string): string {
  if (status === 'dispatched') {
    return 'bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] text-[var(--dg-primary)]';
  }
  if (status === 'delivered') {
    return 'bg-[color-mix(in_srgb,var(--dg-success)_14%,transparent)] text-[var(--dg-success)]';
  }
  return 'bg-[color-mix(in_srgb,var(--dg-warning)_22%,transparent)] text-[var(--dg-ink)]';
}

/* ─── A) Vendor Distribution Summary ─── */

export type DesktopVendorBatchCard = DistributionBatch;

type VendorSummaryProps = {
  vendorName: string;
  vendorPhone?: string | null;
  vendorAddress?: string | null;
  stats: {
    distributed: number;
    sold: number;
    replaced?: number;
    damaged?: number;
    availableWithVendor: number;
  } | null;
  outstanding: number;
  batches: DesktopVendorBatchCard[];
  canCreate: boolean;
  onBack: () => void;
  onSelectBatch: (batchId: string) => void;
  onCreate: (() => void) | null;
  remind: {
    show: boolean;
    disabled: boolean;
    title?: string;
    balance: number;
    onClick: () => void;
  } | null;
};

export function DesktopVendorSummaryGlass({
  vendorName,
  vendorPhone,
  vendorAddress,
  stats,
  outstanding,
  batches,
  canCreate,
  onBack,
  onSelectBatch,
  onCreate,
  remind,
}: VendorSummaryProps) {
  return (
    <div className="space-y-8 max-w-[1200px]">
      <nav className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] dg-faint">
        <button type="button" onClick={onBack} className="hover:opacity-80 dg-muted transition-opacity">
          Distribution
        </button>
        <ChevronRight size={14} className="dg-faint" />
        <span className="dg-ink normal-case tracking-normal text-sm font-semibold">{vendorName}</span>
      </nav>

      <div className="dg-glass-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(var(--dg-primary) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="relative z-[1] flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex gap-4 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full border border-[var(--dg-card-border)] hover:bg-[var(--dg-card-hover)] transition-colors"
              title="Back to vendors"
            >
              <ArrowLeft size={18} className="dg-muted" />
            </button>
            <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-lg font-bold bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] text-[var(--dg-primary)]">
              {initials(vendorName)}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl md:text-3xl font-bold dg-ink tracking-tight mb-1">{vendorName}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm dg-muted">
                {vendorAddress ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={15} className="dg-faint shrink-0" />
                    <span className="truncate max-w-[280px]">{vendorAddress}</span>
                  </span>
                ) : null}
                {vendorAddress && vendorPhone ? <span className="w-1 h-1 rounded-full bg-[var(--dg-faint)]" /> : null}
                {vendorPhone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={15} className="dg-faint shrink-0" />
                    {vendorPhone}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {remind?.show && (
            <button
              type="button"
              disabled={remind.disabled}
              title={remind.title}
              onClick={remind.onClick}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold shrink-0',
                remind.disabled
                  ? 'bg-[var(--dg-input)] dg-faint cursor-not-allowed'
                  : 'dg-bg-primary hover:opacity-90 shadow-sm',
              )}
            >
              <MessageCircle size={16} />
              Remind payment
              {remind.balance > 0 && <span className="opacity-90">· {fmt(remind.balance)}</span>}
            </button>
          )}
        </div>

        <div className="relative z-[1] grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 pt-6 border-t border-[var(--dg-card-border)]">
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Total Distributed</p>
            <p className="text-xl font-bold dg-ink tabular-nums">
              {stats?.distributed ?? 0} <span className="text-sm font-medium dg-muted">items</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Sold</p>
            <p className="text-xl font-bold text-[var(--dg-primary)] tabular-nums">
              {stats?.sold ?? 0} <span className="text-sm font-medium dg-muted">items</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">With Vendor</p>
            <p className="text-xl font-bold dg-ink tabular-nums">
              {stats?.availableWithVendor ?? 0} <span className="text-sm font-medium dg-muted">stock</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-wider mb-1">Outstanding</p>
            <p className={cn('text-xl font-bold tabular-nums', outstanding > 0 ? 'dg-error' : 'dg-success')}>
              {fmt(Math.max(0, outstanding))}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-lg font-bold dg-ink">Distribution History</h3>
          <span className="text-sm dg-muted">
            Showing {batches.length} Distribution{batches.length !== 1 ? 's' : ''}
          </span>
        </div>

        {batches.length === 0 ? (
          <div className="dg-glass-card rounded-2xl p-10 text-center dg-muted text-sm">
            No distributions for this vendor
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map(batch => {
              const { docNo, label } = batchDocMeta(batch);
              const ds = ((batch as Record<string, unknown>).dispatchStatus as string) || '';
              const paid = isBillFullyPaid(batch.billValue, batch.balanceRemaining);
              return (
                <button
                  key={batch.batchId}
                  type="button"
                  onClick={() => onSelectBatch(batch.batchId)}
                  className={cn(
                    'group w-full dg-glass-card rounded-2xl p-5 text-left transition-all hover:scale-[1.005]',
                    paid && 'opacity-80',
                  )}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="flex gap-4 min-w-0">
                      <div className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center bg-[var(--dg-input)] dg-muted group-hover:bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] group-hover:text-[var(--dg-primary)] transition-colors">
                        <Truck size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-bold dg-ink text-[15px]">Batch — {formatDate(batch.distributionDate)}</h4>
                          {paid && <PaidBadge size="sm" />}
                          {ds ? (
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                                dispatchBadgeClass(ds),
                              )}
                            >
                              {dispatchLabel(ds)}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 text-sm dg-muted flex-wrap">
                          {docNo && <span className="font-mono text-[13px] dg-ink">{docNo}</span>}
                          {docNo && <span className="w-1 h-1 rounded-full bg-[var(--dg-faint)]" />}
                          <span>{label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 md:gap-8 md:text-right">
                      <div className="md:min-w-[100px]">
                        <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Quantity</p>
                        <p className="text-sm font-bold dg-ink tabular-nums">
                          {batch.total} item{batch.total !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="md:min-w-[100px]">
                        <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Value</p>
                        <p className="text-sm font-bold dg-ink tabular-nums">{fmt(batch.billValue)}</p>
                      </div>
                      <div className="md:min-w-[100px]">
                        <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Due</p>
                        <p
                          className={cn(
                            'text-sm font-bold tabular-nums',
                            batch.balanceRemaining > 0 ? 'dg-error' : 'dg-success',
                          )}
                        >
                          {batch.balanceRemaining > 0 ? `${fmt(batch.balanceRemaining)} due` : 'Paid'}
                        </p>
                      </div>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center dg-muted group-hover:bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] group-hover:text-[var(--dg-primary)] transition-colors">
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {canCreate && onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 w-full md:w-auto min-w-[280px] border-2 border-dashed border-[var(--dg-card-border)] rounded-2xl p-10 flex flex-col items-center justify-center text-center hover:border-[var(--dg-primary)] hover:bg-[var(--dg-card)] transition-all group"
          >
            <div className="w-14 h-14 rounded-full bg-[var(--dg-input)] flex items-center justify-center mb-3 group-hover:bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] transition-colors">
              <Plus size={28} className="dg-muted group-hover:text-[var(--dg-primary)]" />
            </div>
            <p className="font-bold dg-ink text-sm">Record New Distribution</p>
            <p className="text-sm dg-muted mt-1">Assign stock to this vendor</p>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── B) Distribution Batch Details ─── */

export type DesktopBatchProductRow = {
  productId: string;
  productName: string;
  total: number;
  sold: number;
  replaced: number;
  damaged: number;
  withVendor: number;
};

type BatchDetailProps = {
  vendorName: string;
  dateLabel: string;
  dispatchStatus: string;
  docNo: string | null;
  docLabel: string | null;
  totalAmount: number;
  balanceDue: number;
  amountPaid: number;
  fullyPaid: boolean;
  halfUnits: number;
  halfSold: number;
  halfBillValue: number;
  halfTotalLabel: string;
  deliveryTotal: number;
  useHalfTabs: boolean;
  deliveryHalf: 'gst' | 'bos';
  batchGstUnits: number;
  batchNonGstUnits: number;
  halfHasLines: boolean;
  products: DesktopBatchProductRow[];
  onBack: () => void;
  onHalfChange: (half: 'gst' | 'bos') => void;
  onSelectProduct: (productId: string) => void;
  /** Edit / Record Payment / ⋮ — preserve existing handlers from parent */
  headerActions: React.ReactNode;
  /** Mark Dispatched / EWB / E-Invoice toolbar */
  dispatchToolbar: React.ReactNode | null;
};

export function DesktopBatchDetailGlass({
  vendorName,
  dateLabel,
  dispatchStatus,
  docNo,
  docLabel,
  totalAmount,
  balanceDue,
  amountPaid,
  fullyPaid,
  halfUnits,
  halfSold,
  halfBillValue,
  halfTotalLabel,
  deliveryTotal,
  useHalfTabs,
  deliveryHalf,
  batchGstUnits,
  batchNonGstUnits,
  halfHasLines,
  products,
  onBack,
  onHalfChange,
  onSelectProduct,
  headerActions,
  dispatchToolbar,
}: BatchDetailProps) {
  const soldPct = halfUnits > 0 ? Math.round((halfSold / halfUnits) * 100) : 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full border border-[var(--dg-card-border)] hover:bg-[var(--dg-card-hover)] transition-colors"
            title="Back"
          >
            <ArrowLeft size={18} className="dg-muted" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-bold dg-ink tracking-tight">{vendorName}</h2>
              {fullyPaid && <PaidBadge />}
              <span
                className={cn(
                  'px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest',
                  dispatchBadgeClass(dispatchStatus),
                )}
              >
                {dispatchLabel(dispatchStatus)}
              </span>
            </div>
            <p className="text-sm dg-muted mt-0.5">Distribution — {dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">{headerActions}</div>
      </div>

      <section className="dg-glass-card rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex flex-col gap-2 min-w-0">
          <span className="text-[11px] uppercase tracking-widest text-[var(--dg-primary)] font-bold">
            Document Number
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            <FileText size={20} className="text-[var(--dg-primary)] shrink-0" />
            <span className="font-mono text-lg md:text-xl dg-ink">{docNo || '—'}</span>
          </div>
          {docLabel && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-[color-mix(in_srgb,var(--dg-success)_35%,transparent)] bg-[color-mix(in_srgb,var(--dg-success)_10%,transparent)] w-fit">
              <span className="text-[11px] font-bold dg-success">{docLabel}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest dg-faint font-bold">Total Amount</p>
            <p className="font-mono text-lg dg-ink tabular-nums">{fmt(totalAmount)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest dg-faint font-bold">Balance Due</p>
            <p
              className={cn(
                'font-mono text-lg tabular-nums',
                balanceDue > 0 ? 'text-[var(--dg-primary)]' : 'dg-success',
              )}
            >
              {fmt(Math.max(0, balanceDue))}
            </p>
          </div>
          {amountPaid > 0 && (
            <div className="col-span-2 pt-2 border-t border-[var(--dg-card-border)]">
              <p className="text-xs dg-muted">
                Paid: <span className="font-bold dg-success tabular-nums">{fmt(amountPaid)}</span>
              </p>
            </div>
          )}
        </div>
      </section>

      {useHalfTabs && (
        <div className="flex items-center gap-6 border-b border-[var(--dg-card-border)]">
          <button
            type="button"
            role="tab"
            aria-selected={deliveryHalf === 'gst'}
            onClick={() => onHalfChange('gst')}
            className={cn(
              'pb-3 px-1 border-b-2 text-sm font-bold flex items-center gap-2 transition-colors',
              deliveryHalf === 'gst'
                ? 'border-[var(--dg-primary)] text-[var(--dg-primary)]'
                : 'border-transparent dg-muted hover:opacity-80',
            )}
          >
            GST Tax Invoice
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px]',
                deliveryHalf === 'gst'
                  ? 'bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)]'
                  : 'bg-[var(--dg-input)]',
              )}
            >
              {batchGstUnits}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={deliveryHalf === 'bos'}
            onClick={() => onHalfChange('bos')}
            className={cn(
              'pb-3 px-1 border-b-2 text-sm font-bold flex items-center gap-2 transition-colors',
              deliveryHalf === 'bos'
                ? 'border-[var(--dg-primary)] text-[var(--dg-primary)]'
                : 'border-transparent dg-muted hover:opacity-80',
            )}
          >
            Non-GST (Bill of Supply)
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px]',
                deliveryHalf === 'bos'
                  ? 'bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)]'
                  : 'bg-[var(--dg-input)]',
              )}
            >
              {batchNonGstUnits}
            </span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="dg-glass-card rounded-2xl p-5">
            <p className="text-[11px] uppercase tracking-wider dg-faint font-bold">Stock Summary</p>
            <h3 className="font-mono text-2xl dg-ink mt-1 tabular-nums">{halfUnits}</h3>
            <p className="text-sm dg-muted">
              {useHalfTabs
                ? deliveryHalf === 'gst'
                  ? 'GST units in batch'
                  : 'Non-GST units in batch'
                : 'Total units in batch'}
            </p>
            <div className="w-full bg-[var(--dg-input)] h-1.5 rounded-full mt-4 overflow-hidden">
              <div
                className="bg-[var(--dg-primary)] h-full rounded-full transition-all"
                style={{ width: `${soldPct}%` }}
              />
            </div>
            <p className="text-[10px] text-[var(--dg-primary)] font-bold mt-1">{soldPct}% sold</p>
            {halfHasLines && (
              <p className="text-xs dg-muted mt-3">
                <span className="font-bold dg-ink">{halfTotalLabel}:</span> {fmt(halfBillValue)}
                <br />
                Delivery {fmt(deliveryTotal)}
                {balanceDue > 0 && <> · {fmt(balanceDue)} due</>}
              </p>
            )}
          </div>
          {dispatchToolbar && (
            <div className="dg-glass-card rounded-2xl p-5 flex flex-col gap-3">
              <p className="text-[11px] uppercase tracking-wider dg-faint font-bold">Batch Actions</p>
              <div className="flex flex-col gap-2">{dispatchToolbar}</div>
            </div>
          )}
        </div>

        <div className="lg:col-span-9 flex flex-col gap-3">
          <h4 className="text-[11px] uppercase tracking-widest dg-faint font-bold border-l-4 border-[var(--dg-primary)] pl-3">
            {useHalfTabs ? (deliveryHalf === 'gst' ? 'Tax Invoice products' : 'Bill of Supply products') : 'Products'}
          </h4>

          {!halfHasLines && useHalfTabs ? (
            <div className="dg-glass-card rounded-2xl p-12 text-center text-sm dg-muted">
              {deliveryHalf === 'gst'
                ? 'No Tax Invoice (GST) lines on this delivery'
                : 'No Bill of Supply (non-GST) lines on this delivery'}
            </div>
          ) : (
            products.map(p => (
              <button
                key={p.productId}
                type="button"
                onClick={() => onSelectProduct(p.productId)}
                className="dg-glass-card group rounded-2xl p-5 text-left transition-all hover:scale-[1.005] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center bg-[var(--dg-input)] dg-muted group-hover:bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] group-hover:text-[var(--dg-primary)] transition-colors">
                    <Package size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold dg-ink text-[15px] group-hover:text-[var(--dg-primary)] transition-colors truncate">
                      {p.productName}
                    </h3>
                    <p className="text-xs dg-muted mt-0.5 inline-flex items-center gap-1">
                      <Truck size={12} />
                      {p.withVendor > 0 ? `${p.withVendor} with vendor` : 'No units with vendor'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-5 sm:gap-6 flex-wrap">
                  <div>
                    <p className="text-[10px] uppercase font-bold dg-faint">Qty</p>
                    <p className="font-mono text-sm font-bold dg-ink tabular-nums">{p.total}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold dg-faint">With vendor</p>
                    <p className="font-mono text-sm font-bold text-[var(--dg-primary)] tabular-nums">{p.withVendor}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold dg-faint">Sold</p>
                    <p className="font-mono text-sm font-bold dg-success tabular-nums">{p.sold}</p>
                  </div>
                  {(p.replaced > 0 || p.damaged > 0) && (
                    <div>
                      <p className="text-[10px] uppercase font-bold dg-faint">Other</p>
                      <p className="text-xs dg-muted">
                        {p.replaced > 0 && <span className="dg-warning">{p.replaced} repl.</span>}
                        {p.replaced > 0 && p.damaged > 0 && ' · '}
                        {p.damaged > 0 && <span className="dg-error">{p.damaged} dmg</span>}
                      </p>
                    </div>
                  )}
                  <ChevronRight size={18} className="dg-faint group-hover:text-[var(--dg-primary)]" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── C) Product Batch Tracking (barcodes) ─── */

export type DesktopBarcodeUnit = {
  id: string;
  barcode: string;
  status: string;
};

type ProductBarcodeProps = {
  productName: string;
  units: DesktopBarcodeUnit[];
  sold: number;
  withVendor: number;
  replaced: number;
  damaged: number;
  canEdit: boolean;
  onBack: () => void;
  onEdit: (() => void) | null;
};

function statusPill(status: string): string {
  if (status === 'Sold') {
    return 'bg-[color-mix(in_srgb,var(--dg-success)_14%,transparent)] text-[var(--dg-success)] border-[color-mix(in_srgb,var(--dg-success)_30%,transparent)]';
  }
  if (status === 'Distributed') {
    return 'bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)] border-[color-mix(in_srgb,var(--dg-primary)_28%,transparent)]';
  }
  if (status === 'Replaced') {
    return 'bg-[color-mix(in_srgb,var(--dg-warning)_22%,transparent)] dg-ink border-[color-mix(in_srgb,var(--dg-warning)_40%,transparent)]';
  }
  if (status === 'Damaged') {
    return 'bg-[color-mix(in_srgb,var(--dg-error)_12%,transparent)] dg-error border-[color-mix(in_srgb,var(--dg-error)_30%,transparent)]';
  }
  return 'bg-[var(--dg-input)] dg-muted border-[var(--dg-card-border)]';
}

export function DesktopProductBarcodeGlass({
  productName,
  units,
  sold,
  withVendor,
  replaced,
  damaged,
  canEdit,
  onBack,
  onEdit,
}: ProductBarcodeProps) {
  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] dg-faint mb-2">
            <button type="button" onClick={onBack} className="hover:opacity-80 dg-muted">
              Batch
            </button>
            <ChevronRight size={14} />
            <span>Barcode tracking</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onBack}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--dg-card-border)] hover:bg-[var(--dg-card-hover)]"
              title="Back"
            >
              <ArrowLeft size={16} className="dg-muted" />
            </button>
            <h2 className="text-2xl md:text-3xl font-bold dg-ink tracking-tight">{productName}</h2>
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1 border border-[var(--dg-card-border)] rounded-full text-xs font-bold dg-ink hover:bg-[var(--dg-card-hover)]"
              >
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        </div>
        <div className="dg-glass-card rounded-xl px-5 py-3 flex items-center gap-6">
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Units</p>
            <p className="font-mono text-xl font-bold dg-ink tabular-nums">{units.length}</p>
          </div>
          <div className="h-8 w-px bg-[var(--dg-card-border)]" />
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Sold</p>
            <p className="font-mono text-xl font-bold dg-success tabular-nums">{sold}</p>
          </div>
          <div className="h-8 w-px bg-[var(--dg-card-border)]" />
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">With Vendor</p>
            <p className="font-mono text-xl font-bold text-[var(--dg-primary)] tabular-nums">{withVendor}</p>
          </div>
          {(replaced > 0 || damaged > 0) && (
            <>
              <div className="h-8 w-px bg-[var(--dg-card-border)]" />
              <div>
                <p className="text-[10px] font-bold dg-faint uppercase tracking-wider">Other</p>
                <p className="text-xs dg-muted">
                  {replaced > 0 && <span>{replaced} repl.</span>}
                  {replaced > 0 && damaged > 0 && ' · '}
                  {damaged > 0 && <span className="dg-error">{damaged} dmg</span>}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="dg-glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--dg-input)] border-b border-[var(--dg-card-border)]">
                <th className="py-3 px-6 text-[10px] font-bold dg-faint uppercase tracking-widest w-16">#</th>
                <th className="py-3 px-6 text-[10px] font-bold dg-faint uppercase tracking-widest">Barcode</th>
                <th className="py-3 px-6 text-[10px] font-bold dg-faint uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--dg-card-border)]">
              {units.map((d, idx) => (
                <tr key={d.id} className="hover:bg-[var(--dg-card-hover)] transition-colors">
                  <td className="py-3.5 px-6 font-mono text-sm dg-muted">{idx + 1}</td>
                  <td className="py-3.5 px-6 font-mono text-sm dg-ink">{d.barcode}</td>
                  <td className="py-3.5 px-6">
                    <span
                      className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border',
                        statusPill(d.status),
                      )}
                    >
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="py-3 px-6 bg-[color-mix(in_srgb,var(--dg-input)_50%,transparent)] border-t border-[var(--dg-card-border)]">
          <span className="text-[11px] dg-muted font-mono">
            Showing {units.length} of {units.length} entries
          </span>
        </div>
      </div>
    </div>
  );
}
