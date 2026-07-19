import React from 'react';
import { cn } from '../../lib/utils';

/** Shared dense date input — full-width friendly on phone. */
export const dateControlClass =
  'w-full min-h-10 h-10 px-2.5 border border-gray-200 rounded-lg text-[13px] sm:text-sm bg-white focus:ring-2 focus:ring-brand focus:outline-none';

const PRESETS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'custom', label: 'Custom' },
] as const;

export function DateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: { range: string; from: string; to: string };
  onChange: (v: { range: string; from: string; to: string }) => void;
  className?: string;
}) {
  return (
    <div className={cn('w-full min-w-0 space-y-2', className)}>
      <div
        className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5 pb-0.5"
        role="group"
        aria-label="Date range"
      >
        {PRESETS.map(r => {
          const active = value.range === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() =>
                onChange(r.id === 'custom' ? { ...value, range: 'custom' } : { range: r.id, from: '', to: '' })
              }
              className={cn(
                'dg-pill-tab shrink-0 inline-flex items-center justify-center rounded-full',
                'box-border h-7 min-h-7 max-h-7 !min-h-7 px-2.5 py-0 leading-none',
                'text-[11px] font-bold border border-solid transition-colors',
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200',
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {value.range === 'custom' && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
          <div className="min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">From</label>
            <input
              type="date"
              value={value.from}
              onChange={e => onChange({ ...value, from: e.target.value })}
              className={dateControlClass}
            />
          </div>
          <div className="min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-1">To</label>
            <input
              type="date"
              value={value.to}
              onChange={e => onChange({ ...value, to: e.target.value })}
              className={dateControlClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}
