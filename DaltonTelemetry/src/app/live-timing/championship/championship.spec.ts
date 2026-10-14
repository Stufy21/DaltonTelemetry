import { describe, expect, it } from 'vitest';
import {
  OF1ChampionshipDriver,
  OF1ChampionshipTeam,
  OF1Driver,
} from '../../core/openf1/openf1.model';
import {
  pointsFor,
  projectDriverStandings,
  projectTeamStandings,
  RACE_POINTS,
  SPRINT_POINTS,
} from './championship';

const driver = (n: number, acronym: string, team: string, colour: string): OF1Driver => ({
  driver_number: n,
  broadcast_name: acronym,
  full_name: `Driver ${acronym}`,
  name_acronym: acronym,
  team_name: team,
  team_colour: colour,
  headshot_url: null,
});

const drivers = new Map([
  [1, driver(1, 'VER', 'Red Bull', '3671C6')],
  [4, driver(4, 'NOR', 'McLaren', 'FF8000')],
  [81, driver(81, 'PIA', 'McLaren', 'FF8000')],
]);

const entry = (n: number, start: number | null, points: number | null): OF1ChampionshipDriver => ({
  session_key: 1,
  driver_number: n,
  position_start: start,
  position_current: start,
  points_start: points,
  points_current: points,
});

describe('pointsFor', () => {
  it('follows the race and sprint scales', () => {
    expect(pointsFor(1, RACE_POINTS)).toBe(25);
    expect(pointsFor(10, RACE_POINTS)).toBe(1);
    expect(pointsFor(11, RACE_POINTS)).toBe(0);
    expect(pointsFor(1, SPRINT_POINTS)).toBe(8);
    expect(pointsFor(9, SPRINT_POINTS)).toBe(0);
  });

  it('gives nothing without a position', () => {
    expect(pointsFor(undefined, RACE_POINTS)).toBe(0);
    expect(pointsFor(0, RACE_POINTS)).toBe(0);
  });
});

describe('projectDriverStandings', () => {
  const base = [entry(1, 1, 100), entry(4, 2, 90), entry(81, 3, 80)];

  it('adds the points of the current race positions and re-ranks', () => {
    const rows = projectDriverStandings(
      base,
      drivers,
      new Map([
        [4, 1],
        [81, 2],
        [1, 3],
      ]),
      RACE_POINTS,
      true,
    );
    expect(rows.map((r) => [r.label, r.points, r.gained, r.position, r.startPosition])).toEqual([
      ['VER', 115, 15, 1, 1],
      ['NOR', 115, 25, 2, 2],
      ['PIA', 98, 18, 3, 3],
    ]);
  });

  it('keeps the standing entering the race until the race has started', () => {
    const rows = projectDriverStandings(base, drivers, new Map([[4, 1]]), RACE_POINTS, false);
    expect(rows.map((r) => [r.label, r.points, r.gained])).toEqual([
      ['VER', 100, 0],
      ['NOR', 90, 0],
      ['PIA', 80, 0],
    ]);
  });

  it('starts new drivers and a season opener from zero', () => {
    const rows = projectDriverStandings([], drivers, new Map([[81, 1]]), RACE_POINTS, true);
    expect(rows[0]).toMatchObject({ label: 'PIA', points: 25, startPosition: null });
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('still lists a driver who is only in the standings', () => {
    const rows = projectDriverStandings([entry(44, 4, 70)], drivers, new Map(), RACE_POINTS, true);
    expect(rows.find((r) => r.key === '44')).toMatchObject({ label: '#44', points: 70 });
  });

  it('breaks ties with the earlier standing', () => {
    const rows = projectDriverStandings(
      [entry(1, 2, 50), entry(4, 1, 50)],
      drivers,
      new Map(),
      RACE_POINTS,
      false,
    );
    expect(rows.slice(0, 2).map((r) => r.label)).toEqual(['NOR', 'VER']);
  });
});

describe('projectTeamStandings', () => {
  const teams: OF1ChampionshipTeam[] = [
    {
      session_key: 1,
      team_name: 'Red Bull',
      position_start: 1,
      position_current: 1,
      points_start: 100,
      points_current: 100,
    },
    {
      session_key: 1,
      team_name: 'McLaren',
      position_start: 2,
      position_current: 2,
      points_start: 95,
      points_current: 95,
    },
  ];

  it('sums both drivers of a team', () => {
    const rows = projectTeamStandings(
      teams,
      drivers,
      new Map([
        [4, 1],
        [81, 2],
        [1, 3],
      ]),
      RACE_POINTS,
      true,
    );
    expect(rows.map((r) => [r.label, r.points, r.gained, r.position])).toEqual([
      ['McLaren', 138, 43, 1],
      ['Red Bull', 115, 15, 2],
    ]);
    expect(rows[0]?.colour).toBe('#FF8000');
  });

  it('does not score before the start', () => {
    const rows = projectTeamStandings(teams, drivers, new Map([[1, 1]]), RACE_POINTS, false);
    expect(rows.map((r) => [r.label, r.points])).toEqual([
      ['Red Bull', 100],
      ['McLaren', 95],
    ]);
  });
});
