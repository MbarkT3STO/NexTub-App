import { getYtDlp } from './ytdlp.manager.js';
import { VideoMetadata } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class YouTubeService {
  async getMetadata(url: string): Promise<VideoMetadata> {
    logger.info('Fetching metadata for:', url);

    const ytdlp = await getYtDlp();

    // Use execPromise with --dump-json for reliable metadata extraction.
    // --no-playlist ensures we only get the single video, not the whole list.
    // --socket-timeout prevents hanging on slow connections.
    const jsonStr = await Promise.race([
      ytdlp.execPromise([
        url,
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        '--socket-timeout', '15',
      ]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Metadata fetch timed out. Check your internet connection.')), 30_000)
      ),
    ]);

    let info: Record<string, unknown>;
    try {
      // execPromise returns stdout — may contain multiple JSON lines for playlists,
      // we only want the first one.
      const firstLine = (jsonStr as string).split('\n').find((l) => l.trim().startsWith('{'));
      if (!firstLine) throw new Error('No JSON output from yt-dlp');
      info = JSON.parse(firstLine) as Record<string, unknown>;
    } catch {
      throw new Error('Failed to parse video info. The URL may be invalid or the video unavailable.');
    }

    const thumbnail =
      (info['thumbnail'] as string | undefined) ??
      ((info['thumbnails'] as Array<{ url: string; width?: number }> | undefined)
        ?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url) ??
      '';

    const rawTitle = (info['title'] as string) ?? '';
    const isFacebook = /facebook\.com|fb\.watch/.test(url);

    let title: string;
    if (isFacebook) {
      // Facebook uses the post body as the title — grab only the first line/sentence
      // and cap it so it doesn't bleed into description territory.
      const firstLine = rawTitle
        .split(/[\n\r]+/)[0]!          // first line only
        .split(/[.!?]\s/)[0]!          // first sentence only
        .trim();
      title = firstLine.substring(0, 80) || 'Facebook Video';
    } else {
      title = rawTitle || 'Unknown Title';
    }

    return {
      title,
      duration: (info['duration'] as number) ?? 0,
      thumbnail,
      author: (info['uploader'] as string) ?? (info['channel'] as string) ?? 'Unknown',
      videoId: (info['id'] as string) ?? '',
      formats: [],
    };
  }
}
