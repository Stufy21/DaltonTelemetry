/** Angles are degrees, clockwise from 3 o'clock (SVG convention, y pointing down). */
export function polar(radius: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** SVG path for an arc centred on the origin, from one angle to another (either direction). */
export function arcPath(radius: number, from: number, to: number): string {
  const start = polar(radius, from);
  const end = polar(radius, to);
  const clockwise = to >= from;
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${round(start.x)} ${round(start.y)}A${radius} ${radius} 0 ${large} ${clockwise ? 1 : 0} ${round(end.x)} ${round(end.y)}`;
}

/** Fraction clamped to 0..1. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const SPEED_MAX = 360;
export const SPEED_START = 135;
export const SPEED_SWEEP = 270;
export const SPEED_TICKS = [60, 120, 180, 240, 300, 360];

/** Angle on the speed dial for a speed in km/h. */
export function speedAngle(kmh: number): number {
  return SPEED_START + SPEED_SWEEP * clamp01(kmh / SPEED_MAX);
}

/** OpenF1 reports neutral as gear 0. */
export function gearLabel(gear: number | null | undefined): string {
  if (gear == null) return '–';
  return gear === 0 ? 'N' : String(gear);
}
