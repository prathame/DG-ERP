/**
 * Desktop-only glass Inventory Management.
 * Cap / service-phone UX stays in InventoryView.
 */
import React from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  Download,
  IndianRupee,
  Package,
  Plus,
  Scale,
  Trash2,
  Upload,
  Warehouse,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Product } from '../../types';
import { TableSkeleton } from '../../components/ui';
import { ColumnPickerButton } from '../../components/ui/ColumnPicker';

export type StockFilter = 'all' | 'low' | 'out';

type SortKey = 'name' | 'price' | 'stock';

type Props = {
  title: string;
  products: Product[];
  loading: boolean;
  canEdit: boolean;
  inventoryTrackingEnabled: boolean;
  metalMode: boolean;
  barcodeSearch: string;
  onBarcodeSearch: (v: string) => void;
  stockFilter: StockFilter;
  onStockFilter: (f: StockFilter) => void;
  sortBy: SortKey;
  sortOrder: 'asc' | 'desc';
  onToggleSort: (field: SortKey) => void;
  colVisible: Set<string>;
  colToggle: (key: string) => void;
  colShow: (key: string) => boolean;
  invCols: { key: string; label: string; default?: boolean }[];
  onExport: () => void;
  onDeleteAll: () => void;
  onImportCsv: () => void;
  onMetalIntake: () => void;
  onAddProduct: () => void;
  onBarcodeDetails: (p: Product) => void;
  onAddStock: (p: Product) => void;
  onDelete: (p: Product) => void;
  onToggleGst: (p: Product) => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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

function remainingOf(p: Product): number {
  return p.remainingInventory ?? p.stock ?? 0;
}

function totalOf(p: Product): number {
  return p.totalInventory ?? p.stock ?? 0;
}

function pricePair(p: Product): { primary: number; secondary: number; secondaryLabel: string } {
  const rate = (p.gstRate ?? 18) / 100;
  if (p.priceIncludesGst) {
    const excl = rate > 0 ? p.price / (1 + rate) : p.price;
    return { primary: p.price, secondary: excl, secondaryLabel: 'Excl. GST' };
  }
  const incl = p.price * (1 + rate);
  return { primary: p.price, secondary: incl, secondaryLabel: 'Incl. GST' };
}

function stockStatus(remaining: number): 'ok' | 'low' | 'out' {
  if (remaining <= 0) return 'out';
  if (remaining < 10) return 'low';
  return 'ok';
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtCompact = (n: number) => {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  return fmt(n);
};

export function DesktopInventoryPanel({
  title,
  products,
  loading,
  canEdit,
  inventoryTrackingEnabled,
  metalMode,
  barcodeSearch,
  onBarcodeSearch,
  stockFilter,
  onStockFilter,
  sortBy,
  sortOrder,
  onToggleSort,
  colToggle,
  colShow,
  invCols,
  colVisible,
  onExport,
  onDeleteAll,
  onImportCsv,
  onMetalIntake,
  onAddProduct,
  onBarcodeDetails,
  onAddStock,
  onDelete,
  onToggleGst,
}: Props) {
  const fieldInput =
    'w-full pl-10 pr-4 py-2.5 bg-[var(--dg-bg)] border border-[var(--dg-card-border)] rounded-lg text-sm dg-ink focus:ring-2 focus:ring-[var(--dg-primary)] focus:border-transparent';

  const filtered = products.filter(p => {
    if (!inventoryTrackingEnabled) return true;
    const rem = remainingOf(p);
    if (stockFilter === 'low') return rem > 0 && rem < 10;
    if (stockFilter === 'out') return rem <= 0;
    return true;
  });

  const totalSkus = products.length;
  const inventoryValue = products.reduce((s, p) => s + p.price * totalOf(p), 0);
  const outOfStock = inventoryTrackingEnabled ? products.filter(p => remainingOf(p) <= 0).length : 0;

  const filters: { id: StockFilter; label: string }[] = [
    { id: 'all', label: 'All Products' },
    ...(inventoryTrackingEnabled
      ? [
          { id: 'low' as const, label: 'Low Stock' },
          { id: 'out' as const, label: 'Out of Stock' },
        ]
      : []),
  ];

  const sortKeys: { label: string; key: SortKey }[] = [
    { label: 'Name', key: 'name' },
    { label: 'Price', key: 'price' },
    ...(inventoryTrackingEnabled ? [{ label: 'Stock', key: 'stock' as const }] : []),
  ];

  return (
    <div className="space-y-8 w-full max-w-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 dg-muted mb-1">
            <Package size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Inventory List</span>
          </div>
          <h2 className="text-3xl font-bold dg-ink tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onExport}
            disabled={!products.length}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-[var(--dg-card-border)] dg-muted hover:bg-[var(--dg-input)] disabled:opacity-50"
          >
            <Download size={16} /> Export CSV
          </button>
          {canEdit && products.length > 0 && (
            <button
              type="button"
              onClick={onDeleteAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-[color-mix(in_srgb,var(--dg-error)_35%,transparent)] dg-error hover:bg-[color-mix(in_srgb,var(--dg-error)_8%,transparent)]"
            >
              <Trash2 size={16} /> Delete All
            </button>
          )}
          <ColumnPickerButton columns={invCols} visible={colVisible} onToggle={colToggle} />
          <div className="relative min-w-[180px] flex-1 sm:flex-none sm:w-56">
            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 dg-faint" size={16} />
            <input
              type="text"
              placeholder="Scan or enter barcode..."
              value={barcodeSearch}
              onChange={e => onBarcodeSearch(e.target.value)}
              className={fieldInput}
              autoComplete="off"
            />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onImportCsv}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-[var(--dg-card-border)] dg-muted hover:bg-[var(--dg-input)]"
            >
              <Upload size={16} /> Import CSV
            </button>
          )}
          {canEdit && metalMode && (
            <button
              type="button"
              onClick={onMetalIntake}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border border-[color-mix(in_srgb,var(--dg-primary)_35%,transparent)] dg-primary hover:bg-[var(--dg-input)]"
            >
              <Scale size={16} /> Metal Intake
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onAddProduct}
              className="flex items-center gap-2 px-5 py-2.5 dg-bg-primary rounded-lg text-sm font-bold shadow-sm hover:opacity-90"
            >
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      </div>

      <div className="dg-glass-card rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--dg-card-border)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex p-1 rounded-xl border border-[var(--dg-card-border)] gap-0.5 bg-[var(--dg-input)]">
            {filters.map(f => {
              const active = stockFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onStockFilter(f.id)}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
                    active ? 'bg-[var(--dg-card)] dg-primary shadow-sm' : 'dg-muted hover:opacity-80',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold dg-faint uppercase tracking-wider">Sort by</span>
            <div className="flex gap-1">
              {sortKeys.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleSort(item.key)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                    sortBy === item.key
                      ? 'border-[color-mix(in_srgb,var(--dg-primary)_35%,transparent)] dg-primary bg-[color-mix(in_srgb,var(--dg-primary)_8%,transparent)]'
                      : 'border-[var(--dg-card-border)] dg-muted hover:bg-[var(--dg-input)]',
                  )}
                >
                  {item.label}
                  {sortBy === item.key && (
                    <ArrowUpDown
                      size={12}
                      className={cn('transition-transform', sortOrder === 'desc' && 'rotate-180')}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto mb-3 dg-faint" />
            <p className="font-medium dg-muted text-lg">
              {products.length === 0 ? 'No products in inventory' : 'No products match this filter'}
            </p>
            {products.length === 0 && canEdit && (
              <button
                type="button"
                onClick={onAddProduct}
                className="mt-4 px-6 py-2 dg-bg-primary rounded-xl text-sm font-bold"
              >
                Add Product
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold dg-faint uppercase tracking-wider border-b border-[var(--dg-card-border)] bg-[var(--dg-input)]">
                    <th className="px-5 py-3">Product Details</th>
                    {colShow('price') && <th className="px-5 py-3">Price (Incl/Excl)</th>}
                    {inventoryTrackingEnabled && colShow('total') && <th className="px-5 py-3">Total Stock</th>}
                    {inventoryTrackingEnabled && colShow('admin') && <th className="px-5 py-3">Admin Inventory</th>}
                    {inventoryTrackingEnabled && colShow('vendors') && <th className="px-5 py-3">With Vendors</th>}
                    {inventoryTrackingEnabled && colShow('sold') && <th className="px-5 py-3">Sold</th>}
                    <th className="px-5 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dg-card-border)]">
                  {filtered.map(p => {
                    const rem = remainingOf(p);
                    const tot = totalOf(p);
                    const status = stockStatus(rem);
                    const sku = skuLabel(p);
                    const prices = pricePair(p);
                    const ps = p.packSize || 1;
                    const isBoxProduct = ps > 1;
                    const isBoxBarcode = p.barcodeUnitType === 'box';
                    const boxCount = isBoxBarcode ? rem : Math.floor(rem / ps);
                    const totalBoxCount = isBoxBarcode ? tot : Math.floor(tot / ps);
                    const unitLabel = isBoxProduct ? `${p.packName || 'Box'}es` : 'pcs';

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-[color-mix(in_srgb,var(--dg-primary)_5%,transparent)] transition-colors group"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-sm font-bold border border-[var(--dg-card-border)] bg-[var(--dg-card)] text-[var(--dg-primary)] group-hover:scale-105 transition-transform">
                              {initials(p.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold dg-ink text-sm truncate">{p.name}</p>
                                {status === 'low' && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-bold dg-warning bg-[color-mix(in_srgb,var(--dg-warning)_18%,transparent)] px-1.5 py-0.5 rounded-full">
                                    <AlertTriangle size={10} /> Low
                                  </span>
                                )}
                              </div>
                              {sku && <p className="text-[11px] dg-muted font-mono truncate mt-0.5">{sku}</p>}
                            </div>
                          </div>
                        </td>
                        {colShow('price') && (
                          <td className="px-5 py-4">
                            <p className="text-sm font-bold dg-ink tabular-nums">{fmt(prices.primary)}</p>
                            <p className="text-[11px] dg-muted tabular-nums">
                              {fmt(prices.secondary)} ({prices.secondaryLabel})
                            </p>
                            {(p.packSize || 1) > 1 && <p className="text-[10px] dg-faint">per {p.packName || 'Box'}</p>}
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => onToggleGst(p)}
                                className={cn(
                                  'mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                                  p.priceIncludesGst
                                    ? 'bg-[color-mix(in_srgb,var(--dg-success)_16%,transparent)] dg-success'
                                    : 'bg-[var(--dg-input)] dg-muted',
                                )}
                              >
                                {p.priceIncludesGst ? 'GST Incl' : 'GST Excl'}
                              </button>
                            ) : (
                              <span
                                className={cn(
                                  'mt-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                                  p.priceIncludesGst
                                    ? 'bg-[color-mix(in_srgb,var(--dg-success)_16%,transparent)] dg-success'
                                    : 'bg-[var(--dg-input)] dg-muted',
                                )}
                              >
                                {p.priceIncludesGst ? 'GST Incl' : 'GST Excl'}
                              </span>
                            )}
                          </td>
                        )}
                        {inventoryTrackingEnabled && colShow('total') && (
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'w-2 h-2 rounded-full shrink-0',
                                  status === 'ok' && 'bg-[var(--dg-success)]',
                                  status === 'low' && 'bg-[var(--dg-warning)]',
                                  status === 'out' && 'bg-[var(--dg-error)]',
                                )}
                              />
                              <span
                                className={cn(
                                  'font-bold text-sm tabular-nums',
                                  status === 'low' && 'dg-warning',
                                  status === 'out' && 'dg-error',
                                  status === 'ok' && 'dg-ink',
                                )}
                              >
                                {isBoxProduct ? totalBoxCount : tot}
                              </span>
                              <span className="text-[10px] dg-muted font-medium">{unitLabel}</span>
                            </div>
                          </td>
                        )}
                        {inventoryTrackingEnabled && colShow('admin') && (
                          <td className="px-5 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold dg-primary bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] w-fit uppercase">
                                Admin
                              </span>
                              <p className="text-sm font-medium dg-ink tabular-nums">
                                {isBoxProduct ? `${boxCount} ${unitLabel}` : `${rem} pcs`}
                              </p>
                            </div>
                          </td>
                        )}
                        {inventoryTrackingEnabled && colShow('vendors') && (
                          <td className="px-5 py-4">
                            <span className="text-sm font-bold dg-ink tabular-nums">{p.withVendors ?? 0}</span>
                          </td>
                        )}
                        {inventoryTrackingEnabled && colShow('sold') && (
                          <td className="px-5 py-4">
                            <span className="text-sm font-bold dg-ink tabular-nums font-mono">{p.soldCount ?? 0}</span>
                          </td>
                        )}
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => onBarcodeDetails(p)}
                              className="p-2 rounded-lg dg-primary hover:bg-[var(--dg-input)]"
                              title="Barcode Details"
                            >
                              <Barcode size={16} />
                            </button>
                            {canEdit && inventoryTrackingEnabled && (
                              <button
                                type="button"
                                onClick={() => onAddStock(p)}
                                className="p-2 rounded-lg text-[var(--dg-primary-bright)] hover:bg-[var(--dg-input)]"
                                title="Add Stock"
                              >
                                <Plus size={16} />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => onDelete(p)}
                                className="p-2 rounded-lg dg-error hover:bg-[color-mix(in_srgb,var(--dg-error)_8%,transparent)]"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-[var(--dg-card-border)] bg-[var(--dg-input)]">
              <p className="text-xs dg-muted">
                Showing <span className="font-bold dg-ink">{filtered.length}</span>
                {filtered.length !== products.length && (
                  <>
                    {' '}
                    of <span className="font-bold dg-ink">{products.length}</span>
                  </>
                )}{' '}
                products
              </p>
            </div>
          </>
        )}
      </div>

      <div className={cn('grid grid-cols-1 gap-4', inventoryTrackingEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        <div className="dg-glass-card p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[color-mix(in_srgb,var(--dg-primary)_14%,transparent)] text-[var(--dg-primary)]">
            <Package size={22} />
          </div>
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-widest">Total SKUs</p>
            <p className="text-2xl font-bold dg-ink tabular-nums mt-0.5">{totalSkus.toLocaleString('en-IN')}</p>
          </div>
        </div>
        <div className="dg-glass-card p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[color-mix(in_srgb,var(--dg-primary-bright)_14%,transparent)] text-[var(--dg-primary-bright)]">
            <IndianRupee size={22} />
          </div>
          <div>
            <p className="text-[10px] font-bold dg-faint uppercase tracking-widest">Inventory Value</p>
            <p className="text-2xl font-bold dg-ink tabular-nums mt-0.5">{fmtCompact(inventoryValue)}</p>
          </div>
        </div>
        {inventoryTrackingEnabled && (
          <div className="dg-glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[color-mix(in_srgb,var(--dg-error)_12%,transparent)] text-[var(--dg-error)]">
              <Warehouse size={22} />
            </div>
            <div>
              <p className="text-[10px] font-bold dg-faint uppercase tracking-widest">Out of Stock</p>
              <p className="text-2xl font-bold dg-ink tabular-nums mt-0.5">{outOfStock.toLocaleString('en-IN')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
