import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ChildProcess, spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { BrowserWindow } from 'electron';
import { getYtDlp } from './ytdlp.manager.js';
import { YouTubeService } from './youtube.service.js';
import { ConfigService } from './config.service.js';
import {
  DownloadRequest,
  DownloadResult,
  IPC_CHANNELS,
} from '../types/index.js';
import { sanitizeFilename, generateId } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';

export class DownloadService {
  private youtubeService: YouTubeService;
  private configService: ConfigService;

  // Track every active child process so cancel() can kill them immediately
  private activeProcs: Set<ChildProcess> = new Set();
  private cancelled = false;

  constructor(youtubeService: YouTubeService, configService: ConfigService) {
    this.youtubeService = youtubeService;
    this.configService = configService;
  }

  cancel(): void {
    this.cancelled = true;
    for (const proc of this.activeProcs) {
      try {
        // SIGKILL — no grace period, instant termination
        proc.kill('SIGKILL');
      } catch { /* already dead */ }
    }
    this.activeProcs.clear();
  }

  private registerProc(proc: ChildProcess): ChildProcess {
    this.activeProcs.add(proc);
    proc.on('close', () => this.activeProcs.delete(proc));
    proc.on('error', () => this.activeProcs.delete(proc));
    return proc;
  }

  async download(request: DownloadRequest, win: BrowserWindow): Promise<DownloadResult> {
    // Reset cancel state for this new download
    this.cancelled = false;
    this.activeProcs.clear();

    const send = (channel: string, data: unknown) => {
      if (!win.isDestroyed()) win.webContents.send(channel, data);
    };
    const sendStatus = (s: string) => send(IPC_CHANNELS.DOWNLOAD_STATUS, s);
    const sendProgress = (percent: number, speed = 0, downloaded = 0, total = 0) =>
      send(IPC_CHANNELS.DOWNLOAD_PROGRESS, { percent, speed, downloaded, total });

    const ffmpegPath = ffmpegStatic ?? 'ffmpeg';

    try {
      if (!fs.existsSync(request.outputDir)) {
        fs.mkdirSync(request.outputDir, { recursive: true });
      }

      sendStatus('Fetching video info...');
      const metadata = await this.youtubeService.getMetadata(request.url);
      if (this.cancelled) return { success: false, error: 'Download cancelled' };

      const safeTitle = sanitizeFilename(metadata.title);
      const ytdlp = await getYtDlp();

      // ── Helpers ────────────────────────────────────────────────────────────

      /** Run a yt-dlp command, track the process, reject on cancel or error */
      const runYtDlp = (
        args: string[],
        onProgress: (pct: number, speed: string) => void
      ): Promise<void> =>
        new Promise((resolve, reject) => {
          if (this.cancelled) return reject(new Error('cancelled'));

          const proc = ytdlp.exec(args, {});
          // yt-dlp-wrap returns an EventEmitter wrapping the child process
          // Access the underlying ChildProcess to be able to kill it
          const child = (proc as unknown as { ytDlpProcess?: ChildProcess }).ytDlpProcess
            ?? (proc as unknown as ChildProcess);
          this.registerProc(child as ChildProcess);

          proc.on('ytDlpEvent', (_: string, data: string) => {
            if (this.cancelled) { (child as ChildProcess).kill?.('SIGKILL'); return; }
            const pct = data.match(/(\d+\.?\d*)%/);
            const spd = data.match(/at\s+([\d.]+\w+\/s)/);
            if (pct) onProgress(parseFloat(pct[1]!), spd?.[1] ?? '');
          });
          proc.on('error', (err: Error) => reject(err));
          proc.on('close', () => {
            if (this.cancelled) reject(new Error('cancelled'));
            else resolve();
          });
        });

      /** Run ffmpeg, track the process, kill on cancel */
      const runFfmpeg = (
        args: string[],
        onProgress?: (pct: number) => void
      ): Promise<void> =>
        new Promise((resolve, reject) => {
          if (this.cancelled) return reject(new Error('cancelled'));

          const proc = this.registerProc(spawn(ffmpegPath, args));
          let duration = 0;
          let stderr = '';

          proc.stderr?.on('data', (chunk: Buffer) => {
            if (this.cancelled) { proc.kill('SIGKILL'); return; }
            const line = chunk.toString();
            stderr += line;
            if (!duration) {
              const dm = line.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
              if (dm) duration = +dm[1]! * 3600 + +dm[2]! * 60 + parseFloat(dm[3]!);
            }
            if (onProgress && duration > 0) {
              const tm = line.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
              if (tm) {
                const cur = +tm[1]! * 3600 + +tm[2]! * 60 + parseFloat(tm[3]!);
                onProgress(Math.min(cur / duration, 1));
              }
            }
          });

          proc.on('close', (code) => {
            if (this.cancelled) return reject(new Error('cancelled'));
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
          });
          proc.on('error', reject);
        });

      // ── MP4 ────────────────────────────────────────────────────────────────
      if (request.type === 'mp4') {
        const outputPath = path.join(request.outputDir, `${safeTitle}.mp4`);
        const tempId = generateId();
        const tempVideo = path.join(os.tmpdir(), `nextub_${tempId}_video.mp4`);
        const tempAudio = path.join(os.tmpdir(), `nextub_${tempId}_audio.m4a`);

        const cleanup = () => {
          for (const f of [tempVideo, tempAudio]) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
          }
        };

        const quality = request.quality ?? 'best';
        const heightMap: Record<string, string> = {
          '1080p': '[height<=1080]', '720p': '[height<=720]',
          '480p':  '[height<=480]',  '360p': '[height<=360]', 'best': '',
        };
        const hf = heightMap[quality] ?? '';
        const videoFormat = `bestvideo${hf}[ext=mp4]/bestvideo${hf}`;

        // Pass 1 — video
        sendStatus(`Downloading video stream (${quality})...`);
        try {
          await runYtDlp(
            [request.url, '-f', videoFormat, '-o', tempVideo, '--no-playlist', '--newline'],
            (pct, spd) => {
              sendProgress(pct * 0.45);
              sendStatus(`Downloading video… ${spd}`);
            }
          );
        } catch (e) {
          cleanup();
          if (this.cancelled) return { success: false, error: 'Download cancelled' };
          throw e;
        }

        if (this.cancelled) { cleanup(); return { success: false, error: 'Download cancelled' }; }

        // Pass 2 — audio
        sendStatus('Downloading audio stream...');
        try {
          await runYtDlp(
            [request.url, '-f', 'bestaudio[ext=m4a]/bestaudio', '-o', tempAudio, '--no-playlist', '--newline'],
            (pct, spd) => {
              sendProgress(45 + pct * 0.45);
              sendStatus(`Downloading audio… ${spd}`);
            }
          );
        } catch (e) {
          cleanup();
          if (this.cancelled) return { success: false, error: 'Download cancelled' };
          throw e;
        }

        if (this.cancelled) { cleanup(); return { success: false, error: 'Download cancelled' }; }

        // Pass 3 — merge
        sendStatus('Merging audio & video...');
        sendProgress(92);
        try {
          await runFfmpeg([
            '-i', tempVideo, '-i', tempAudio,
            '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', '-y', outputPath,
          ]);
        } catch (e) {
          cleanup();
          if (this.cancelled) return { success: false, error: 'Download cancelled' };
          throw e;
        }

        cleanup();
        if (this.cancelled) return { success: false, error: 'Download cancelled' };

        sendProgress(100);
        sendStatus('Download complete!');
        this.configService.addHistory({
          id: generateId(), title: metadata.title, thumbnail: metadata.thumbnail,
          type: 'mp4', filePath: outputPath, downloadedAt: Date.now(), duration: metadata.duration,
        });
        return { success: true, filePath: outputPath };

      // ── MP3 ────────────────────────────────────────────────────────────────
      } else {
        const outputPath = path.join(request.outputDir, `${safeTitle}.mp3`);
        const tempBase = path.join(os.tmpdir(), `nextub_${generateId()}`);
        const tempOutput = `${tempBase}.%(ext)s`;

        sendStatus('Downloading audio...');
        try {
          await runYtDlp(
            [request.url, '-f', 'bestaudio', '-o', tempOutput, '--no-playlist', '--newline'],
            (pct, spd) => {
              sendProgress(pct * 0.6);
              sendStatus(`Downloading audio… ${spd}`);
            }
          );
        } catch (e) {
          if (this.cancelled) return { success: false, error: 'Download cancelled' };
          throw e;
        }

        if (this.cancelled) return { success: false, error: 'Download cancelled' };

        const tempDir = path.dirname(tempBase);
        const tempBaseName = path.basename(tempBase);
        const tempFiles = fs.readdirSync(tempDir).filter(f => f.startsWith(tempBaseName));
        if (tempFiles.length === 0) throw new Error('Downloaded audio file not found');
        const tempFilePath = path.join(tempDir, tempFiles[0]!);

        sendStatus('Converting to MP3...');
        sendProgress(65);
        try {
          await runFfmpeg(
            ['-i', tempFilePath, '-vn', '-ab', '320k', '-ar', '44100', '-y', outputPath],
            (ratio) => sendProgress(65 + ratio * 34)
          );
        } catch (e) {
          fs.unlink(tempFilePath, () => {});
          if (this.cancelled) return { success: false, error: 'Download cancelled' };
          throw e;
        }

        fs.unlink(tempFilePath, () => {});
        if (this.cancelled) return { success: false, error: 'Download cancelled' };

        sendProgress(100);
        sendStatus('Conversion complete!');
        this.configService.addHistory({
          id: generateId(), title: metadata.title, thumbnail: metadata.thumbnail,
          type: 'mp3', filePath: outputPath, downloadedAt: Date.now(), duration: metadata.duration,
        });
        return { success: true, filePath: outputPath };
      }

    } catch (err) {
      if (this.cancelled) return { success: false, error: 'Download cancelled' };
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Download failed:', message);
      return { success: false, error: message };
    }
  }
}
