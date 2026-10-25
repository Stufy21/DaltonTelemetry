import { OF1Session } from '../core/openf1/openf1.model';
import { scheduledLaps } from './race-distance';

const session = (circuit_key: number | undefined, session_name: string, session_type = 'Race') =>
  ({ circuit_key, session_name, session_type }) as OF1Session;

describe('scheduledLaps', () => {
  it('gives the 305 km race distance in whole laps', () => {
    expect(scheduledLaps(session(9, 'Race'))).toBe(56); // Austin
    expect(scheduledLaps(session(7, 'Race'))).toBe(44); // Spa
    expect(scheduledLaps(session(2, 'Race'))).toBe(52); // Silverstone
    expect(scheduledLaps(session(55, 'Race'))).toBe(72); // Zandvoort
  });

  it('uses the shorter distance at Monaco and for a sprint', () => {
    expect(scheduledLaps(session(22, 'Race'))).toBe(78);
    expect(scheduledLaps(session(49, 'Sprint'))).toBe(19); // Shanghai
    expect(scheduledLaps(session(151, 'Sprint'))).toBe(19); // Miami
    expect(scheduledLaps(session(2, 'Sprint'))).toBe(17); // Silverstone
  });

  it('matches the laps run at the circuits whose lengths were set to the 2026 races', () => {
    expect(scheduledLaps(session(153, 'Race'))).toBe(57); // Madrid
    expect(scheduledLaps(session(12, 'Race'))).toBe(55); // Sepang
  });

  it('has no total for practice, qualifying, an unknown circuit or a missing circuit key', () => {
    expect(scheduledLaps(session(9, 'Practice 1', 'Practice'))).toBeNull();
    expect(scheduledLaps(session(9, 'Qualifying', 'Qualifying'))).toBeNull();
    expect(scheduledLaps(session(99999, 'Race'))).toBeNull();
    expect(scheduledLaps(session(undefined, 'Race'))).toBeNull();
    expect(scheduledLaps(null)).toBeNull();
  });
});
