import { Injectable, signal } from '@angular/core';

export const DEFAULT_OPENF1_BASE_URL = 'https://api.openf1.org/v1';

/**
 * Turns the `openf1BaseUrl` setting of `config.json` into the API base URL: the public OpenF1 API
 * when empty, otherwise the given self-hosted server (`https://f1.example.com` or a full `.../v1`
 * URL). Anything that is not an http(s) URL is ignored so a typo can't break the app.
 */
export function resolveOpenF1BaseUrl(raw: unknown): { url: string; custom: boolean } {
  const fallback = { url: DEFAULT_OPENF1_BASE_URL, custom: false };
  if (typeof raw !== 'string' || !raw.trim()) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return fallback;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback;

  const path = parsed.pathname.replace(/\/+$/, '');
  const url = `${parsed.origin}${path.endsWith('/v1') ? path : `${path}/v1`}`;
  return { url, custom: url !== DEFAULT_OPENF1_BASE_URL };
}

/** Which OpenF1 server the app talks to, set once at startup from `/config.json`. */
@Injectable({ providedIn: 'root' })
export class OpenF1Config {
  private readonly resolved = signal(resolveOpenF1BaseUrl(null));

  get baseUrl(): string {
    return this.resolved().url;
  }

  /** True for a self-hosted server: it has no public rate limits and serves live sessions. */
  get selfHosted(): boolean {
    return this.resolved().custom;
  }

  /** Reads `/config.json` (browser only); a missing or invalid file keeps the public API. */
  async load(): Promise<void> {
    try {
      const response = await fetch('/config.json', { cache: 'no-store' });
      if (!response.ok) return;
      const config = (await response.json()) as { openf1BaseUrl?: unknown };
      this.resolved.set(resolveOpenF1BaseUrl(config.openf1BaseUrl));
    } catch {
      // no config file: keep the public API
    }
  }
}
