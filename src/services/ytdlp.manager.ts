/**
 * Manages the yt-dlp binary — downloads it on first run, caches the path,
 * and auto-updates it in the background on each launch.
 */
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import YTDlpWrap from 'yt-dlp-wrap';
import { logger } from '../utils/logger.js';

let _instance: YTDlpWrap | null = null;
let _initPromise: Promise<YTDlpWrap> | null = null;

function getBinaryPath(): string {
  const binDir = path.join(app.getPath('userData'), 'bin');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(binDir, binaryName);
}

export function getYtDlp(): Promise<YTDlpWrap> {
  if (_instance) return Promise.resolve(_instance);
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const binaryPath = getBinaryPath();

    if (!fs.existsSync(binaryPath)) {
      logger.info('Downloading yt-dlp binary to:', binaryPath);
      await Promise.race([
        YTDlpWrap.downloadFromGithub(binaryPath),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('yt-dlp binary download timed out')), 120_000)
        ),
      ]);
      logger.info('yt-dlp binary ready');
    } else {
      logger.info('yt-dlp binary found at:', binaryPath);
    }

    _instance = new YTDlpWrap(binaryPath);
    return _instance;
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });

  return _initPromise;
}

/**
 * Checks GitHub for a newer yt-dlp release and updates the binary if needed.
 * Runs silently in the background — never throws to the caller.
 */
export async function autoUpdateYtDlp(
  onUpdate?: (msg: string) => void
): Promise<void> {
  try {
    const binaryPath = getBinaryPath();
    if (!fs.existsSync(binaryPath)) return; // not installed yet, skip

    const ytdlp = await getYtDlp();

    // Get current version
    const currentVersion = (await ytdlp.getVersion()).trim();
    logger.info('yt-dlp current version:', currentVersion);

    // Get latest release tag from GitHub
    const releases = await YTDlpWrap.getGithubReleases(1, 1);
    const latestVersion: string = releases?.[0]?.tag_name ?? '';
    if (!latestVersion) return;

    logger.info('yt-dlp latest version:', latestVersion);

    if (latestVersion === currentVersion) {
      logger.info('yt-dlp is up to date');
      return;
    }

    logger.info(`Updating yt-dlp: ${currentVersion} → ${latestVersion}`);
    onUpdate?.(`Updating yt-dlp to ${latestVersion}...`);

    // Download new binary, replacing the old one
    await YTDlpWrap.downloadFromGithub(binaryPath, latestVersion);

    // Reset singleton so next call picks up the new binary
    _instance = new YTDlpWrap(binaryPath);
    _initPromise = Promise.resolve(_instance);

    logger.info('yt-dlp updated to', latestVersion);
    onUpdate?.(`yt-dlp updated to ${latestVersion}`);
  } catch (err) {
    logger.warn('yt-dlp auto-update failed (non-fatal):', err);
  }
}
