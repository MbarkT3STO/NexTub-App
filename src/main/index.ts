import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { YouTubeService } from '../services/youtube.service.js';
import { DownloadService } from '../services/download.service.js';
import { ConfigService } from '../services/config.service.js';
import { getYtDlp, autoUpdateYtDlp } from '../services/ytdlp.manager.js';
import { IPC_CHANNELS, DownloadRequest } from '../types/index.js';
import { isValidYouTubeUrl } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

// ── Services ──────────────────────────────────────────────────────────────────
const configService = new ConfigService();
const youtubeService = new YouTubeService();
const downloadService = new DownloadService(youtubeService, configService);

let mainWindow: BrowserWindow | null = null;

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(): void {
  const { screen } = require('electron');
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const w = Math.round(sw * 0.70);
  const h = Math.round(sh * 0.70);

  mainWindow = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 560,
    minHeight: 500,
    resizable: true,
    maximizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../../src/assets/icon.png'),
  });

  mainWindow.loadFile(
    path.join(__dirname, '../../../src/renderer/index.html')
  );

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Ensure yt-dlp is ready, then auto-update in background
  getYtDlp()
    .then(() => {
      mainWindow?.webContents.send(IPC_CHANNELS.YTDLP_READY);
      logger.info('yt-dlp ready');
      // Auto-update silently after window is ready
      autoUpdateYtDlp((msg) => {
        logger.info(msg);
        mainWindow?.webContents.send(IPC_CHANNELS.YTDLP_UPDATE, msg);
      });
    })
    .catch((err) => logger.warn('yt-dlp init failed:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Fetch video metadata
ipcMain.handle(IPC_CHANNELS.FETCH_METADATA, async (_event, url: string) => {
  if (!isValidYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL. Please enter a valid YouTube link.');
  }
  return youtubeService.getMetadata(url);
});

// Start download
ipcMain.handle(
  IPC_CHANNELS.START_DOWNLOAD,
  async (_event, request: DownloadRequest) => {
    if (!mainWindow) throw new Error('No window available');
    if (!isValidYouTubeUrl(request.url)) {
      throw new Error('Invalid YouTube URL.');
    }
    return downloadService.download(request, mainWindow);
  }
);

// Cancel download
ipcMain.handle(IPC_CHANNELS.CANCEL_DOWNLOAD, () => {
  downloadService.cancel();
});

// Select output directory
ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Download Folder',
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const dir = result.filePaths[0];
    configService.updateConfig({ defaultDownloadDir: dir });
    return dir;
  }
  return null;
});

// Config
ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => configService.getConfig());
ipcMain.handle(IPC_CHANNELS.SAVE_CONFIG, (_event, partial) => {
  configService.updateConfig(partial);
});

// History
ipcMain.handle(IPC_CHANNELS.GET_HISTORY, () => configService.getHistory());
ipcMain.handle(IPC_CHANNELS.CLEAR_HISTORY, () => configService.clearHistory());

// yt-dlp status check
ipcMain.handle('ytdlp-status', async () => {
  try {
    await getYtDlp();
    return { ready: true };
  } catch (err) {
    return { ready: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// File existence check
ipcMain.handle('check-file-exists', (_event, filePath: string) => {
  const fs = require('fs');
  return fs.existsSync(filePath);
});

// Open file / folder in OS
ipcMain.handle(IPC_CHANNELS.OPEN_FILE, (_event, filePath: string) => {
  shell.openPath(filePath);
});
ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER, (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});
// Open the default download directory
ipcMain.handle(IPC_CHANNELS.OPEN_DEFAULT_DIR, () => {
  shell.openPath(configService.getConfig().defaultDownloadDir);
});

// Window controls (custom titlebar)
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

logger.info('NexTub main process started');
