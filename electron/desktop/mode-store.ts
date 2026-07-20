/**
 * One-time Online/Offline latch for the unified Electron desktop shell.
 * Pure fs helpers (no Electron import) so unit tests can use a temp dir.
 */
import fs from 'fs';
import path from 'path';

export type DesktopMode = 'online' | 'offline';

export const DESKTOP_MODE_FILENAME = 'desktop-mode.json';

export function desktopModePath(userDataDir: string): string {
  return path.join(userDataDir, DESKTOP_MODE_FILENAME);
}

export function readDesktopMode(userDataDir: string): DesktopMode | null {
  try {
    const raw = fs.readFileSync(desktopModePath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw) as { mode?: unknown };
    if (parsed.mode === 'online' || parsed.mode === 'offline') return parsed.mode;
  } catch {
    /* missing or corrupt */
  }
  return null;
}

/**
 * Set mode once. Same value is idempotent OK; different value is rejected.
 */
export function setDesktopModeOnce(
  userDataDir: string,
  mode: DesktopMode,
): { ok: boolean; mode: DesktopMode | null; reason?: string } {
  const existing = readDesktopMode(userDataDir);
  if (existing != null) {
    if (existing === mode) return { ok: true, mode: existing };
    return { ok: false, mode: existing, reason: 'Desktop mode already set; reinstall to change' };
  }
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(desktopModePath(userDataDir), JSON.stringify({ mode }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return { ok: true, mode };
}

/**
 * Resolve mode for boot: existing latch, else offline if license.dat present, else null (show picker).
 */
export function resolveDesktopMode(userDataDir: string, hasOfflineLicense: boolean): DesktopMode | null {
  const existing = readDesktopMode(userDataDir);
  if (existing) return existing;
  if (hasOfflineLicense) {
    const r = setDesktopModeOnce(userDataDir, 'offline');
    return r.mode;
  }
  return null;
}

/** Test helper */
export function __resetDesktopModeForTests(userDataDir: string): void {
  try {
    fs.unlinkSync(desktopModePath(userDataDir));
  } catch {
    /* ignore */
  }
}
