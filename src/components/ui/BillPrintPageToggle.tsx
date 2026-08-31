import { cn } from '../../lib/utils';
import type { BillPrintPage } from '../../lib/billTemplates';

/** Miracle-style A4 vs A5 receipt size for print / Save as PDF. */
export function BillPrintPageToggle({
  value,
  onChange,
}: {
  value: BillPrintPage;
  onChange: (page: BillPrintPage) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden text-sm font-bold">
      {(['full', 'half'] as const).map(page => (
        <button
          key={page}
          type="button"
          onClick={() => onChange(page)}
          className={cn(
            'px-3 py-2',
            value === page ? 'bg-brand text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          {page === 'full' ? 'Full page' : 'Half page'}
        </button>
      ))}
    </div>
  );
}
