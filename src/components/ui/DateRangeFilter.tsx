import React from 'react';
import { cn } from '../../lib/utils';

export function DateRangeFilter({ value, onChange }: { value: { range: string; from: string; to: string }; onChange: (v: { range: string; from: string; to: string }) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {['all', 'today', 'week', 'month'].map((r) => (
        <button key={r} type="button" onClick={() => onChange({ range: r, from: '', to: '' })} className={cn("px-3 py-1.5 text-xs font-bold rounded-full transition-colors", value.range === r ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
          {r === 'all' ? 'All' : r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
        </button>
      ))}
      <button type="button" onClick={() => onChange({ ...value, range: 'custom' })} className={cn("px-3 py-1.5 text-xs font-bold rounded-full transition-colors", value.range === 'custom' ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>Custom</button>
      {value.range === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand" />
        </div>
      )}
    </div>
  );
}
