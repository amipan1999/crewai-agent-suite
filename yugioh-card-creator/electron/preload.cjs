const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cardAPI', {
  savePng: (payload) => ipcRenderer.invoke('save-png', payload),
  isElectron: true,
});
