import {
  clickAt,
  fromView,
  MIN_SPAN,
  NO_ZOOM,
  spanBetween,
  toView,
  visiblePoints,
  ZoomState,
} from './zoom';

describe('selecting a stretch to zoom into', () => {
  it('starts a selection on the first click and zooms on the second', () => {
    const started = clickAt(NO_ZOOM, 0.4);
    expect(started).toEqual({ anchor: 0.4, zoom: null });
    expect(clickAt(started, 0.6)).toEqual({ anchor: null, zoom: { from: 0.4, to: 0.6 } });
  });

  it('accepts the second click on either side of the first', () => {
    const state = clickAt(clickAt(NO_ZOOM, 0.7), 0.5);
    expect(state.zoom).toEqual({ from: 0.5, to: 0.7 });
  });

  it('drops a selection too narrow to be intended and keeps the current zoom', () => {
    const zoomed: ZoomState = { anchor: null, zoom: { from: 0.2, to: 0.8 } };
    const started = clickAt(zoomed, 0.5);
    expect(clickAt(started, 0.5 + MIN_SPAN / 2)).toEqual(zoomed);
    expect(spanBetween(0.5, 0.5 + MIN_SPAN)).toEqual({ from: 0.5, to: 0.5 + MIN_SPAN });
  });

  it('can zoom further into a zoomed stretch', () => {
    const zoomed = clickAt(clickAt(NO_ZOOM, 0.2), 0.8);
    const deeper = clickAt(clickAt(zoomed, 0.4), 0.5);
    expect(deeper.zoom).toEqual({ from: 0.4, to: 0.5 });
  });
});

describe('mapping between the lap and the visible chart', () => {
  const zoom = { from: 0.4, to: 0.6 };

  it('is the identity without a zoom', () => {
    expect(toView(0.3, null)).toBe(0.3);
    expect(fromView(0.3, null)).toBe(0.3);
  });

  it('stretches the zoomed stretch over the whole chart', () => {
    expect(toView(0.4, zoom)).toBeCloseTo(0);
    expect(toView(0.5, zoom)).toBeCloseTo(0.5);
    expect(toView(0.6, zoom)).toBeCloseTo(1);
    expect(toView(0.3, zoom)).toBeLessThan(0);
    expect(fromView(0, zoom)).toBeCloseTo(0.4);
    expect(fromView(1, zoom)).toBeCloseTo(0.6);
  });

  it('round-trips a position', () => {
    expect(fromView(toView(0.537, zoom), zoom)).toBeCloseTo(0.537);
  });
});

describe('visiblePoints', () => {
  const points = Array.from({ length: 11 }, (_, i) => ({ f: i / 10, v: i }));

  it('keeps everything without a zoom', () => {
    expect(visiblePoints(points, null)).toBe(points);
  });

  it('keeps the points in the zoom plus one on each side', () => {
    expect(visiblePoints(points, { from: 0.35, to: 0.55 }).map((p) => p.v)).toEqual([3, 4, 5, 6]);
  });

  it('copes with a zoom at the ends and beyond the data', () => {
    expect(visiblePoints(points, { from: 0, to: 0.15 }).map((p) => p.v)).toEqual([0, 1, 2]);
    expect(visiblePoints(points, { from: 0.9, to: 1 }).map((p) => p.v)).toEqual([8, 9, 10]);
    expect(visiblePoints(points, { from: 1.2, to: 1.4 }).map((p) => p.v)).toEqual([10]);
    expect(visiblePoints([], { from: 0.1, to: 0.2 })).toEqual([]);
  });
});
