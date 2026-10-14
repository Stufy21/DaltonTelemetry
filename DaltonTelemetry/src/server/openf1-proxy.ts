import { RateWindow } from '../app/core/openf1/rate-window';
import { TokenProvider } from './openf1-token';

/** Endpoints the browser may reach through the proxy (it must not be an open relay). */
export const ALLOWED_ENDPOINTS = new Set([
  'sessions',
  'drivers',
  'position',
  'intervals',
  'laps',
  'stints',
  'pit',
  'race_control',
  'weather',
  'team_radio',
  'location',
  'car_data',
  'session_result',
]);

export interface ProxyResult {
  status: number;
  contentType: string;
  body: string;
}

export interface OpenF1ProxyOptions {
  tokens: TokenProvider;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Identical requests within this time share one upstream response. */
  cacheMs?: number;
  /** The sponsor plan allows 6/s and 60/min; keep headroom for the live stream's own needs. */
  maxPerMinute?: number;
  /** Don't keep responses larger than this in the cache. */
  maxCachedBytes?: number;
}

interface CacheEntry extends ProxyResult {
  expiresAt: number;
}

/**
 * Authenticated pass-through to OpenF1's REST API, used while a session is live (the browser has
 * no token). Responses are cached briefly and shared between concurrent identical requests, and
 * requests are paced to stay inside the account's rate limit.
 */
export class OpenF1Proxy {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly cacheMs: number;
  private readonly maxCachedBytes: number;
  private readonly limiter: RateWindow;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<ProxyResult>>();

  constructor(private readonly options: OpenF1ProxyOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.openf1.org/v1';
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
    this.cacheMs = options.cacheMs ?? 5_000;
    this.maxCachedBytes = options.maxCachedBytes ?? 2_000_000;
    this.limiter = new RateWindow({
      minGapMs: 200,
      maxPerWindow: options.maxPerMinute ?? 50,
      windowMs: 60_000,
    });
  }

  /** Fetches `endpoint` with the raw query string (OpenF1 filters like `date>=…` must stay as is). */
  async get(endpoint: string, query: string): Promise<ProxyResult> {
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      return json(404, { error: `Unknown endpoint "${endpoint}"` });
    }

    const key = `${endpoint}?${query}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.fetchUpstream(endpoint, query, key).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, request);
    return request;
  }

  private async fetchUpstream(endpoint: string, query: string, key: string): Promise<ProxyResult> {
    let token: string;
    try {
      token = await this.options.tokens.getToken();
    } catch (error) {
      return json(502, { error: error instanceof Error ? error.message : 'token request failed' });
    }

    const wait = this.limiter.reserve(this.now()) - this.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}/${endpoint}?${query}`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      });
    } catch {
      return json(502, { error: 'OpenF1 is unreachable' });
    }

    // An expired or revoked token: forget it so the next request gets a new one.
    if (response.status === 401) this.options.tokens.invalidate();

    const result: ProxyResult = {
      status: response.status,
      contentType: response.headers.get('content-type') ?? 'application/json',
      body: await response.text(),
    };

    // 404 means "no rows" for OpenF1 and is as cacheable as data; errors are not.
    if ((response.ok || response.status === 404) && result.body.length <= this.maxCachedBytes) {
      this.cache.set(key, { ...result, expiresAt: this.now() + this.cacheMs });
      this.prune();
    }
    return result;
  }

  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key);
    // Keep memory bounded: drop the oldest entries beyond a fixed count.
    while (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value as string);
  }
}

const json = (status: number, body: unknown): ProxyResult => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});
