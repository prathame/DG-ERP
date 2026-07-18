import type { ReactNode, JSX } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Dense horizontal pill tabs — smaller than Expo mockups. */
export function MobilePillTabs({
  items,
  value,
  onChange,
  className,
}: {
  items: { id: string; label: string; icon?: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-0.5 px-0.5', className)} role="tablist">
      {items.map(item => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              // Fixed h/min/max so active brand fill never looks larger than idle pills
              'dg-pill-tab shrink-0 inline-flex items-center justify-center gap-1 rounded-full',
              'box-border h-7 min-h-7 max-h-7 !min-h-7 px-2.5 py-0 leading-none',
              'text-[11px] font-bold border border-solid transition-colors',
              active
                ? 'bg-brand text-white border-brand'
                : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200',
            )}
          >
            {item.icon ? <span className="opacity-90 [&_svg]:size-3.5">{item.icon}</span> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** KPI / summary card with optional left accent. */
export function MobileKpiCard({
  label,
  value,
  hint,
  accent = 'brand',
  className,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: 'brand' | 'blue' | 'green' | 'rose' | 'amber' | 'indigo' | 'gray';
  className?: string;
  onClick?: () => void;
}): JSX.Element {
  const accentBar: Record<string, string> = {
    brand: 'border-l-brand bg-orange-50/80',
    blue: 'border-l-blue-500 bg-blue-50/80',
    green: 'border-l-emerald-500 bg-emerald-50/80',
    rose: 'border-l-rose-500 bg-rose-50/80',
    amber: 'border-l-amber-500 bg-amber-50/80',
    indigo: 'border-l-indigo-500 bg-indigo-50/80',
    gray: 'border-l-gray-400 bg-gray-50',
  };
  const body = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-base font-bold text-gray-900 tabular-nums mt-0.5 leading-tight">{value}</p>
      {hint ? <div className="text-[10px] text-gray-500 mt-1">{hint}</div> : null}
    </>
  );
  const cls = cn(
    'w-full text-left rounded-xl border border-gray-100 border-l-[3px] px-3 py-2.5 shadow-sm',
    accentBar[accent] || accentBar.brand,
    onClick && 'hover:shadow-md transition-shadow',
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Compact section title. */
export function MobileSectionTitle({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <h3 className="text-[13px] font-bold text-gray-900">{title}</h3>
      {action}
    </div>
  );
}

/** Empty state — compact. */
export function MobileEmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      {icon ? (
        <div className="w-14 h-14 rounded-full bg-orange-50 text-brand flex items-center justify-center mb-3 [&_svg]:size-7">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-bold text-gray-900">{title}</p>
      {subtitle ? <p className="text-[11px] text-gray-500 mt-1 max-w-[240px]">{subtitle}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex items-center gap-0.5 h-6 px-2 rounded-full bg-brand text-white text-[10px] font-bold"
        >
          <Plus size={10} strokeWidth={1.5} absoluteStrokeWidth /> {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Floating action — compact pill, not huge. */
export function MobileFab({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'fixed z-30 sm:hidden',
        'right-3 bottom-[calc(var(--app-bottom-nav)+var(--safe-bottom)+0.75rem)]',
        'inline-flex items-center gap-0.5 h-6 px-2 rounded-full',
        'bg-brand text-white text-[10px] font-bold shadow-md shadow-brand/20',
        className,
      )}
    >
      <Plus size={10} strokeWidth={1.5} absoluteStrokeWidth />
      {label}
    </button>
  );
}

/** Dense list row card. */
export function MobileListRow({
  icon,
  title,
  subtitle,
  trailing,
  meta,
  onClick,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  className?: string;
}): JSX.Element {
  const body = (
    <>
      {icon ? (
        <div className="shrink-0 w-9 h-9 rounded-lg bg-orange-50 text-brand flex items-center justify-center [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-gray-900 truncate">{title}</div>
        {subtitle ? <div className="text-[11px] text-gray-500 truncate mt-0.5">{subtitle}</div> : null}
      </div>
      {(trailing || meta) && (
        <div className="shrink-0 text-right">
          {trailing ? <div className="text-[13px] font-bold text-gray-900 tabular-nums">{trailing}</div> : null}
          {meta ? (
            <div className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mt-0.5">{meta}</div>
          ) : null}
        </div>
      )}
    </>
  );
  const cls = cn(
    'w-full flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-2.5 py-2 text-left',
    onClick && 'active:bg-gray-50',
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** 2×2 quick action grid — compact. */
export function MobileQuickActions({
  actions,
}: {
  actions: { id: string; label: string; icon: ReactNode; onClick: () => void; tint?: string }[];
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map(a => (
        <button
          key={a.id}
          type="button"
          onClick={a.onClick}
          className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2.5 text-left active:bg-gray-100"
        >
          <span
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 [&_svg]:size-4',
              a.tint || 'bg-orange-100 text-brand',
            )}
          >
            {a.icon}
          </span>
          <span className="text-[12px] font-bold text-gray-800 leading-tight">{a.label}</span>
        </button>
      ))}
    </div>
  );
}
