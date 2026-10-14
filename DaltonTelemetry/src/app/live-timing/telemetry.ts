import { OF1CarData } from '../core/openf1/openf1.model';

export interface TracePoint {
  /** Fraction of the lap covered (0..1), from integrating speed. */
  f: number;
  /** Seconds since the first sample. */
  t: number;
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  rpm: number;
}

export interface Trace {
  points: TracePoint[];
  /** Lap length in metres, estimated from the speed samples. */
  length: number;
}

export type TraceChannel = 'speed' | 'throttle' | 'brake' | 'gear' | 'rpm';

/**
 * OpenF1 telemetry has no distance channel, so distance is integrated from speed. That makes the
 * traces of two drivers comparable point by point (same place on track) instead of by time.
 */
export function buildTrace(rows: OF1CarData[]): Trace | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const t0 = Date.parse(sorted[0].date);

  let distance = 0;
  const raw = sorted.map((r, i) => {
    const t = (Date.parse(r.date) - t0) / 1000;
    if (i > 0) {
      const prev = sorted[i - 1];
      const dt = t - (Date.parse(prev.date) - t0) / 1000;
      distance += ((r.speed + prev.speed) / 2 / 3.6) * dt;
    }
    return { d: distance, t, r };
  });

  if (distance <= 0) return null;
  return {
    length: distance,
    points: raw.map(({ d, t, r }) => ({
      f: d / distance,
      t,
      speed: r.speed,
      throttle: r.throttle,
      brake: r.brake,
      gear: r.n_gear,
      rpm: r.rpm,
    })),
  };
}

/** The sample closest to lap fraction f. */
export function pointAt(trace: Trace, f: number): TracePoint {
  const pts = trace.points;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pts[mid].f < f) lo = mid + 1;
    else hi = mid;
  }
  const prev = pts[Math.max(0, lo - 1)];
  return Math.abs(prev.f - f) <= Math.abs(pts[lo].f - f) ? prev : pts[lo];
}
