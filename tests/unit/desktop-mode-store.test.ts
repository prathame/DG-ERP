import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  __resetDesktopModeForTests,
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
    __resetDesktopModeForTests(dir);
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

  it('rejects flip after latch', () => {
    setDesktopModeOnce(dir, 'online');
    const r = setDesktopModeOnce(dir, 'offline');
    expect(r.ok).toBe(false);
    expect(r.mode).toBe('online');
    expect(r.reason).toMatch(/reinstall/i);
    expect(readDesktopMode(dir)).toBe('online');
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
