import { app, BrowserWindow, shell, Menu, nativeImage } from 'electron';
import path from 'path';

const CLOUD_URL = process.env.DG_CLOUD_URL || 'https://dg-erp.onrender.com';

let win: BrowserWindow | null = null;

function createWindow() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../public/icons/icon-192.svg')
  );

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DG ERP',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#ffffff',
    show: false,
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  // Tag every request so server knows it's coming from the Electron app
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'X-DG-Client': 'electron-cloud' } });
  });

  win.loadURL(CLOUD_URL);

  // Show window once loaded — avoids white flash
  win.once('ready-to-show', () => win?.show());

  // Open external links in system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(CLOUD_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
