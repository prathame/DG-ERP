import { useRef, useEffect, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { useFocusTrap } from '../../lib/useFocusTrap';

/**
 * Responsive modal: bottom sheet on phones, centered dialog on sm+.
 * Sticky header + scrollable body + optional sticky footer; safe-area aware.
 */
export function AppModal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'lg',
  className,
  bodyClassName,
  zIndex = 50,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  bodyClassName?: string;
  zIndex?: number;
}) {
  const titleId = useRef(`app-modal-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const panelRef = useRef<HTMLDivElement>(null);

  useEscapeKey(() => {
    onClose();
    return true;
  }, true);
  useFocusTrap(panelRef);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const maxW = (
    {
      sm: 'max-w-sm',
      md: 'max-w-lg',
      lg: 'max-w-3xl',
      xl: 'max-w-4xl',
      '2xl': 'max-w-6xl',
    } as const
  )[size];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex }}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className={cn(
          'bg-white w-full flex flex-col shadow-xl',
          'rounded-t-2xl sm:rounded-2xl',
          'max-h-[min(92dvh,100%)] sm:max-h-[min(90dvh,100%)]',
          'pb-[var(--safe-bottom)] sm:pb-0',
          maxW,
          className,
        )}
      >
        <div className="shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 pt-[max(1rem,var(--safe-top))] sm:pt-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base sm:text-lg font-bold text-gray-900 truncate">
              {title}
            </h3>
            {subtitle ? <div className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        <div className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4', bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4 bg-white">{footer}</div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
