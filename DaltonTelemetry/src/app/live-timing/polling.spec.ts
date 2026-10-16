import { pollCadence } from './polling';

describe('pollCadence', () => {
  it('polls every 5 seconds against a self-hosted server', () => {
    expect(pollCadence(true)).toEqual({ fast: 5_000, slow: 5_000, mapLag: 5_000 });
  });

  it('keeps the public API under its rate limit', () => {
    const { fast, slow } = pollCadence(false);
    // fast group = 4 requests, slow group = up to 5; the public API allows 30 per minute
    const perMinute = (4 * 60_000) / fast + (5 * 60_000) / slow;
    expect(perMinute).toBeLessThanOrEqual(30);
  });

  it('lets the map trail by one fast poll', () => {
    for (const selfHosted of [true, false]) {
      const { fast, mapLag } = pollCadence(selfHosted);
      expect(mapLag).toBe(fast);
    }
  });
});
