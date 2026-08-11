/**
 * Cap non-service phone Masters hub (tile grid mock).
 * Service phone keeps pill+list hub in MastersView.
 */
import React, { useMemo, useState } from 'react';
import { Search, type LucideIcon } from 'lucide-react';
import { MobileFab } from '../../components/ui';
import type { MasterType } from './MastersView';

export type MobileMasterTile = {
  id: MasterType;
  name: string;
  count: number | string;
  icon: LucideIcon;
};

const COUNT_SUFFIX: Partial<Record<MasterType, string>> = {
  item: 'Items',
  customer: 'Active',
  vendor: 'Partners',
  bank: 'Accounts',
  staff: 'Employees',
  expenses: '',
  priceList: '',
  rewardRules: '',
  mapping: '',
};

type Props = {
  masters: MobileMasterTile[];
  onOpen: (id: MasterType) => void;
  subtitle?: string;
};

export function MobileMastersHub({ masters, onOpen, subtitle }: Props) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return masters;
    return masters.filter(m => m.name.toLowerCase().includes(needle));
  }, [masters, q]);

  const fabTarget =
    masters.find(m => m.id === 'vendor' || m.id === 'customer' || m.id === 'bank' || m.id === 'staff') ??
    masters.find(m => m.id !== 'item' && m.id !== 'expenses') ??
    masters[0];

  return (
    <div className="dg-mobile-glass space-y-4 -mx-3 px-3 pb-16 sm:hidden">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest dg-m-faint">Administrative Shell</p>
        <h2 className="text-2xl font-bold dg-m-ink tracking-tight mt-0.5">Masters</h2>
        <p className="text-[12px] dg-m-muted mt-1 leading-relaxed">
          {subtitle || 'Manage your core business entities and database records from a central hub.'}
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 dg-m-faint" />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search modules…"
          className="w-full h-10 pl-9 pr-3 rounded-xl dg-m-surface border border-[var(--dg-card-border)] text-sm dg-m-ink placeholder:text-[var(--dg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary-bright)]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {filtered.map(m => {
          const Icon = m.icon;
          const suffix = COUNT_SUFFIX[m.id];
          const countLine =
            typeof m.count === 'number'
              ? `${m.count.toLocaleString()}${suffix ? ` ${suffix}` : ' records'}`
              : m.count || 'Open';
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className="dg-m-glass-card rounded-2xl p-3.5 text-left active:scale-[0.98] transition-transform min-h-[112px] flex flex-col"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[color-mix(in_srgb,var(--dg-primary-bright)_14%,transparent)] dg-m-bright">
                <Icon size={22} />
              </div>
              <h3 className="text-sm font-bold dg-m-ink">{m.name}</h3>
              <p className="text-[11px] dg-m-muted mt-auto pt-1">{countLine}</p>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && <p className="text-sm dg-m-muted text-center py-8">No modules match “{q.trim()}”.</p>}

      {/* ponytail: no System Health / fake sync % — product has no such metrics */}

      {fabTarget && (
        <MobileFab
          label={`Open ${fabTarget.name}`}
          iconOnly
          onClick={() => onOpen(fabTarget.id)}
          className="!bg-[var(--dg-primary-bright)]"
        />
      )}
    </div>
  );
}
