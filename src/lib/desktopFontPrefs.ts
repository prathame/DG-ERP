/**
 * Desktop glass typography prefs (font family + density scale).
 * Cap / service-phone never read these — CSS only applies under .dg-desktop-glass.
 *
 * Persistence mirrors theme: localStorage only (no server field).
 */

export type DesktopFontFamilyId = 'geist' | 'inter' | 'system';
export type DesktopFontDensityId = 'compact' | 'default' | 'comfortable';

const FAMILY_KEY = 'dg_desktop_font_family';
const DENSITY_KEY = 'dg_desktop_font_density';

export const DESKTOP_FONT_FAMILIES: {
  id: DesktopFontFamilyId;
  label: string;
  /** Why this face is allowed in dense glass ERP tables. */
  why: string;
  stack: string;
}[] = [
  {
    id: 'geist',
    label: 'Geist',
    why: 'Default glass face — geometric sans with tight table metrics already used in the desktop shell.',
    stack: 'Geist, Inter, ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'inter',
    label: 'Inter',
    why: 'Already loaded; near-identical x-height/metrics to Geist so layout/tables stay stable.',
    stack: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: 'system',
    label: 'System',
    why: 'OS UI sans (no webfont) — similar neo-grotesque metrics; zero network cost.',
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
];

/** Density presets clamp the modular type scale (0.9 / 1 / 1.1). */
export const DESKTOP_FONT_DENSITIES: {
  id: DesktopFontDensityId;
  label: string;
  scale: number;
  hint: string;
}[] = [
  { id: 'compact', label: 'Compact', scale: 0.9, hint: 'Denser tables and labels' },
  { id: 'default', label: 'Default', scale: 1, hint: 'Balanced glass type scale' },
  { id: 'comfortable', label: 'Comfortable', scale: 1.1, hint: 'Slightly larger body & headings' },
];

function isFamily(v: string | null): v is DesktopFontFamilyId {
  return v === 'geist' || v === 'inter' || v === 'system';
}

function isDensity(v: string | null): v is DesktopFontDensityId {
  return v === 'compact' || v === 'default' || v === 'comfortable';
}

export function getDesktopFontFamily(): DesktopFontFamilyId {
  try {
    const v = localStorage.getItem(FAMILY_KEY);
    return isFamily(v) ? v : 'geist';
  } catch {
    return 'geist';
  }
}

export function getDesktopFontDensity(): DesktopFontDensityId {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return isDensity(v) ? v : 'default';
  } catch {
    return 'default';
  }
}

/** Write prefs + sync html data attrs consumed by glass CSS. */
export function setDesktopFontFamily(id: DesktopFontFamilyId): void {
  try {
    localStorage.setItem(FAMILY_KEY, id);
  } catch {
    /* ignore quota */
  }
  applyDesktopFontPrefs();
}

export function setDesktopFontDensity(id: DesktopFontDensityId): void {
  try {
    localStorage.setItem(DENSITY_KEY, id);
  } catch {
    /* ignore quota */
  }
  applyDesktopFontPrefs();
}

/** Apply saved prefs to <html> so .dg-desktop-glass / .dg-glass-scope pick them up. */
export function applyDesktopFontPrefs(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.dgFont = getDesktopFontFamily();
  html.dataset.dgDensity = getDesktopFontDensity();
}
