import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    deploymentMode: 'onprem',
    // Wizard — called during first-run setup
    activateLicense: (licenseKey) => ipcRenderer.invoke('activate-license', licenseKey),
    completeSetup: (data) => ipcRenderer.invoke('complete-setup', data),
    // Heartbeat status — read by the online indicator in the UI
    getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
    syncNow: () => ipcRenderer.invoke('sync-now'),
});
