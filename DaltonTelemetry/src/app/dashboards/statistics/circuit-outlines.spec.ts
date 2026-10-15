import { describe, expect, it } from 'vitest';
import { CIRCUIT_OUTLINES } from './circuit-outlines';

describe('circuit outlines', () => {
  const entries = Object.entries(CIRCUIT_OUTLINES);

  it('covers the circuits of the calendar', () => {
    for (const id of ['monza', 'monaco', 'spa', 'silverstone', 'marina_bay', 'madring']) {
      expect(CIRCUIT_OUTLINES[id], id).toBeDefined();
    }
    expect(entries.length).toBeGreaterThanOrEqual(24);
  });

  it.each(entries)('%s is a closed path inside its box', (_id, outline) => {
    expect(outline.width).toBeGreaterThan(0);
    expect(outline.height).toBeGreaterThan(0);
    expect(outline.path).toMatch(/^M\d+ \d+(L\d+ \d+)+Z$/);

    const numbers = outline.path.match(/\d+/g)!.map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    expect(xs.length).toBeGreaterThan(20);
    expect(Math.max(...xs)).toBeLessThanOrEqual(outline.width);
    expect(Math.max(...ys)).toBeLessThanOrEqual(outline.height);
  });
});
