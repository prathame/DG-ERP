/**
 * Desktop-only glass Search & Verify (product barcode + party ledger).
 * Cap / service-phone UX stays in ProductVerificationView.
 */
import React from 'react';
import {
  Barcode,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  Gift,
  IndianRupee,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';

export type DesktopVerificationResult = {
  found: boolean;
  barcode: string;
  currentStatus: string;
  features: {
    warranty: boolean;
    replacement: boolean;
    rewards: boolean;
    vendorPortal: boolean;
    barcodeSystem: boolean;
  };
  product: {
    name: string;
    price: number;
    description?: string;
    hsnCode?: string;
    gstRate?: number;
    warrantyMonths?: number;
    warrantyApplicable?: boolean;
  };
  timeline: { addedToInventory?: string; distributed?: string; sold?: string };
  distribution?: {
    date: string;
    status: string;
    discountPercent?: number;
    netPrice?: number;
    gstApplied?: boolean;
    billedPrice?: number;
    vendorName?: string;
    vendorPhone?: string;
    contactPerson?: string;
  };
  sale?: {
    date: string;
    salePrice?: number;
    soldByVendor?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    rewardPointsEarned?: number;
  };
  warranty?: { status: string; activationDate: string; expiryDate: string };
  replacements?: { oldBarcode: string; newBarcode: string; reason?: string; status: string; date: string }[];
};

export type DesktopSearchResults = {
  products: { id: string; name: string; price: number; stock: number }[];
  customers: { id: string; name: string; phone: string; email: string }[];
  vendors: { id: string; name: string; contact: string; phone: string }[];
  barcodes: { barcode: string; productName: string; productId: string; status: string }[];
  challans?: { batchId: string; vendorName: string; date: string; units: number }[];
  staff?: { name: string; totalPaid: number; payments: number; lastPayment: string }[];
};

export type DesktopPartyDetail = {
  vendor?: { name: string; phone?: string; email?: string; address?: string };
  totalDistributedValue: number;
  totalPaid: number;
  balance: number;
  payments?: { id: string; amount: number; paymentDate: string; paymentMethod: string }[];
  distributions?: { date: string; productName: string; quantity: number; total: number }[];
};

export type DesktopStaffDetail = {
  name: string;
  payments: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentType: string;
    paymentMethod: string;
    notes?: string;
  }[];
};

type Props = {
  partyPlural: string;
  partySingular: string;
  distributionLabel: string;
  query: string;
  onQueryChange: (v: string) => void;
  loading: boolean;
  showScan: boolean;
  onScan: () => void;
  searchResults: DesktopSearchResults | null;
  result: DesktopVerificationResult | null;
  notFound: boolean;
  partyDetail: DesktopPartyDetail | null;
  staffDetail: DesktopStaffDetail | null;
  onVerifyBarcode: (code: string) => void;
  onSelectVendor: (id: string) => void;
  onSelectStaff: (name: string) => void;
  onClearParty: () => void;
  onClearStaff: () => void;
  onPrintParty: () => void;
};

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  InStock: { color: 'text-blue-600', bg: 'bg-blue-50', icon: Package },
  Distributed: {
    color: 'text-[var(--dg-primary)]',
    bg: 'bg-[color-mix(in_srgb,var(--dg-primary)_10%,transparent)]',
    icon: Truck,
  },
  Sold: { color: 'text-emerald-600', bg: 'bg-emerald-50', icon: ShoppingCart },
  Replaced: { color: 'text-purple-600', bg: 'bg-purple-50', icon: RefreshCw },
  Damaged: { color: 'text-rose-600', bg: 'bg-rose-50', icon: XCircle },
};

const fmt = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

const fieldInput =
  'w-full pl-12 pr-4 py-3 bg-[var(--dg-bg)] border border-[var(--dg-card-border)] rounded-xl text-sm font-mono dg-ink focus:ring-2 focus:ring-[var(--dg-primary)] focus:border-transparent outline-none transition-all';

function ResultSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Package;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="dg-glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--dg-card-border)] flex items-center gap-2">
        <Icon size={16} className="dg-muted" />
        <span className="text-[10px] font-bold dg-faint uppercase tracking-[0.14em]">
          {title} ({count})
        </span>
      </div>
      {children}
    </div>
  );
}

