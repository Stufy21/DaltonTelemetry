import {
  OF1Driver,
  OF1Gap,
  OF1Interval,
  OF1Lap,
  OF1Location,
  OF1Pit,
  OF1Position,
  OF1RaceControl,
  OF1Stint,
  OF1TeamRadio,
  OF1Weather,
} from '../core/openf1/openf1.model';
import { TimedSeries, upperBound } from './timed-series';
import { withDistinctColour } from './team-colours';

export type SectorTone = 'purple' | 'green' | 'yellow' | 'none';
export type TrackStatusTone = 'green' | 'yellow' | 'red' | 'sc' | 'vsc' | 'chequered' | 'none';

export interface SectorView {
  time: number | null;
  tone: SectorTone;
}

export interface TimingRow {
  position: number | null;
  driverNumber: number;
  acronym: string;
  fullName: string;
  teamName: string;
  teamColour: string;
  gap: string;
  interval: string;
  lastLap: number | null;
  lastLapTone: SectorTone;
  bestLap: number | null;
  sectors: [SectorView, SectorView, SectorView];
  compound: string | null;
  tyreAge: number | null;
  pitStops: number;
  inPit: boolean;
  currentLap: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CarPoint extends Point {
  driverNumber: number;
  acronym: string;
  colour: string;
}

export interface ReferenceLap {
  driver: number;
  /** Lap start/end as ISO timestamps, ready to be used as API filters. */
  from: string;
  to: string;
}

export type FlagTone = 'yellow' | 'red' | 'sc' | 'vsc' | 'chequered';

/** A stretch of the session under a flag or safety car, for the timeline. */
export interface FlagSegment {
  from: number;
  to: number;
  tone: FlagTone;
  label: string;
}

export interface LapSummary {
  lap: number;
  /** Lap start/end as epoch ms. */
  start: number;
  end: number;
  duration: number | null;
  sectors: [number | null, number | null, number | null];
  pitOut: boolean;
}

export interface TrackStatus {
  label: string;
  tone: TrackStatusTone;
}

interface LapRecord {
  lap: OF1Lap;
  start: number;
  end: number;
  /** Personal bests including this lap. */
  best: [number, number, number, number];
}

const toMs = (iso: string): number => Date.parse(iso);

/** Samples further apart than this (a gap in the feed) are not bridged by interpolation. */
export const MAX_INTERPOLATION_GAP_MS = 1500;

export class TimingDataset {
  readonly drivers = new Map<number, OF1Driver>();
  readonly raceControl = new TimedSeries<OF1RaceControl>();
  readonly weather = new TimedSeries<OF1Weather>();
  readonly radio = new TimedSeries<OF1TeamRadio>();

  private locations = new Map<number, TimedSeries<Point>>();
  private positions = new Map<number, TimedSeries<number>>();
  private intervals = new Map<number, TimedSeries<OF1Interval>>();
  private pits = new Map<number, TimedSeries<OF1Pit>>();
  private stints = new Map<number, OF1Stint[]>();
  private lapsByDriver = new Map<number, Map<number, OF1Lap>>();
  private pitIndex = new Map<string, OF1Pit>();
  private seenRaceControl = new Set<string>();
  private seenRadio = new Set<string>();
  private lapTracks = new Map<number, LapRecord[]>();
  private lapsDirty = false;

  get hasData(): boolean {
    return this.positions.size > 0 || this.lapsByDriver.size > 0;
  }

  get hasIntervals(): boolean {
    return this.intervals.size > 0;
  }

  /** Timestamp of the newest sample ingested, used to pick the live polling cursor. */
  get lastDataTime(): number {
    let max = Math.max(this.raceControl.lastTime, this.weather.lastTime, this.radio.lastTime);
    for (const s of this.positions.values()) max = Math.max(max, s.lastTime);
    for (const s of this.intervals.values()) max = Math.max(max, s.lastTime);
    return max;
  }

  setDrivers(rows: OF1Driver[]): void {
    this.drivers.clear();
    for (const d of rows) this.drivers.set(d.driver_number, withDistinctColour(d));
  }

