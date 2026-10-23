/** Longest delay the live view can be pushed behind real time, in seconds. */
export const DELAY_MAX_S = 600;
export const DELAY_STORAGE_KEY = 'dalton-live-delay';

/** A whole number of seconds between 0 and DELAY_MAX_S; anything else counts as no delay. */
export function clampDelay(value: unknown): number {
  const seconds = Math.round(Number(value));
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), DELAY_MAX_S) : 0;
}

/** The delay saved by a previous visit (0 when none, or when storage is unavailable). */
export function readStoredDelay(storage: Pick<Storage, 'getItem'> | null): number {
  try {
    return clampDelay(storage?.getItem(DELAY_STORAGE_KEY));
  } catch {
    return 0;
  }
}
