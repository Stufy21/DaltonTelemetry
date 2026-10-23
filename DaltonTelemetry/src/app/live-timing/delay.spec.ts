import { DELAY_MAX_S, DELAY_STORAGE_KEY, clampDelay, readStoredDelay } from './delay';

describe('clampDelay', () => {
  it('keeps whole seconds in range', () => {
    expect(clampDelay(0)).toBe(0);
    expect(clampDelay(30)).toBe(30);
    expect(clampDelay('45')).toBe(45);
    expect(clampDelay(DELAY_MAX_S)).toBe(DELAY_MAX_S);
  });

  it('rounds, and clamps to the allowed range', () => {
    expect(clampDelay(12.6)).toBe(13);
    expect(clampDelay(-5)).toBe(0);
    expect(clampDelay(10_000)).toBe(DELAY_MAX_S);
  });

  it('treats junk as no delay', () => {
    expect(clampDelay('')).toBe(0);
    expect(clampDelay('abc')).toBe(0);
    expect(clampDelay(undefined)).toBe(0);
    expect(clampDelay(NaN)).toBe(0);
  });
});

describe('readStoredDelay', () => {
  it('reads the saved value', () => {
    const storage = { getItem: (key: string) => (key === DELAY_STORAGE_KEY ? '25' : null) };
    expect(readStoredDelay(storage)).toBe(25);
  });

  it('falls back to no delay without storage, with nothing saved, or when reading throws', () => {
    expect(readStoredDelay(null)).toBe(0);
    expect(readStoredDelay({ getItem: () => null })).toBe(0);
    expect(
      readStoredDelay({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(0);
  });
});
