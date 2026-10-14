/** 102.675 -> "1:42.675" */
export function formatLapTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(3).padStart(6, '0');
  return minutes > 0 ? `${minutes}:${rest}` : rest;
}

export function formatSector(seconds: number | null): string {
  return seconds == null ? '—' : seconds.toFixed(3);
}

/** Milliseconds since session start -> "1:02:03" (negative before the start). */
export function formatElapsed(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const COMPOUND_LETTER: Record<string, string> = {
  SOFT: 'S',
  MEDIUM: 'M',
  HARD: 'H',
  INTERMEDIATE: 'I',
  WET: 'W',
};
