/** A stretch of the lap, as fractions of its length (0 = start line, 1 = back at the line). */
export interface Span {
  from: number;
  to: number;
}

/** What the telemetry charts show: the zoomed stretch, and the first click of a selection. */
export interface ZoomState {
  /** Where the first click of a selection landed, while waiting for the second. */
  anchor: number | null;
  /** The stretch the charts are zoomed to; null shows the whole lap. */
  zoom: Span | null;
}

export const NO_ZOOM: ZoomState = { anchor: null, zoom: null };
/** A selection narrower than this (1% of the lap, ~50 m) is a stray click, not a zoom. */
export const MIN_SPAN = 0.01;

/** The ordered stretch between two clicks, or null when it is too narrow to zoom into. */
export function spanBetween(a: number, b: number): Span | null {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  return to - from >= MIN_SPAN ? { from, to } : null;
}

/** First click starts a selection, second click zooms to it (a too-narrow one is dropped). */
export function clickAt(state: ZoomState, f: number): ZoomState {
  if (state.anchor == null) return { ...state, anchor: f };
  const span = spanBetween(state.anchor, f);
  return span ? { anchor: null, zoom: span } : { ...state, anchor: null };
}

/** Position along the whole lap -> position across the visible chart (0..1, outside = hidden). */
export function toView(f: number, zoom: Span | null): number {
  return zoom ? (f - zoom.from) / (zoom.to - zoom.from) : f;
}

/** Position across the visible chart (0..1) -> position along the whole lap. */
export function fromView(x: number, zoom: Span | null): number {
  return zoom ? zoom.from + x * (zoom.to - zoom.from) : x;
}

/** The points inside the zoom, plus the one on each side so the lines run off the edges. */
export function visiblePoints<T extends { f: number }>(points: T[], zoom: Span | null): T[] {
  if (!zoom) return points;
  const first = points.findIndex((p) => p.f >= zoom.from);
  if (first < 0) return points.slice(-1);
  let last = points.length - 1;
  while (last > first && points[last - 1].f > zoom.to) last--;
  return points.slice(Math.max(0, first - 1), last + 1);
}
