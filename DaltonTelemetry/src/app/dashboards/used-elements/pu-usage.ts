import { PuDriverUsage, PuElementKey, PuPenalty, PU_ELEMENT_LIST } from './pu-elements.model';

/** Over the season allowance, exactly on it (the next new part costs a penalty), or within it. */
export type UsageState = 'over' | 'at' | 'ok';

export function usageState(used: number, limit: number): UsageState {
  if (used > limit) return 'over';
  return used === limit ? 'at' : 'ok';
}

/** Parts a driver has used beyond the allowance. */
export function overLimit(driver: PuDriverUsage): { key: PuElementKey; extra: number }[] {
  return PU_ELEMENT_LIST.filter((e) => driver.used[e.key] > e.limit).map((e) => ({
    key: e.key,
    extra: driver.used[e.key] - e.limit,
  }));
}

export interface DriverPenalty {
  car: number;
  driver: string;
  /** Places dropped in total, over every decision of the weekend. */
  places: number;
  /** Decisions that are not a plain drop (a pit lane start, for example). */
  other: string[];
}

/** One line per driver: a weekend can bring several decisions for the same car. */
export function penaltiesByDriver(penalties: PuPenalty[]): DriverPenalty[] {
  const byCar = new Map<number, DriverPenalty>();
  for (const p of penalties) {
    const entry = byCar.get(p.car) ?? { car: p.car, driver: p.driver, places: 0, other: [] };
    if (p.places === null) entry.other.push(p.decision);
    else entry.places += p.places;
    byCar.set(p.car, entry);
  }
  return [...byCar.values()].sort((a, b) => b.places - a.places);
}

/** Team colours by the name the FIA uses; the engine maker comes after the team name. */
const TEAM_COLOURS: { match: RegExp; colour: string }[] = [
  { match: /^mclaren/i, colour: '#FF8000' },
  { match: /^mercedes/i, colour: '#27F4D2' },
  { match: /^red bull/i, colour: '#3671C6' },
  { match: /^ferrari/i, colour: '#E8002D' },
  { match: /williams/i, colour: '#64C4FF' },
  { match: /^racing bulls/i, colour: '#6692FF' },
  { match: /^aston martin/i, colour: '#229971' },
  { match: /^haas/i, colour: '#B6BABD' },
  // Audi and Cadillac look like Ferrari and Haas in the feed's colours: keep them apart.
  { match: /^audi/i, colour: '#FF3D9A' },
  { match: /^alpine/i, colour: '#0093CC' },
  { match: /^cadillac/i, colour: '#E6B800' },
];

export function teamColour(team: string): string {
  return TEAM_COLOURS.find((t) => t.match.test(team))?.colour ?? '#8A8F98';
}
