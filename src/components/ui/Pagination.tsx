import React from 'react';
import { cn } from '../../lib/utils';

export function PaginationControls({ page, totalPages, total, onPageChange }: { page: number; totalPages: number; total: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-100">
      <span className="text-xs text-gray-500">{total} records &middot; Page {page} of {totalPages}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const start = Math.max(1, Math.min(page - 2, totalPages - 4));
          const p = start + i;
          if (p > totalPages) return null;
          return <button key={p} type="button" onClick={() => onPageChange(p)} className={cn("px-3 py-1.5 text-xs font-medium rounded-lg", p === page ? "bg-brand text-white" : "bg-white border border-gray-200 hover:bg-gray-50")}>{p}</button>;
        })}
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  );
}
