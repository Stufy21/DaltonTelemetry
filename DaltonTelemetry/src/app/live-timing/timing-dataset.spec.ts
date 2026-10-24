import { OF1Driver, OF1Lap } from '../core/openf1/openf1.model';
import { formatGap, TimingDataset } from './timing-dataset';

const T0 = Date.parse('2026-01-01T12:00:00Z');
const iso = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString();

const driver = (n: number, acronym: string): OF1Driver => ({
  driver_number: n,
  broadcast_name: acronym,
  full_name: acronym,
  name_acronym: acronym,
  team_name: 'Team',
  team_colour: 'FF0000',
  headshot_url: null,
});

const lap = (
  d: number,
  n: number,
  start: number,
  dur: number,
  s: [number, number, number],
): OF1Lap => ({
  driver_number: d,
  lap_number: n,
  date_start: iso(start),
  lap_duration: dur,
  duration_sector_1: s[0],
  duration_sector_2: s[1],
  duration_sector_3: s[2],
  is_pit_out_lap: false,
});

function build(): TimingDataset {
  const ds = new TimingDataset();
  ds.setDrivers([driver(1, 'AAA'), driver(2, 'BBB')]);
  ds.addPositions([
    { date: iso(0), driver_number: 1, position: 2 },
    { date: iso(0), driver_number: 2, position: 1 },
    { date: iso(150), driver_number: 1, position: 1 },
    { date: iso(150), driver_number: 2, position: 2 },
  ]);
  ds.mergeLaps([
    lap(1, 1, 0, 100, [30, 40, 30]),
    lap(1, 2, 100, 98, [29, 40, 29]),
    lap(2, 1, 0, 101, [31, 39, 31]),
    lap(2, 2, 101, 99, [30, 41, 28]),
  ]);
  ds.setStints([
    {
      driver_number: 1,
      stint_number: 1,
      lap_start: 1,
      lap_end: 1,
      compound: 'SOFT',
      tyre_age_at_start: 0,
    },
    {
      driver_number: 1,
      stint_number: 2,
      lap_start: 2,
      lap_end: null,
      compound: 'HARD',
      tyre_age_at_start: 3,
    },
  ]);
  return ds;
}

