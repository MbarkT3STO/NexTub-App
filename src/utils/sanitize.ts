/**
 * Sanitizes a filename by removing/replacing characters not allowed in file systems.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // remove illegal chars
    .replace(/\s+/g, ' ')                    // collapse whitespace
    .trim()
    .substring(0, 200);                      // cap length
}

/**
 * Formats bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Formats seconds into mm:ss or hh:mm:ss.
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Formats bytes/sec into a human-readable speed string.
 */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Validates a YouTube URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}/,
    /^https?:\/\/youtu\.be\/[\w-]{11}/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]{11}/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]{11}/,
  ];
  return patterns.some((p) => p.test(url.trim()));
}

/**
 * Validates a Facebook video URL.
 */
export function isValidFacebookUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.|m\.)?facebook\.com\/.+\/videos\//,
    /^https?:\/\/(www\.|m\.)?facebook\.com\/video(\.php|\?v=)/,
    /^https?:\/\/(www\.|m\.)?facebook\.com\/watch/,
    /^https?:\/\/(www\.|m\.)?fb\.watch\//,
    /^https?:\/\/(www\.|m\.)?facebook\.com\/reel\//,
  ];
  return patterns.some((p) => p.test(url.trim()));
}

/**
 * Returns the platform for a given URL, or null if unsupported.
 */
export function detectPlatform(url: string): 'youtube' | 'facebook' | null {
  if (isValidYouTubeUrl(url)) return 'youtube';
  if (isValidFacebookUrl(url)) return 'facebook';
  return null;
}

/**
 * Validates a URL from any supported platform.
 */
export function isValidVideoUrl(url: string): boolean {
  return detectPlatform(url) !== null;
}

/**
 * Generates a unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
