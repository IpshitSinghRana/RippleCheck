// -----------------------------------------------------------------------------
// main.js — Electron Desktop Application Entry Point for RippleCheck
// -----------------------------------------------------------------------------

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { startBackend, stopBackend, getBackendUrl } = require('./processManager');
const {
  checkSystemReadiness,
  startOllamaDaemon,
  stopOllamaDaemon,
  pullModel,
  downloadOllamaInstaller,
  runOllamaInstaller,
  REQUIRED_MODEL
} = require('./dependencyInstaller');

let mainWindow = null;
let backendUrl = null;

async function createWindow() {
  const iconPath = path.join(__dirname, '../build/icon.ico');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'RippleCheck Desktop',
    backgroundColor: '#0a0a0c',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // In production desktop, load the static built frontend;
  // in development, if dev server is running, we can load it.
  const isDev = process.env.NODE_ENV === 'development';
  const devServerUrl = process.env.ELECTRON_START_URL;

  if (isDev && devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, '../frontend/dist/index.html');
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-backend-url', () => {
  return backendUrl;
});

ipcMain.handle('get-desktop-status', () => {
  return {
    isDesktop: true,
    platform: process.platform,
    backendUrl
  };
});

ipcMain.handle('check-system-readiness', async () => {
  return await checkSystemReadiness();
});

ipcMain.handle('start-ollama', async () => {
  return await startOllamaDaemon();
});

ipcMain.handle('download-ollama', async () => {
  const installerPath = await downloadOllamaInstaller((progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ollama-download-progress', progress);
    }
  });
  return await runOllamaInstaller(installerPath);
});

ipcMain.handle('pull-model', async (event, modelName) => {
  const target = modelName || REQUIRED_MODEL;
  return await pullModel(target, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('model-pull-progress', progress);
    }
  });
});

app.whenReady().then(async () => {
  try {
    // 1. Ensure Ollama service is supervised and running if installed
    await startOllamaDaemon();

    // 2. Launch local backend child process on dynamic 127.0.0.1 port
    backendUrl = await startBackend();
  } catch (err) {
    console.error('[Electron Main] Failed to initialize local services:', err);
  }

  // 3. Open Chromium Window
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  stopBackend();
  stopOllamaDaemon();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

