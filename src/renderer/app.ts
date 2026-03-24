export {};

// ── Types ─────────────────────────────────────────────────────────────────────
interface VideoMetadata { title: string; duration: number; thumbnail: string; author: string; videoId: string; }
interface DownloadProgress { percent: number; downloaded: number; total: number; speed: number; eta: number; }
interface DownloadResult { success: boolean; filePath?: string; error?: string; }
interface DownloadHistoryItem { id: string; title: string; thumbnail: string; type: 'mp4' | 'mp3'; filePath: string; downloadedAt: number; duration: number; }
interface AppConfig { theme: 'light' | 'dark'; defaultDownloadDir: string; history: DownloadHistoryItem[]; }

declare global {
  interface Window {
    electronAPI: {
      fetchMetadata(url: string): Promise<VideoMetadata>;
      startDownload(req: { url: string; type: 'mp4' | 'mp3'; outputDir: string; quality?: string; customName?: string }): Promise<DownloadResult>;
      cancelDownload(): Promise<void>;
      onDownloadProgress(cb: (p: DownloadProgress) => void): void;
      onDownloadStatus(cb: (s: string) => void): void;
      removeDownloadListeners(): void;
      selectDirectory(): Promise<string | null>;
      getConfig(): Promise<AppConfig>;
      saveConfig(partial: Partial<Omit<AppConfig, 'history'>>): Promise<void>;
      getHistory(): Promise<DownloadHistoryItem[]>;
      clearHistory(): Promise<void>;
      openFile(path: string): Promise<void>;
      openFolder(path: string): Promise<void>;
      checkFileExists(path: string): Promise<boolean>;
      minimizeWindow(): void;
      closeWindow(): void;
      checkYtDlp(): Promise<{ ready: boolean; error?: string }>;
      onYtDlpReady(cb: () => void): void;
      onYtDlpUpdate(cb: (msg: string) => void): void;
      openDefaultDir(): Promise<void>;
      getFileUrl(filePath: string): Promise<string>;
    };
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentMeta: VideoMetadata | null = null;
let downloadDir = '';
let lastFilePath = '';
let isDownloading = false;

// ── DOM ───────────────────────────────────────────────────────────────────────
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const urlInput        = el<HTMLInputElement>('urlInput');
const urlError        = el('urlError');
const urlWrapper      = el('urlInputWrapper');
const clearUrlBtn     = el<HTMLButtonElement>('clearUrlBtn');
const fetchBtn        = el<HTMLButtonElement>('fetchBtn');
const previewCard     = el('previewCard');
const thumbnail       = el<HTMLImageElement>('thumbnail');
const durationBadge   = el('durationBadge');
const videoTitle      = el('videoTitle');
const videoAuthor     = el('videoAuthor');
const downloadDirText = el('downloadDirText');
const changeDirBtn    = el<HTMLButtonElement>('changeDirBtn');
const qualitySelect   = el<HTMLSelectElement>('qualitySelect');
const filenameInput   = el<HTMLInputElement>('filenameInput');
const filenameExt     = el('filenameExt');
const actionRow       = el('actionRow');
const downloadVideoBtn = el<HTMLButtonElement>('downloadVideoBtn');
const downloadAudioBtn = el<HTMLButtonElement>('downloadAudioBtn');
const themeToggle     = el<HTMLButtonElement>('themeToggle');
const openDirBtn      = el<HTMLButtonElement>('openDirBtn');
const historyList     = el('historyList');
const historyEmpty    = el('historyEmpty');
const clearHistoryBtn = el<HTMLButtonElement>('clearHistoryBtn');
const toast           = el('toast');
const dragOverlay     = el('dragOverlay');
const historyCount    = el('historyCount');

// Modal elements
const dlOverlay       = el('dlModalOverlay');
const dlModalIcon     = el('dlModalIcon');
const dlModalTitle    = el('dlModalTitle');
const dlModalSub      = el('dlModalSub');
const dlModalClose    = el<HTMLButtonElement>('dlModalClose');
const dlProgressView  = el('dlProgressView');
const dlResultView    = el('dlResultView');
const progressPercent = el('progressPercent');
const progressBytes   = el('progressBytes');
const progressSpeed   = el('progressSpeed');
const progressEta     = el('progressEta');
const progressTrack   = el('progressTrack');
const progressFill    = el('progressFill');
const progressStatus  = el('progressStatus');
const cancelBtn       = el<HTMLButtonElement>('cancelBtn');
const resultIconSuccess = el('resultIconSuccess');
const resultIconError   = el('resultIconError');
const resultMessage   = el('resultMessage');
const resultPath      = el('resultPath');
const resultActions   = el('resultActions');
const openFileBtn     = el<HTMLButtonElement>('openFileBtn');
const openFolderBtn   = el<HTMLButtonElement>('openFolderBtn');
const newDownloadBtn  = el<HTMLButtonElement>('newDownloadBtn');
const playFileBtn     = el<HTMLButtonElement>('playFileBtn');
// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '—';
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string, type: 'default' | 'update' | 'error' = 'default'): void {
  toast.className = 'toast';
  if (type !== 'default') toast.classList.add(`toast--${type}`);
  const msgEl = toast.querySelector('.toast__msg');
  if (msgEl) msgEl.textContent = msg;
  toast.classList.add('toast--visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('toast--visible'), 3000);
}

function setError(msg: string): void {
  urlError.textContent = msg;
  if (msg) urlWrapper.style.borderColor = 'var(--c-danger)';
  else urlWrapper.style.borderColor = '';
}

function setFetchLoading(loading: boolean): void {
  if (loading) {
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<span class="spinner"></span><span>Fetching…</span>';
  } else {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span>Fetch</span>';
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeForDisplay(str: string): string {
  return str.replace(/[<>:"/\\|?*]/g, '').trim();
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme(): void {
  const current = document.documentElement.getAttribute('data-theme') as 'light' | 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  window.electronAPI.saveConfig({ theme: next });
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(tabName: string): void {
  document.querySelectorAll<HTMLElement>('.tab-panel').forEach(p => {
    p.hidden = p.id !== `tab-${tabName}`;
    if (!p.hidden) p.classList.add('tab-panel--active');
    else p.classList.remove('tab-panel--active');
  });
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(b => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle('tab-btn--active', active);
    b.setAttribute('aria-selected', String(active));
  });
  if (tabName === 'history') loadHistory();
}

// ── URL Handling ──────────────────────────────────────────────────────────────
function onUrlInput(): void {
  const val = urlInput.value.trim();
  clearUrlBtn.hidden = val.length === 0;
  setError('');
}

function clearUrl(): void {
  urlInput.value = '';
  clearUrlBtn.hidden = true;
  setError('');
  urlInput.focus();
  // Hide preview if shown
  previewCard.hidden = true;
  actionRow.hidden = true;
  currentMeta = null;
  // Restore quality selector visibility
  const qualityGroup = qualitySelect.closest<HTMLElement>('.opt-group');
  if (qualityGroup) qualityGroup.style.display = '';
  // Reset filename edited state
  delete filenameInput.dataset.userEdited;
  filenameInput.value = '';
}

async function checkClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (text && /youtube\.com|youtu\.be|facebook\.com|fb\.watch/.test(text) && !urlInput.value) {
      urlInput.value = text;
      clearUrlBtn.hidden = false;
    }
  } catch {
    // clipboard access denied — silently ignore
  }
}

// ── Filename Preview ──────────────────────────────────────────────────────────
function updateFilenamePreview(type: 'mp4' | 'mp3' = 'mp4'): void {
  if (!currentMeta) return;
  const safe = sanitizeForDisplay(currentMeta.title).substring(0, 60) || 'video';
  // Only reset the name if the user hasn't edited it yet
  if (!filenameInput.dataset.userEdited) {
    filenameInput.value = safe;
  }
  filenameExt.textContent = `.${type}`;
  const icon = document.getElementById('filenameIcon');
  if (icon) {
    icon.className = type === 'mp4' ? 'fa-solid fa-file-video' : 'fa-solid fa-file-audio';
  }
}

// ── Fetch Metadata ────────────────────────────────────────────────────────────
async function fetchMetadata(): Promise<void> {
  const url = urlInput.value.trim();
  if (!url) { setError('Please enter a video URL.'); return; }
  if (!/youtube\.com|youtu\.be|facebook\.com|fb\.watch/.test(url)) {
    setError('Please enter a valid YouTube or Facebook video URL.');
    return;
  }

  setError('');
  setFetchLoading(true);
  previewCard.hidden = true;
  actionRow.hidden = true;
  currentMeta = null;

  try {
    const meta = await window.electronAPI.fetchMetadata(url);
    currentMeta = meta;
    renderPreview(meta);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch video info.';
    setError(msg);
    showToast(msg, 'error');
  } finally {
    setFetchLoading(false);
  }
}

function renderPreview(meta: VideoMetadata): void {
  thumbnail.src = meta.thumbnail;
  thumbnail.alt = escapeHtml(meta.title);
  durationBadge.textContent = formatDuration(meta.duration);
  videoTitle.textContent = meta.title;
  const authorSpan = videoAuthor.querySelector('span');
  if (authorSpan) authorSpan.textContent = meta.author;
  downloadDirText.textContent = downloadDir || '~/Downloads';
  updateFilenamePreview('mp4');

  // Update platform pill based on URL
  const platformPill = document.querySelector<HTMLElement>('.platform-pill');
  const isFacebook = /facebook\.com|fb\.watch/.test(urlInput.value.trim());
  if (platformPill) {
    platformPill.innerHTML = isFacebook
      ? '<i class="fa-brands fa-facebook"></i> Facebook'
      : '<i class="fa-brands fa-youtube"></i> YouTube';
  }

  // Hide quality selector for Facebook — it doesn't support quality tiers
  const qualityGroup = qualitySelect.closest<HTMLElement>('.opt-group');
  if (qualityGroup) qualityGroup.style.display = isFacebook ? 'none' : '';

  previewCard.hidden = false;
  actionRow.hidden = false;
}

// ── Directory ─────────────────────────────────────────────────────────────────
async function selectDirectory(): Promise<void> {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    downloadDir = dir;
    downloadDirText.textContent = dir;
    showToast('Download folder updated');
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function setModalView(view: 'progress' | 'result'): void {
  dlProgressView.classList.toggle('modal__body--hidden', view !== 'progress');
  dlResultView.classList.toggle('modal__body--hidden', view !== 'result');
}

function openDownloadModal(type: 'mp4' | 'mp3'): void {
  // Reset to progress view
  setModalView('progress');
  dlModalClose.classList.remove('modal__close--visible');

  // Icon + title
  dlModalIcon.className = 'modal__head-icon';
  dlModalIcon.style.color = '';
  if (type === 'mp4') {
    dlModalIcon.classList.add('modal__head-icon--mp4');
    dlModalIcon.innerHTML = '<i class="fa-solid fa-film"></i>';
    dlModalTitle.textContent = 'Downloading MP4';
  } else {
    dlModalIcon.classList.add('modal__head-icon--mp3');
    dlModalIcon.innerHTML = '<i class="fa-solid fa-music"></i>';
    dlModalTitle.textContent = 'Converting to MP3';
  }
  dlModalSub.textContent = 'Preparing your file…';

  // Reset progress
  progressPercent.textContent = '0%';
  progressBytes.textContent = '—';
  progressSpeed.textContent = '—';
  progressEta.textContent = '—';
  progressFill.style.width = '0%';
  progressTrack.setAttribute('aria-valuenow', '0');
  progressStatus.textContent = 'Starting…';

  // Show overlay
  dlOverlay.classList.add('modal-overlay--visible');
}

function closeDownloadModal(): void {
  dlOverlay.classList.remove('modal-overlay--visible');
  setTimeout(() => {
    if (!isDownloading) actionRow.hidden = false;
  }, 400);
}

// ── Progress Update ───────────────────────────────────────────────────────────
function updateProgress(p: DownloadProgress): void {
  const pct = Math.min(Math.round(p.percent || 0), 100);
  progressPercent.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
  progressTrack.setAttribute('aria-valuenow', String(pct));
  progressBytes.textContent = p.downloaded > 0
    ? `${formatBytes(p.downloaded)} / ${formatBytes(p.total)}`
    : '—';
  progressSpeed.textContent = formatSpeed(p.speed);
  progressEta.textContent = p.eta > 0 ? formatEta(p.eta) : '—';
}

// ── Download ──────────────────────────────────────────────────────────────────
async function startDownload(type: 'mp4' | 'mp3'): Promise<void> {
  if (!currentMeta || isDownloading) return;

  const url = urlInput.value.trim();
  const quality = qualitySelect.value;
  const outputDir = downloadDir;
  const customName = filenameInput.value.trim() || undefined;

  isDownloading = true;
  actionRow.hidden = true;

  // Always remove stale listeners before adding new ones
  window.electronAPI.removeDownloadListeners();

  openDownloadModal(type);

  window.electronAPI.onDownloadProgress(updateProgress);
  window.electronAPI.onDownloadStatus((status) => {
    progressStatus.textContent = status;
    dlModalSub.textContent = status;
  });

  try {
    const result = await window.electronAPI.startDownload({ url, type, outputDir, quality, customName });
    showResult(result, type);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Download failed.';
    showResult({ success: false, error: msg }, type);
  } finally {
    isDownloading = false;
    window.electronAPI.removeDownloadListeners();
  }
}

async function cancelDownload(): Promise<void> {
  try {
    await window.electronAPI.cancelDownload();
  } catch { /* ignore */ }
  isDownloading = false;
  window.electronAPI.removeDownloadListeners();
  closeDownloadModal();
  actionRow.hidden = false;
  showToast('Download cancelled');
}

function showResult(result: DownloadResult, type: 'mp4' | 'mp3'): void {
  setModalView('result');
  dlModalClose.classList.add('modal__close--visible');

  // Reset icon states
  resultIconSuccess.classList.remove('active');
  resultIconError.classList.remove('active');

  // Update modal header — clear inline style first
  dlModalIcon.className = 'modal__head-icon';
  dlModalIcon.style.color = '';

  if (result.success && result.filePath) {
    lastFilePath = result.filePath;
    resultIconSuccess.classList.add('active');
    resultMessage.textContent = type === 'mp4' ? 'Video downloaded!' : 'Audio converted!';
    resultPath.textContent = result.filePath;
    resultPath.classList.add('result-path--visible');
    resultActions.classList.add('result-actions--visible');
    // Only show Play button for video files
    playFileBtn.style.display = type === 'mp4' ? '' : 'none';
    dlModalTitle.textContent = 'Complete';
    dlModalSub.textContent = 'Your file is ready';
    dlModalIcon.classList.add('modal__head-icon--success');
    dlModalIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    showToast(type === 'mp4' ? 'Video downloaded!' : 'MP3 ready!');
  } else {
    resultIconError.classList.add('active');
    resultMessage.textContent = result.error || 'Download failed.';
    resultPath.classList.remove('result-path--visible');
    resultActions.classList.remove('result-actions--visible');
    dlModalTitle.textContent = 'Failed';
    dlModalSub.textContent = 'Something went wrong';
    dlModalIcon.classList.add('modal__head-icon--error');
    dlModalIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
    showToast(result.error || 'Download failed.', 'error');
  }
}

function resetToStart(): void {
  // Hide modal immediately, restore action row
  dlOverlay.classList.remove('modal-overlay--visible');
  setTimeout(() => {
    resultPath.classList.remove('result-path--visible');
    resultActions.classList.remove('result-actions--visible');
    resultIconSuccess.classList.remove('active');
    resultIconError.classList.remove('active');
    if (currentMeta) actionRow.hidden = false;
  }, 380);
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory(): Promise<void> {
  const history = await window.electronAPI.getHistory();
  historyCount.textContent = `${history.length} item${history.length !== 1 ? 's' : ''}`;

  // Remove all items except the empty state element
  Array.from(historyList.children).forEach(c => {
    if (c.id !== 'historyEmpty') c.remove();
  });

  if (history.length === 0) {
    historyEmpty.removeAttribute('hidden');
    return;
  }
  historyEmpty.setAttribute('hidden', '');

  // Check file existence for all items in parallel, then render
  const existsResults = await Promise.all(
    history.map(item => window.electronAPI.checkFileExists(item.filePath))
  );
  history.forEach((item, i) => {
    historyList.appendChild(buildHistoryItem(item, existsResults[i]!));
  });
}

function buildHistoryItem(item: DownloadHistoryItem, fileExists: boolean): HTMLElement {
  const div = document.createElement('div');
  div.className = 'history-item' + (fileExists ? '' : ' history-item--missing');
  div.setAttribute('role', 'listitem');
  const date = new Date(item.downloadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const actionsHtml = fileExists
    ? `<div class="history-actions">
        ${item.type === 'mp4' ? `<button class="history-action-btn history-action-btn--play" title="Play" data-action="play" data-path="${escapeHtml(item.filePath)}" data-title="${escapeHtml(item.title)}">
          <i class="fa-solid fa-play"></i>
        </button>` : ''}
        <button class="history-action-btn" title="Open file" data-action="open-file" data-path="${escapeHtml(item.filePath)}">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </button>
        <button class="history-action-btn" title="Show in folder" data-action="open-folder" data-path="${escapeHtml(item.filePath)}">
          <i class="fa-solid fa-folder-open"></i>
        </button>
      </div>`
    : `<div class="history-missing-badge">
        <i class="fa-solid fa-triangle-exclamation"></i><span>Not found</span>
      </div>`;

  div.innerHTML = `
    <img class="history-thumb${fileExists ? '' : ' history-thumb--missing'}" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />
    <div class="history-info">
      <div class="history-title">${escapeHtml(item.title)}</div>
      <div class="history-meta">${formatDuration(item.duration)} · ${date}</div>
    </div>
    <span class="history-badge history-badge--${item.type}">${item.type.toUpperCase()}</span>
    ${actionsHtml}
  `;

  if (fileExists) {
    div.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = btn.dataset.path || '';
        if (btn.dataset.action === 'play') openPlayer(p, btn.dataset.title || 'Video');
        else if (btn.dataset.action === 'open-file') window.electronAPI.openFile(p);
        else window.electronAPI.openFolder(p);
      });
    });
  }
  return div;
}

async function clearHistory(): Promise<void> {
  await window.electronAPI.clearHistory();
  loadHistory();
  showToast('History cleared');
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function setupDragDrop(): void {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragOverlay.classList.add('drag-overlay--active');
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) dragOverlay.classList.remove('drag-overlay--active');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragOverlay.classList.remove('drag-overlay--active');
    const text = e.dataTransfer?.getData('text/plain') || '';
    if (text && /youtube\.com|youtu\.be/.test(text)) {
      urlInput.value = text;
      clearUrlBtn.hidden = false;
      fetchMetadata();
    }
  });
}

// ── yt-dlp Readiness ──────────────────────────────────────────────────────────
async function checkYtDlpReady(): Promise<void> {
  const status = await window.electronAPI.checkYtDlp();
  if (!status.ready) {
    showToast('yt-dlp not ready — downloads may fail', 'error');
  }
  window.electronAPI.onYtDlpReady(() => {
    showToast('yt-dlp ready');
  });
  window.electronAPI.onYtDlpUpdate((msg) => {
    if (msg.toLowerCase().includes('update')) showToast(msg, 'update');
  });
}

// ── Video Player ──────────────────────────────────────────────────────────────
const playerOverlay   = el('playerOverlay');
const playerVideo     = el<HTMLVideoElement>('playerVideo');
const playerStage     = el('playerStage');
const playerTitle     = el('playerTitle');
const playerClose     = el<HTMLButtonElement>('playerClose');
const playerPlayPause = el<HTMLButtonElement>('playerPlayPause');
const playerPlayIcon  = el('playerPlayIcon');
const playerSkipBack  = el<HTMLButtonElement>('playerSkipBack');
const playerSkipFwd   = el<HTMLButtonElement>('playerSkipFwd');
const playerMute      = el<HTMLButtonElement>('playerMute');
const playerVolIcon   = el('playerVolIcon');
const playerSeek      = el('playerSeek');
const playerFill      = el('playerFill');
const playerBuf       = el('playerBuf');
const playerThumb     = el('playerThumb');
const playerSeekTooltip = el('playerSeekTooltip');
const playerCurrent   = el('playerCurrent');
const playerDuration  = el('playerDuration');
const playerVolSlider = el('playerVolSlider');
const playerVolFill   = el('playerVolFill');
const playerSpeed     = el<HTMLSelectElement>('playerSpeed');
const playerFullscreen = el<HTMLButtonElement>('playerFullscreen');
const thumbPlayBtn    = el<HTMLButtonElement>('thumbPlayBtn');
const thumbDlProgress = el('thumbDlProgress');
const thumbDlRingFill = document.getElementById('thumbDlRingFill') as unknown as SVGCircleElement;
const thumbDlPct      = el('thumbDlPct');

let controlsHideTimer: ReturnType<typeof setTimeout> | null = null;
let thumbDownloading = false;

function playerFmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function playerUpdateSeek(): void {
  if (!playerVideo.duration) return;
  const pct = (playerVideo.currentTime / playerVideo.duration) * 100;
  playerFill.style.width = `${pct}%`;
  playerThumb.style.left = `${pct}%`;
  playerCurrent.textContent = playerFmtTime(playerVideo.currentTime);
  // buffered
  if (playerVideo.buffered.length > 0) {
    const bufPct = (playerVideo.buffered.end(playerVideo.buffered.length - 1) / playerVideo.duration) * 100;
    playerBuf.style.width = `${bufPct}%`;
  }
}

function playerSetVolume(v: number): void {
  playerVideo.volume = Math.max(0, Math.min(1, v));
  playerVolFill.style.width = `${playerVideo.volume * 100}%`;
  playerVideo.muted = playerVideo.volume === 0;
  playerVolIcon.className = playerVideo.volume === 0
    ? 'fa-solid fa-volume-xmark'
    : playerVideo.volume < 0.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high';
}

function playerSyncPlayIcon(): void {
  playerPlayIcon.className = playerVideo.paused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
  if (playerVideo.paused) playerStage.classList.add('paused');
  else playerStage.classList.remove('paused');
}

function showControls(): void {
  playerStage.classList.remove('controls-hidden');
  if (controlsHideTimer) clearTimeout(controlsHideTimer);
  if (!playerVideo.paused) {
    controlsHideTimer = setTimeout(() => playerStage.classList.add('controls-hidden'), 3000);
  }
}

function seekFromEvent(e: MouseEvent, bar: HTMLElement, cb: (ratio: number) => void): void {
  const rect = bar.getBoundingClientRect();
  cb(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
}

function initPlayerEvents(): void {
  playerStage.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.player-controls, .player-top-bar')) return;
    if (playerVideo.paused) playerVideo.play();
    else playerVideo.pause();
  });

  playerStage.addEventListener('mousemove', showControls);
  playerStage.addEventListener('mouseenter', showControls);
  playerStage.addEventListener('mouseleave', () => {
    if (!playerVideo.paused) playerStage.classList.add('controls-hidden');
  });

  playerPlayPause.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playerVideo.paused) playerVideo.play();
    else playerVideo.pause();
  });

  playerSkipBack.addEventListener('click', (e) => {
    e.stopPropagation();
    playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 10);
  });
  playerSkipFwd.addEventListener('click', (e) => {
    e.stopPropagation();
    playerVideo.currentTime = Math.min(playerVideo.duration || 0, playerVideo.currentTime + 10);
  });

  playerVideo.addEventListener('play',  () => { playerSyncPlayIcon(); showControls(); });
  playerVideo.addEventListener('pause', () => { playerSyncPlayIcon(); showControls(); });
  playerVideo.addEventListener('ended', () => { playerVideo.currentTime = 0; playerSyncPlayIcon(); });
  playerVideo.addEventListener('timeupdate', playerUpdateSeek);
  playerVideo.addEventListener('loadedmetadata', () => {
    playerDuration.textContent = playerFmtTime(playerVideo.duration);
    playerUpdateSeek();
  });

  // Seek bar drag + tooltip
  let seeking = false;
  playerSeek.addEventListener('mousedown', (e) => {
    e.stopPropagation(); seeking = true;
    seekFromEvent(e, playerSeek, (r) => { playerVideo.currentTime = r * playerVideo.duration; });
  });
  playerSeek.addEventListener('mousemove', (e) => {
    const rect = playerSeek.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    playerSeekTooltip.textContent = playerFmtTime(ratio * (playerVideo.duration || 0));
    playerSeekTooltip.style.left = `${ratio * 100}%`;
  });
  document.addEventListener('mousemove', (e) => {
    if (!seeking) return;
    seekFromEvent(e, playerSeek, (r) => { playerVideo.currentTime = r * playerVideo.duration; });
  });
  document.addEventListener('mouseup', () => { seeking = false; });

  // Volume drag
  let volDragging = false;
  playerVolSlider.addEventListener('mousedown', (e) => {
    e.stopPropagation(); volDragging = true;
    seekFromEvent(e, playerVolSlider, playerSetVolume);
  });
  document.addEventListener('mousemove', (e) => {
    if (!volDragging) return;
    seekFromEvent(e, playerVolSlider, playerSetVolume);
  });
  document.addEventListener('mouseup', () => { volDragging = false; });

  playerMute.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playerVideo.muted || playerVideo.volume === 0) {
      playerVideo.muted = false;
      playerSetVolume(playerVideo.volume || 0.8);
    } else {
      playerVideo.muted = true;
      playerVolIcon.className = 'fa-solid fa-volume-xmark';
    }
  });

  playerSpeed.addEventListener('change', (e) => {
    e.stopPropagation();
    playerVideo.playbackRate = parseFloat(playerSpeed.value);
  });

  playerFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = el('playerWrap');
    if (!document.fullscreenElement) wrap.requestFullscreen();
    else document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    const icon = playerFullscreen.querySelector('i')!;
    icon.className = document.fullscreenElement ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
  });

  playerOverlay.addEventListener('click', (e) => {
    if (e.target === playerOverlay) closePlayer();
  });

  playerClose.addEventListener('click', (e) => { e.stopPropagation(); closePlayer(); });

  document.addEventListener('keydown', (e) => {
    if (!playerOverlay.classList.contains('player-overlay--visible')) return;
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    showControls();
    switch (e.key) {
      case 'Escape': closePlayer(); break;
      case ' ': case 'k': e.preventDefault(); playerPlayPause.click(); break;
      case 'ArrowRight': playerVideo.currentTime = Math.min(playerVideo.duration||0, playerVideo.currentTime + 5); break;
      case 'ArrowLeft':  playerVideo.currentTime = Math.max(0, playerVideo.currentTime - 5); break;
      case 'ArrowUp':    e.preventDefault(); playerSetVolume(playerVideo.volume + 0.1); break;
      case 'ArrowDown':  e.preventDefault(); playerSetVolume(playerVideo.volume - 0.1); break;
      case 'm': playerMute.click(); break;
      case 'f': playerFullscreen.click(); break;
    }
  });
}


