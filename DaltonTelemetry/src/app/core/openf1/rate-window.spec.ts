import { RateWindow } from './rate-window';

const limits = { minGapMs: 400, maxPerWindow: 3, windowMs: 10_000 };

describe('RateWindow', () => {
  it('sends the first request immediately and spaces the following ones', () => {
    const w = new RateWindow(limits);
    expect(w.reserve(1000)).toBe(1000);
    expect(w.reserve(1000)).toBe(1400);
    expect(w.reserve(1000)).toBe(1800);
  });

  it('delays a request that would exceed the per-window cap until the oldest slot expires', () => {
    const w = new RateWindow(limits);
    w.reserve(1000);
    w.reserve(1000);
    w.reserve(1000); // 1000, 1400, 1800
    // a fourth must wait for the first (1000) to leave the 10 s window
    expect(w.reserve(1000)).toBe(11_000);
  });

  it('forgets slots that have left the window', () => {
    const w = new RateWindow(limits);
    w.reserve(0);
    w.reserve(0);
    w.reserve(0);
    expect(w.reserve(60_000)).toBe(60_000);
    expect(w.scheduled).toEqual([60_000]);
  });

  it('honours a cooldown and restores persisted slots', () => {
    const w = new RateWindow(limits, [900, 500]);
    expect(w.scheduled).toEqual([500, 900]);
    expect(w.reserve(1000, 5000)).toBe(5000);
  });
});
