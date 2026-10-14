import { ErgastDriver, ErgastHistoricRace } from '../../core/ergast/ergast.model';

export interface Person {
  id: string;
  name: string;
}

export interface RankedEntry extends Person {
  count: number;
  seasons: number[];
}

export interface LapRecord {
  time: string;
  seconds: number;
  driver: string;
  constructor: string;
  season: number;
  speedKph: number | null;
}

export interface Edition {
  season: number;
  raceName: string;
  date: string;
  winner: Person | null;
  constructor: string | null;
  pole: Person | null;
  poleWon: boolean;
  fastestLap: { driver: string; time: string } | null;
}

export interface CircuitStats {
  races: number;
  firstSeason: number | null;
  lastSeason: number | null;
  /** Newest first. */
  editions: Edition[];
  winningDrivers: RankedEntry[];
  winningConstructors: RankedEntry[];
  poleSitters: RankedEntry[];
  /** Fastest race lap ever recorded here. Layouts change, so older laps are not always comparable. */
  lapRecord: LapRecord | null;
  /** Of the Grands Prix with a known pole and winner, how many were won from pole. */
  poleToWin: { won: number; of: number };
}

const personOf = (d: ErgastDriver): Person => ({
  id: d.driverId,
  name: `${d.givenName} ${d.familyName}`,
});

/** "1:45.599" -> 105.599 */
export function lapSeconds(time: string): number {
  const [minutes, rest] = time.includes(':') ? time.split(':') : ['0', time];
  return Number(minutes) * 60 + Number(rest);
}

function rank(entries: { person: Person; season: number }[]): RankedEntry[] {
  const byId = new Map<string, RankedEntry>();
  for (const { person, season } of entries) {
    const entry = byId.get(person.id) ?? { ...person, count: 0, seasons: [] };
    entry.count++;
    entry.seasons.push(season);
    byId.set(person.id, entry);
  }
  const latest = (e: RankedEntry) => Math.max(...e.seasons);
  return [...byId.values()].sort(
    (a, b) => b.count - a.count || latest(b) - latest(a) || a.name.localeCompare(b.name),
  );
}

/** Builds the per-circuit statistics from the winners, pole sitters and fastest laps of every race. */
export function buildCircuitStats(
  winners: ErgastHistoricRace[],
  poles: ErgastHistoricRace[],
  fastest: ErgastHistoricRace[],
): CircuitStats {
  const poleBySeason = new Map<number, Person>();
  for (const race of poles) {
    const row = race.QualifyingResults?.[0];
    if (row) poleBySeason.set(Number(race.season), personOf(row.Driver));
  }

  const fastestBySeason = new Map<
    number,
    { person: Person; constructor: string; time: string; speed: number | null }
  >();
  for (const race of fastest) {
    const row = race.Results?.[0];
    const time = row?.FastestLap?.Time?.time;
    if (!row || !time) continue;
    fastestBySeason.set(Number(race.season), {
      person: personOf(row.Driver),
      constructor: row.Constructor.name,
      time,
      speed: Number(row.FastestLap?.AverageSpeed?.speed) || null,
    });
  }

  const editions: Edition[] = [];
  const winningDrivers: { person: Person; season: number }[] = [];
  const winningConstructors: { person: Person; season: number }[] = [];
  const poleSitters: { person: Person; season: number }[] = [];
  let polesKnown = 0;
  let polesWon = 0;

  for (const race of winners) {
    const season = Number(race.season);
    const row = race.Results?.[0];
    if (!row) continue;

    const winner = personOf(row.Driver);
    const pole = poleBySeason.get(season) ?? null;
    const lap = fastestBySeason.get(season) ?? null;

    winningDrivers.push({ person: winner, season });
    winningConstructors.push({
      person: { id: row.Constructor.constructorId, name: row.Constructor.name },
      season,
    });
    if (pole) {
      poleSitters.push({ person: pole, season });
      polesKnown++;
      if (pole.id === winner.id) polesWon++;
    }

    editions.push({
      season,
      raceName: race.raceName,
      date: race.date,
      winner,
      constructor: row.Constructor.name,
      pole,
      poleWon: !!pole && pole.id === winner.id,
      fastestLap: lap ? { driver: lap.person.name, time: lap.time } : null,
    });
  }
  editions.sort((a, b) => b.season - a.season);

  let lapRecord: LapRecord | null = null;
  for (const [season, lap] of fastestBySeason) {
    const seconds = lapSeconds(lap.time);
    if (!lapRecord || seconds < lapRecord.seconds) {
      lapRecord = {
        time: lap.time,
        seconds,
        driver: lap.person.name,
        constructor: lap.constructor,
        season,
        speedKph: lap.speed,
      };
    }
  }

  const seasons = editions.map((e) => e.season);
  return {
    races: editions.length,
    firstSeason: seasons.length ? Math.min(...seasons) : null,
    lastSeason: seasons.length ? Math.max(...seasons) : null,
    editions,
    winningDrivers: rank(winningDrivers),
    winningConstructors: rank(winningConstructors),
    poleSitters: rank(poleSitters),
    lapRecord,
    poleToWin: { won: polesWon, of: polesKnown },
  };
}