describe('TimingDataset', () => {
  it('orders drivers by the latest position at the cursor time', () => {
    const ds = build();
    expect(ds.rows(T0 + 10_000).map((r) => r.acronym)).toEqual(['BBB', 'AAA']);
    expect(ds.rows(T0 + 160_000).map((r) => r.acronym)).toEqual(['AAA', 'BBB']);
  });

  it('only counts laps completed by the cursor time', () => {
    const ds = build();
    const early = ds.rows(T0 + 50_000).find((r) => r.acronym === 'AAA')!;
    expect(early.lastLap).toBeNull();
    expect(early.currentLap).toBe(1);

    const later = ds.rows(T0 + 150_000).find((r) => r.acronym === 'AAA')!;
    expect(later.lastLap).toBe(100);
    expect(later.currentLap).toBe(2);
  });

  it('marks overall-best sectors purple and personal bests green', () => {
    const ds = build();
    const rows = ds.rows(T0 + 250_000);
    const a = rows.find((r) => r.acronym === 'AAA')!;
    const b = rows.find((r) => r.acronym === 'BBB')!;
    // AAA lap 2: S1 29 is the overall best; S2 40 and S3 29 are AAA's own bests but not overall (BBB: 39 / 28).
    expect(a.sectors.map((s) => s.tone)).toEqual(['purple', 'green', 'green']);
    expect(a.lastLapTone).toBe('purple');
    // BBB lap 2: S1 30 is its own best, S2 41 is slower than its 39, S3 28 is the overall best.
    expect(b.sectors.map((s) => s.tone)).toEqual(['green', 'yellow', 'purple']);
    expect(b.bestLap).toBe(99);
  });

  it('shows no best lap until a lap has a time, instead of Infinity', () => {
    const ds = build();
    ds.setDrivers([driver(1, 'AAA'), driver(2, 'BBB'), driver(3, 'CCC')]);
    // an out-lap has sector times but no lap time, then the next lap starts
    ds.mergeLaps([
      { ...lap(3, 1, 0, 0, [0, 46.161, 39.62]), lap_duration: null, duration_sector_1: null },
      { ...lap(3, 2, 100, 0, [0, 0, 0]), lap_duration: null, duration_sector_2: null },
    ]);
    const c = ds.rows(T0 + 120_000).find((r) => r.acronym === 'CCC')!;
    expect(c.bestLap).toBeNull();
    expect(c.sectors[1].time).toBe(46.161);
    expect(['yellow', 'green', 'purple']).toContain(c.sectors[1].tone);
  });

  it('does not count an out-lap as a lap time, however long the wait in the garage was', () => {
    const ds = build();
    ds.mergeLaps([{ ...lap(2, 0, -460, 459.188, [0, 52, 41]), is_pit_out_lap: true }]);
    // the out-lap ends 0.8 s before T0, so it is the last completed lap here
    const early = ds.rows(T0 - 500).find((r) => r.acronym === 'BBB')!;
    expect(early.lastLap).toBeNull();
    expect(early.bestLap).toBeNull();
    // later laps keep their own times, and the out-lap never becomes the best
    const later = ds.rows(T0 + 250_000).find((r) => r.acronym === 'BBB')!;
    expect(later.lastLap).toBe(99);
    expect(later.bestLap).toBe(99);
  });

  it('keeps showing laps that follow an out-lap whose duration includes the wait before it', () => {
    const ds = new TimingDataset();
    ds.setDrivers([driver(3, 'CCC')]);
    ds.addPositions([{ date: iso(0), driver_number: 3, position: 1 }]);
    // lap 3 is an out-lap that left the pits at 200 s but is "700 s long", although lap 4 starts
    // at 300 s: its end must not be taken as 900 s, or laps 4 and 5 stay invisible until then
    ds.mergeLaps([
      lap(3, 1, 0, 100, [30, 40, 30]),
      lap(3, 2, 100, 90, [29, 32, 29]),
      { ...lap(3, 3, 200, 700, [0, 40, 30]), is_pit_out_lap: true },
      lap(3, 4, 300, 85, [28, 29, 28]),
      lap(3, 5, 385, 99, [30, 40, 29]),
    ]);
    const at = (s: number) => ds.rows(T0 + s * 1000).find((r) => r.acronym === 'CCC')!;
    expect(at(250).lastLap).toBe(90); // lap 3 is still running
    expect(at(310).lastLap).toBeNull(); // lap 3 is over, but an out-lap has no lap time
    expect(at(450).lastLap).toBe(85);
    expect(at(450).bestLap).toBe(85);
    expect(at(500).lastLap).toBe(99);
    expect(at(500).bestLap).toBe(85);
  });

  it('shows an unknown gap instead of a negative one when the ranking lags the lap times', () => {
    const ds = new TimingDataset();
    ds.setDrivers([driver(1, 'AAA'), driver(2, 'BBB')]);
    // the feed still ranks BBB behind AAA although BBB's best lap is already faster
    ds.addPositions([
      { date: iso(0), driver_number: 1, position: 1 },
      { date: iso(0), driver_number: 2, position: 2 },
    ]);
    ds.mergeLaps([lap(1, 1, 0, 100, [30, 40, 30]), lap(2, 1, 0, 99, [30, 40, 29])]);
    const rows = ds.rows(T0 + 150_000);
    expect(rows.map((r) => [r.acronym, r.gap, r.interval])).toEqual([
      ['AAA', 'Leader', '—'],
      ['BBB', '—', '—'],
    ]);
  });

  it('counts a lap whose start was never recorded, as when the recorder joined mid-lap', () => {
    const ds = new TimingDataset();
    ds.setDrivers([driver(3, 'CCC')]);
    ds.addPositions([{ date: iso(0), driver_number: 3, position: 1 }]);
    // lap 1 (95.2 s) has no start: the recorder connected during it; lap 2 starts at 95.2 s
    ds.mergeLaps([
      { ...lap(3, 1, 0, 95.2, [0, 37.8, 31.7]), date_start: null, duration_sector_1: null },
      lap(3, 2, 95.2, 125.79, [35.5, 47.4, 42.9]),
    ]);
    const at = (s: number) => ds.rows(T0 + s * 1000).find((r) => r.acronym === 'CCC')!;
    expect(at(100).lastLap).toBe(95.2);
    expect(at(100).bestLap).toBe(95.2);
    // the slow second lap must not replace it as the best
    expect(at(250).lastLap).toBe(125.79);
    expect(at(250).bestLap).toBe(95.2);
  });

  it('shows a sector as soon as it is done, instead of when the lap ends', () => {
    const ds = new TimingDataset();
    ds.setDrivers([driver(1, 'AAA'), driver(2, 'BBB')]);
    ds.addPositions([
      { date: iso(0), driver_number: 1, position: 1 },
      { date: iso(0), driver_number: 2, position: 2 },
    ]);
    // AAA's lap 1 ran 30/41/31; on lap 2 (from 100 s) it does 29/40/29, so S1 is done at 129 s,
    // S2 at 169 s and the lap ends at 198 s. BBB is slower everywhere (31/42/32).
    ds.mergeLaps([
      lap(1, 1, 0, 102, [30, 41, 31]),
      lap(1, 2, 102, 98, [29, 40, 29]),
      lap(2, 1, 0, 105, [31, 42, 32]),
    ]);
    const sectors = (s: number) => ds.rows(T0 + s * 1000).find((r) => r.acronym === 'AAA')!.sectors;
    // before S1 of lap 2 is done: still the previous lap's sectors
    expect(sectors(120).map((x) => x.time)).toEqual([30, 41, 31]);
    // S1 done at 131 s: just that sector is new, and already the fastest of the session (purple)
    expect(sectors(135).map((x) => x.time)).toEqual([29, 41, 31]);
    expect(sectors(135)[0].tone).toBe('purple');
    // S2 done at 171 s
    expect(sectors(175).map((x) => x.time)).toEqual([29, 40, 31]);
    // lap done
    expect(sectors(205).map((x) => x.time)).toEqual([29, 40, 29]);
  });

  it('finds the best lap of a driver as of a time, for comparing best laps', () => {
    const ds = build(); // AAA: lap 1 = 100 s, lap 2 = 98 s; BBB: 101 s and 99 s
    const best = (driver: number, s: number) => ds.bestLapOf(driver, T0 + s * 1000);
    expect(best(1, 50)).toBeNull();
    expect(best(1, 150)).toMatchObject({ lap: 1, duration: 100 });
    expect(best(1, 250)).toMatchObject({ lap: 2, duration: 98, sectors: [29, 40, 29] });
    expect(best(2, 250)).toMatchObject({ lap: 2, duration: 99 });
    expect(best(99, 250)).toBeNull();
  });

  it('does not take an out-lap or a deleted lap as the best lap', () => {
    const ds = new TimingDataset();
    ds.mergeLaps([
      { ...lap(3, 1, 0, 60, [20, 20, 20]), is_pit_out_lap: true },
      lap(3, 2, 60, 99, [30, 40, 29]),
      lap(3, 3, 159, 95, [29, 38, 28]),
      lap(3, 4, 254, 100, [30, 40, 30]),
    ]);
    ds.addRaceControl([
      {
        date: iso(300),
        driver_number: 3,
        lap_number: 3,
        category: 'Other',
        flag: null,
        scope: null,
        sector: null,
        message: 'CAR 3 (CCC) TIME 1:35.000 DELETED - TRACK LIMITS AT TURN 9 LAP 3 12:00:00',
      },
    ]);
    expect(ds.bestLapOf(3, T0 + 280_000)?.lap).toBe(3); // the 95 s lap, not yet deleted
    expect(ds.bestLapOf(3, T0 + 400_000)).toMatchObject({ lap: 2, duration: 99 }); // not the out-lap
  });

  it('ignores a lap once the stewards have deleted it', () => {
    const ds = build();
    // BBB's 99 s lap ends at 200 s; the deletion is announced at 210 s
    ds.addRaceControl([
      {
        date: iso(210),
        driver_number: 2,
        lap_number: 2,
        category: 'Other',
        flag: null,
        scope: null,
        sector: null,
        message: 'CAR 2 (BBB) TIME 1:39.000 DELETED - TRACK LIMITS AT TURN 9 LAP 2 12:00:00',
      },
    ]);
    const before = ds.rows(T0 + 205_000).find((r) => r.acronym === 'BBB')!;
    expect(before.bestLap).toBe(99);
    const after = ds.rows(T0 + 215_000).find((r) => r.acronym === 'BBB')!;
    expect(after.bestLap).toBe(101);
  });

  it('derives tyre compound and age from the stint covering the current lap', () => {
    const ds = build();
    const first = ds.rows(T0 + 10_000).find((r) => r.acronym === 'AAA')!;
    expect([first.compound, first.tyreAge]).toEqual(['SOFT', 0]);
    const second = ds.rows(T0 + 120_000).find((r) => r.acronym === 'AAA')!;
    expect([second.compound, second.tyreAge]).toEqual(['HARD', 3]);
  });

  it('falls back to best-lap gaps when there is no interval feed', () => {
    const ds = build();
    const rows = ds.rows(T0 + 250_000);
    expect(rows[0].gap).toBe('Leader');
    expect(rows[1].gap).toBe('+1.000');
  });

  it('uses the interval feed when present', () => {
    const ds = build();
    ds.addIntervals([
      { date: iso(0), driver_number: 1, gap_to_leader: 0, interval: 0 },
      { date: iso(0), driver_number: 2, gap_to_leader: '+1 LAP', interval: 1.234 },
    ]);
    const rows = ds.rows(T0 + 10_000);
    expect(rows.map((r) => [r.acronym, r.gap, r.interval])).toEqual([
      ['BBB', 'Leader', '—'],
      ['AAA', '+0.000', '+0.000'],
    ]);
  });

  it('flags a pit stop during the pit lane time that ends at the stop record', () => {
    const ds = build();
    // the record is dated when the car leaves the pit lane, after 20 s in it
    ds.addPits([{ date: iso(60), driver_number: 1, lap_number: 1, pit_duration: 20 }]);
    const at = (s: number) => ds.rows(T0 + s * 1000).find((r) => r.acronym === 'AAA')!;
    expect(at(30).inPit).toBe(false);
    expect(at(50).inPit).toBe(true);
    expect(at(59).inPit).toBe(true);
    expect(at(61).inPit).toBe(false);
    expect(at(61).pitStops).toBe(1);
  });

  it('sees a car in the pits from its laps alone, as the stop record only comes once it left', () => {
    const ds = new TimingDataset();
    ds.setDrivers([driver(3, 'CCC')]);
    // lap 1 ends at 100 s, the out-lap only starts at 130 s: 30 s in the pit lane
    ds.mergeLaps([
      lap(3, 1, 0, 100, [30, 40, 30]),
      { ...lap(3, 2, 130, 0, [0, 0, 0]), lap_duration: null, is_pit_out_lap: true },
    ]);
    const at = (s: number) => ds.rows(T0 + s * 1000).find((r) => r.acronym === 'CCC')!;
    expect(at(99).inPit).toBe(false);
    expect(at(115).inPit).toBe(true);
    expect(at(131).inPit).toBe(false);
  });

  it('does not call a car in the pits just because its next lap has not arrived yet', () => {
    const ds = new TimingDataset();
    ds.setDrivers([driver(3, 'CCC')]);
    ds.mergeLaps([lap(3, 1, 0, 100, [30, 40, 30])]);
    const at = (s: number) => ds.rows(T0 + s * 1000).find((r) => r.acronym === 'CCC')!;
    expect(at(105).inPit).toBe(false); // the live feed may still be delivering lap 2
    expect(at(115).inPit).toBe(true);
  });

  it('derives the track status from the latest relevant race control message', () => {
    const ds = build();
    const msg = (
      s: number,
      category: string,
      flag: string | null,
      message: string,
      scope: string | null = 'Track',
    ) => ({
      date: iso(s),
      driver_number: null,
      lap_number: null,
      category,
      flag,
      scope,
      sector: null,
      message,
    });
    ds.addRaceControl([
      msg(0, 'Flag', 'GREEN', 'GREEN LIGHT - PIT EXIT OPEN'),
      msg(50, 'SafetyCar', null, 'SAFETY CAR DEPLOYED', null),
      msg(60, 'Other', null, 'SOMETHING ELSE', null),
      msg(120, 'Flag', 'CLEAR', 'TRACK CLEAR'),
    ]);
    expect(ds.trackStatus(T0 + 10_000).tone).toBe('green');
    expect(ds.trackStatus(T0 + 70_000).tone).toBe('sc');
    expect(ds.trackStatus(T0 + 130_000).tone).toBe('green');
  });

  it('keeps data ordered when rows arrive out of order', () => {
    const ds = new TimingDataset();
    ds.addPositions([
      { date: iso(100), driver_number: 1, position: 3 },
      { date: iso(0), driver_number: 1, position: 1 },
    ]);
    expect(ds.rows(T0 + 50_000)[0].position).toBe(1);
    expect(ds.rows(T0 + 150_000)[0].position).toBe(3);
  });
});

