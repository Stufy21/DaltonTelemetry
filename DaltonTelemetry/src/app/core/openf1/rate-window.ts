export interface RateLimits {
  /** Minimum spacing between two requests. */
  minGapMs: number;
  /** At most this many requests in any `windowMs` span. */
  maxPerWindow: number;
  windowMs: number;
}

/**
 * Sliding-window scheduler for OpenF1's limits (requests/second and requests/minute). It hands
 * out the next moment a request may be sent; callers wait until then instead of being rejected.
 * Pure (no timers, no storage) so the browser and the server proxy can both use it.
 */
export class RateWindow {
  private slots: number[];

  constructor(
    private readonly limits: RateLimits,
    initialSlots: readonly number[] = [],
  ) {
    this.slots = [...initialSlots].sort((a, b) => a - b);
  }

  /** Scheduled request times still inside the window, e.g. to persist across reloads. */
  get scheduled(): readonly number[] {
    return this.slots;
  }

  /** Reserves the next free slot at or after `notBefore`; returns its time in epoch ms. */
  reserve(now: number, notBefore = 0): number {
    const { minGapMs, maxPerWindow, windowMs } = this.limits;
    this.slots = this.slots.filter((s) => s > now - windowMs);

    let at = Math.max(now, notBefore, (this.slots[this.slots.length - 1] ?? 0) + minGapMs);
    if (this.slots.length >= maxPerWindow) {
      at = Math.max(at, this.slots[this.slots.length - maxPerWindow] + windowMs);
    }
    this.slots.push(at);
    return at;
  }
}
