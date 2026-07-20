import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopPicker', {
  chooseMode: (mode: 'online' | 'offline') => ipcRenderer.invoke('choose-desktop-mode', mode),
});
