import { formatLapTime, formatSector } from '../format';
import { LapSummary } from '../timing-dataset';

export interface BestCell {
  text: string;
  /** The quickest of the drivers on this row (only marked when there is more than one time). */
  fastest: boolean;
}

/** One line of the best-laps table: a measure, a cell per driver and B minus A. */
export interface BestRow {
  label: string;
  cells: BestCell[];
  /** B minus A in seconds (negative = B faster); null when either driver has no time. */
  delta: number | null;
}

const NONE = '–';

/** The index of the smallest time, or -1 when fewer than two drivers have one or they tie. */
function fastestIndex(values: (number | null)[]): number {
  const timed = values.filter((v): v is number => v != null);
  if (timed.length < 2) return -1;
  const best = Math.min(...timed);
  return timed.filter((v) => v === best).length === 1 ? values.indexOf(best) : -1;
}

/**
 * The best-laps comparison as rows (lap, time, S1-S3) by driver. Drivers are the columns because
 * there are at most two of them, so a narrow panel has room for every number.
 */
export function buildBestTable(laps: (LapSummary | null)[]): BestRow[] {
  const measure = (
    label: string,
    pick: (lap: LapSummary) => number | null,
    format: (value: number | null) => string,
  ): BestRow => {
    const values = laps.map((lap) => (lap ? pick(lap) : null));
    const fastest = fastestIndex(values);
    const [a, b] = values;
    return {
      label,
      cells: values.map((v, i) => ({ text: v == null ? NONE : format(v), fastest: i === fastest })),
      delta: a != null && b != null ? b - a : null,
    };
  };

  return [
    {
      label: 'Lap',
      cells: laps.map((lap) => ({ text: lap ? String(lap.lap) : NONE, fastest: false })),
      delta: null,
    },
    measure('Time', (lap) => lap.duration, formatLapTime),
    measure('S1', (lap) => lap.sectors[0], formatSector),
    measure('S2', (lap) => lap.sectors[1], formatSector),
    measure('S3', (lap) => lap.sectors[2], formatSector),
  ];
}
