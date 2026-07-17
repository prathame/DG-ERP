import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || description) && (
        <div>
          {title ? <h4 className="text-sm font-bold text-gray-800">{title}</h4> : null}
          {description ? <p className="text-xs text-gray-500 mt-0.5">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

/** 1-col on phone, 2-col from sm up. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4', className)}>{children}</div>;
}

export function FormField({
  label,
  htmlFor,
  required,
  children,
  className,
  hint,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="text-xs font-bold text-gray-400 uppercase block mb-1">
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
      {hint ? <p className="text-[10px] text-gray-400 mt-1">{hint}</p> : null}
    </div>
  );
}

export const formControlClass =
  'w-full min-h-11 px-3 sm:px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand focus:outline-none bg-white text-sm';
