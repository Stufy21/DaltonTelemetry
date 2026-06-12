import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ClaudeSettings, DEFAULT_SETTINGS, ShareableSettings } from './settings.model';

const STORAGE_KEY = 'dalton-claude-settings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _settings = signal<ClaudeSettings>(this.loadFromStorage());

  readonly settings = this._settings.asReadonly();

  constructor() {
    if (this.isBrowser) {
      effect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings()));
      });
    }
  }

  set(settings: ClaudeSettings): void {
    this._settings.set(settings);
  }

  toShareToken(): string {
    const { apiKey: _omit, ...shareable } = this._settings();
    return btoa(JSON.stringify(shareable));
  }

  fromShareToken(token: string): Partial<ShareableSettings> | null {
    try {
      return JSON.parse(atob(token)) as Partial<ShareableSettings>;
    } catch {
      return null;
    }
  }

  private loadFromStorage(): ClaudeSettings {
    if (!this.isBrowser) return { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // corrupted storage — start fresh
    }
    return { ...DEFAULT_SETTINGS };
  }
}