describe('TimingDataset flag segments', () => {
  const msg = (
    s: number,
    category: string,
    flag: string | null,
    message: string,
    scope: string | null = null,
    sector: number | null = null,
    lap = 5,
  ) => ({
    date: iso(s),
    driver_number: null,
    lap_number: lap,
    category,
    flag,
    scope,
    sector,
    message,
  });

  const segmentsFor = (rows: ReturnType<typeof msg>[], end = 1000) => {
    const ds = new TimingDataset();
    ds.addRaceControl(rows);
    return ds
      .flagSegments(T0 + end * 1000)
      .map((x) => [x.tone, (x.from - T0) / 1000, (x.to - T0) / 1000]);
  };

  it('keeps a sector yellow open until that sector is cleared', () => {
    expect(
      segmentsFor([
        msg(10, 'Flag', 'YELLOW', 'YELLOW IN TRACK SECTOR 6', 'Sector', 6),
        msg(10, 'Flag', 'YELLOW', 'YELLOW IN TRACK SECTOR 5', 'Sector', 5),
        msg(30, 'Flag', 'CLEAR', 'CLEAR IN TRACK SECTOR 6', 'Sector', 6),
        msg(40, 'Flag', 'CLEAR', 'CLEAR IN TRACK SECTOR 5', 'Sector', 5),
      ]),
    ).toEqual([['yellow', 10, 40]]);
  });

  it('shows the VSC over a yellow and resumes yellow after it', () => {
    expect(
      segmentsFor([
        msg(10, 'Flag', 'YELLOW', 'YELLOW IN TRACK SECTOR 14', 'Sector', 14),
        msg(20, 'SafetyCar', null, 'VSC DEPLOYED'),
        msg(50, 'SafetyCar', null, 'VSC ENDING'),
        msg(60, 'Flag', 'CLEAR', 'CLEAR IN TRACK SECTOR 14', 'Sector', 14),
        msg(65, 'Flag', 'CLEAR', 'TRACK CLEAR', 'Track'),
      ]),
    ).toEqual([
      ['yellow', 10, 20],
      ['vsc', 20, 65],
    ]);
  });

  it('ends a safety car on track clear and marks the chequered flag', () => {
    expect(
      segmentsFor([
        msg(10, 'SafetyCar', null, 'SAFETY CAR DEPLOYED'),
        msg(50, 'Flag', 'CLEAR', 'TRACK CLEAR', 'Track'),
        msg(90, 'Flag', 'CHEQUERED', 'CHEQUERED FLAG', 'Track'),
      ]),
    ).toEqual([
      ['sc', 10, 50],
      ['chequered', 90, 90],
    ]);
  });

  it('runs a red flag until the track is green again', () => {
    expect(
      segmentsFor([
        msg(10, 'Flag', 'RED', 'RED FLAG', 'Track'),
        msg(80, 'Flag', 'GREEN', 'GREEN LIGHT - PIT EXIT OPEN', 'Track'),
      ]),
    ).toEqual([['red', 10, 80]]);
  });

  it('closes a still-open period at the end of the range and ignores later messages', () => {
    expect(
      segmentsFor(
        [
          msg(10, 'SafetyCar', null, 'SAFETY CAR DEPLOYED'),
          msg(500, 'Flag', 'CLEAR', 'TRACK CLEAR', 'Track'),
        ],
        100,
      ),
    ).toEqual([['sc', 10, 100]]);
  });

  it('labels the period with its lap', () => {
    const ds = new TimingDataset();
    ds.addRaceControl([msg(10, 'SafetyCar', null, 'VSC DEPLOYED', null, null, 8)]);
    expect(ds.flagSegments(T0 + 100_000)[0].label).toBe('Virtual safety car · lap 8');
  });

  it('reports a VSC as VSC (not safety car) in the track status', () => {
    const ds = new TimingDataset();
    ds.addRaceControl([msg(10, 'SafetyCar', null, 'VSC DEPLOYED')]);
    expect(ds.trackStatus(T0 + 20_000).tone).toBe('vsc');
  });
});

