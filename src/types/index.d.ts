export interface VideoMetadata {
    title: string;
    duration: number;
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
export type DownloadStatus = 'idle' | 'fetching-metadata' | 'downloading' | 'converting' | 'completed' | 'error';
export interface DownloadProgress {
    percent: number;
    downloaded: number;
    total: number;
    speed: number;
}
export interface DownloadRequest {
    url: string;
    type: DownloadType;
    outputDir: string;
}
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
    downloadedAt: number;
    duration: number;
}
export interface AppConfig {
    theme: 'light' | 'dark';
    defaultDownloadDir: string;
    history: DownloadHistoryItem[];
}
export declare const IPC_CHANNELS: {
    readonly FETCH_METADATA: "fetch-metadata";
    readonly START_DOWNLOAD: "start-download";
    readonly CANCEL_DOWNLOAD: "cancel-download";
    readonly DOWNLOAD_PROGRESS: "download-progress";
    readonly DOWNLOAD_STATUS: "download-status";
    readonly DOWNLOAD_COMPLETE: "download-complete";
    readonly DOWNLOAD_ERROR: "download-error";
    readonly SELECT_DIRECTORY: "select-directory";
    readonly GET_CONFIG: "get-config";
    readonly SAVE_CONFIG: "save-config";
    readonly OPEN_FILE: "open-file";
    readonly OPEN_FOLDER: "open-folder";
    readonly GET_HISTORY: "get-history";
    readonly CLEAR_HISTORY: "clear-history";
};
//# sourceMappingURL=index.d.ts.map