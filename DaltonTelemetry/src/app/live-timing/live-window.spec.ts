import { describe, expect, it } from 'vitest';
import { LIVE_OVERRUN_MS, LIVE_WINDOW_AFTER_MS, liveWindowEnd } from './live-window';

const END = Date.parse('2026-11-01T22:00:00Z');

describe('liveWindowEnd', () => {
  it('closes shortly after the scheduled end once the chequered flag has been shown', () => {
    expect(liveWindowEnd(END, true)).toBe(END + LIVE_WINDOW_AFTER_MS);
  });

  it('keeps a session that overruns its scheduled end live until the flag', () => {
    const tenPastEnd = END + LIVE_WINDOW_AFTER_MS + 1000;
    expect(liveWindowEnd(END, false)).toBeGreaterThan(tenPastEnd);
    expect(liveWindowEnd(END, false)).toBe(END + LIVE_OVERRUN_MS);
  });
});
