/** How long a session stays live after its end, once the chequered flag has been shown. */
export const LIVE_WINDOW_AFTER_MS = 10 * 60_000;
/**
 * How long a session may overrun its scheduled end while the chequered flag has not been shown. The
 * scheduled end is only an estimate: safety cars and red flags push a race past it (the limit for a
 * whole race is three hours from the start, an hour more than the scheduled two).
 */
export const LIVE_OVERRUN_MS = 60 * 60_000;

/** The moment a session stops being live: after the flag, shortly after the scheduled end. */
export function liveWindowEnd(scheduledEnd: number, chequeredShown: boolean): number {
  return scheduledEnd + (chequeredShown ? LIVE_WINDOW_AFTER_MS : LIVE_OVERRUN_MS);
}
