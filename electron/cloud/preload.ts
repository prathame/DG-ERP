import { contextBridge, ipcRenderer } from 'electron';

// Minimal bridge — cloud app doesn't need IPC beyond version info
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  deploymentMode: 'cloud',
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
});
