import { pointAtFraction, stretchOfOutline } from './track-position';

// a square path of side 10 starting at the origin: 40 long in all
const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
  { x: 0, y: 0 },
];

describe('pointAtFraction', () => {
  it('maps a fraction of the lap to a fraction of the outline length', () => {
    expect(pointAtFraction(square, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtFraction(square, 0.25)).toEqual({ x: 10, y: 0 });
    expect(pointAtFraction(square, 0.125)).toEqual({ x: 5, y: 0 });
    expect(pointAtFraction(square, 0.5)).toEqual({ x: 10, y: 10 });
    expect(pointAtFraction(square, 1)).toEqual({ x: 0, y: 0 });
  });

  it('interpolates between vertices on any leg', () => {
    const p = pointAtFraction(square, 0.375)!;
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(5);
  });

  it('clamps positions outside the lap', () => {
    expect(pointAtFraction(square, -0.3)).toEqual({ x: 0, y: 0 });
    expect(pointAtFraction(square, 1.4)).toEqual({ x: 0, y: 0 });
  });

  it('has no point for an outline too short to draw', () => {
    expect(pointAtFraction([], 0.5)).toBeNull();
    expect(pointAtFraction([{ x: 1, y: 1 }], 0.5)).toBeNull();
  });
});

describe('stretchOfOutline', () => {
  it('returns the part between two positions, with interpolated ends', () => {
    expect(stretchOfOutline(square, 0.125, 0.375)).toEqual([
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
  });

  it('accepts the positions in either order', () => {
    expect(stretchOfOutline(square, 0.375, 0.125)).toEqual(stretchOfOutline(square, 0.125, 0.375));
  });

  it('covers the whole outline for 0..1 and is empty without an outline', () => {
    expect(stretchOfOutline(square, 0, 1)).toEqual(square);
    expect(stretchOfOutline([], 0, 1)).toEqual([]);
  });
});
