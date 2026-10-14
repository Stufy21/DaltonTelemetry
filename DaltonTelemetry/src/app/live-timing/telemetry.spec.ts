import { OF1CarData } from '../core/openf1/openf1.model';
import { buildTrace, pointAt } from './telemetry';

const T0 = Date.parse('2026-01-01T12:00:00Z');

const sample = (sec: number, speed: number, extra: Partial<OF1CarData> = {}): OF1CarData => ({
  date: new Date(T0 + sec * 1000).toISOString(),
  driver_number: 1,
  speed,
  rpm: 10000,
  n_gear: 7,
  throttle: 100,
  brake: 0,
  ...extra,
});

describe('buildTrace', () => {
  it('integrates speed into a lap length', () => {
    // 360 km/h = 100 m/s for 10 s -> 1000 m
    const trace = buildTrace(Array.from({ length: 11 }, (_, i) => sample(i, 360)))!;
    expect(trace.length).toBeCloseTo(1000, 6);
    expect(trace.points[0].f).toBe(0);
    expect(trace.points[10].f).toBeCloseTo(1, 6);
    expect(trace.points[5].f).toBeCloseTo(0.5, 6);
  });

  it('spreads the lap by distance, not by time', () => {
    // 2 s slow then 2 s fast: the slow half of the time covers a small share of the distance.
    const trace = buildTrace([sample(0, 72), sample(2, 72), sample(4, 360)])!;
    // 40 m at 72 km/h, then 120 m at an average 216 km/h: half the time, a quarter of the distance.
    expect(trace.points[1].f).toBeCloseTo(0.25, 6);
    expect(trace.points[1].t).toBe(2);
  });

  it('sorts unordered samples and rejects unusable input', () => {
    const trace = buildTrace([sample(2, 100), sample(0, 100), sample(1, 100)])!;
    expect(trace.points.map((p) => p.t)).toEqual([0, 1, 2]);
    expect(buildTrace([sample(0, 100)])).toBeNull();
    expect(buildTrace([sample(0, 0), sample(1, 0)])).toBeNull();
  });
});

describe('pointAt', () => {
  it('returns the nearest sample to a lap fraction', () => {
    const trace = buildTrace(Array.from({ length: 11 }, (_, i) => sample(i, 360, { n_gear: i })))!;
    expect(pointAt(trace, 0.52).gear).toBe(5);
    expect(pointAt(trace, 0.9999).gear).toBe(10);
    expect(pointAt(trace, 0).gear).toBe(0);
  });
});