describe('TimingDataset recent laps', () => {
  it('returns only completed laps, oldest first, capped to the requested count', () => {
    const ds = build();
    expect(ds.recentLaps(1, T0 + 50_000, 5)).toEqual([]);
    const at = ds.recentLaps(1, T0 + 250_000, 5);
    expect(at.map((l) => [l.lap, l.duration])).toEqual([
      [1, 100],
      [2, 98],
    ]);
    expect(ds.recentLaps(1, T0 + 250_000, 1).map((l) => l.lap)).toEqual([2]);
    expect(ds.recentLaps(99, T0 + 250_000, 5)).toEqual([]);
  });
});

describe('TimingDataset live updates', () => {
  it('merges a pit stop reported again with its duration instead of counting it twice', () => {
    const ds = build();
    ds.addPits([{ date: iso(60), driver_number: 1, lap_number: 1, pit_duration: null }]);
    ds.addPits([{ date: iso(60), driver_number: 1, lap_number: 1, pit_duration: 20 }]);
    const row = (s: number) => ds.rows(T0 + s * 1000).find((r) => r.acronym === 'AAA')!;
    expect(row(70).pitStops).toBe(1);
    expect(row(50).inPit).toBe(true); // in the lane from 40 s until the record at 60 s
    expect(row(70).inPit).toBe(false);
  });

  it('ignores race control messages and radio clips it already has', () => {
    const ds = new TimingDataset();
    const message = {
      date: iso(10),
      driver_number: null,
      lap_number: 1,
      category: 'Flag',
      flag: 'GREEN',
      scope: 'Track',
      sector: null,
      message: 'GREEN LIGHT - PIT EXIT OPEN',
    };
    ds.addRaceControl([message]);
    ds.addRaceControl([message]);
    expect(ds.raceControl.length).toBe(1);

    const clip = { date: iso(5), driver_number: 1, recording_url: 'https://x/a.mp3' };
    ds.addRadio([clip, clip]);
    ds.addRadio([clip]);
    expect(ds.radio.length).toBe(1);
  });
});

