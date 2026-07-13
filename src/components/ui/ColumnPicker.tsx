import { useState, useEffect } from 'react';
import { Columns3 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function useColumnPicker(storageKey: string, allColumns: { key: string; label: string; default?: boolean }[]) {
  const [visible, setVisible] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`col_${storageKey}`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(allColumns.filter(c => c.default !== false).map(c => c.key));
  });

  const toggle = (key: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(`col_${storageKey}`, JSON.stringify([...next]));
      return next;
    });
  };

  const show = (key: string) => visible.has(key);

  return { visible, toggle, show };
}

export function ColumnPickerButton({ columns, visible, onToggle }: {
  columns: { key: string; label: string }[];
  visible: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700" title="Toggle columns">
        <Columns3 size={18} />
      </button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-xl p-3 min-w-[180px]">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Show Columns</p>
          {columns.map(col => (
            <label key={col.key} className="flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={visible.has(col.key)} onChange={() => onToggle(col.key)} className="rounded text-brand" />
              <span className="text-sm text-gray-700">{col.label}</span>
            </label>
          ))}
        </div>
      </>}
    </div>
  );
}