  addPositions(rows: OF1Position[]): void {
    for (const r of rows)
      this.series(this.positions, r.driver_number).add(toMs(r.date), r.position);
  }

  addIntervals(rows: OF1Interval[]): void {
    for (const r of rows) this.series(this.intervals, r.driver_number).add(toMs(r.date), r);
  }

  addLocations(rows: OF1Location[]): void {
    for (const r of rows) {
      // OpenF1 emits (0,0,0) when a car has no fix; it would drag the car to the map origin.
      if (r.x === 0 && r.y === 0 && r.z === 0) continue;
      this.series(this.locations, r.driver_number).add(toMs(r.date), { x: r.x, y: r.y });
    }
  }

  /** A stop can be reported again once its duration is known, so rows merge by (driver, lap). */
  addPits(rows: OF1Pit[]): void {
    for (const r of rows) {
      const key = `${r.driver_number}:${r.lap_number}`;
      const existing = this.pitIndex.get(key);
      if (existing) {
        existing.pit_duration = r.pit_duration ?? existing.pit_duration;
        continue;
      }
      const copy = { ...r };
      this.pitIndex.set(key, copy);
      this.series(this.pits, r.driver_number).add(toMs(r.date), copy);
    }
  }

  addRaceControl(rows: OF1RaceControl[]): void {
    for (const r of rows) {
      const key = `${r.date}|${r.message}`;
      if (this.seenRaceControl.has(key)) continue;
      this.seenRaceControl.add(key);
      this.raceControl.add(toMs(r.date), r);
    }
  }

  addWeather(rows: OF1Weather[]): void {
    for (const r of rows) this.weather.add(toMs(r.date), r);
  }

  addRadio(rows: OF1TeamRadio[]): void {
    for (const r of rows) {
      if (this.seenRadio.has(r.recording_url)) continue;
      this.seenRadio.add(r.recording_url);
      this.radio.add(toMs(r.date), r);
    }
  }

  setStints(rows: OF1Stint[]): void {
    this.stints.clear();
    for (const r of rows) {
      const list = this.stints.get(r.driver_number) ?? [];
      list.push(r);
      this.stints.set(r.driver_number, list);
    }
    for (const list of this.stints.values()) list.sort((a, b) => a.lap_start - b.lap_start);
  }

  /** Laps are rewritten once completed, so merge by (driver, lap number). */
  mergeLaps(rows: OF1Lap[]): void {
    for (const r of rows) {
      const laps = this.lapsByDriver.get(r.driver_number) ?? new Map<number, OF1Lap>();
      laps.set(r.lap_number, r);
      this.lapsByDriver.set(r.driver_number, laps);
    }
    this.lapsDirty = true;
  }

  /** Highest lap number seen across all drivers. */
  get maxLap(): number {
    let max = 0;
    for (const laps of this.lapsByDriver.values())
      for (const n of laps.keys()) max = Math.max(max, n);
    return max;
  }

  leaderLap(t: number): number {
    let max = 0;
    for (const track of this.tracks().values()) {
      max = Math.max(max, this.currentLap(track, t));
    }
    return max;
  }

  /** The last `count` laps a driver had completed by time t, oldest first. */
  recentLaps(driver: number, t: number, count: number): LapSummary[] {
    const track = this.tracks().get(driver) ?? [];
    const done = upperBound(track, t, (r) => r.end);
    return track.slice(Math.max(0, done - count), done).map((r) => ({
      lap: r.lap.lap_number,
      start: r.start,
      end: r.end,
      duration: r.lap.lap_duration,
      sectors: [r.lap.duration_sector_1, r.lap.duration_sector_2, r.lap.duration_sector_3],
      pitOut: r.lap.is_pit_out_lap,
    }));
  }

