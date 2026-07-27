import { useBusinessConfig } from '../../lib/businessTypeConfig';
import { isDesktopGlassUi } from '../../lib/desktopGlass';
import { isMobileAppShell } from '../../lib/mobileAppShell';
import { isServicePhoneUx } from '../../platforms/service-cloud/mode';
import { cn } from '../../lib/utils';

export type HospShell = 'desktopGlass' | 'capGlass' | 'classic';

export function useHospShell(): HospShell {
  const biz = useBusinessConfig().type;
  if (isDesktopGlassUi(biz)) return 'desktopGlass';
  if (isMobileAppShell() && !isServicePhoneUx(biz)) return 'capGlass';
  return 'classic';
}

export function hospPageClass(shell: HospShell) {
  return cn(
    shell === 'desktopGlass' && 'space-y-6 w-full',
    shell === 'capGlass' && 'dg-mobile-glass space-y-3 -mx-3 px-3 pb-2 min-h-full',
    shell === 'classic' && 'space-y-6',
  );
}

export function hospEyebrowClass(shell: HospShell) {
  return cn(
    'text-[10px] font-bold uppercase tracking-[0.14em]',
    shell === 'desktopGlass' && 'dg-muted',
    shell === 'capGlass' && 'dg-m-faint tracking-widest',
    shell === 'classic' && 'text-gray-400',
  );
}

export function hospTitleClass(shell: HospShell) {
  return cn(
    'font-bold tracking-tight',
    shell === 'desktopGlass' && 'text-3xl dg-ink',
    shell === 'capGlass' && 'text-xl dg-m-ink',
    shell === 'classic' && 'text-xl text-gray-900',
  );
}

export function hospSubClass(shell: HospShell) {
  return cn(
    'text-sm',
    shell === 'desktopGlass' && 'dg-muted',
    shell === 'capGlass' && 'dg-m-muted',
    shell === 'classic' && 'text-gray-500',
  );
}

export function hospCardClass(shell: HospShell) {
  return cn(
    'rounded-2xl',
    shell === 'desktopGlass' && 'dg-glass-card',
    shell === 'capGlass' && 'dg-m-glass-card',
    shell === 'classic' && 'bg-white border border-gray-100 shadow-sm',
  );
}

export function hospPrimaryBtn(shell: HospShell) {
  return cn(
    'inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-bold disabled:opacity-50',
    shell === 'desktopGlass' && 'dg-bg-primary rounded-lg',
    shell === 'capGlass' && 'dg-m-bg-primary rounded-full h-9 px-3 text-[11px]',
    shell === 'classic' && 'bg-brand text-white rounded-xl shadow-lg shadow-brand/20 hover:bg-brand-dark',
  );
}

export function hospSecondaryBtn(shell: HospShell) {
  return cn(
    'inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-sm font-medium',
    shell === 'desktopGlass' && 'rounded-lg border border-[var(--dg-card-border)] dg-muted hover:bg-[var(--dg-input)]',
    shell === 'capGlass' &&
      'rounded-full border border-[var(--dg-card-border)] dg-m-muted dg-m-surface h-9 text-[11px]',
    shell === 'classic' && 'rounded-xl bg-white border border-gray-200 hover:bg-gray-50',
  );
}

export function hospDangerBtn(shell: HospShell) {
  return cn(
    'inline-flex items-center justify-center min-h-[44px] px-3 py-1.5 text-sm font-bold',
    shell === 'desktopGlass' && 'rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50/10',
    shell === 'capGlass' && 'rounded-full border border-rose-300 text-rose-600 h-9 text-[11px]',
    shell === 'classic' && 'rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50',
  );
}

export function hospInputClass(shell: HospShell) {
  return cn(
    'w-full px-3 py-2 text-sm',
    shell === 'desktopGlass' &&
      'rounded-lg bg-[var(--dg-bg)] border border-[var(--dg-card-border)] dg-ink focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary)]',
    shell === 'capGlass' &&
      'rounded-xl dg-m-surface border border-[var(--dg-card-border)] dg-m-ink focus:outline-none focus:ring-2 focus:ring-[var(--dg-primary-bright)]',
    shell === 'classic' && 'rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand',
  );
}

/** Shared segment/filter chip sizing — same box on active & idle so text never kisses the edge. */
const hospChipBase =
  'dg-pill-tab inline-flex items-center justify-center box-border shrink-0 min-h-9 px-4 py-2 text-sm font-semibold leading-none border border-solid transition-colors';

export function hospChipActive(shell: HospShell) {
  return cn(
    hospChipBase,
    // Transparent border keeps height identical to idle (1px border always present)
    shell === 'desktopGlass' && 'dg-bg-primary rounded-lg border-transparent',
    shell === 'capGlass' && 'dg-m-chip-active rounded-full border-transparent',
    shell === 'classic' && 'bg-brand text-white shadow-md shadow-brand/20 rounded-full border-transparent',
  );
}

export function hospChipIdle(shell: HospShell) {
  return cn(
    hospChipBase,
    shell === 'desktopGlass' && 'rounded-lg border-[var(--dg-card-border)] dg-muted hover:bg-[var(--dg-input)]',
    shell === 'capGlass' && 'rounded-full border-[var(--dg-card-border)] dg-m-muted dg-m-surface',
    shell === 'classic' && 'rounded-full bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
  );
}
