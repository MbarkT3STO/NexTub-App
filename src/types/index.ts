export interface VideoMetadata {
  title: string;
  duration: number; // seconds
  thumbnail: string;
  author: string;
  videoId: string;
  formats: VideoFormat[];
}

export interface VideoFormat {
  itag: number;
  quality: string;
  mimeType: string;
  bitrate?: number;
  audioBitrate?: number;
}

export type DownloadType = 'mp4' | 'mp3';

export type DownloadStatus =
  | 'idle'
  | 'fetching-metadata'
  | 'downloading'
  | 'converting'
  | 'completed'
  | 'error';

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
  speed: number; // bytes/sec
}

export interface DownloadRequest {
  url: string;
  type: DownloadType;
  outputDir: string;
  quality?: VideoQuality;
}

export type VideoQuality = '1080p' | '720p' | '480p' | '360p' | 'best';

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface DownloadHistoryItem {
  id: string;
  title: string;
  thumbnail: string;
  type: DownloadType;
  filePath: string;
  downloadedAt: number; // timestamp
  duration: number;
}

export interface AppConfig {
  theme: 'light' | 'dark';
  defaultDownloadDir: string;
  history: DownloadHistoryItem[];
}

// IPC channel names
export const IPC_CHANNELS = {
  FETCH_METADATA: 'fetch-metadata',
  START_DOWNLOAD: 'start-download',
  CANCEL_DOWNLOAD: 'cancel-download',
  DOWNLOAD_PROGRESS: 'download-progress',
  DOWNLOAD_STATUS: 'download-status',
  DOWNLOAD_COMPLETE: 'download-complete',
  DOWNLOAD_ERROR: 'download-error',
  SELECT_DIRECTORY: 'select-directory',
  GET_CONFIG: 'get-config',
  SAVE_CONFIG: 'save-config',
  OPEN_FILE: 'open-file',
  OPEN_FOLDER: 'open-folder',
  GET_HISTORY: 'get-history',
  CLEAR_HISTORY: 'clear-history',
  YTDLP_READY: 'ytdlp-ready',
  YTDLP_DOWNLOADING: 'ytdlp-downloading',
  OPEN_DEFAULT_DIR: 'open-default-dir',
  YTDLP_UPDATE: 'ytdlp-update',
} as const;
