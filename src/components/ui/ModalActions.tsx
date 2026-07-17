import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Modal footer actions: stack on phone (primary on top via flex-col-reverse),
 * horizontal on sm+. Never overflows narrow viewports.
 */
export function ModalActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 w-full',
        '[&>button]:min-h-11 [&>button]:rounded-xl [&>button]:font-bold [&>button]:text-sm',
        '[&>button]:w-full sm:[&>button]:w-auto',
        'sm:[&>button.modal-action-primary]:flex-1',
        'sm:[&>button.modal-action-secondary]:flex-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ModalActionButton({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  return (
    <button
      type="button"
      className={cn(
        'px-4 py-2.5 disabled:opacity-60 transition-colors',
        variant === 'primary' && 'modal-action-primary bg-brand text-white hover:bg-brand-dark',
        variant === 'secondary' && 'modal-action-secondary border border-gray-200 hover:bg-gray-50',
        variant === 'ghost' && 'border border-gray-200 font-medium hover:bg-gray-50 sm:w-auto sm:flex-none',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
