import React, { useEffect, useRef, useState } from 'react';
import { FileText, Package, Plus, ReceiptIndianRupee, ShoppingBag, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ShellDropdownPortal, shellDropdownAnchor, type ShellDropdownAnchor } from './ShellDropdownPortal';
import type { CreateLaunch } from '../../lib/quickAdd';
import { useEscapeKey } from '../../lib/useEscapeKey';

const ICONS: Record<CreateLaunch, React.ComponentType<{ size?: number; className?: string }>> = {
  invoice: ReceiptIndianRupee,
  quote: FileText,
  challan: Truck,
  purchase: ShoppingBag,
  product: Package,
};

export function QuickAddMenu({
  items,
  onSelect,
  desktopGlass = false,
  capGlassHeader = false,
  menuUp = false,
}: {
  items: { id: CreateLaunch; label: string }[];
  onSelect: (id: CreateLaunch) => void;
  desktopGlass?: boolean;
  capGlassHeader?: boolean;
  menuUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<ShellDropdownAnchor | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEscapeKey(() => {
    if (!open) return false;
    setOpen(false);
    setAnchor(null);
    return true;
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setAnchor(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (items.length === 0) return null;

  const menu = (
    <div
      className={cn(
        'w-52 rounded-xl shadow-xl py-1 overflow-hidden',
        !anchor && 'absolute right-0 z-[100]',
        !anchor && (menuUp ? 'bottom-full mb-2' : 'top-full mt-2'),
        desktopGlass ? 'dg-glass-card border border-[var(--dg-card-border)]' : 'bg-white border border-gray-100',
      )}
    >
      {items.map(item => {
        const Icon = ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAnchor(null);
              onSelect(item.id);
            }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm',
              desktopGlass ? 'dg-ink hover:bg-[var(--dg-input)]' : 'text-gray-700 hover:bg-gray-50',
            )}
          >
            <Icon size={15} className={desktopGlass ? 'dg-faint' : 'text-gray-400'} />
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          if (open) {
            setOpen(false);
            setAnchor(null);
            return;
          }
          setOpen(true);
          setAnchor(shellDropdownAnchor(e.currentTarget));
        }}
        className={cn(
          'p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors',
          capGlassHeader || desktopGlass ? 'hover:bg-[var(--dg-input)] dg-m-muted' : 'hover:bg-gray-100 text-gray-600',
        )}
        aria-label="Add"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus size={18} />
      </button>
      {open &&
        (anchor ? (
          <ShellDropdownPortal
            anchor={anchor}
            openBelow={!menuUp}
            align="right"
            panelRef={panelRef}
            forceOpaque={desktopGlass}
          >
            {menu}
          </ShellDropdownPortal>
        ) : (
          menu
        ))}
    </div>
  );
}
