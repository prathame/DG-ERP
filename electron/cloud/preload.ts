import { contextBridge, ipcRenderer } from 'electron';

// Minimal bridge — cloud app doesn't need IPC beyond version info + WhatsApp PDF share
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  deploymentMode: 'cloud',
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  sharePdfWhatsApp: (payload: { base64: string; filename: string; phone?: string; message?: string }) =>
    ipcRenderer.invoke('share-pdf-whatsapp', payload),
});
