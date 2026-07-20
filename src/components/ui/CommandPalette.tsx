import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Package, ShoppingCart, Users, Barcode, FileText, IndianRupee, LayoutDashboard, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import {
  globalSearchHasHits,
  navigateForGlobalSearchHit,
  type GlobalSearchEntityKind,
  type GlobalSearchNavigate,
} from '../../lib/globalSearch';

type PaletteItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  section?: string;
};

type FlatRow =
  | { key: string; kind: 'nav'; item: PaletteItem }
  | {
      key: string;
      kind: 'entity';
      entity: GlobalSearchEntityKind;
      label: string;
      sub?: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      navigate: GlobalSearchNavigate;
    }
  | { key: string; kind: 'header'; label: string };

export function CommandPalette({
  items,
  onSelect,
  onNavigateEntity,
  onClose,
  inventoryVisible = true,
  distributionVisible = true,
  serviceMobile = false,
}: {
  items: PaletteItem[];
  /** Page / nav tab select (existing behavior). */
  onSelect: (id: string) => void;
  /** Global search entity → navigate (no verify). */
  onNavigateEntity?: (nav: GlobalSearchNavigate) => void;
  onClose: () => void;
  inventoryVisible?: boolean;
  distributionVisible?: boolean;
  serviceMobile?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { results, loading } = useGlobalSearch(query);
  const navFiltered = query ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) : items;

  const rows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    if (navFiltered.length > 0) {
      if (query.trim()) out.push({ key: 'h-pages', kind: 'header', label: 'Pages' });
      for (const item of navFiltered) {
        out.push({ key: `nav-${item.id}`, kind: 'nav', item });
      }
    }
    if (query.trim() && results && globalSearchHasHits(results)) {
      const pushEntity = (
        entity: GlobalSearchEntityKind,
        key: string,
        label: string,
        sub: string | undefined,
        icon: React.ComponentType<{ size?: number; className?: string }>,
        hit: { id?: string; name?: string; productId?: string },
      ) => {
        out.push({
          key,
          kind: 'entity',
          entity,
          label,
          sub,
          icon,
          navigate: navigateForGlobalSearchHit(entity, hit, {
            inventoryVisible,
            distributionVisible,
            serviceMobile,
          }),
        });
      };

      if (results.vendors.length > 0) {
        out.push({ key: 'h-vendors', kind: 'header', label: serviceMobile ? 'Clients' : 'Vendors' });
        for (const v of results.vendors) {
          pushEntity('vendor', `vendor-${v.id}`, v.name, v.contact || v.phone || undefined, ShoppingCart, {
            id: v.id,
            name: v.name,
          });
        }
      }
      if (results.products.length > 0) {
        out.push({ key: 'h-products', kind: 'header', label: 'Products' });
        for (const p of results.products) {
          pushEntity(
            'product',
            `product-${p.id}`,
            p.name,
            `₹${Number(p.price).toLocaleString()} · ${p.stock} in stock`,
            Package,
            { id: p.id, name: p.name },
          );
        }
      }
      if (results.customers.length > 0) {
        out.push({ key: 'h-customers', kind: 'header', label: 'Customers' });
        for (const c of results.customers) {
          pushEntity('customer', `customer-${c.id}`, c.name, c.phone || c.email || undefined, Users, {
            id: c.id,
            name: c.name,
          });
        }
      }
      if (results.barcodes.length > 0) {
        out.push({ key: 'h-barcodes', kind: 'header', label: 'Barcodes' });
        for (const b of results.barcodes) {
          pushEntity('barcode', `barcode-${b.barcode}`, b.barcode, `${b.productName} · ${b.status}`, Barcode, {
            id: b.productId,
            productId: b.productId,
            name: b.productName,
          });
        }
      }
      if ((results.challans?.length ?? 0) > 0) {
        out.push({ key: 'h-challans', kind: 'header', label: 'Challans' });
        for (const c of results.challans!) {
          pushEntity('challan', `challan-${c.batchId}`, c.batchId, `${c.vendorName} · ${c.units} units`, FileText, {
            id: c.batchId,
            name: c.batchId,
          });
        }
      }
      if ((results.staff?.length ?? 0) > 0) {
        out.push({ key: 'h-staff', kind: 'header', label: 'Staff' });
        for (const s of results.staff!) {
          pushEntity(
            'staff',
            `staff-${s.name}`,
            s.name,
            `₹${Number(s.totalPaid).toLocaleString()} · ${s.payments} payments`,
            IndianRupee,
            { name: s.name },
          );
        }
      }
    }
    return out;
  }, [navFiltered, query, results, inventoryVisible, distributionVisible, serviceMobile]);

  const selectable = useMemo(() => rows.filter(r => r.kind === 'nav' || r.kind === 'entity'), [rows]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setActiveIdx(0);
  }, [query, results]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-idx="${activeIdx}"]`) as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const activate = useCallback(
    (row: FlatRow) => {
      if (row.kind === 'nav') {
        onSelect(row.item.id);
        onClose();
      } else if (row.kind === 'entity') {
        if (onNavigateEntity) onNavigateEntity(row.navigate);
        else onSelect(row.navigate.tab);
        onClose();
      }
    },
    [onSelect, onNavigateEntity, onClose],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, Math.max(0, selectable.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && selectable[activeIdx]) {
        activate(selectable[activeIdx]!);
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [selectable, activeIdx, activate, onClose],
  );

  const activeKey = selectable[activeIdx]?.key;
  const showEmpty =
    query.trim().length > 0 && !loading && selectable.length === 0 && (!results || !globalSearchHasHits(results));

  return (
    <>
      <div className="dg-fade-enter fixed inset-0 bg-black/40 z-[300]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="dg-cmd-enter fixed top-[12%] sm:top-[20%] left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-lg max-h-[80dvh] z-[301] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          <Search size={20} className="text-gray-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={selectable.length > 0}
            aria-controls="command-palette-list"
            aria-activedescendant={activeKey ? `cmd-item-${activeKey}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search products, clients, pages..."
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
          />
          {loading && (
            <div
              className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0"
              aria-hidden="true"
            />
          )}
          <kbd className="hidden sm:inline text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md sm:hidden"
            aria-label="Close search"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div id="command-palette-list" ref={listRef} role="listbox" className="max-h-[320px] overflow-y-auto py-2">
          {showEmpty ? (
            <p className="text-sm text-gray-400 text-center py-8" role="status">
              No results for "{query}"
            </p>
          ) : !query.trim() && selectable.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8" role="status">
              Type to search…
            </p>
          ) : (
            rows.map(row => {
              if (row.kind === 'header') {
                return (
                  <p
                    key={row.key}
                    className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400"
                  >
                    {row.label}
                  </p>
                );
              }
              const selIdx = selectable.findIndex(s => s.key === row.key);
              const isActive = selIdx === activeIdx;
              const Icon = row.kind === 'nav' ? row.item.icon : row.icon;
              const label = row.kind === 'nav' ? row.item.label : row.label;
              const sub = row.kind === 'entity' ? row.sub : row.item.section;
              return (
                <button
                  id={`cmd-item-${row.key}`}
                  key={row.key}
                  type="button"
                  role="option"
                  data-cmd-idx={selIdx}
                  aria-selected={isActive}
                  onClick={() => activate(row)}
                  onMouseEnter={() => selIdx >= 0 && setActiveIdx(selIdx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                    isActive ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <Icon size={18} className={isActive ? 'text-brand' : 'text-gray-400'} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium block truncate">{label}</span>
                    {sub && <span className="text-[11px] text-gray-400 block truncate">{sub}</span>}
                  </span>
                  {row.kind === 'nav' && (
                    <LayoutDashboard size={12} className="text-gray-300 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span>
            <kbd className="font-mono bg-gray-100 px-1 rounded">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono bg-gray-100 px-1 rounded">↵</kbd> select
          </span>
          <span>
            <kbd className="font-mono bg-gray-100 px-1 rounded">esc</kbd> close
          </span>
        </div>
      </div>
    </>
  );
}
