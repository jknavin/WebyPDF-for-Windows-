const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  setTheme: (t) => ipcRenderer.send('theme', t),
  reveal: (p) => ipcRenderer.send('reveal', p),
  onSaved: (cb) => ipcRenderer.on('saved', (_e, p) => cb(p)),
});
