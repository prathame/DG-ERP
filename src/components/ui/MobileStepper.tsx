import { cn } from '../../lib/utils';

export function MobileStepper({
  steps,
  current,
  onStepClick,
  className,
}: {
  steps: string[];
  current: number;
  /** Optional: allow jumping to completed steps */
  onStepClick?: (index: number) => void;
  className?: string;
}) {
  return (
    <nav aria-label="Form steps" className={cn('flex items-center gap-1 sm:gap-2', className)}>
      {steps.map((label, i) => {
        const active = i === current;
        const done = i < current;
        const clickable = Boolean(onStepClick) && (done || active);
        return (
          <button
            key={label}
            type="button"
            disabled={!clickable}
            onClick={() => onStepClick?.(i)}
            className={cn(
              'flex-1 min-w-0 rounded-lg px-1.5 py-2 text-center transition-colors',
              'min-h-11 sm:min-h-0 sm:py-1.5',
              active && 'bg-brand/10 text-brand',
              done && !active && 'bg-emerald-50 text-emerald-700',
              !active && !done && 'bg-gray-50 text-gray-400',
              !clickable && 'cursor-default',
            )}
            aria-current={active ? 'step' : undefined}
          >
            <span className="block text-[10px] font-bold uppercase tracking-wide truncate">
              {i + 1}. {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
