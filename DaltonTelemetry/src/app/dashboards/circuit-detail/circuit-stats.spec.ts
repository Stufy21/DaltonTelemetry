import { ErgastDriver, ErgastHistoricRace } from '../../core/ergast/ergast.model';
import { buildCircuitStats, lapSeconds } from './circuit-stats';

const driver = (id: string, given: string, family: string): ErgastDriver => ({
  driverId: id,
  givenName: given,
  familyName: family,
  nationality: 'x',
});
const HAM = driver('hamilton', 'Lewis', 'Hamilton');
const VER = driver('max_verstappen', 'Max', 'Verstappen');
const ALO = driver('alonso', 'Fernando', 'Alonso');

const race = (season: number, extra: Partial<ErgastHistoricRace>): ErgastHistoricRace => ({
  season: String(season),
  round: '1',
  raceName: 'Test Grand Prix',
  date: `${season}-09-20`,
  Circuit: {} as ErgastHistoricRace['Circuit'],
  ...extra,
});

const win = (season: number, d: ErgastDriver, team: string) =>
  race(season, {
    Results: [
      { position: '1', Driver: d, Constructor: { constructorId: team.toLowerCase(), name: team } },
    ],
  });
const pole = (season: number, d: ErgastDriver) =>
  race(season, {
    QualifyingResults: [
      { position: '1', Driver: d, Constructor: { constructorId: 'x', name: 'X' } },
    ],
  });
const fast = (season: number, d: ErgastDriver, time: string, speed = '170.0') =>
  race(season, {
    Results: [
      {
        position: '5',
        Driver: d,
        Constructor: { constructorId: 'x', name: 'X' },
        FastestLap: { rank: '1', lap: '10', Time: { time }, AverageSpeed: { units: 'kph', speed } },
      },
    ],
  });

describe('lapSeconds', () => {
  it('parses minute:second lap times', () => {
    expect(lapSeconds('1:45.599')).toBeCloseTo(105.599, 6);
    expect(lapSeconds('59.2')).toBeCloseTo(59.2, 6);
  });
});

describe('buildCircuitStats', () => {
  const winners = [
    win(2022, VER, 'Red Bull'),
    win(2008, ALO, 'Renault'),
    win(2023, HAM, 'Mercedes'),
    win(2024, HAM, 'Mercedes'),
  ];
  const poles = [pole(2008, ALO), pole(2022, HAM), pole(2023, HAM), pole(2024, VER)];
  const fastest = [
    fast(2008, ALO, '1:45.599', '172.7'),
    fast(2022, VER, '1:46.000'),
    fast(2023, HAM, '1:35.867', '189.3'),
    fast(2024, VER, '1:36.000'),
  ];
  const stats = buildCircuitStats(winners, poles, fastest);

  it('lists the editions newest first with pole and fastest lap', () => {
    expect(stats.races).toBe(4);
    expect([stats.firstSeason, stats.lastSeason]).toEqual([2008, 2024]);
    expect(stats.editions.map((e) => e.season)).toEqual([2024, 2023, 2022, 2008]);
    const e2023 = stats.editions.find((e) => e.season === 2023)!;
    expect(e2023.winner?.name).toBe('Lewis Hamilton');
    expect(e2023.constructor).toBe('Mercedes');
    expect(e2023.pole?.name).toBe('Lewis Hamilton');
    expect(e2023.fastestLap).toEqual({ driver: 'Lewis Hamilton', time: '1:35.867' });
  });

  it('ranks winners, constructors and pole sitters', () => {
    expect(stats.winningDrivers.map((d) => [d.name, d.count])).toEqual([
      ['Lewis Hamilton', 2],
      ['Max Verstappen', 1],
      ['Fernando Alonso', 1],
    ]);
    // equal counts: the more recent winner first
    expect(stats.winningDrivers[1].name).toBe('Max Verstappen');
    expect(stats.winningConstructors[0]).toMatchObject({ name: 'Mercedes', count: 2 });
    expect(stats.poleSitters[0]).toMatchObject({
      name: 'Lewis Hamilton',
      count: 2,
      seasons: [2022, 2023],
    });
  });

  it('counts how often the pole sitter won', () => {
    // 2008 Alonso/Alonso yes, 2022 Hamilton/Verstappen no, 2023 yes, 2024 Verstappen/Hamilton no
    expect(stats.poleToWin).toEqual({ won: 2, of: 4 });
    expect(stats.editions.find((e) => e.season === 2008)!.poleWon).toBe(true);
    expect(stats.editions.find((e) => e.season === 2022)!.poleWon).toBe(false);
  });

  it('finds the lap record across all seasons', () => {
    expect(stats.lapRecord).toMatchObject({
      time: '1:35.867',
      driver: 'Lewis Hamilton',
      season: 2023,
      speedKph: 189.3,
    });
  });

  it('copes with a circuit that has not hosted a race yet', () => {
    const empty = buildCircuitStats([], [], []);
    expect(empty).toMatchObject({
      races: 0,
      firstSeason: null,
      lastSeason: null,
      lapRecord: null,
      poleToWin: { won: 0, of: 0 },
    });
    expect(empty.editions).toEqual([]);
  });

  it('tolerates seasons with missing pole or fastest-lap data', () => {
    const partial = buildCircuitStats([win(1995, ALO, 'Benetton')], [], []);
    expect(partial.editions[0]).toMatchObject({ pole: null, fastestLap: null, poleWon: false });
    expect(partial.poleToWin).toEqual({ won: 0, of: 0 });
  });
});
