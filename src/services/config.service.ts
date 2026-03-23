import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AppConfig, DownloadHistoryItem } from '../types/index.js';
import { logger } from '../utils/logger.js';

const MAX_HISTORY = 50;

export class ConfigService {
  private configPath: string;
  private config: AppConfig;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'config.json');
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(raw) as AppConfig;
      }
    } catch (err) {
      logger.warn('Failed to load config, using defaults:', err);
    }
    return {
      theme: 'light',
      defaultDownloadDir: app.getPath('downloads'),
      history: [],
    };
  }

  private save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to save config:', err);
    }
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<Omit<AppConfig, 'history'>>): void {
    this.config = { ...this.config, ...partial };
    this.save();
  }

  addHistory(item: DownloadHistoryItem): void {
    // Remove any existing entry for the same video + type so only the latest is kept
    this.config.history = this.config.history.filter(
      h => !(h.title === item.title && h.type === item.type)
    );
    this.config.history.unshift(item);
    if (this.config.history.length > MAX_HISTORY) {
      this.config.history = this.config.history.slice(0, MAX_HISTORY);
    }
    this.save();
  }

  getHistory(): DownloadHistoryItem[] {
    return [...this.config.history];
  }

  clearHistory(): void {
    this.config.history = [];
    this.save();
  }
}
