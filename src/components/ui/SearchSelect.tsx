import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Search, ChevronDown } from 'lucide-react';
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selected = options.find(o => o.value === value);
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  const grouped: Record<string, Option[]> = {};
  for (const o of filtered) {
    const letter = o.label.charAt(0).toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(o);
  }
  const sortedLetters = Object.keys(grouped).sort();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
      }
    };
    updatePos();
    if (inputRef.current) inputRef.current.focus();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  const dropdown = open
    ? ReactDOM.createPortal(
        <div
          ref={dropRef}
          className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10050 }}
        >
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && filtered.length === 1) {
                  onChange(filtered[0].value);
                  setOpen(false);
                  setSearch('');
                }
              }}
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400">No matches found</div>
            ) : (
              sortedLetters.map(letter => (
                <div key={letter}>
                  <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase bg-gray-50 sticky top-0">
                    {letter}
                  </div>
                  {grouped[letter].map(o => (
                    <div
                      key={o.value}
                      role="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        onChange(o.value);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={cn(
                        'w-full px-3 py-2.5 text-left text-sm hover:bg-brand/5 transition-colors flex items-center justify-between cursor-pointer',
                        o.value === value && 'bg-brand/10 font-medium',
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.sublabel && <span className="text-[10px] text-gray-400 shrink-0 ml-2">{o.sublabel}</span>}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          {value && (
            <div
              role="button"
              onMouseDown={e => {
                e.preventDefault();
                e.stopPropagation();
                onChange('');
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 border-t border-gray-100 font-medium cursor-pointer"
            >
              Clear selection
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
        className={cn(
          'w-full px-3 py-2 border rounded-lg text-sm text-left flex items-center gap-2 transition-colors',
          open ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200',
          selected ? 'text-gray-900' : 'text-gray-400',
        )}
      >
        <span className="truncate flex-1">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className={cn('text-gray-400 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {dropdown}
    </div>
  );
}
