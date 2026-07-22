/**
 * Desktop · online boot — thin window around the hosted ERP.
 */
import { app, BrowserWindow, shell, Menu, nativeImage } from 'electron';
import path from 'path';
import { CLOUD_API as CLOUD_URL } from '../shared/constants';
import { registerWhatsAppPdfShareIpc } from '../shared/whatsapp-pdf-share';

let win: BrowserWindow | null = null;

function createWindow() {
  // PNG required — Electron nativeImage often fails silently on SVG
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../public/icons/icon-512.png'));

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Dhandho',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#ffffff',
    show: false,
  });

  Menu.setApplicationMenu(null);

  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'X-DG-Client': 'electron-cloud' } });
  });

  win.loadURL(`${CLOUD_URL}?desktop=1`);

  win.webContents.once('did-finish-load', () => {
    win?.webContents
      .executeJavaScript(
        `
      (function() {
        var slug = localStorage.getItem('dg_last_slug');
        if (slug && window.location.pathname === '/') {
          window.location.href = '/' + slug;
        }
      })();
    `,
      )
      .catch(function () {});
  });

  win.once('ready-to-show', () => win?.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || url.startsWith('about:blank')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    try {
      const u = new URL(url);
      if (url.startsWith(CLOUD_URL)) {
        return { action: 'allow' };
      }
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch {
      /* ignore invalid URLs */
    }
    return { action: 'deny' };
  });

  win.on('closed', () => {
    win = null;
  });
}

/** Start Online (cloud) desktop. Call after app.whenReady(). */
export function bootOnline(): void {
  registerWhatsAppPdfShareIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
