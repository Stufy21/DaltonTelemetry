import { describe, expect, it } from 'vitest';
import { OF1Session } from '../core/openf1/openf1.model';
import { groupMeetings } from './meetings';

let key = 0;
const session = (
  meeting: number,
  name: string,
  date: string,
  country: string,
  location = country,
): OF1Session => ({
  session_key: ++key,
  session_type: name.startsWith('Race') ? 'Race' : 'Practice',
  session_name: name,
  date_start: `${date}T12:00:00+00:00`,
  date_end: `${date}T13:00:00+00:00`,
  meeting_key: meeting,
  circuit_short_name: location,
  country_name: country,
  location,
  year: 2026,
  is_cancelled: false,
});

describe('groupMeetings', () => {
  const sessions = [
    session(2, 'Race', '2026-03-15', 'Australia'),
    session(1, 'Practice 1', '2026-03-06', 'Bahrain'),
    session(2, 'Practice 1', '2026-03-13', 'Australia'),
    session(1, 'Race', '2026-03-08', 'Bahrain'),
    session(2, 'Qualifying', '2026-03-14', 'Australia'),
  ];

  it('groups sessions by weekend, newest weekend first', () => {
    expect(groupMeetings(sessions).map((m) => m.key)).toEqual([2, 1]);
  });

  it('orders the sessions of a weekend as they are run', () => {
    const australia = groupMeetings(sessions)[0];
    expect(australia.sessions.map((s) => s.session_name)).toEqual([
      'Practice 1',
      'Qualifying',
      'Race',
    ]);
  });

  it('points at the most recent session of the weekend', () => {
    const [australia, bahrain] = groupMeetings(sessions);
    expect(australia.latest.session_name).toBe('Race');
    expect(bahrain.latest.session_name).toBe('Race');
  });

  it('labels a weekend with its country', () => {
    expect(groupMeetings(sessions).map((m) => m.label)).toEqual(['Australia', 'Bahrain']);
  });

  it('adds the venue when two weekends share a country', () => {
    const meetings = groupMeetings([
      session(1, 'Race', '2026-09-06', 'Italy', 'Monza'),
      session(2, 'Race', '2026-05-17', 'Italy', 'Imola'),
      session(3, 'Race', '2026-03-15', 'Japan', 'Suzuka'),
    ]);
    expect(meetings.map((m) => m.label)).toEqual(['Italy · Monza', 'Italy · Imola', 'Japan']);
  });

  it('calls pre-season testing by that name and keeps it out of the country count', () => {
    const meetings = groupMeetings([
      session(1, 'Race', '2026-04-12', 'Bahrain', 'Sakhir'),
      session(2, 'Day 1', '2026-02-11', 'Bahrain'),
      session(2, 'Day 2', '2026-02-12', 'Bahrain'),
    ]);
    expect(meetings.map((m) => m.label)).toEqual(['Bahrain', 'Testing · Bahrain']);
  });

  it('adds the date when two weekends would still share a label', () => {
    const meetings = groupMeetings([
      session(1, 'Day 1', '2026-02-18', 'Bahrain'),
      session(2, 'Day 1', '2026-02-11', 'Bahrain'),
    ]);
    expect(meetings.map((m) => m.label)).toEqual([
      'Testing · Bahrain · 18 Feb',
      'Testing · Bahrain · 11 Feb',
    ]);
  });

  it('copes with no sessions and does not reorder its input', () => {
    expect(groupMeetings([])).toEqual([]);
    const copy = [...sessions];
    groupMeetings(sessions);
    expect(sessions).toEqual(copy);
  });
});
