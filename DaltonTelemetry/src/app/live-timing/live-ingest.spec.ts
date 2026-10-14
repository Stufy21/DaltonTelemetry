import { applyLiveBatch, stintKey } from './live-ingest';
import { OF1Stint } from '../core/openf1/openf1.model';
import { TimingDataset } from './timing-dataset';

const KEY = 11388;
const T0 = Date.parse('2026-10-11T12:00:00Z');
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();
const event = (topic: string, data: Record<string, unknown>) => ({
  topic,
  data: { session_key: KEY, ...data },
});

const driver = (n: number, acronym: string) => ({
  driver_number: n,
  broadcast_name: acronym,
  full_name: acronym,
  name_acronym: acronym,
  team_name: 'Team',
  team_colour: 'FF0000',
  headshot_url: null,
});

describe('applyLiveBatch', () => {
  function setup() {
    const ds = new TimingDataset();
    ds.setDrivers([driver(1, 'AAA'), driver(2, 'BBB')]);
    return { ds, stints: new Map<string, OF1Stint>() };
  }

  it('applies streamed rows of each kind to the dataset', () => {
    const { ds, stints } = setup();
    const result = applyLiveBatch(
      ds,
      stints,
      [
        event('v1/position', { date: iso(0), driver_number: 1, position: 2, _id: 1 }),
        event('v1/position', { date: iso(0), driver_number: 2, position: 1, _id: 2 }),
        event('v1/intervals', {
          date: iso(0),
          driver_number: 1,
          gap_to_leader: 1.5,
          interval: 1.5,
        }),
        event('v1/location', { date: iso(1), driver_number: 1, x: 10, y: 20, z: 5 }),
        event('v1/weather', {
          date: iso(0),
          air_temperature: 20,
          track_temperature: 30,
          humidity: 50,
          pressure: 1000,
          rainfall: 0,
          wind_speed: 1,
          wind_direction: 90,
        }),
      ],
      KEY,
    );

    expect(result).toEqual({ changed: true, lapsChanged: false });
    const rows = ds.rows(T0 + 2000);
    expect(rows.map((r) => r.acronym)).toEqual(['BBB', 'AAA']);
    expect(rows[1].gap).toBe('+1.500');
    expect(ds.cars(T0 + 1500)).toHaveLength(1);
    expect(ds.weather.at(T0 + 1000)?.air_temperature).toBe(20);
  });

  it('ignores rows of other sessions and reports nothing changed', () => {
    const { ds, stints } = setup();
    const result = applyLiveBatch(
      ds,
      stints,
      [
        {
          topic: 'v1/position',
          data: { session_key: 99, date: iso(0), driver_number: 1, position: 1 },
        },
      ],
      KEY,
    );
    expect(result).toEqual({ changed: false, lapsChanged: false });
    expect(ds.hasData).toBe(false);
  });

  it('updates a lap in place as its sectors and duration arrive', () => {
    const { ds, stints } = setup();
    const lap = (extra: Record<string, unknown>) =>
      event('v1/laps', {
        driver_number: 1,
        lap_number: 1,
        date_start: iso(0),
        is_pit_out_lap: false,
        duration_sector_1: null,
        duration_sector_2: null,
        duration_sector_3: null,
        lap_duration: null,
        ...extra,
      });

    const first = applyLiveBatch(ds, stints, [lap({ duration_sector_1: 30 })], KEY);
    expect(first.lapsChanged).toBe(true);
    expect(ds.recentLaps(1, T0 + 500_000, 5)).toEqual([]); // not finished: no duration yet

    applyLiveBatch(
      ds,
      stints,
      [
        lap({
          duration_sector_1: 30,
          duration_sector_2: 40,
          duration_sector_3: 30,
          lap_duration: 100,
        }),
      ],
      KEY,
    );
    const laps = ds.recentLaps(1, T0 + 500_000, 5);
    expect(laps).toHaveLength(1);
    expect([laps[0].duration, laps[0].sectors]).toEqual([100, [30, 40, 30]]);
  });

  it('rebuilds the stint list when a stint document is updated', () => {
    const { ds, stints } = setup();
    ds.mergeLaps([
      {
        driver_number: 1,
        lap_number: 1,
        date_start: iso(0),
        lap_duration: 90,
        duration_sector_1: 30,
        duration_sector_2: 30,
        duration_sector_3: 30,
        is_pit_out_lap: false,
      },
    ]);
    const stint = (extra: Record<string, unknown>) =>
      event('v1/stints', {
        driver_number: 1,
        stint_number: 1,
        lap_start: 1,
        lap_end: null,
        compound: 'MEDIUM',
        tyre_age_at_start: 0,
        ...extra,
      });
    ds.addPositions([{ date: iso(0), driver_number: 1, position: 1 }]);

    applyLiveBatch(ds, stints, [stint({})], KEY);
    expect(ds.rows(T0 + 10_000)[0].compound).toBe('MEDIUM');

    applyLiveBatch(ds, stints, [stint({ compound: 'HARD' })], KEY);
    expect(stints.size).toBe(1);
    expect(ds.rows(T0 + 10_000)[0].compound).toBe('HARD');
    expect(stintKey({ driver_number: 1, stint_number: 2 })).toBe('1:2');
  });

  it('does not double count a pit stop that arrives again with its duration', () => {
    const { ds, stints } = setup();
    ds.addPositions([{ date: iso(0), driver_number: 1, position: 1 }]);
    const pit = (duration: number | null) =>
      event('v1/pit', { date: iso(60), driver_number: 1, lap_number: 3, pit_duration: duration });
    applyLiveBatch(ds, stints, [pit(null)], KEY);
    applyLiveBatch(ds, stints, [pit(22.5)], KEY);
    expect(ds.rows(T0 + 120_000)[0].pitStops).toBe(1);
  });
});
