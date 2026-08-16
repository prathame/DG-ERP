import React from 'react';
import { cn } from '../lib/utils';
import type { ReportingPeriodPreset } from '../lib/reportingPeriod';

export type PeriodPresetChip = {
  id: ReportingPeriodPreset;
  label: string;
};

type Props = {
  presets: PeriodPresetChip[];
  activeId?: string | null;
  onSelect: (id: ReportingPeriodPreset) => void;
  className?: string;
  /** denser chips for Books / Accounts toolbars */
  size?: 'sm' | 'md';
};

/** Shared period chips (This FY / Last FY / This Q / …). */
export function PeriodPresetChips({ presets, activeId, onSelect, className, size = 'sm' }: Props) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {presets.map(p => {
        const active = activeId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={cn(
              'rounded-lg font-bold border transition-all whitespace-nowrap',
              size === 'sm' ? 'h-8 px-2.5 text-[11px]' : 'h-10 px-3 text-xs',
              active
                ? 'border-transparent text-white'
                : 'border-[var(--dg-card-border)] dg-ink hover:bg-[var(--dg-input)] bg-white/80',
            )}
            style={active ? { background: 'var(--dg-primary-bright, #ea580c)' } : undefined}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
