declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    audioBitrate(bitrate: number): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    format(fmt: string): FfmpegCommand;
    on(event: 'progress', cb: (progress: { percent?: number; timemark?: string }) => void): FfmpegCommand;
    on(event: 'end', cb: () => void): FfmpegCommand;
    on(event: 'error', cb: (err: Error) => void): FfmpegCommand;
    save(path: string): FfmpegCommand;
  }

  interface FfmpegStatic {
    (input?: string): FfmpegCommand;
    setFfmpegPath(path: string): void;
  }

  const ffmpeg: FfmpegStatic;
  export = ffmpeg;
}
