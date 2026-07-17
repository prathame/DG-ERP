import { useState, type ReactNode } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formControlClass } from './FormSection';

export type LineItemCardField = {
  key: string;
  label: string;
  /** Full-width row (product select, description) */
  wide?: boolean;
  node: ReactNode;
};

/**
 * Mobile stacked line-item editor. Desktop screens keep their tables;
 * render this with `sm:hidden` alongside a `hidden sm:block` table.
 */
type LineItemCardProps = {
  index: number;
  title?: string;
  amountLabel?: string;
  fields: LineItemCardField[];
  onRemove?: () => void;
  canRemove?: boolean;
  defaultOpen?: boolean;
  className?: string;
};

export function LineItemCard({
  index,
  title,
  amountLabel,
  fields,
  onRemove,
  canRemove,
  defaultOpen = true,
  className,
}: LineItemCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = title || `Item ${index + 1}`;

  return (
    <div className={cn('border border-gray-200 rounded-xl bg-white overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-10"
          aria-expanded={open}
        >
          <ChevronDown size={16} className={cn('shrink-0 text-gray-400 transition-transform', !open && '-rotate-90')} />
          <span className="font-bold text-sm text-gray-800 truncate">{heading}</span>
          {amountLabel ? (
            <span className="ml-auto shrink-0 text-sm font-bold text-brand tabular-nums">{amountLabel}</span>
          ) : null}
        </button>
        {canRemove && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove item ${index + 1}`}
            className="shrink-0 min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="p-3 grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key} className={cn('min-w-0', f.wide && 'col-span-2')}>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">{f.label}</label>
              {f.node}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { formControlClass };
