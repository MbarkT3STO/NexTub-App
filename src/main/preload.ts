import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, DownloadRequest, AppConfig } from '../types/index.js';

/**
 * Exposes a safe, typed API to the renderer via window.electronAPI.
 * No Node APIs are exposed directly — all communication goes through IPC.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Metadata
  fetchMetadata: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FETCH_METADATA, url),

  // Download
  startDownload: (request: DownloadRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.START_DOWNLOAD, request),
  cancelDownload: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CANCEL_DOWNLOAD),

  // Progress events (renderer subscribes)
  onDownloadProgress: (cb: (progress: import('../types/index.js').DownloadProgress) => void) => {
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, (_event, data) => cb(data));
  },
  onDownloadStatus: (cb: (status: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_STATUS, (_event, status) => cb(status));
  },
  removeDownloadListeners: () => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.DOWNLOAD_PROGRESS);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.DOWNLOAD_STATUS);
  },

  // Directory
  selectDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY),

  // Config
  getConfig: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),
  saveConfig: (partial: Partial<Omit<AppConfig, 'history'>>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_CONFIG, partial),

  // History
  getHistory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY),
  clearHistory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAR_HISTORY),

  // File system
  openFile: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE, filePath),
  openFolder: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_FOLDER, filePath),
  checkFileExists: (filePath: string) =>
    ipcRenderer.invoke('check-file-exists', filePath),

  // yt-dlp status
  checkYtDlp: () => ipcRenderer.invoke('ytdlp-status'),
  onYtDlpReady: (cb: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.YTDLP_READY, () => cb());
  },
  onYtDlpUpdate: (cb: (msg: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.YTDLP_UPDATE, (_e, msg) => cb(msg));
  },

  // Open default download folder
  openDefaultDir: () => ipcRenderer.invoke(IPC_CHANNELS.OPEN_DEFAULT_DIR),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});
