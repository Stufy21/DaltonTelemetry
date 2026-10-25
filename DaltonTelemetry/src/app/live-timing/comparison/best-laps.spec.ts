import { LapSummary } from '../timing-dataset';
import { buildBestTable } from './best-laps';

const lap = (n: number, duration: number | null, s: [number, number, number]): LapSummary => ({
  lap: n,
  start: 0,
  end: 0,
  duration,
  sectors: s,
  pitOut: false,
});

describe('buildBestTable', () => {
  const a = lap(5, 94.471, [25.28, 37.71, 31.481]);
  const b = lap(8, 94.539, [25.3, 37.575, 31.664]);

  it('has a row for the lap, the time and each sector', () => {
    expect(buildBestTable([a, b]).map((r) => r.label)).toEqual(['Lap', 'Time', 'S1', 'S2', 'S3']);
  });

  it('lists the laps and formats the times', () => {
    const [laps, time, s1] = buildBestTable([a, b]);
    expect(laps.cells.map((c) => c.text)).toEqual(['5', '8']);
    expect(time.cells.map((c) => c.text)).toEqual(['1:34.471', '1:34.539']);
    expect(s1.cells.map((c) => c.text)).toEqual(['25.280', '25.300']);
  });

  it('gives B minus A, and marks the quicker driver of each row', () => {
    const [, time, s1, s2] = buildBestTable([a, b]);
    expect(time.delta).toBeCloseTo(0.068);
    expect(time.cells.map((c) => c.fastest)).toEqual([true, false]);
    expect(s1.cells.map((c) => c.fastest)).toEqual([true, false]);
    expect(s2.delta).toBeCloseTo(-0.135);
    expect(s2.cells.map((c) => c.fastest)).toEqual([false, true]); // B is quicker in S2
  });

  it('marks nobody on a tie, and nobody for a single driver', () => {
    const tie = buildBestTable([lap(1, 90, [30, 30, 30]), lap(2, 90, [30, 30, 30])]);
    expect(tie[1].cells.map((c) => c.fastest)).toEqual([false, false]);
    expect(tie[1].delta).toBe(0);
    const solo = buildBestTable([a]);
    expect(solo[1].cells.map((c) => c.fastest)).toEqual([false]);
    expect(solo[1].delta).toBeNull();
  });

  it('shows a dash and no delta for a driver without a lap or a sector', () => {
    const [laps, time, s1] = buildBestTable([a, null]);
    expect(laps.cells[1].text).toBe('–');
    expect(time.cells[1].text).toBe('–');
    expect(time.delta).toBeNull();
    expect(time.cells.map((c) => c.fastest)).toEqual([false, false]);
    const partial = buildBestTable([a, lap(9, 95, [26, 38, 32])]);
    expect(partial[2].delta).toBeCloseTo(0.72);
    const missingSector = buildBestTable([a, { ...b, sectors: [null, 37.575, 31.664] }]);
    expect(missingSector[2].cells[1].text).toBe('–');
    expect(missingSector[2].delta).toBeNull();
    expect(s1.delta).toBeNull();
  });
});
