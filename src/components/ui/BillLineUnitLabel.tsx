import { cn } from '../../lib/utils';

/** Read-only sale unit. The catalog is Settings → Bill Customization only. */
export function BillLineUnitLabel({ unit, className }: { unit: string; className?: string }) {
  return (
    <span
      className={cn('text-sm text-gray-600 whitespace-nowrap', className)}
      title="Set in Settings → Bill Customization"
    >
      {unit}
    </span>
  );
}
