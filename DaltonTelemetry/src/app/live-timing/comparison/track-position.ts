import { Point } from '../timing-dataset';

/** Length of the path up to each vertex, starting at 0. */
function cumulativeLengths(points: Point[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y),
    );
  }
  return lengths;
}

/** Index of the first vertex at or beyond `target` along the path (the last one if none is). */
function firstAtOrBeyond(lengths: number[], target: number): number {
  let lo = 0;
  let hi = lengths.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lengths[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The point at a distance along the path, between the vertices around it. */
function pointAtDistance(points: Point[], lengths: number[], distance: number): Point {
  const i = firstAtOrBeyond(lengths, distance);
  if (i === 0) return points[0];
  const span = lengths[i] - lengths[i - 1];
  const t = span > 0 ? (distance - lengths[i - 1]) / span : 0;
  return {
    x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
    y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
  };
}

const clamp01 = (f: number): number => Math.min(1, Math.max(0, f));

/**
 * Where on the circuit a position along the lap (0 = start line, 1 = back at it) is. The outline
 * is one lap of car coordinates, so a fraction of its length is a fraction of the lap.
 */
export function pointAtFraction(outline: Point[], f: number): Point | null {
  if (outline.length < 2) return null;
  const lengths = cumulativeLengths(outline);
  return pointAtDistance(outline, lengths, clamp01(f) * lengths[lengths.length - 1]);
}

/** The part of the outline between two positions along the lap, ends included. */
export function stretchOfOutline(outline: Point[], from: number, to: number): Point[] {
  if (outline.length < 2) return [];
  const lengths = cumulativeLengths(outline);
  const total = lengths[lengths.length - 1];
  const a = clamp01(Math.min(from, to)) * total;
  const b = clamp01(Math.max(from, to)) * total;
  const inside = outline.filter((_, i) => lengths[i] > a && lengths[i] < b);
  return [pointAtDistance(outline, lengths, a), ...inside, pointAtDistance(outline, lengths, b)];
}
