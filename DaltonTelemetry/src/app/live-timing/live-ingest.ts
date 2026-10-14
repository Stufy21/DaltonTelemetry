import type { LiveEvent } from '../core/openf1/live-feed.service';
import type {
  OF1Interval,
  OF1Lap,
  OF1Location,
  OF1Pit,
  OF1Position,
  OF1RaceControl,
  OF1Stint,
  OF1TeamRadio,
  OF1Weather,
} from '../core/openf1/openf1.model';
import { TimingDataset } from './timing-dataset';

export interface IngestResult {
  /** Anything was applied (the page should refresh). */
  changed: boolean;
  /** Lap rows arrived (the circuit outline may now be drawable). */
  lapsChanged: boolean;
}

/** Key of a stint document; streamed updates to the same stint replace the earlier one. */
export const stintKey = (s: Pick<OF1Stint, 'driver_number' | 'stint_number'>) =>
  `${s.driver_number}:${s.stint_number}`;

/**
 * Applies a batch of streamed rows to the dataset. Messages mirror the REST rows of the same
 * endpoint, so they go through the same methods; rows of other sessions are ignored.
 */
export function applyLiveBatch(
  dataset: TimingDataset,
  stints: Map<string, OF1Stint>,
  batch: LiveEvent[],
  sessionKey: number,
): IngestResult {
  const byTopic = new Map<string, unknown[]>();
  for (const event of batch) {
    if (event.data['session_key'] !== sessionKey) continue;
    const list = byTopic.get(event.topic) ?? [];
    list.push(event.data);
    byTopic.set(event.topic, list);
  }
  if (!byTopic.size) return { changed: false, lapsChanged: false };

  const of = <T>(topic: string) => (byTopic.get(topic) ?? []) as T[];
  dataset.addPositions(of<OF1Position>('v1/position'));
  dataset.addIntervals(of<OF1Interval>('v1/intervals'));
  dataset.mergeLaps(of<OF1Lap>('v1/laps'));
  dataset.addPits(of<OF1Pit>('v1/pit'));
  dataset.addRaceControl(of<OF1RaceControl>('v1/race_control'));
  dataset.addWeather(of<OF1Weather>('v1/weather'));
  dataset.addRadio(of<OF1TeamRadio>('v1/team_radio'));
  dataset.addLocations(of<OF1Location>('v1/location'));

  const updatedStints = of<OF1Stint>('v1/stints');
  if (updatedStints.length) {
    for (const stint of updatedStints) stints.set(stintKey(stint), stint);
    dataset.setStints([...stints.values()]);
  }

  return { changed: true, lapsChanged: byTopic.has('v1/laps') };
}
