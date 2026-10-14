import {
  OF1ChampionshipDriver,
  OF1ChampionshipTeam,
  OF1Driver,
} from '../../core/openf1/openf1.model';

/** Points for P1, P2, … of a Grand Prix and of a Sprint. */
export const RACE_POINTS: readonly number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const SPRINT_POINTS: readonly number[] = [8, 7, 6, 5, 4, 3, 2, 1];

export interface StandingRow {
  /** Driver number or team name: stable identity for the list. */
  key: string;
  label: string;
  /** Full driver name; null for teams. */
  detail: string | null;
  colour: string;
  position: number;
  /** Standing entering the race, when OpenF1 has one (not before a season's first race). */
  startPosition: number | null;
  points: number;
  /** Points the current race positions add to the standing. */
  gained: number;
}

const NO_START = 99;

export function pointsFor(position: number | undefined, scale: readonly number[]): number {
  return position && position > 0 ? (scale[position - 1] ?? 0) : 0;
}

/** Highest points first; a tie is broken by the earlier standing, then by identity. */
function rank(rows: Omit<StandingRow, 'position'>[]): StandingRow[] {
  return rows
    .sort(
      (a, b) =>
        b.points - a.points ||
        (a.startPosition ?? NO_START) - (b.startPosition ?? NO_START) ||
        a.key.localeCompare(b.key, undefined, { numeric: true }),
    )
    .map((row, i) => ({ ...row, position: i + 1 }));
}

const colourOf = (hex: string | null | undefined): string => (hex ? `#${hex}` : '#888888');

/**
 * Drivers' championship as it would stand if the race ended now: the standing entering the race
 * plus the points of each driver's current position. `started` is false on the grid, when
 * positions don't mean anything yet.
 */
export function projectDriverStandings(
  base: readonly OF1ChampionshipDriver[],
  drivers: ReadonlyMap<number, OF1Driver>,
  positions: ReadonlyMap<number, number>,
  scale: readonly number[],
  started: boolean,
): StandingRow[] {
  const byDriver = new Map(base.map((b) => [b.driver_number, b]));
  const numbers = new Set<number>([...byDriver.keys(), ...drivers.keys()]);

  return rank(
    [...numbers].map((n) => {
      const entry = byDriver.get(n);
      const driver = drivers.get(n);
      const gained = started ? pointsFor(positions.get(n), scale) : 0;
      return {
        key: String(n),
        label: driver?.name_acronym ?? `#${n}`,
        detail: driver?.full_name ?? null,
        colour: colourOf(driver?.team_colour),
        startPosition: entry?.position_start ?? null,
        points: (entry?.points_start ?? 0) + gained,
        gained,
      };
    }),
  );
}

/** Constructors' championship: a team scores the points of both its drivers. */
export function projectTeamStandings(
  base: readonly OF1ChampionshipTeam[],
  drivers: ReadonlyMap<number, OF1Driver>,
  positions: ReadonlyMap<number, number>,
  scale: readonly number[],
  started: boolean,
): StandingRow[] {
  const gainedByTeam = new Map<string, number>();
  const colourByTeam = new Map<string, string>();
  for (const [n, driver] of drivers) {
    if (!driver.team_name) continue;
    colourByTeam.set(driver.team_name, colourOf(driver.team_colour));
    const gained = started ? pointsFor(positions.get(n), scale) : 0;
    gainedByTeam.set(driver.team_name, (gainedByTeam.get(driver.team_name) ?? 0) + gained);
  }

  const byTeam = new Map(base.map((b) => [b.team_name, b]));
  const names = new Set<string>([...byTeam.keys(), ...gainedByTeam.keys()]);

  return rank(
    [...names].map((name) => {
      const entry = byTeam.get(name);
      const gained = gainedByTeam.get(name) ?? 0;
      return {
        key: name,
        label: name,
        detail: null,
        colour: colourByTeam.get(name) ?? '#888888',
        startPosition: entry?.position_start ?? null,
        points: (entry?.points_start ?? 0) + gained,
        gained,
      };
    }),
  );
}
