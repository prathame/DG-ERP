/**
 * Cap non-service phone Inventory cards (immersive mock).
 * Service phone keeps InventoryView’s existing list chrome.
 */
import React from 'react';
import { AlertTriangle, ArrowUpDown, Barcode, Package, Plus, Scale, Search, Trash2, Upload } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Product } from '../../types';
import { LoadingSpinner } from '../../components/ui';
import type { StockFilter } from './DesktopInventoryPanel';

type SortKey = 'name' | 'price' | 'stock';

type Props = {
  title: string;
  products: Product[];
  loading: boolean;
  canEdit: boolean;
  inventoryTrackingEnabled: boolean;
  metalMode?: boolean;
  barcodeSearch: string;
  onBarcodeSearch: (v: string) => void;
  stockFilter: StockFilter;
  onStockFilter: (f: StockFilter) => void;
  sortBy: SortKey;
  sortOrder: 'asc' | 'desc';
  onToggleSort: (field: SortKey) => void;
  onImportCsv: () => void;
  onMetalIntake?: () => void;
  onAddProduct: () => void;
  onBarcodeDetails: (p: Product) => void;
  onAddStock: (p: Product) => void;
  onDelete: (p: Product) => void;
  onToggleGst: (p: Product) => void;
};

function remainingOf(p: Product): number {
  return p.remainingInventory ?? p.stock ?? 0;
}

function totalOf(p: Product): number {
  return p.totalInventory ?? p.stock ?? 0;
}

function skuLabel(p: Product): string | null {
  if (p.barcodeRange?.first) {
    if (p.barcodeRange.last && p.barcodeRange.last !== p.barcodeRange.first) {
      return `${p.barcodeRange.first} – ${p.barcodeRange.last}`;
    }
    return p.barcodeRange.first;
  }
  if (p.barcode) return p.barcode;
  return null;
}

