/**
 * Electron shell for the STORM prototype: a frameless-free desktop window around the Vite build.
 * - `npm run desktop`  → builds and opens the window (dist/index.html, file://)
 * - `npm run dist:win` → portable .exe + NSIS installer in release/ (electron-builder)
 * Updates: electron-updater polls the GitHub releases of karlagli791/Storm-Prototype-Build
 * (publish config in package.json). It is a no-op in dev and when the app is not packaged.
 */
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');

// Gamepad polling + WebGL: keep the renderer at full speed even when the window is unfocused.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#0a0a0f',
    title: 'STORM Prototype Build',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const devUrl = process.env.STORM_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}

app.whenReady().then(() => {
  createWindow();
  ipcMain.handle('storm:version', () => app.getVersion());
  ipcMain.on('storm:fullscreen', (e, on) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) w.setFullScreen(!!on);
  });
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = true;
      autoUpdater.on('update-downloaded', () => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('storm:update-ready');
      });
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    } catch {
      /* updater not available in this build */
    }
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
