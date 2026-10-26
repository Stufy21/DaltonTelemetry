/** The power unit parts a driver may use a limited number of per season (FIA B8.2). */
export const PU_ELEMENT_LIST = [
  { key: 'ICE', label: 'ICE', name: 'Internal combustion engine', limit: 4 },
  { key: 'TC', label: 'TC', name: 'Turbocharger', limit: 4 },
  { key: 'EXH', label: 'EX', name: 'Exhaust set', limit: 4 },
  { key: 'MGU-K', label: 'MGU-K', name: 'Motor generator unit – kinetic', limit: 3 },
  { key: 'ES', label: 'ES', name: 'Energy store', limit: 3 },
  { key: 'PU-CE', label: 'CE', name: 'Control electronics', limit: 3 },
  { key: 'PU-ANC', label: 'ANC', name: 'Ancillary components', limit: 6 },
] as const;

export type PuElementKey = (typeof PU_ELEMENT_LIST)[number]['key'];

export interface PuDriverUsage {
  car: number;
  driver: string;
  /** The team as the FIA writes it, with the engine maker: "McLaren Mercedes". */
  team: string;
  /** Elements used so far this season, including the ones fitted this weekend. */
  used: Record<PuElementKey, number>;
  /** Elements fitted new this weekend. */
  new: PuElementKey[];
}

export interface PuPenalty {
  car: number;
  driver: string;
  /** Places dropped on the grid, when the decision is a drop. */
  places: number | null;
  decision: string;
  document: number | null;
}

export interface PuElementsSnapshot {
  season: number;
  event: string;
  drivers: PuDriverUsage[];
  penalties: PuPenalty[];
}
