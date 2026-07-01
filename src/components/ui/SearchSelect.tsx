import React, { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchSelect({ options, value, onChange, placeholder = 'Search...', className }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  // Group by first letter
  const grouped: Record<string, Option[]> = {};
  for (const o of filtered) {
    const letter = o.label.charAt(0).toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(o);
  }
  const sortedLetters = Object.keys(grouped).sort();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(''); }}
        className={cn(
          "w-full px-2 py-1.5 border rounded-lg text-sm text-left flex items-center gap-2 transition-colors",
          open ? "border-brand ring-2 ring-brand/20" : "border-gray-200",
          selected ? "text-gray-900" : "text-gray-400"
        )}
      >
        <span className="truncate flex-1">{selected ? selected.label : placeholder}</span>
        <Search size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[60] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400">No matches found</div>
            ) : (
              sortedLetters.map(letter => (
                <div key={letter}>
                  <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase bg-gray-50 sticky top-0">{letter}</div>
                  {grouped[letter].map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-brand/5 transition-colors flex items-center justify-between",
                        o.value === value && "bg-brand/10 font-medium"
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.sublabel && <span className="text-[10px] text-gray-400 shrink-0 ml-2">{o.sublabel}</span>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="w-full px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 border-t border-gray-100 font-medium">Clear selection</button>
          )}
        </div>
      )}
    </div>
  );
}
