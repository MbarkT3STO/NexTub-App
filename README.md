# NexTub — YouTube Downloader & Converter

A production-ready desktop app built with Electron + TypeScript featuring a neumorphic UI.

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
npm install
```

## Development

Build TypeScript (one-shot):
```bash
npm run build
```

Watch mode (two terminals):
```bash
npx tsc -w -p tsconfig.main.json
npx tsc -w -p tsconfig.renderer.json
```

Run the app:
```bash
npx electron .
```

Or build + run in one step:
```bash
npm start
```

## Distribution

```bash
# Current platform
npm run dist

# Specific platforms
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Output goes to `release/`.

## Architecture

```
src/
├── main/           Electron main process + preload (IPC bridge)
├── renderer/       HTML + CSS + TypeScript UI (no frameworks)
├── services/       YouTubeService, DownloadService, ConfigService
├── utils/          sanitize, logger helpers
├── types/          Shared TypeScript interfaces + IPC channel names
└── assets/         Icons
```

## Features

- Download YouTube videos as MP4 (highest quality)
- Convert and download as MP3 (320kbps via ffmpeg)
- Real-time progress bar with speed/size info
- Neumorphic light/dark theme with smooth transitions
- Persistent theme + download directory preferences
- Download history (last 50 items)
- Drag & drop URL support
- Clipboard auto-detect on window focus
- Custom frameless titlebar with window controls
- Secure IPC via contextBridge (no Node in renderer)
