/**
 * Unified Desktop Electron shell.
 * First launch: Online (cloud) or Offline (on-prem) picker — once.
 * Pair with `src/platforms/desktop/`.
 */
import { app, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron';
import path from 'path';
import { loadLicense } from '../onprem/license-store';
import { bootOnline } from '../cloud/boot';
import { bootOffline } from '../onprem/boot';
import { resolveDesktopMode, setDesktopModeOnce, type DesktopMode } from './mode-store';
import { migrateLegacyOnPremUserData } from './migrate-onprem-userdata';

let pickerWin: BrowserWindow | null = null;
let booting = false;

function getIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '../../public/icons/icon-192.svg'));
}

function showModePicker(): Promise<DesktopMode> {
  return new Promise((resolve, reject) => {
    let settled = false;
    pickerWin = new BrowserWindow({
      width: 480,
      height: 640,
      resizable: false,
      title: 'Dhandho — Choose mode',
      icon: getIcon(),
      webPreferences: {
        preload: path.join(__dirname, 'preload-picker.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      backgroundColor: '#0c0f12',
      show: false,
    });
    Menu.setApplicationMenu(null);
    pickerWin.loadFile(path.join(__dirname, 'picker/index.html'));
    pickerWin.once('ready-to-show', () => pickerWin?.show());

    const onChoose = async (_event: Electron.IpcMainInvokeEvent, mode: DesktopMode) => {
      if (mode !== 'online' && mode !== 'offline') {
        return { ok: false, mode: null, reason: 'Invalid mode' };
      }
      const result = setDesktopModeOnce(app.getPath('userData'), mode);
      if (result.ok && result.mode && !settled) {
        settled = true;
        ipcMain.removeHandler('choose-desktop-mode');
        pickerWin?.close();
        pickerWin = null;
        resolve(result.mode);
      }
      return result;
    };

    ipcMain.handle('choose-desktop-mode', onChoose);

    pickerWin.on('closed', () => {
      pickerWin = null;
      ipcMain.removeHandler('choose-desktop-mode');
      if (!settled) {
        settled = true;
        reject(new Error('Mode picker closed without choosing'));
      }
    });
  });
}

async function startWithMode(mode: DesktopMode): Promise<void> {
  if (booting) return;
  booting = true;
  if (mode === 'online') {
    bootOnline();
  } else {
    await bootOffline();
  }
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  // Legacy On-Prem installs used productName "Dhandho On-Prem" (different userData).
  const mig = migrateLegacyOnPremUserData(userData);
  if (mig.migrated) {
    console.log(`[desktop] migrated Offline data from ${mig.from}`);
  }

  let mode = resolveDesktopMode(userData, Boolean(loadLicense()));

  if (!mode) {
    try {
      mode = await showModePicker();
    } catch (err) {
      console.error(err);
      app.quit();
      return;
    }
  }

  await startWithMode(mode);
});
