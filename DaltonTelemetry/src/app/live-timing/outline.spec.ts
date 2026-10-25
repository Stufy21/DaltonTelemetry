import { OF1Location } from '../core/openf1/openf1.model';
import {
  analyseOutline,
  isBetterOutline,
  isCompleteOutline,
  OUTLINE_MAX_CLOSURE_STEPS,
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
    expect(analyseOutline([])).toEqual({ points: [], maxGapMs: 0, closure: Infinity });
  });
});

describe('choosing the lap that draws the outline', () => {
  const sample = (points: number, maxGapMs: number, closure = 1): OutlineSample => ({
    points: Array.from({ length: points }, () => ({ x: 0, y: 0 })),
    maxGapMs,
    closure,
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

  it('is complete only with enough points, no real gap and a lap that closes', () => {
    expect(isCompleteOutline(null)).toBe(false);
    expect(isCompleteOutline(sample(350, 300))).toBe(true);
    expect(isCompleteOutline(sample(350, 1100))).toBe(false);
    expect(isCompleteOutline(sample(20, 300))).toBe(false);
    expect(isCompleteOutline(sample(350, 300, 23))).toBe(false); // a standing start from the grid
  });

  it('prefers a lap that closes over a faster-looking one that does not', () => {
    const open = sample(384, 270, 23); // no gaps at all, but it starts behind the line
    const closed = sample(360, 1100, 1.4);
    expect(isBetterOutline(closed, open)).toBe(true);
    expect(isBetterOutline(open, closed)).toBe(false);
  });
});

describe('closing the lap and the lap window', () => {
  /** A circle of `n` samples every 270 ms, optionally stopping early: an open lap. */
  const circle = (n: number, used = n): OF1Location[] =>
    Array.from({ length: used }, (_, i) => {
      const a = (i / n) * 2 * Math.PI;
      return row(i * 270, Math.round(5000 * Math.cos(a)), Math.round(5000 * Math.sin(a)), 1);
    });

  it('sees a lap that ends where it started as closed', () => {
    expect(analyseOutline(circle(300, 299)).closure).toBeLessThan(3);
  });

  it('sees a lap that is missing its last stretch as open', () => {
    // a standing start leaves out the part before the line: here a quarter of the circle
    expect(analyseOutline(circle(300, 225)).closure).toBeGreaterThan(OUTLINE_MAX_CLOSURE_STEPS);
  });

  it('counts the silence before the first and after the last sample of the lap window', () => {
    const rows = lap(300); // samples from 0 to 80.7 s
    const exact = { from: new Date(T0).toISOString(), to: new Date(T0 + 80_730).toISOString() };
    expect(analyseOutline(rows, exact).maxGapMs).toBe(270);
    const late = { from: new Date(T0 - 3_000).toISOString(), to: exact.to };
    expect(analyseOutline(rows, late).maxGapMs).toBe(3_000); // the lap began 3 s before any sample
    const early = { from: exact.from, to: new Date(T0 + 86_000).toISOString() };
    expect(analyseOutline(rows, early).maxGapMs).toBe(5_270); // and ended well after the last
  });
});
