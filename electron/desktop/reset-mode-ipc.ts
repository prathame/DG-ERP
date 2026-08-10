/**
 * IPC: clear Online/Offline latch and relaunch so the mode picker shows again.
 */
import { app, ipcMain } from 'electron';
import { clearDesktopMode } from './mode-store';

const CHANNEL = 'reset-desktop-mode';

export function registerResetDesktopModeIpc(): void {
  try {
    ipcMain.removeHandler(CHANNEL);
  } catch {
    /* not registered yet */
  }
  ipcMain.handle(CHANNEL, async () => {
    clearDesktopMode(app.getPath('userData'));
    // Relaunch after the invoke returns so the renderer gets { ok: true }
    setImmediate(() => {
      app.relaunch();
      app.exit(0);
    });
    return { ok: true as const };
  });
}