  /**
   * Cars with a recent enough fix at time t. Positions are interpolated between the two
   * surrounding samples (~4 Hz) so the dots glide instead of stepping.
   */
  cars(t: number, maxAgeMs = 30_000): CarPoint[] {
    const cars: CarPoint[] = [];
    for (const [driverNumber, series] of this.locations) {
      const { prev, next } = series.bracket(t);
      if (!prev || t - prev.t > maxAgeMs) continue;

      let { x, y } = prev.v;
      if (next && next.t - prev.t <= MAX_INTERPOLATION_GAP_MS) {
        const k = (t - prev.t) / (next.t - prev.t);
        x += (next.v.x - x) * k;
        y += (next.v.y - y) * k;
      }

      const driver = this.drivers.get(driverNumber);
      cars.push({
        driverNumber,
        acronym: driver?.name_acronym ?? String(driverNumber),
        colour: driver?.team_colour ? `#${driver.team_colour}` : '#888888',
        x,
        y,
      });
    }
    return cars;
  }

  /**
   * A clean flying lap (fastest, not an out-lap) whose coordinates draw the circuit outline,
   * or null while no lap has been completed yet.
   */
  referenceLap(): ReferenceLap | null {
    let best: LapRecord | null = null;
    for (const track of this.tracks().values()) {
      for (const rec of track) {
        const duration = rec.lap.lap_duration;
        if (!duration || rec.lap.is_pit_out_lap || !Number.isFinite(rec.end)) continue;
        if (!best || duration < (best.lap.lap_duration as number)) best = rec;
      }
    }
    if (!best) return null;
    return {
      driver: best.lap.driver_number,
      from: new Date(best.start).toISOString(),
      to: new Date(best.end).toISOString(),
    };
  }

  /**
   * Flag periods up to `end`, derived from race control messages. Only one condition is shown at
   * a time, by severity: red flag > safety car > virtual safety car > yellow (any sector).
   */
  flagSegments(end: number): FlagSegment[] {
    const segments: FlagSegment[] = [];
    let base: 'red' | 'sc' | 'vsc' | null = null;
    let trackYellow = false;
    const yellowSectors = new Set<number>();
    let open: { tone: FlagTone; from: number; label: string } | null = null;

    const close = (at: number) => {
      if (open) segments.push({ ...open, to: Math.max(at, open.from) });
      open = null;
    };
    const clearAll = () => {
      base = null;
      trackYellow = false;
      yellowSectors.clear();
    };

    for (const { t, v: m } of this.raceControl.entries()) {
      if (t > end) break;
      const text = m.message.toUpperCase();

      if (m.category === 'SafetyCar') {
        base = text.includes('VSC') || text.includes('VIRTUAL') ? 'vsc' : 'sc';
      } else if (m.category === 'SessionStatus' && /STARTED|RESUMED/.test(text)) {
        if (base === 'red') base = null;
      } else if (m.category === 'Flag') {
        const track = m.scope === 'Track' || m.scope == null;
        switch (m.flag) {
          case 'RED':
            base = 'red';
            break;
          case 'YELLOW':
          case 'DOUBLE YELLOW':
            if (m.scope === 'Sector' && m.sector != null) yellowSectors.add(m.sector);
            else if (track) trackYellow = true;
            break;
          case 'CLEAR':
            if (m.scope === 'Sector' && m.sector != null) yellowSectors.delete(m.sector);
            else if (track) clearAll();
            break;
          case 'GREEN':
            if (track) clearAll();
            break;
          case 'CHEQUERED':
            close(t);
            segments.push({ from: t, to: t, tone: 'chequered', label: 'Chequered flag' });
            clearAll();
            continue;
        }
      }

      const tone: FlagTone | null = base ?? (trackYellow || yellowSectors.size ? 'yellow' : null);
      if (tone === (open as { tone: FlagTone } | null)?.tone) continue;
      close(t);
      if (tone) open = { tone, from: t, label: flagLabel(tone, m.lap_number) };
    }
    close(end);
    return segments.filter((s) => s.to >= s.from);
  }

  trackStatus(t: number): TrackStatus {
    const messages = this.raceControl.latest(t, 400);
    for (const m of messages) {
      const status = statusFromMessage(m);
      if (status) return status;
    }
    return { label: '—', tone: 'none' };
  }