/** Same thresholds as desktop / InventoryView: <10 = low, ≤0 = out. */
function stockStatus(remaining: number): 'ok' | 'low' | 'out' {
  if (remaining <= 0) return 'out';
  if (remaining < 10) return 'low';
  return 'ok';
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function MobileInventoryPanel({
  title,
  products,
  loading,
  canEdit,
  inventoryTrackingEnabled,
  metalMode = false,
  barcodeSearch,
  onBarcodeSearch,
  stockFilter,
  onStockFilter,
  sortBy,
  sortOrder,
  onToggleSort,
  onImportCsv,
  onMetalIntake,
  onAddProduct,
  onBarcodeDetails,
  onAddStock,
  onDelete,
  onToggleGst,
}: Props) {
  const filtered = products.filter(p => {
    if (!inventoryTrackingEnabled) return true;
    const rem = remainingOf(p);
    if (stockFilter === 'low') return rem > 0 && rem < 10;
    if (stockFilter === 'out') return rem <= 0;
    return true;
  });

  const sortKeys: { label: string; key: SortKey }[] = [
    { label: 'Name', key: 'name' },
    { label: 'Price', key: 'price' },
    ...(inventoryTrackingEnabled ? [{ label: 'Stock', key: 'stock' as const }] : []),
  ];

  const filters: { id: StockFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...(inventoryTrackingEnabled
      ? [
          { id: 'low' as const, label: 'Low Stock' },
          { id: 'out' as const, label: 'Out' },
        ]
      : []),
  ];

  return (
    <div className="dg-mobile-glass space-y-3 -mx-3 px-3 pb-2 min-h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest dg-m-faint">Inventory List</p>
          <h2 className="text-xl font-bold dg-m-ink tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={onImportCsv}
              className="h-9 w-9 rounded-full border border-[var(--dg-card-border)] bg-white/80 flex items-center justify-center dg-m-muted"
              aria-label="Import CSV"
            >
              <Upload size={16} />
            </button>
          )}
          {canEdit && metalMode && onMetalIntake && (
            <button
              type="button"
              onClick={onMetalIntake}
              className="h-9 w-9 rounded-full border border-[color-mix(in_srgb,var(--dg-primary-bright)_40%,transparent)] bg-white/80 flex items-center justify-center dg-m-bright"
              aria-label="Metal Intake"
            >
              <Scale size={16} />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onAddProduct}
              className="h-9 px-3 rounded-full dg-m-bg-primary text-[11px] font-bold inline-flex items-center gap-1"
            >
              <Plus size={14} /> Add
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 dg-m-faint" />
        <Barcode size={14} className="absolute right-3 top-1/2 -translate-y-1/2 dg-m-faint" />
        <input
          type="search"
          value={barcodeSearch}
          onChange={e => onBarcodeSearch(e.target.value)}
          placeholder="Scan or search barcode / name…"
          className="w-full h-10 pl-9 pr-9 rounded-xl bg-white/80 border border-[var(--dg-card-border)] text-sm dg-m-ink focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary-bright)]"
        />
      </div>

      {inventoryTrackingEnabled && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {filters.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => onStockFilter(f.id)}
              className={cn(
                'dg-pill-tab shrink-0 h-8 px-3 rounded-full text-[11px] font-bold border border-solid',
                stockFilter === f.id
                  ? 'dg-m-chip-active border-transparent'
                  : 'bg-white/70 dg-m-muted border-[var(--dg-card-border)]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider dg-m-faint shrink-0">Sort By</span>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {sortKeys.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onToggleSort(item.key)}
              className={cn(
                'dg-pill-tab shrink-0 h-7 px-2.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1',
                sortBy === item.key
                  ? 'border-[color-mix(in_srgb,var(--dg-primary-bright)_40%,transparent)] dg-m-bright bg-[color-mix(in_srgb,var(--dg-primary-bright)_12%,transparent)]'
                  : 'border-[var(--dg-card-border)] dg-m-muted bg-white/60',
              )}
            >
              {item.label}
              {sortBy === item.key && <ArrowUpDown size={11} className={cn(sortOrder === 'desc' && 'rotate-180')} />}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16">
          <LoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="dg-m-glass-card rounded-2xl py-12 text-center">
          <Package size={36} className="mx-auto mb-2 dg-m-faint" />
          <p className="text-sm font-bold dg-m-ink">
            {products.length === 0 ? 'No products in inventory' : 'No products match this filter'}
          </p>
          {products.length === 0 && canEdit && (
            <button
              type="button"
              onClick={onAddProduct}
              className="mt-3 h-9 px-4 rounded-full dg-m-bg-primary text-[12px] font-bold"
            >
              Add Product
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const rem = remainingOf(p);
            const tot = totalOf(p);
            const status = stockStatus(rem);
            const sku = skuLabel(p);
            const ps = p.packSize || 1;
            const isBoxProduct = ps > 1;
            const isBoxBarcode = p.barcodeUnitType === 'box';
            const boxCount = isBoxBarcode ? rem : Math.floor(rem / ps);
            const totalBoxCount = isBoxBarcode ? tot : Math.floor(tot / ps);
            const unitLabel = isBoxProduct ? `${p.packName || 'Box'}es` : 'pcs';
            const displayTotal = isBoxProduct ? totalBoxCount : tot;
            const displayAdmin = isBoxProduct ? boxCount : rem;

            return (
              <div key={p.id} className="dg-m-glass-card rounded-2xl p-3.5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold dg-m-ink leading-snug">{p.name}</h3>
                    {sku ? <p className="text-[11px] dg-m-muted font-mono mt-0.5 truncate">SKU: {sku}</p> : null}
                  </div>
                  {inventoryTrackingEnabled && status === 'ok' && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--dg-success)_14%,transparent)] dg-m-success">
                      Optimal Stock
                    </span>
                  )}
                  {inventoryTrackingEnabled && status === 'low' && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,#ffd600_22%,transparent)] text-amber-700">
                      <AlertTriangle size={10} /> Low Stock
                    </span>
                  )}
                  {inventoryTrackingEnabled && status === 'out' && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--dg-error)_12%,transparent)] dg-m-error">
                      Out of Stock
                    </span>
                  )}
                  {/* ponytail: no Maintenance Mode — product has no such status */}
                </div>

                <div className="flex items-baseline gap-2 mb-3">
                  <p className="text-base font-bold dg-m-ink tabular-nums">{fmt(p.price)}</p>
                  {(p.packSize || 1) > 1 && <p className="text-[11px] dg-m-muted">/{p.packName || 'Box'}</p>}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => onToggleGst(p)}
                      className={cn(
                        'ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                        p.priceIncludesGst
                          ? 'bg-[color-mix(in_srgb,var(--dg-success)_14%,transparent)] dg-m-success'
                          : 'bg-[var(--dg-input)] dg-m-muted',
                      )}
                    >
                      {p.priceIncludesGst ? 'GST INCL' : 'GST EXCL'}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        'ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                        p.priceIncludesGst
                          ? 'bg-[color-mix(in_srgb,var(--dg-success)_14%,transparent)] dg-m-success'
                          : 'bg-[var(--dg-input)] dg-m-muted',
                      )}
                    >
                      {p.priceIncludesGst ? 'GST INCL' : 'GST EXCL'}
                    </span>
                  )}
                </div>

                {inventoryTrackingEnabled && (
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {[
                      { label: 'Total', value: displayTotal },
                      { label: 'Admin', value: displayAdmin },
                      { label: 'Vend', value: p.withVendors ?? 0 },
                      { label: 'Sold', value: p.soldCount ?? 0 },
                    ].map(cell => (
                      <div key={cell.label} className="rounded-xl bg-[var(--dg-input)] px-2 py-2 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-wider dg-m-faint">{cell.label}</p>
                        <p className="text-sm font-bold dg-m-ink tabular-nums mt-0.5">{cell.value}</p>
                        {cell.label === 'Total' || cell.label === 'Admin' ? (
                          <p className="text-[9px] dg-m-muted">{unitLabel}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onBarcodeDetails(p)}
                    className="h-9 w-9 rounded-full border border-[var(--dg-card-border)] bg-white/80 flex items-center justify-center dg-m-bright"
                    aria-label="Barcode details"
                  >
                    <Barcode size={16} />
                  </button>
                  {canEdit && inventoryTrackingEnabled && (
                    <button
                      type="button"
                      onClick={() => onAddStock(p)}
                      className="h-9 w-9 rounded-full border border-[var(--dg-card-border)] bg-white/80 flex items-center justify-center dg-m-primary"
                      aria-label="Add stock"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      className="h-9 w-9 rounded-full border border-[var(--dg-card-border)] bg-white/80 flex items-center justify-center dg-m-error ml-auto"
                      aria-label="Delete product"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
