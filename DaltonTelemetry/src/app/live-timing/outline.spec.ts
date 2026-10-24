import { OF1Location } from '../core/openf1/openf1.model';
import {
  analyseOutline,
  isBetterOutline,
  isCompleteOutline,
  OUTLINE_MIN_POINTS,
  OutlineSample,
} from './outline';

const T0 = Date.parse('2026-01-01T12:00:00Z');
const row = (ms: number, x = ms, y = 0, z = 0): OF1Location => ({
  date: new Date(T0 + ms).toISOString(),
  driver_number: 1,
  x,
  y,
  z,
});
/** n samples every 270 ms (about 3.7 Hz), skipping the ones listed. */
const lap = (n: number, skip: number[] = []): OF1Location[] =>
  Array.from({ length: n }, (_, i) => i)
    .filter((i) => !skip.includes(i))
    .map((i) => row(i * 270, i + 1, i + 1, 1));

describe('analyseOutline', () => {
  it('measures the longest silence between samples', () => {
    expect(analyseOutline(lap(300)).maxGapMs).toBe(270);
    expect(analyseOutline(lap(300, [100, 101, 102])).maxGapMs).toBe(270 * 4);
  });

  it('drops samples without a GPS fix and puts the rest in time order', () => {
    const rows = [row(540, 3, 3, 1), row(0, 0, 0, 0), row(270, 2, 2, 1), row(810, 4, 4, 1)];
    const found = analyseOutline(rows);
    expect(found.points).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ]);
    expect(found.maxGapMs).toBe(270);
  });

  it('copes with no data', () => {
    expect(analyseOutline([])).toEqual({ points: [], maxGapMs: 0 });
  });
});

describe('choosing the lap that draws the outline', () => {
  const sample = (points: number, maxGapMs: number): OutlineSample => ({
    points: Array.from({ length: points }, () => ({ x: 0, y: 0 })),
    maxGapMs,
  });

  it('refuses a lap too short to draw a circuit', () => {
    expect(isBetterOutline(sample(OUTLINE_MIN_POINTS - 1, 270), null)).toBe(false);
    expect(isBetterOutline(sample(OUTLINE_MIN_POINTS, 270), null)).toBe(true);
  });

  it('prefers the lap with the smaller gap, then the one with more points', () => {
    const current = sample(350, 1100);
    expect(isBetterOutline(sample(340, 270), current)).toBe(true);
    expect(isBetterOutline(sample(400, 1500), current)).toBe(false);
    expect(isBetterOutline(sample(360, 1100), current)).toBe(true);
    expect(isBetterOutline(sample(350, 1100), current)).toBe(false);
  });

  it('is complete only with enough points and no real gap', () => {
    expect(isCompleteOutline(null)).toBe(false);
    expect(isCompleteOutline(sample(350, 300))).toBe(true);
    expect(isCompleteOutline(sample(350, 1100))).toBe(false);
    expect(isCompleteOutline(sample(20, 300))).toBe(false);
  });
});
