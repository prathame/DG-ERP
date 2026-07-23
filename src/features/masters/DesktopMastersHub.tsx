/**
 * Desktop-only glass Masters hub (light cream + dark charcoal). Cap / phone UX untouched.
 */
import React from 'react';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { MasterType } from './MastersView';

export type DesktopMasterCard = {
  id: MasterType;
  name: string;
  count: number | string;
  icon: LucideIcon;
};

const DESCRIPTIONS: Partial<Record<MasterType, string>> = {
  item: 'Manage SKUs, variants, and item-wise configurations for global inventory tracking.',
  customer: 'Centralize customer profiles, contact history, and personalized credit terms.',
  vendor: 'Partner profiles, credit terms, and distribution relationships in one place.',
  bank: 'Link corporate bank accounts, manage IFSC mappings and reconciliation rules.',
  staff: 'Manage employee directories, role-based access, and payroll identifiers.',
  expenses: 'Vendor master data and purchase category mapping for automated ledger entries.',
  priceList: 'Set up multi-tier pricing, seasonal discounts, and regional currency overrides.',
  rewardRules: 'Configure loyalty points, redemption thresholds, and reward campaigns.',
  mapping: 'Link vendors to customers so sales and distribution stay consistent.',
};

const CTA: Partial<Record<MasterType, string>> = {
  item: 'Manage Products',
  customer: 'View Mapping',
  vendor: 'Manage Partners',
  bank: 'Bank Registry',
  staff: 'Staff Directory',
  expenses: 'Manage Vendors',
  priceList: 'Global Pricing',
  rewardRules: 'Reward Rules',
  mapping: 'Open Mapping',
};

type Props = {
  masters: DesktopMasterCard[];
  onOpen: (id: MasterType) => void;
  totalRecords?: number;
};

export function DesktopMastersHub({ masters, onOpen, totalRecords }: Props) {
  const total = totalRecords ?? masters.reduce((s, m) => s + (typeof m.count === 'number' ? m.count : 0), 0);

  return (
    <div className="space-y-10 max-w-[1400px] mx-auto">
      <div>
        <h3 className="text-3xl font-bold dg-ink tracking-tight">Data Management Central</h3>
        <p className="text-sm dg-muted mt-2 max-w-2xl leading-relaxed">
          Configure your core business entities. Mapping master records ensures consistency across your entire
          procurement and sales lifecycle.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {masters.map(m => {
          const Icon = m.icon;
          const desc = DESCRIPTIONS[m.id] || 'View and manage master records for this category.';
          const cta = CTA[m.id] || 'Open';
          return (
            <div key={m.id} className="dg-glass-card group p-6 rounded-2xl flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[color-mix(in_srgb,var(--dg-primary)_12%,transparent)] text-[var(--dg-primary)] group-hover:scale-110 transition-transform">
                  <Icon size={26} />
                </div>
                <h4 className="text-lg font-bold dg-ink mb-2">{m.name}</h4>
                <p className="text-sm dg-muted mb-2 leading-relaxed">{desc}</p>
                {typeof m.count === 'number' ? (
                  <p className="text-[11px] dg-faint font-bold uppercase tracking-wider">{m.count} records</p>
                ) : null}
              </div>
              <div className="flex items-center justify-between mt-6 pt-2">
                <button
                  type="button"
                  onClick={() => onOpen(m.id)}
                  className="text-[var(--dg-primary)] font-bold text-xs hover:underline"
                >
                  {cta}
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(m.id)}
                  className="w-10 h-10 dg-bg-primary rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                  aria-label={`Add ${m.name}`}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-6 dg-glass-card rounded-2xl flex flex-wrap gap-10 items-center">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold dg-faint uppercase tracking-widest">Total Master Records</span>
          <span className="text-2xl font-bold dg-primary tabular-nums mt-1">{total.toLocaleString()}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold dg-faint uppercase tracking-widest">Categories</span>
          <span className="text-2xl font-bold dg-ink tabular-nums mt-1">{masters.length}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-bold dg-faint uppercase tracking-widest">Sync Status</span>
          <span className="text-2xl font-bold dg-ink mt-1">Live</span>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => masters[0] && onOpen(masters[0].id)}
            className={cn(
              'px-6 py-2.5 dg-bg-primary font-bold rounded-lg text-sm flex items-center gap-2',
              'hover:opacity-90 active:scale-95 transition-all',
            )}
          >
            Open Masters
          </button>
        </div>
      </div>
    </div>
  );
}
