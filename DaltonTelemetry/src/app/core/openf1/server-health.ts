/** How long a self-hosted server that failed is left alone before it is tried again. */
export const SERVER_RETRY_AFTER_MS = 60_000;
/** A self-hosted server that doesn't answer within this time counts as unavailable. */
export const SERVER_TIMEOUT_MS = 8_000;

/**
 * Whether a failed request says the server itself is unreachable (offline, tunnel down, gateway
 * error, no answer in time), as opposed to a reply about the query such as "404: no rows".
 */
export function isServerUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, status } = err as { name?: unknown; status?: unknown };
  if (name === 'TimeoutError') return true;
  return typeof status === 'number' && (status === 0 || status >= 500);
}

/**
 * Remembers that a server just failed so the following requests go straight to the fallback
 * instead of each waiting for the same timeout, then lets one try through after a while.
 */
export class ServerHealth {
  private downUntil = 0;

  constructor(private readonly retryAfterMs = SERVER_RETRY_AFTER_MS) {}

  isDown(now = Date.now()): boolean {
    return now < this.downUntil;
  }

  markDown(now = Date.now()): void {
    this.downUntil = now + this.retryAfterMs;
  }

  markUp(): void {
    this.downUntil = 0;
  }
}
