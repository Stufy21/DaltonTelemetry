import { arcPath, clamp01, gearLabel, polar, speedAngle } from './gauge';

describe('gauge geometry', () => {
  it("converts angles clockwise from 3 o'clock", () => {
    const east = polar(10, 0);
    const south = polar(10, 90);
    expect([Math.round(east.x), Math.round(east.y)]).toEqual([10, 0]);
    expect([Math.round(south.x), Math.round(south.y)]).toEqual([0, 10]);
  });

  it('maps speed to the 270° dial starting bottom-left', () => {
    expect(speedAngle(0)).toBe(135);
    expect(speedAngle(180)).toBe(270);
    expect(speedAngle(360)).toBe(405);
    expect(speedAngle(999)).toBe(405);
    expect(speedAngle(-5)).toBe(135);
  });

  it('draws arcs in the requested direction', () => {
    expect(arcPath(10, 0, 90)).toBe('M10 0A10 10 0 0 1 0 10');
    expect(arcPath(10, 90, 0)).toBe('M0 10A10 10 0 0 0 10 0');
    // more than half a circle needs the large-arc flag
    expect(arcPath(10, 0, 270)).toContain(' 0 1 1 ');
  });

  it('clamps fractions and labels neutral', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-1)).toBe(0);
    expect(gearLabel(0)).toBe('N');
    expect(gearLabel(7)).toBe('7');
    expect(gearLabel(null)).toBe('–');
  });
});