  rows(t: number): TimingRow[] {
    const tracks = this.tracks();
    const overall = this.overallBest(tracks, t);
    const ids = new Set<number>([...this.drivers.keys(), ...this.positions.keys()]);

    const rows: TimingRow[] = [];
    for (const id of ids) {
      const driver = this.drivers.get(id);
      const track = tracks.get(id) ?? [];
      const completed = upperBound(track, t, (r) => r.end);
      const rec = completed > 0 ? track[completed - 1] : null;
      const currentLap = this.currentLap(track, t);

      const lastLap = rec?.lap.lap_duration ?? null;
      const sectorTimes = rec
        ? [rec.lap.duration_sector_1, rec.lap.duration_sector_2, rec.lap.duration_sector_3]
        : [null, null, null];
      const sectors = sectorTimes.map((time, i) =>
        sectorView(time, overall[i + 1], finiteOrNull(rec?.best[i + 1])),
      ) as TimingRow['sectors'];

      const stint = this.stintAt(id, Math.max(1, currentLap));
      const interval = this.intervals.get(id)?.at(t);
      const position = this.positions.get(id)?.at(t) ?? null;

      rows.push({
        position,
        driverNumber: id,
        acronym: driver?.name_acronym ?? String(id),
        fullName: driver?.full_name ?? `#${id}`,
        teamName: driver?.team_name ?? '',
        teamColour: driver?.team_colour ? `#${driver.team_colour}` : '#888888',
        gap: interval ? formatGap(interval.gap_to_leader) : '—',
        interval: interval ? formatGap(interval.interval) : '—',
        lastLap,
        lastLapTone: sectorView(lastLap, overall[0], finiteOrNull(rec?.best[0])).tone,
        bestLap: finiteOrNull(rec?.best[0]),
        sectors,
        compound: stint?.compound ?? null,
        tyreAge: stint
          ? (stint.tyre_age_at_start ?? 0) + Math.max(1, currentLap) - stint.lap_start
          : null,
        pitStops: this.pits.get(id)?.count(t) ?? 0,
        inPit: this.isInPit(id, t),
        currentLap,
      });
    }

    rows.sort(
      (a, b) => (a.position ?? 999) - (b.position ?? 999) || a.driverNumber - b.driverNumber,
    );

    if (!this.hasIntervals) fillGapsFromBestLaps(rows);
    else if (rows[0]?.position === 1) {
      rows[0].gap = 'Leader';
      rows[0].interval = '—';
    }
    return rows;
  }

  private currentLap(track: LapRecord[], t: number): number {
    const n = upperBound(track, t, (r) => r.start);
    return n > 0 ? track[n - 1].lap.lap_number : 0;
  }

  private stintAt(driver: number, lap: number): OF1Stint | undefined {
    const list = this.stints.get(driver);
    if (!list) return undefined;
    let found: OF1Stint | undefined;
    for (const s of list) if (s.lap_start <= lap) found = s;
    return found ?? list[0];
  }

  private isInPit(driver: number, t: number): boolean {
    const series = this.pits.get(driver);
    const pit = series?.at(t);
    if (!pit) return false;
    const lastAt = toMs(pit.date);
    return t - lastAt < ((pit.pit_duration ?? 25) + 2) * 1000;
  }

  private overallBest(
    tracks: Map<number, LapRecord[]>,
    t: number,
  ): [number, number, number, number] {
    const best: [number, number, number, number] = [Infinity, Infinity, Infinity, Infinity];
    for (const track of tracks.values()) {
      const n = upperBound(track, t, (r) => r.end);
      if (n === 0) continue;
      const mine = track[n - 1].best;
      for (let i = 0; i < 4; i++) best[i] = Math.min(best[i], mine[i]);
    }
    return best;
  }

  private series<T>(map: Map<number, TimedSeries<T>>, driver: number): TimedSeries<T> {
    let s = map.get(driver);
    if (!s) map.set(driver, (s = new TimedSeries<T>()));
    return s;
  }

