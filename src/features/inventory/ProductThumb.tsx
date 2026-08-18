import { cn } from '../../lib/utils';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ProductThumb({
  name,
  src,
  size = 48,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const box = cn('shrink-0 overflow-hidden rounded-xl', className);
  const dim = { width: size, height: size };
  if (src && src.startsWith('data:image/')) {
    return <img src={src} alt="" className={cn(box, 'object-cover')} style={dim} />;
  }
  return (
    <div
      className={cn(
        box,
        'flex items-center justify-center text-sm font-bold border border-gray-200 bg-gray-50 text-brand',
      )}
      style={dim}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
