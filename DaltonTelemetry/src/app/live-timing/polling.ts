/** How often live data is polled, in ms. */
export interface PollCadence {
  /** Positions, intervals, laps, location. */
  fast: number;
  /** Race control, weather, pits, stints (+ radio when opened). */
  slow: number;
  /** How far the live map trails the clock so cars move smoothly between two fast polls. */
  mapLag: number;
}

/** Together these use ~20 of the 30 requests/minute the public OpenF1 API allows. */
const PUBLIC_API: PollCadence = { fast: 15_000, slow: 60_000, mapLag: 15_000 };
/** A self-hosted server has no public rate limits, so everything is polled at the same pace. */
const SELF_HOSTED: PollCadence = { fast: 5_000, slow: 5_000, mapLag: 5_000 };

export function pollCadence(selfHosted: boolean): PollCadence {
  return selfHosted ? SELF_HOSTED : PUBLIC_API;
}
