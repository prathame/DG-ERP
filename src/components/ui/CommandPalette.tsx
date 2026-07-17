import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  LayoutDashboard,
  Package,
  ShoppingCart,
  ShoppingBag,
  ScanSearch,
  FileText,
  IndianRupee,
  ShieldCheck,
  RefreshCw,
  Gift,
  BarChart3,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';

type PaletteItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  section?: string;
};

export function CommandPalette({
  items,
  onSelect,
  onClose,
}: {
  items: PaletteItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) : items;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[activeIdx]) {
        onSelect(filtered[activeIdx].id);
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [filtered, activeIdx, onSelect, onClose],
  );

  const activeId = filtered[activeIdx] ? `cmd-item-${filtered[activeIdx].id}` : undefined;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-[300]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        transition={{ duration: 0.15 }}
        className="fixed top-[12%] sm:top-[20%] left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-lg max-h-[80dvh] z-[301] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          <Search size={20} className="text-gray-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-controls="command-palette-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search pages, features..."
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md sm:hidden"
            aria-label="Close search"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div id="command-palette-list" ref={listRef} role="listbox" className="max-h-[320px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8" role="status">
              No results for "{query}"
            </p>
          ) : (
            filtered.map((item, idx) => (
              <button
                id={`cmd-item-${item.id}`}
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                  idx === activeIdx ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <item.icon size={18} className={idx === activeIdx ? 'text-brand' : 'text-gray-400'} />
                <span className="font-medium">{item.label}</span>
                {item.section && <span className="ml-auto text-[10px] text-gray-400">{item.section}</span>}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400">
          <span>
            <kbd className="font-mono bg-gray-100 px-1 rounded">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono bg-gray-100 px-1 rounded">↵</kbd> select
          </span>
          <span>
            <kbd className="font-mono bg-gray-100 px-1 rounded">esc</kbd> close
          </span>
        </div>
      </motion.div>
    </>
  );
}