export function DesktopSearchVerifyPanel({
  partyPlural,
  partySingular,
  distributionLabel,
  query,
  onQueryChange,
  loading,
  showScan,
  onScan,
  searchResults,
  result,
  notFound,
  partyDetail,
  staffDetail,
  onVerifyBarcode,
  onSelectVendor,
  onSelectStaff,
  onClearParty,
  onClearStaff,
  onPrintParty,
}: Props) {
  const status = result ? statusConfig[result.currentStatus] || statusConfig.InStock : null;
  const StatusIcon = status?.icon || Package;
  const recentDistLabel =
    distributionLabel === 'Sales'
      ? 'Recent Sales'
      : distributionLabel === 'Dispatch'
        ? 'Recent Dispatches'
        : 'Recent Distributions';

  const showSearchHits = Boolean(searchResults && !result && !notFound && !partyDetail && !staffDetail);

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Search */}
      <section className="dg-glass-card rounded-2xl p-6">
        <h2 className="text-2xl font-bold dg-ink tracking-tight mb-1">Search</h2>
        <p className="text-sm dg-muted mb-4">
          Search {partyPlural.toLowerCase()}, products, barcodes, customers, or challans
        </p>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 group">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 dg-faint group-focus-within:text-[var(--dg-primary)] transition-colors"
              size={18}
            />
            <input
              type="text"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="Type to search..."
              className={fieldInput}
              autoComplete="off"
              autoFocus
              spellCheck={false}
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--dg-primary)] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          {showScan && (
            <button
              type="button"
              onClick={onScan}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold border border-[var(--dg-card-border)] dg-ink bg-[var(--dg-input)] hover:opacity-90 active:scale-95 transition-all"
            >
              <Camera size={18} /> Scan
            </button>
          )}
        </div>
      </section>

      {/* Search results */}
      {showSearchHits && searchResults && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {searchResults.barcodes.length > 0 && (
            <ResultSection icon={Barcode} title="Barcodes" count={searchResults.barcodes.length}>
              {searchResults.barcodes.map(b => (
                <button
                  key={b.barcode}
                  type="button"
                  onClick={() => onVerifyBarcode(b.barcode)}
                  className="w-full px-4 py-3 text-left hover:bg-[var(--dg-input)] border-b border-[var(--dg-card-border)] last:border-0 transition-colors"
                >
                  <p className="font-mono font-medium text-sm dg-ink">{b.barcode}</p>
                  <p className="text-xs dg-muted">
                    {b.productName}{' '}
                    <span
                      className={cn(
                        'ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold',
                        b.status === 'InStock'
                          ? 'bg-emerald-100 text-emerald-700'
                          : b.status === 'Sold'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] text-[var(--dg-primary)]',
                      )}
                    >
                      {b.status}
                    </span>
                  </p>
                </button>
              ))}
            </ResultSection>
          )}
          {searchResults.vendors.length > 0 && (
            <ResultSection icon={ShoppingCart} title={partyPlural} count={searchResults.vendors.length}>
              {searchResults.vendors.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVendor(v.id)}
                  className="w-full px-4 py-3 text-left hover:bg-[var(--dg-input)] border-b border-[var(--dg-card-border)] last:border-0 transition-colors"
                >
                  <p className="font-medium text-sm dg-ink">{v.name}</p>
                  <p className="text-xs dg-muted">{v.contact || v.phone || '-'}</p>
                </button>
              ))}
            </ResultSection>
          )}
          {searchResults.products.length > 0 && (
            <ResultSection icon={Package} title="Products" count={searchResults.products.length}>
              {searchResults.products.map(p => (
                <div key={p.id} className="px-4 py-3 border-b border-[var(--dg-card-border)] last:border-0">
                  <p className="font-medium text-sm dg-ink">{p.name}</p>
                  <p className="text-xs dg-muted">
                    {fmt(p.price)} · {p.stock} in stock
                  </p>
                </div>
              ))}
            </ResultSection>
          )}
          {searchResults.customers.length > 0 && (
            <ResultSection icon={Users} title="Customers" count={searchResults.customers.length}>
              {searchResults.customers.map(c => (
                <div key={c.id} className="px-4 py-3 border-b border-[var(--dg-card-border)] last:border-0">
                  <p className="font-medium text-sm dg-ink">{c.name}</p>
                  <p className="text-xs dg-muted">{c.phone || c.email || '-'}</p>
                </div>
              ))}
            </ResultSection>
          )}
          {(searchResults.challans?.length ?? 0) > 0 && (
            <ResultSection icon={FileText} title="Challans" count={searchResults.challans!.length}>
              {searchResults.challans!.map(c => (
                <div key={c.batchId} className="px-4 py-3 border-b border-[var(--dg-card-border)] last:border-0">
                  <p className="font-medium text-sm dg-ink">{c.batchId}</p>
                  <p className="text-xs dg-muted">
                    {c.vendorName} · {formatDate(c.date)} · {c.units} units
                  </p>
                </div>
              ))}
            </ResultSection>
          )}
          {(searchResults.staff?.length ?? 0) > 0 && (
            <ResultSection icon={IndianRupee} title="Staff" count={searchResults.staff!.length}>
              {searchResults.staff!.map(s => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => onSelectStaff(s.name)}
                  className="w-full text-left px-4 py-3 border-b border-[var(--dg-card-border)] last:border-0 hover:bg-[var(--dg-input)] transition-colors"
                >
                  <p className="font-medium text-sm dg-ink">{s.name}</p>
                  <p className="text-xs dg-muted">
                    Total Paid: {fmt(s.totalPaid)} · {s.payments} payments · Last:{' '}
                    {s.lastPayment ? formatDate(s.lastPayment) : '—'}
                  </p>
                </button>
              ))}
            </ResultSection>
          )}
        </div>
      )}

      {/* Party ledger */}
      {partyDetail && (
        <section className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="min-w-0 space-y-3">
              <nav className="flex items-center gap-1.5 text-xs font-medium dg-muted">
                <button
                  type="button"
                  onClick={onClearParty}
                  className="hover:text-[var(--dg-primary)] transition-colors"
                >
                  Search / Verify
                </button>
                <ChevronRight size={14} className="dg-faint" />
                <span className="dg-ink">{partySingular} Ledger</span>
              </nav>
              <h1 className="text-3xl font-bold dg-ink tracking-tight">{partyDetail.vendor?.name || partySingular}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm dg-muted">
                {partyDetail.vendor?.phone && (
                  <span className="flex items-center gap-2 font-mono">
                    <Phone size={16} className="text-[var(--dg-primary)] opacity-70" />
                    {partyDetail.vendor.phone}
                  </span>
                )}
                {partyDetail.vendor?.email && (
                  <span className="flex items-center gap-2">
                    <Mail size={16} className="text-[var(--dg-primary)] opacity-70" />
                    {partyDetail.vendor.email}
                  </span>
                )}
                {partyDetail.vendor?.address && (
                  <span className="flex items-center gap-2">
                    <MapPin size={16} className="text-[var(--dg-primary)] opacity-70" />
                    {partyDetail.vendor.address}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onPrintParty}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-[var(--dg-card-border)] dg-ink bg-[var(--dg-card)] hover:bg-[var(--dg-input)] transition-colors shrink-0"
            >
              <Printer size={18} /> Print / PDF
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="dg-glass-card p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint">Total Billed</span>
                <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <FileText size={18} />
                </span>
              </div>
              <p className="text-[32px] font-bold font-mono text-blue-700 leading-none">
                {fmt(partyDetail.totalDistributedValue ?? 0)}
              </p>
              {(partyDetail.distributions?.length ?? 0) > 0 && (
                <p className="text-sm text-blue-600/70 mt-2">
                  From {partyDetail.distributions!.length} distribution
                  {partyDetail.distributions!.length === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <div className="dg-glass-card p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint">Amount Paid</span>
                <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Wallet size={18} />
                </span>
              </div>
              <p className="text-[32px] font-bold font-mono text-emerald-700 leading-none">
                {fmt(partyDetail.totalPaid ?? 0)}
              </p>
              {partyDetail.payments?.[0]?.paymentDate && (
                <p className="text-sm text-emerald-600/70 mt-2">
                  Last payment: {formatDate(partyDetail.payments[0].paymentDate)}
                </p>
              )}
            </div>
            <div
              className={cn(
                'dg-glass-card p-6 rounded-2xl',
                (partyDetail.balance ?? 0) > 0 &&
                  'border-[color-mix(in_srgb,var(--dg-error)_35%,var(--dg-card-border))]',
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint">Outstanding Balance</span>
                <span
                  className={cn(
                    'p-2 rounded-lg',
                    (partyDetail.balance ?? 0) > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600',
                  )}
                >
                  <IndianRupee size={18} />
                </span>
              </div>
              <p
                className={cn(
                  'text-[32px] font-bold font-mono leading-none',
                  (partyDetail.balance ?? 0) > 0 ? 'text-rose-700' : 'text-emerald-700',
                )}
              >
                {fmt(Math.abs(partyDetail.balance ?? 0))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="dg-glass-card rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--dg-card-border)]">
                <h3 className="text-lg font-bold dg-ink">Recent Payments</h3>
              </div>
              {partyDetail.payments && partyDetail.payments.length > 0 ? (
                <div className="divide-y divide-[var(--dg-card-border)]">
                  {partyDetail.payments.slice(0, 8).map(p => (
                    <div key={p.id} className="px-6 py-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                          <Wallet size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold dg-ink truncate">{p.paymentMethod || 'Payment'}</p>
                          <p className="text-xs dg-muted font-mono">{formatDate(p.paymentDate)}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold font-mono text-emerald-600">+{fmt(p.amount)}</p>
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded uppercase tracking-wider">
                          Completed
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-6 py-10 text-sm dg-muted text-center">No payments recorded</p>
              )}
            </div>

            <div className="dg-glass-card rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-[var(--dg-card-border)]">
                <h3 className="text-lg font-bold dg-ink">{recentDistLabel}</h3>
              </div>
              {partyDetail.distributions && partyDetail.distributions.length > 0 ? (
                <div className="divide-y divide-[var(--dg-card-border)]">
                  {partyDetail.distributions.slice(0, 8).map((dist, i) => (
                    <div
                      key={`${dist.date}-${dist.productName}-${i}`}
                      className="px-6 py-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)] flex items-center justify-center shrink-0">
                          <Package size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold dg-ink truncate">{dist.productName}</p>
                          <p className="text-xs dg-muted font-mono">
                            {formatDate(dist.date)} · {dist.quantity} Units
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold font-mono dg-ink">{fmt(dist.total)}</p>
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)] text-[10px] font-bold rounded uppercase tracking-wider">
                          {distributionLabel === 'Sales' ? 'Sold' : 'Distributed'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-6 py-10 text-sm dg-muted text-center">No {recentDistLabel.toLowerCase()} yet</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Staff detail */}
      {staffDetail && (
        <section className="dg-glass-card rounded-2xl p-6 space-y-4">
          <button
            type="button"
            onClick={onClearStaff}
            className="text-xs font-medium text-[var(--dg-primary)] hover:underline"
          >
            ← Back to results
          </button>
          <h3 className="text-xl font-bold dg-ink">{staffDetail.name} — Payment History</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3 bg-emerald-50/80 border border-emerald-100">
              <p className="text-[9px] font-bold dg-faint uppercase">Total Paid</p>
              <p className="text-lg font-bold text-emerald-700">
                {fmt(
                  staffDetail.payments.reduce(
                    (s, p) => s + (['salary', 'bonus'].includes(p.paymentType) ? p.amount : 0),
                    0,
                  ),
                )}
              </p>
            </div>
            <div className="rounded-xl p-3 bg-amber-50/80 border border-amber-100">
              <p className="text-[9px] font-bold dg-faint uppercase">Advance Due</p>
              <p className="text-lg font-bold text-amber-700">
                {fmt(
                  Math.max(
                    0,
                    staffDetail.payments.reduce(
                      (s, p) =>
                        s +
                        (p.paymentType === 'advance' ? p.amount : p.paymentType === 'advance_repay' ? -p.amount : 0),
                      0,
                    ),
                  ),
                )}
              </p>
            </div>
          </div>
          {staffDetail.payments.length > 0 ? (
            staffDetail.payments.map(p => {
              const typeLabel: Record<string, string> = {
                salary: 'Salary',
                advance: 'Advance',
                advance_repay: 'Repaid',
                bonus: 'Bonus',
                deduction: 'Deduction',
              };
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap justify-between py-2 border-b border-[var(--dg-card-border)] text-sm gap-1"
                >
                  <div>
                    <span className="font-bold text-xs dg-ink">{typeLabel[p.paymentType] || p.paymentType}</span>
                    <span className="dg-muted text-xs ml-2">
                      {formatDate(p.paymentDate)} · {p.paymentMethod}
                    </span>
                    {p.notes && <span className="dg-faint text-xs ml-2">— {p.notes}</span>}
                  </div>
                  <span className="font-bold dg-ink">{fmt(p.amount)}</span>
                </div>
              );
            })
          ) : (
            <p className="dg-muted text-sm">No payments recorded</p>
          )}
        </section>
      )}

      {/* Not found */}
      {notFound && (
        <section className="dg-glass-card rounded-2xl p-10 text-center">
          <XCircle size={48} className="text-rose-300 mx-auto mb-3" />
          <h3 className="font-bold text-lg dg-ink">Not Found</h3>
          <p className="text-sm dg-muted mt-1">
            No results found for &ldquo;<span className="font-bold">{query}</span>&rdquo;
          </p>
        </section>
      )}

      {/* Product detail + journey */}
      {result && (
        <div className="space-y-6">
          <section className="dg-glass-card rounded-2xl overflow-hidden">
            <div
              className={cn(
                'px-6 py-4 flex items-center justify-between border-b border-[var(--dg-card-border)]',
                status?.bg,
              )}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <StatusIcon size={18} className={status?.color} />
                  <span className={cn('text-xs font-bold uppercase tracking-wider', status?.color)}>
                    {result.currentStatus}
                  </span>
                </div>
                <p className="font-mono text-[13px] dg-muted">{result.barcode}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-emerald-600" />
              </div>
            </div>
            <div className="p-6">
              <h1 className="text-2xl md:text-3xl font-bold dg-ink tracking-tight mb-1">{result.product.name}</h1>
              {result.product.description && <p className="text-sm dg-muted mb-6">{result.product.description}</p>}
              {!result.product.description && <div className="mb-6" />}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl p-4 border border-[var(--dg-card-border)] bg-[var(--dg-input)]/50 hover:border-[var(--dg-primary)] transition-colors">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint mb-2">Price</p>
                  <p className="font-mono text-2xl dg-ink">{fmt(result.product.price)}</p>
                </div>
                <div className="rounded-xl p-4 border border-[var(--dg-card-border)] bg-[var(--dg-input)]/50 hover:border-[var(--dg-primary)] transition-colors">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint mb-2">HSN Code</p>
                  <p className="font-mono text-2xl dg-ink">{result.product.hsnCode || '—'}</p>
                </div>
                <div className="rounded-xl p-4 border border-[var(--dg-card-border)] bg-[var(--dg-input)]/50 hover:border-[var(--dg-primary)] transition-colors">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint mb-2">GST Rate</p>
                  <p className="font-mono text-2xl dg-ink">
                    {result.product.gstRate != null ? `${Number(result.product.gstRate).toFixed(2)}%` : '—'}
                  </p>
                </div>
              </div>
              {result.features.warranty &&
                result.product.warrantyApplicable &&
                result.product.warrantyMonths != null && (
                  <p className="text-xs dg-muted mt-4">Warranty: {result.product.warrantyMonths} months</p>
                )}
            </div>
          </section>

          <section className="dg-glass-card rounded-2xl p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint mb-6">Product Journey</h3>
            <div className="space-y-0 relative">
              <div className="relative flex items-start pb-8">
                {(result.distribution || result.sale) && (
                  <div className="absolute left-3 top-6 bottom-0 w-px bg-[var(--dg-card-border)]" />
                )}
                <div className="relative z-10 w-6 h-6 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center mr-4 shrink-0">
                  <Package size={14} className="text-blue-500" />
                </div>
                <div>
                  <h4 className="font-bold text-sm dg-ink">Added to Inventory</h4>
                  <p className="font-mono text-xs dg-muted">
                    {result.timeline.addedToInventory ? formatDate(result.timeline.addedToInventory) : 'N/A'}
                  </p>
                </div>
              </div>

              {result.distribution && (
                <div className="relative flex items-start pb-8 last:pb-0">
                  {result.sale && <div className="absolute left-3 top-6 bottom-0 w-px bg-[var(--dg-card-border)]" />}
                  <div className="relative z-10 w-6 h-6 rounded-md bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] border border-[color-mix(in_srgb,var(--dg-primary)_25%,transparent)] flex items-center justify-center mr-4 shrink-0">
                    <Truck size={14} className="text-[var(--dg-primary)]" />
                  </div>
                  <div className="flex-1 rounded-xl border border-[var(--dg-card-border)] bg-[var(--dg-input)]/40 p-4">
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div>
                        <h4 className="font-bold text-sm dg-ink">
                          Distributed
                          {result.features.vendorPortal && result.distribution.vendorName
                            ? ` to ${result.distribution.vendorName}`
                            : ''}
                        </h4>
                        <p className="font-mono text-xs dg-muted">{formatDate(result.distribution.date)}</p>
                      </div>
                      {result.distribution.gstApplied && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase shrink-0">
                          GST Applied
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--dg-card-border)]">
                      <div>
                        <p className="text-[11px] dg-faint mb-1">Financials</p>
                        <p className="font-mono text-[13px] dg-ink">
                          {result.distribution.netPrice != null && <>Price: {fmt(result.distribution.netPrice)} </>}
                          {result.distribution.discountPercent != null && (
                            <span className="dg-muted ml-1">
                              Disc: {Number(result.distribution.discountPercent).toFixed(2)}%
                            </span>
                          )}
                        </p>
                      </div>
                      {result.features.vendorPortal && result.distribution.vendorPhone && (
                        <div>
                          <p className="text-[11px] dg-faint mb-1">Contact</p>
                          <p className="font-mono text-[13px] dg-ink">{result.distribution.vendorPhone}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {result.sale && (
                <div className="relative flex items-start">
                  <div className="relative z-10 w-6 h-6 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center mr-4 shrink-0">
                    <ShoppingCart size={14} className="text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm dg-ink">
                      Sold
                      {result.features.vendorPortal && result.sale.customerName
                        ? ` to ${result.sale.customerName}`
                        : ''}
                    </h4>
                    <p className="font-mono text-xs dg-muted">{formatDate(result.sale.date)}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs dg-muted">
                      {result.sale.salePrice != null && <span>Sale Price: {fmt(result.sale.salePrice)}</span>}
                      {result.features.vendorPortal && result.sale.soldByVendor && (
                        <span>By: {result.sale.soldByVendor}</span>
                      )}
                    </div>
                    {result.features.vendorPortal && result.sale.customerPhone && (
                      <p className="text-xs dg-faint mt-0.5">Customer Phone: {result.sale.customerPhone}</p>
                    )}
                    {result.features.rewards && result.sale.rewardPointsEarned ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Gift size={12} className="text-amber-500" />
                        <span className="text-xs font-medium text-amber-600">
                          +{result.sale.rewardPointsEarned} reward points
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </section>

          {result.features.warranty && result.warranty && (
            <section className="dg-glass-card rounded-2xl p-6">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint mb-3 flex items-center gap-2">
                <ShieldCheck size={16} /> Warranty
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-bold dg-faint uppercase">Status</p>
                  <p
                    className={cn(
                      'font-bold text-sm',
                      result.warranty.status === 'Active'
                        ? 'text-emerald-600'
                        : result.warranty.status === 'Expired'
                          ? 'text-rose-600'
                          : 'dg-muted',
                    )}
                  >
                    {result.warranty.status}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold dg-faint uppercase">Activation</p>
                  <p className="font-medium text-sm dg-ink">{formatDate(result.warranty.activationDate)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold dg-faint uppercase">Expiry</p>
                  <p className="font-medium text-sm dg-ink">{formatDate(result.warranty.expiryDate)}</p>
                </div>
              </div>
            </section>
          )}

          {result.features.replacement && result.replacements && result.replacements.length > 0 && (
            <section className="dg-glass-card rounded-2xl p-6">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] dg-faint mb-3 flex items-center gap-2">
                <RefreshCw size={16} /> Replacement History
              </h4>
              <div className="space-y-2">
                {result.replacements.map((r, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm bg-[var(--dg-input)]"
                  >
                    <span className="font-mono text-xs dg-ink">{r.oldBarcode}</span>
                    <span className="dg-faint">→</span>
                    <span className="font-mono text-xs dg-ink">{r.newBarcode}</span>
                    {r.reason && <span className="text-xs dg-muted">({r.reason})</span>}
                    <span className="ml-auto text-xs dg-faint">{formatDate(r.date)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
