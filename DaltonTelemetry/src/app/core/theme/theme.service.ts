import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'dalton-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Light/dark/system theme. The choice is exposed as `data-theme` on <html> (see
 * material-theme.scss); `system` removes the attribute so the OS preference applies.
 * index.html applies the stored choice before first paint to avoid a flash.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly mode = signal<ThemeMode>(this.read());
  private readonly systemDark = signal(false);

  /** The theme actually on screen. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const mode = this.mode();
    return mode === 'system' ? (this.systemDark() ? 'dark' : 'light') : mode;
  });

  constructor() {
    if (this.isBrowser) {
      const media = matchMedia(DARK_QUERY);
      this.systemDark.set(media.matches);
      media.addEventListener('change', (e) => this.systemDark.set(e.matches));
    }

    effect(() => {
      const mode = this.mode();
      const root = this.doc.documentElement;
      if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', mode);
      this.doc
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', this.resolved() === 'dark' ? '#0f1418' : '#f6faff');
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    if (!this.isBrowser) return;
    try {
      if (mode === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage unavailable: the choice just won't persist
    }
  }

  private read(): ThemeMode {
    if (!this.isBrowser) return 'system';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  }
}