async function openPlayer(filePath: string, title: string): Promise<void> {
  const fileUrl = await window.electronAPI.getFileUrl(filePath);
  playerTitle.textContent = title;
  playerVideo.src = fileUrl;
  playerSetVolume(1);
  playerOverlay.classList.add('player-overlay--visible');
  playerVideo.play().catch(() => {});
}

function closePlayer(): void {
  playerOverlay.classList.remove('player-overlay--visible');
  playerVideo.pause();
  playerVideo.src = '';
}

// ── Thumb Download & Play ─────────────────────────────────────────────────────
async function thumbDownloadAndPlay(): Promise<void> {
  if (!currentMeta || isDownloading || thumbDownloading) return;

  const url = urlInput.value.trim();
  const outputDir = downloadDir;
  const circumference = 94.2;

  // Switch UI to progress ring
  thumbDownloading = true;
  thumbPlayBtn.classList.add('hidden');
  thumbDlProgress.classList.add('active');
  thumbDlRingFill.style.strokeDashoffset = String(circumference);
  thumbDlPct.textContent = '0%';

  window.electronAPI.removeDownloadListeners();
  window.electronAPI.onDownloadProgress((p) => {
    const pct = Math.min(Math.round(p.percent || 0), 100);
    const offset = circumference - (pct / 100) * circumference;
    thumbDlRingFill.style.strokeDashoffset = String(offset);
    thumbDlPct.textContent = `${pct}%`;
  });

  try {
    const result = await window.electronAPI.startDownload({ url, type: 'mp4', outputDir });
    if (result.success && result.filePath) {
      lastFilePath = result.filePath;
      openPlayer(result.filePath, currentMeta.title);
    } else {
      showToast(result.error || 'Download failed.', 'error');
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Download failed.', 'error');
  } finally {
    thumbDownloading = false;
    thumbDlProgress.classList.remove('active');
    thumbPlayBtn.classList.remove('hidden');
    thumbDlRingFill.style.strokeDashoffset = String(circumference);
    thumbDlPct.textContent = '0%';
    window.electronAPI.removeDownloadListeners();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  // Load config
  const config = await window.electronAPI.getConfig();
  applyTheme(config.theme || 'dark');
  downloadDir = config.defaultDownloadDir || '';

  // Window controls
  document.getElementById('btnClose')?.addEventListener('click', () => window.electronAPI.closeWindow());

  // Theme
  themeToggle.addEventListener('click', toggleTheme);

  // Open downloads folder
  openDirBtn.addEventListener('click', () => window.electronAPI.openDefaultDir());

  // Tab nav
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab || 'downloader'));
  });

  // URL input
  urlInput.addEventListener('input', onUrlInput);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchMetadata(); });
  clearUrlBtn.addEventListener('click', clearUrl);
  fetchBtn.addEventListener('click', fetchMetadata);

  // Directory
  changeDirBtn.addEventListener('click', selectDirectory);

  // Quality select — update filename preview
  qualitySelect.addEventListener('change', () => updateFilenamePreview('mp4'));

  // Mark filename as user-edited when they type in it
  filenameInput.addEventListener('input', () => {
    filenameInput.dataset.userEdited = '1';
  });

  // Download buttons
  downloadVideoBtn.addEventListener('click', () => startDownload('mp4'));
  downloadAudioBtn.addEventListener('click', () => startDownload('mp3'));

  // Modal controls
  dlModalClose.addEventListener('click', closeDownloadModal);
  cancelBtn.addEventListener('click', cancelDownload);
  newDownloadBtn.addEventListener('click', resetToStart);

  // Result actions
  openFileBtn.addEventListener('click', () => { if (lastFilePath) window.electronAPI.openFile(lastFilePath); });
  openFolderBtn.addEventListener('click', () => { if (lastFilePath) window.electronAPI.openFolder(lastFilePath); });
  playFileBtn.addEventListener('click', () => { if (lastFilePath) openPlayer(lastFilePath, lastFilePath.split(/[\\/]/).pop() || 'Video'); });

  // Thumbnail play button — download MP4 then auto-play
  thumbPlayBtn.addEventListener('click', () => thumbDownloadAndPlay());

  // History
  clearHistoryBtn.addEventListener('click', clearHistory);

  // Drag & drop
  setupDragDrop();

  // Clipboard check
  checkClipboard();

  // yt-dlp
  checkYtDlpReady();

  // Player
  initPlayerEvents();
}

document.addEventListener('DOMContentLoaded', init);
