import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  clearDesktopMode,
  readDesktopMode,
  resolveDesktopMode,
  setDesktopModeOnce,
} from '../../electron/desktop/mode-store';

describe('desktop mode-store', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-desktop-mode-'));
  });

  afterEach(() => {
    clearDesktopMode(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts unset', () => {
    expect(readDesktopMode(dir)).toBeNull();
  });

  it('sets mode once', () => {
    expect(setDesktopModeOnce(dir, 'online')).toEqual({ ok: true, mode: 'online' });
    expect(readDesktopMode(dir)).toBe('online');
    expect(setDesktopModeOnce(dir, 'online')).toEqual({ ok: true, mode: 'online' });
  });

  it('rejects flip after latch until cleared', () => {
    setDesktopModeOnce(dir, 'online');
    const r = setDesktopModeOnce(dir, 'offline');
    expect(r.ok).toBe(false);
    expect(r.mode).toBe('online');
    expect(r.reason).toMatch(/Change mode/i);
    expect(readDesktopMode(dir)).toBe('online');
    clearDesktopMode(dir);
    expect(readDesktopMode(dir)).toBeNull();
    expect(setDesktopModeOnce(dir, 'offline')).toEqual({ ok: true, mode: 'offline' });
  });

  it('resolve upgrades from offline license when unset', () => {
    expect(resolveDesktopMode(dir, true)).toBe('offline');
    expect(readDesktopMode(dir)).toBe('offline');
  });

  it('resolve returns null when no latch and no license', () => {
    expect(resolveDesktopMode(dir, false)).toBeNull();
  });

  it('resolve prefers existing latch over license', () => {
    setDesktopModeOnce(dir, 'online');
    expect(resolveDesktopMode(dir, true)).toBe('online');
  });
});
