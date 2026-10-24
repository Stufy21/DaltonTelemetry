import { OF1Location } from '../core/openf1/openf1.model';
import { Point } from './timing-dataset';

/** Car coordinates arrive about 3.7 times a second; a longer silence leaves a gap in the outline. */
export const OUTLINE_MAX_GAP_MS = 800;
/** Fewer points than this can't draw a circuit. */
export const OUTLINE_MIN_POINTS = 150;
/** How many of the fastest laps are tried, in order, to find one without gaps. */
export const OUTLINE_CANDIDATES = 6;

export interface OutlineSample {
  points: Point[];
  /** Longest silence between two consecutive samples of the lap, in ms. */
  maxGapMs: number;
}

/** The usable points of a lap (no GPS fix = all zero) and how complete they are. */
export function analyseOutline(rows: OF1Location[]): OutlineSample {
  const fixes = rows
    .filter((r) => !(r.x === 0 && r.y === 0 && r.z === 0))
    .map((r) => ({ t: Date.parse(r.date), x: r.x, y: r.y }))
    .sort((a, b) => a.t - b.t);
  let maxGapMs = 0;
  for (let i = 1; i < fixes.length; i++) maxGapMs = Math.max(maxGapMs, fixes[i].t - fixes[i - 1].t);
  return { points: fixes.map(({ x, y }) => ({ x, y })), maxGapMs };
}

/** A lap with fewer or shorter gaps draws a better circuit; with equal gaps, more points do. */
export function isBetterOutline(candidate: OutlineSample, current: OutlineSample | null): boolean {
  if (candidate.points.length < OUTLINE_MIN_POINTS) return false;
  if (!current) return true;
  if (candidate.maxGapMs !== current.maxGapMs) return candidate.maxGapMs < current.maxGapMs;
  return candidate.points.length > current.points.length;
}

export const isCompleteOutline = (outline: OutlineSample | null): boolean =>
  !!outline &&
  outline.points.length >= OUTLINE_MIN_POINTS &&
  outline.maxGapMs <= OUTLINE_MAX_GAP_MS;
