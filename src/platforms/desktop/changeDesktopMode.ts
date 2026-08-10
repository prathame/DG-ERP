/**
 * Unified desktop: restart into the Online / Offline picker.
 * Requires Electron preload `resetDesktopMode`.
 */

type ElectronBridge = {
  isElectron?: boolean;
  deploymentMode?: string;
  resetDesktopMode?: () => Promise<{ ok?: boolean }>;
};

type Host = typeof globalThis & {
  confirm?: (message?: string) => boolean;
  electronAPI?: ElectronBridge;
};

function host(): Host {
  return globalThis as Host;
}

function electronAPI(): ElectronBridge | undefined {
  return host().electronAPI;
}

export function canChangeDesktopMode(): boolean {
  return typeof electronAPI()?.resetDesktopMode === 'function';
}

export function desktopModeLabel(): 'Online' | 'Offline' | null {
  const ea = electronAPI();
  if (ea?.deploymentMode === 'onprem') return 'Offline';
  if (ea?.deploymentMode === 'cloud' || ea?.isElectron) return 'Online';
  return null;
}

const CONFIRM =
  'Switch Online / Offline mode?\n\n' +
  'The app will restart and ask you to choose again.\n' +
  'Offline company data on this computer is kept. Online uses the cloud.';

/** Confirm with the user, then clear the latch and relaunch. */
export async function requestChangeDesktopMode(): Promise<boolean> {
  const ea = electronAPI();
  if (typeof ea?.resetDesktopMode !== 'function') return false;
  const confirmFn = host().confirm;
  if (typeof confirmFn === 'function' && !confirmFn(CONFIRM)) return false;
  await ea.resetDesktopMode();
  return true;
}
