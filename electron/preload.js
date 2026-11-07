const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  getDesktopStatus: () => ipcRenderer.invoke('get-desktop-status'),
  checkSystemReadiness: () => ipcRenderer.invoke('check-system-readiness'),
  startOllama: () => ipcRenderer.invoke('start-ollama'),
  downloadOllama: () => ipcRenderer.invoke('download-ollama'),
  pullModel: (modelName) => ipcRenderer.invoke('pull-model', modelName),
  onOllamaDownloadProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on('ollama-download-progress', listener);
    return () => ipcRenderer.removeListener('ollama-download-progress', listener);
  },
  onModelProgress: (callback) => {
    const listener = (event, progress) => callback(progress);
    ipcRenderer.on('model-pull-progress', listener);
    return () => ipcRenderer.removeListener('model-pull-progress', listener);
  }
});

