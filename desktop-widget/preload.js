const { contextBridge, ipcRenderer } = require('electron');

// contextIsolation is on (no nodeIntegration) — the renderer can't reach ipcRenderer or
// the main-process `app`/BrowserWindow directly, so this is the deliberate hole poked
// through for the widget's own window controls (frame:false means no native ones).
contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: () => ipcRenderer.send('quit-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
});
