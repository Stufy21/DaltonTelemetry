import { OF1Session } from '../core/openf1/openf1.model';

/** One Grand Prix weekend: its sessions in the order they are run. */
export interface Meeting {
  key: number;
  /** Country, with the venue added when two weekends of the list share a country (Italy, USA). */
  label: string;
  sessions: OF1Session[];
  /** The most recent session: the Race of a finished weekend, or what is running now. */
  latest: OF1Session;
}

const start = (s: OF1Session): number => Date.parse(s.date_start);

/** Pre-season testing runs "Day 1", "Day 2", … instead of practice, qualifying and a race. */
const isTesting = (m: Meeting): boolean =>
  m.sessions.every((s) => /^Day \d+$/.test(s.session_name));

const shortDate = (s: OF1Session): string =>
  new Date(s.date_start).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Groups sessions by weekend, newest weekend first, each weekend's sessions oldest first. */
export function groupMeetings(sessions: readonly OF1Session[]): Meeting[] {
  const byKey = new Map<number, OF1Session[]>();
  for (const session of sessions) {
    const list = byKey.get(session.meeting_key);
    if (list) list.push(session);
    else byKey.set(session.meeting_key, [session]);
  }

  const meetings = [...byKey].map(([key, list]) => {
    const ordered = [...list].sort((a, b) => start(a) - start(b));
    return { key, sessions: ordered, latest: ordered[ordered.length - 1], label: '' };
  });
  meetings.sort((a, b) => start(b.latest) - start(a.latest));

  const perCountry = new Map<string, number>();
  for (const m of meetings) {
    if (isTesting(m)) continue;
    perCountry.set(m.latest.country_name, (perCountry.get(m.latest.country_name) ?? 0) + 1);
  }
  for (const m of meetings) {
    const { country_name, location } = m.latest;
    m.label = isTesting(m)
      ? `Testing · ${location}`
      : (perCountry.get(country_name) ?? 0) > 1
        ? `${country_name} · ${location}`
        : country_name;
  }

  // Whatever is still ambiguous (two test events at the same circuit) gets its date.
  const perLabel = new Map<string, number>();
  for (const m of meetings) perLabel.set(m.label, (perLabel.get(m.label) ?? 0) + 1);
  for (const m of meetings) {
    if ((perLabel.get(m.label) ?? 0) > 1) m.label += ` · ${shortDate(m.sessions[0])}`;
  }
  return meetings;
}
