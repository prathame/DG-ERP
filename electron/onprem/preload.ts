import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  deploymentMode: 'onprem',

  // Wizard — called during first-run setup
  activateLicense: (licenseKey: string) => ipcRenderer.invoke('activate-license', licenseKey),
  completeSetup: (data: Record<string, unknown>) => ipcRenderer.invoke('complete-setup', data),

  // Heartbeat status — read by the online indicator in the UI
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
  syncNow: () => ipcRenderer.invoke('sync-now'),

  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  sharePdfWhatsApp: (payload: { base64: string; filename: string; phone?: string; message?: string }) =>
    ipcRenderer.invoke('share-pdf-whatsapp', payload),
});
