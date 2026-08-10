import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  canChangeDesktopMode,
  desktopModeLabel,
  requestChangeDesktopMode,
} from '../../src/platforms/desktop/changeDesktopMode';

type Host = typeof globalThis & {
  confirm?: (message?: string) => boolean;
  electronAPI?: {
    isElectron?: boolean;
    deploymentMode?: string;
    resetDesktopMode?: () => Promise<{ ok?: boolean }>;
  };
};

describe('changeDesktopMode', () => {
  const g = globalThis as Host;
  let prevConfirm: Host['confirm'];
  let prevApi: Host['electronAPI'];

  beforeEach(() => {
    prevConfirm = g.confirm;
    prevApi = g.electronAPI;
    g.confirm = vi.fn(() => true);
    delete g.electronAPI;
  });

  afterEach(() => {
    if (prevConfirm) g.confirm = prevConfirm;
    else delete g.confirm;
    if (prevApi) g.electronAPI = prevApi;
    else delete g.electronAPI;
  });

  it('canChangeDesktopMode requires preload bridge', () => {
    expect(canChangeDesktopMode()).toBe(false);
    g.electronAPI = { resetDesktopMode: async () => ({ ok: true }) };
    expect(canChangeDesktopMode()).toBe(true);
  });

  it('desktopModeLabel maps deploymentMode', () => {
    expect(desktopModeLabel()).toBeNull();
    g.electronAPI = { deploymentMode: 'onprem' };
    expect(desktopModeLabel()).toBe('Offline');
    g.electronAPI = { deploymentMode: 'cloud', isElectron: true };
    expect(desktopModeLabel()).toBe('Online');
  });

  it('requestChangeDesktopMode confirms then invokes reset', async () => {
    const resetDesktopMode = vi.fn(async () => ({ ok: true }));
    g.electronAPI = { resetDesktopMode };
    expect(await requestChangeDesktopMode()).toBe(true);
    expect(g.confirm).toHaveBeenCalled();
    expect(resetDesktopMode).toHaveBeenCalled();

    (g.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(await requestChangeDesktopMode()).toBe(false);
    expect(resetDesktopMode).toHaveBeenCalledTimes(1);
  });
});
