export interface TokenProviderOptions {
  username: string;
  password: string;
  url?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** Renew this long before the token expires, so a request never carries an expired one. */
const RENEW_MARGIN_MS = 5 * 60_000;

/**
 * OAuth2 password-grant token for OpenF1 (`POST /token`). Tokens last an hour; this keeps one in
 * memory, renews it ahead of time, and shares a single in-flight request between callers.
 */
export class TokenProvider {
  private readonly url: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private cached: { token: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(private readonly options: TokenProviderOptions) {
    this.url = options.url ?? 'https://api.openf1.org/token';
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async getToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt - RENEW_MARGIN_MS) {
      return this.cached.token;
    }
    this.pending ??= this.request().finally(() => (this.pending = null));
    return this.pending;
  }

  /** Drop the token (e.g. after a 401) so the next call fetches a fresh one. */
  invalidate(): void {
    this.cached = null;
  }

  /** Milliseconds until the current token should be replaced (0 when there is none). */
  get renewInMs(): number {
    return this.cached ? Math.max(0, this.cached.expiresAt - RENEW_MARGIN_MS - this.now()) : 0;
  }

  private async request(): Promise<string> {
    const response = await this.fetchFn(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: this.options.username,
        password: this.options.password,
      }),
    });
    if (!response.ok) throw new Error(`OpenF1 token request failed (HTTP ${response.status})`);

    const body = (await response.json()) as { access_token?: string; expires_in?: string | number };
    if (!body.access_token) throw new Error('OpenF1 token response had no access_token');
    this.cached = {
      token: body.access_token,
      expiresAt: this.now() + (Number(body.expires_in) || 3600) * 1000,
    };
    return body.access_token;
  }
}
