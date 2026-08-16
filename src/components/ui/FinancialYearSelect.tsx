import React, { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { listIndianFinancialYears, matchFyStartYear } from '../../lib/reportingPeriod';

type Props = {
  /** Currently selected FY start year (e.g. 2025 for FY 2025-26), or null */
  value?: number | null;
  /** Infer selection from From/To when value is not set */
  from?: string;
  to?: string;
  onChange: (startYear: number) => void;
  className?: string;
  selectClassName?: string;
  label?: string;
  /** How many prior years to list (including current). Default 12. */
  years?: number;
};

/** Dropdown to pick any Indian financial year (Apr–Mar). */
export function FinancialYearSelect({
  value,
  from,
  to,
  onChange,
  className,
  selectClassName,
  label = 'Financial year',
  years = 12,
}: Props) {
  const options = useMemo(() => listIndianFinancialYears(new Date(), years), [years]);
  const selected = value ?? matchFyStartYear(from, to) ?? (options[0] ? options[0].startYear : null);

  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <label className="text-[10px] font-bold uppercase tracking-wider dg-muted block mb-1">{label}</label>
      ) : null}
      <select
        value={selected ?? ''}
        onChange={e => {
          const y = Number(e.target.value);
          if (Number.isFinite(y)) onChange(y);
        }}
        className={cn(
          'h-8 min-w-[8.5rem] rounded-lg border border-[var(--dg-card-border)] bg-white/90 px-2 text-[11px] font-bold dg-ink',
          'focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary)]',
          selectClassName,
        )}
        aria-label={label || 'Financial year'}
      >
        {options.map(o => (
          <option key={o.startYear} value={o.startYear}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