  private tracks(): Map<number, LapRecord[]> {
    if (!this.lapsDirty) return this.lapTracks;
    this.lapTracks = new Map();
    for (const [driver, laps] of this.lapsByDriver) {
      const ordered = [...laps.values()]
        .filter((l) => l.date_start)
        .sort((a, b) => a.lap_number - b.lap_number);
      const records: LapRecord[] = [];
      let best: [number, number, number, number] = [Infinity, Infinity, Infinity, Infinity];
      ordered.forEach((lap, i) => {
        const start = toMs(lap.date_start as string);
        const next = ordered[i + 1]?.date_start;
        const end = lap.lap_duration
          ? start + lap.lap_duration * 1000
          : next
            ? toMs(next)
            : Infinity;
        best = [
          Math.min(best[0], lap.lap_duration ?? Infinity),
          Math.min(best[1], lap.duration_sector_1 ?? Infinity),
          Math.min(best[2], lap.duration_sector_2 ?? Infinity),
          Math.min(best[3], lap.duration_sector_3 ?? Infinity),
        ];
        records.push({ lap, start, end, best });
      });
      this.lapTracks.set(driver, records);
    }
    this.lapsDirty = false;
    return this.lapTracks;
  }
}

/**
 * Running bests start at Infinity until a lap has a valid time (an out-lap, for instance, has
 * none), and Infinity must not reach the screen or the gap arithmetic.
 */
function finiteOrNull(value: number | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function sectorView(
  time: number | null,
  overallBest: number,
  personalBest: number | null,
): SectorView {
  if (time == null) return { time: null, tone: 'none' };
  if (time <= overallBest) return { time, tone: 'purple' };
  if (personalBest != null && time <= personalBest) return { time, tone: 'green' };
  return { time, tone: 'yellow' };
}

export function formatGap(gap: OF1Gap): string {
  if (gap == null) return '—';
  if (typeof gap === 'string') return gap;
  return `+${gap.toFixed(3)}`;
}

/** Practice/qualifying have no interval feed, so rank gaps come from best laps instead. */
function fillGapsFromBestLaps(rows: TimingRow[]): void {
  const leaderBest = rows[0]?.bestLap ?? null;
  rows.forEach((row, i) => {
    const ahead = i > 0 ? rows[i - 1].bestLap : null;
    if (i === 0) {
      row.gap = 'Leader';
      row.interval = '—';
      return;
    }
    row.gap = row.bestLap != null && leaderBest != null ? formatGap(row.bestLap - leaderBest) : '—';
    row.interval = row.bestLap != null && ahead != null ? formatGap(row.bestLap - ahead) : '—';
  });
}

export const FLAG_NAMES: Record<FlagTone, string> = {
  yellow: 'Yellow flag',
  red: 'Red flag',
  sc: 'Safety car',
  vsc: 'Virtual safety car',
  chequered: 'Chequered flag',
};

function flagLabel(tone: FlagTone, lap: number | null): string {
  return lap ? `${FLAG_NAMES[tone]} · lap ${lap}` : FLAG_NAMES[tone];
}

function statusFromMessage(m: OF1RaceControl): TrackStatus | null {
  const text = m.message.toUpperCase();
  if (m.category === 'SafetyCar') {
    if (text.includes('VSC') || text.includes('VIRTUAL')) return { label: 'VSC', tone: 'vsc' };
    return { label: 'Safety Car', tone: 'sc' };
  }
  if (m.category === 'Flag' && (m.scope === 'Track' || m.flag === 'CHEQUERED')) {
    switch (m.flag) {
      case 'GREEN':
      case 'CLEAR':
        return { label: 'Green', tone: 'green' };
      case 'YELLOW':
      case 'DOUBLE YELLOW':
        return { label: 'Yellow', tone: 'yellow' };
      case 'RED':
        return { label: 'Red flag', tone: 'red' };
      case 'CHEQUERED':
        return { label: 'Finished', tone: 'chequered' };
    }
  }
  return null;
}
