import { OF1Location } from '../core/openf1/openf1.model';
import { Point } from './timing-dataset';

/** Car coordinates arrive about 3.7 times a second; a longer silence leaves a gap in the outline. */
export const OUTLINE_MAX_GAP_MS = 800;
/** Fewer points than this can't draw a circuit. */
export const OUTLINE_MIN_POINTS = 150;
/** How many of the fastest laps are tried, in order, to find one without gaps. */
export const OUTLINE_CANDIDATES = 6;
/**
 * A lap draws the whole circuit only if it ends where it started: the distance between its first
 * and last point may be at most this many of the usual steps between two samples. A standing start
 * begins on the grid, behind the line, and leaves the stretch up to the line out.
 */
export const OUTLINE_MAX_CLOSURE_STEPS = 4;

export interface OutlineSample {
  points: Point[];
  /**
   * Longest silence in the lap, in ms: between two samples, and (when the lap's window is known)
   * before the first and after the last one.
   */
  maxGapMs: number;
  /** Distance between the first and last point, in usual steps between samples (0-2 when it closes). */
  closure: number;
}

/** When a lap ran, as ISO timestamps. */
export interface LapWindow {
  from: string;
  to: string;
}

/** The usable points of a lap (no GPS fix = all zero) and how complete they are. */
export function analyseOutline(rows: OF1Location[], window?: LapWindow): OutlineSample {
  const fixes = rows
    .filter((r) => !(r.x === 0 && r.y === 0 && r.z === 0))
    .map((r) => ({ t: Date.parse(r.date), x: r.x, y: r.y }))
    .sort((a, b) => a.t - b.t);

  let maxGapMs = 0;
  for (let i = 1; i < fixes.length; i++) maxGapMs = Math.max(maxGapMs, fixes[i].t - fixes[i - 1].t);
  if (window && fixes.length) {
    maxGapMs = Math.max(
      maxGapMs,
      fixes[0].t - Date.parse(window.from),
      Date.parse(window.to) - fixes[fixes.length - 1].t,
    );
  }

  const steps = fixes
    .slice(1)
    .map((f, i) => Math.hypot(f.x - fixes[i].x, f.y - fixes[i].y))
    .sort((a, b) => a - b);
  const usualStep = steps[Math.floor(steps.length / 2)] ?? 0;
  const first = fixes[0];
  const last = fixes[fixes.length - 1];
  const closure =
    first && usualStep > 0 ? Math.hypot(last.x - first.x, last.y - first.y) / usualStep : Infinity;

  return { points: fixes.map(({ x, y }) => ({ x, y })), maxGapMs, closure };
}

const isClosed = (sample: OutlineSample): boolean => sample.closure <= OUTLINE_MAX_CLOSURE_STEPS;

/**
 * A lap that closes beats one that doesn't; then fewer and shorter gaps draw a better circuit,
 * and with equal gaps, more points do.
 */
export function isBetterOutline(candidate: OutlineSample, current: OutlineSample | null): boolean {
  if (candidate.points.length < OUTLINE_MIN_POINTS) return false;
  if (!current) return true;
  if (isClosed(candidate) !== isClosed(current)) return isClosed(candidate);
  if (candidate.maxGapMs !== current.maxGapMs) return candidate.maxGapMs < current.maxGapMs;
  return candidate.points.length > current.points.length;
}

export const isCompleteOutline = (outline: OutlineSample | null): boolean =>
  !!outline &&
  outline.points.length >= OUTLINE_MIN_POINTS &&
  isClosed(outline) &&
  outline.maxGapMs <= OUTLINE_MAX_GAP_MS;
