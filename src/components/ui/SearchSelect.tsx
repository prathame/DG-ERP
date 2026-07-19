import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
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
  /** Combobox: type freely; pick a suggestion or keep custom text via onInputChange. */
  allowCustom?: boolean;
  /** Controlled display text when allowCustom (selected label or typed name). */
  inputValue?: string;
  onInputChange?: (text: string) => void;
  /** Hint under the field when allowCustom. */
  emptyHint?: string;
  /** Label for the “use typed text” footer, e.g. customer / client. */
  customLabel?: string;
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  className,
  allowCustom = false,
  inputValue,
  onInputChange,
  emptyHint,
  customLabel = 'customer',
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selected = options.find(o => o.value === value);
  const query = allowCustom ? (inputValue ?? '') : search;
  const filtered = query
    ? options.filter(
        o =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel && o.sublabel.toLowerCase().includes(query.toLowerCase())),
      )
    : options;

  const exactMatch = query.trim() ? options.find(o => o.label.toLowerCase() === query.trim().toLowerCase()) : undefined;
  const showCustomFooter = allowCustom && query.trim().length > 0 && !exactMatch;

  const grouped: Record<string, Option[]> = {};
  for (const o of filtered) {
    const letter = o.label.charAt(0).toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(o);
  }
  const sortedLetters = Object.keys(grouped).sort();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
      }
    };
    updatePos();
    if (!allowCustom && searchInputRef.current) searchInputRef.current.focus();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, allowCustom]);

  const pickOption = (optValue: string) => {
    // Parent onChange should sync display text (e.g. customerName). Do not call
    // onInputChange here — parents often clear the linked id on free-text change.
    onChange(optValue);
    setOpen(false);
    setSearch('');
  };

  const commitCustom = () => {
    if (!allowCustom || !query.trim()) return;
    onChange('');
    onInputChange?.(query.trim());
    setOpen(false);
  };

  const dropdown = open
    ? ReactDOM.createPortal(
        <div
          ref={dropRef}
          className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10050 }}
        >
          {!allowCustom && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Type to search..."
                  className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  onKeyDown={e => {
                    if (e.key === 'Escape') setOpen(false);
                    if (e.key === 'Enter' && filtered.length === 1) {
                      pickOption(filtered[0]!.value);
                    }
                  }}
                />
              </div>
            </div>
          )}
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 && !showCustomFooter ? (
              <div className="px-3 py-4 text-center text-sm text-gray-400">No matches found</div>
            ) : (
              sortedLetters.map(letter => (
                <div key={letter}>
                  <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase bg-gray-50 sticky top-0">
                    {letter}
                  </div>
                  {grouped[letter]!.map(o => (
                    <div
                      key={o.value}
                      role="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        pickOption(o.value);
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
          {showCustomFooter && (
            <div
              role="button"
              onMouseDown={e => {
                e.preventDefault();
                e.stopPropagation();
                commitCustom();
              }}
              className="w-full px-3 py-2.5 text-left text-sm border-t border-gray-100 hover:bg-brand/5 cursor-pointer"
            >
              <span className="text-gray-500">Use </span>
              <span className="font-semibold text-gray-900">“{query.trim()}”</span>
              <span className="text-gray-500"> as new {customLabel}</span>
            </div>
          )}
          {!allowCustom && value && (
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
          {allowCustom && (value || query.trim()) && (
            <div
              role="button"
              onMouseDown={e => {
                e.preventDefault();
                e.stopPropagation();
                onChange('');
                onInputChange?.('');
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 border-t border-gray-100 font-medium cursor-pointer"
            >
              Clear
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={cn('relative', className)}>
      {allowCustom ? (
        <div className="relative">
          <input
            ref={triggerRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={inputValue ?? ''}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={e => {
              const text = e.target.value;
              onInputChange?.(text);
              // Typing frees the linked party unless exact match later on select
              if (value) {
                const stillMatches = options.find(
                  o => o.value === value && o.label.toLowerCase() === text.trim().toLowerCase(),
                );
                if (!stillMatches) onChange('');
              }
              setOpen(true);
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length === 1) pickOption(filtered[0]!.value);
                else if (exactMatch) pickOption(exactMatch.value);
                else commitCustom();
              }
            }}
            className={cn(
              'w-full px-3 py-2 pr-9 border rounded-lg text-sm transition-colors',
              open ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200',
              'text-gray-900 placeholder:text-gray-400',
            )}
          />
          <ChevronDown
            size={14}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform',
              open && 'rotate-180',
            )}
          />
        </div>
      ) : (
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
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
      )}
      {dropdown}
      {allowCustom && emptyHint && <p className="text-[10px] text-gray-400 mt-1">{emptyHint}</p>}
    </div>
  );
}
