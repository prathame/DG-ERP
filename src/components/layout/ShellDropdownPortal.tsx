import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export type ShellDropdownAnchor = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

type Props = {
  anchor: ShellDropdownAnchor;
  /** Open below anchor (top nav) or above anchor (bottom nav). */
  openBelow: boolean;
  align?: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  role?: string;
  'aria-labelledby'?: string;
};

/** Portals shell dropdowns above page content (glass cards, period filters, etc.). */
export function ShellDropdownPortal({
  anchor,
  openBelow,
  align = 'left',
  children,
  className,
  panelRef,
  role = 'menu',
  'aria-labelledby': ariaLabelledBy,
}: Props) {
  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-labelledby={ariaLabelledBy}
      style={{
        position: 'fixed',
        zIndex: 500,
        ...(align === 'right' ? { right: window.innerWidth - anchor.right } : { left: anchor.left }),
        ...(openBelow ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 }),
      }}
      className={cn('dg-shell-dropdown', className)}
    >
      {children}
    </div>,
    document.body,
  );
}

export function shellDropdownAnchor(el: HTMLElement): ShellDropdownAnchor {
  const rect = el.getBoundingClientRect();
  return { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
}