describe('TimingDataset location', () => {
  const loc = (d: number, s: number, x: number, y: number, z = 1) => ({
    date: iso(s),
    driver_number: d,
    x,
    y,
    z,
  });

  it('returns the latest fix per car and drops stale or empty ones', () => {
    const ds = build();
    ds.addLocations([
      loc(1, 0, 100, 200),
      loc(1, 10, 110, 210),
      loc(2, 0, 0, 0, 0), // "no fix" marker, must be ignored
      loc(2, 5, 300, 400),
    ]);
    const at = (s: number) => ds.cars(T0 + s * 1000);
    expect(at(12).map((c) => [c.acronym, c.x, c.y])).toEqual([
      ['AAA', 110, 210],
      ['BBB', 300, 400],
    ]);
    // 40s after the last fix of both cars: too old to show.
    expect(at(50)).toEqual([]);
  });

  it('interpolates a car between its two surrounding fixes', () => {
    const ds = build();
    ds.addLocations([loc(1, 0, 100, 200), loc(1, 1, 200, 400)]);
    const at = (ms: number) => ds.cars(T0 + ms).find((c) => c.acronym === 'AAA')!;
    expect([at(0).x, at(0).y]).toEqual([100, 200]);
    expect([at(250).x, at(250).y]).toEqual([125, 250]);
    expect([at(500).x, at(500).y]).toEqual([150, 300]);
    expect([at(1000).x, at(1000).y]).toEqual([200, 400]);
  });

  it('does not bridge a gap in the feed', () => {
    const ds = build();
    ds.addLocations([loc(1, 0, 100, 200), loc(1, 10, 900, 900)]);
    const car = ds.cars(T0 + 5_000).find((c) => c.acronym === 'AAA')!;
    expect([car.x, car.y]).toEqual([100, 200]);
  });

  it('picks the fastest clean lap as the circuit reference', () => {
    const ds = build();
    expect(ds.referenceLap()).toEqual({
      driver: 1,
      from: iso(100),
      to: iso(198),
    });

    const withOutLap = new TimingDataset();
    withOutLap.mergeLaps([
      { ...lap(1, 1, 0, 60, [20, 20, 20]), is_pit_out_lap: true },
      lap(1, 2, 60, 100, [30, 40, 30]),
    ]);
    expect(withOutLap.referenceLap()?.from).toBe(iso(60));
  });

  it('ranks the clean flying laps fastest first, as candidates for the circuit outline', () => {
    const ds = build(); // laps: AAA 100 and 98 s, BBB 101 and 99 s
    expect(ds.referenceLaps(3).map((l) => [l.driver, l.from])).toEqual([
      [1, iso(100)],
      [2, iso(101)],
      [1, iso(0)],
    ]);
    expect(ds.referenceLaps(1)).toEqual([ds.referenceLap()!]);
    expect(new TimingDataset().referenceLaps(5)).toEqual([]);
  });

  it('has no reference lap before any lap is recorded', () => {
    expect(new TimingDataset().referenceLap()).toBeNull();
  });
});

describe('formatGap', () => {
  it('formats seconds, lap gaps and unknowns', () => {
    expect(formatGap(1.5)).toBe('+1.500');
    expect(formatGap('+1 LAP')).toBe('+1 LAP');
    expect(formatGap(null)).toBe('—');
  });
});
