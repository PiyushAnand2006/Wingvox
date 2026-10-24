// preload — safe bridge: tells the app it's running capture-protected on the desktop
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wingvoxDesktop', {
  platform: process.platform,
  // initial protection state (main defaults it to true)
  captureProtected: true,
  onProtectionChanged: (cb) => ipcRenderer.on('wingvox:protection-changed', (_e, on) => cb(on)),
  setProtection: (on) => ipcRenderer.send('wingvox:set-protection', on),
  onHotkey: (cb) => ipcRenderer.on('wingvox:hotkey', (_e, action) => cb(action)),
  setSize: (opts) => ipcRenderer.send('wingvox:set-size', opts),
  moveWindow: (dx, dy) => ipcRenderer.send('wingvox:move-window', { dx, dy }),
  ready: () => ipcRenderer.send('wingvox:ready'),
});
