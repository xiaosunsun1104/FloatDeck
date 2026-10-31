const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('duoview', {
  getState: () => ipcRenderer.invoke('duoview:state'),
  save: config => ipcRenderer.invoke('duoview:save', config),
  bind: (slot, action, key) => ipcRenderer.invoke('duoview:bind', slot, action, key),
  add: () => ipcRenderer.invoke('duoview:add'),
  remove: slot => ipcRenderer.invoke('duoview:remove', slot),
  open: slot => ipcRenderer.invoke('duoview:open', slot),
  close: slot => ipcRenderer.invoke('duoview:close', slot),
  login: (slot, enabled) => ipcRenderer.invoke('duoview:login', slot, enabled),
  compact: (slot, value) => ipcRenderer.invoke('duoview:compact', slot, value),
  command: (slot, action) => ipcRenderer.invoke('duoview:command', slot, action),
  onState: callback => ipcRenderer.on('duoview:changed', (_event, value) => callback(value))
});
