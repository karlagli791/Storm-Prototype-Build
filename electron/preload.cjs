const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stormDesktop', {
  version: () => ipcRenderer.invoke('storm:version'),
  setFullscreen: (on) => ipcRenderer.send('storm:fullscreen', on),
  onUpdateReady: (cb) => ipcRenderer.on('storm:update-ready', () => cb()),
});
