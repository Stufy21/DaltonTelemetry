export interface ErgastLocation {
  lat: string;
  long: string;
  locality: string;
  country: string;
}

export interface ErgastCircuit {
  circuitId: string;
  url: string;
  circuitName: string;
  Location: ErgastLocation;
  photoUrl : string | null;
}

export interface ErgastCircuitTable {
  Circuits: ErgastCircuit[];
}

export interface ErgastMRData {
  xmlns: string;
  series: string;
  url: string;
  limit: string;
  offset: string;
  total: string;
  CircuitTable: ErgastCircuitTable;
}

export interface ErgastCircuitsResponse {
  MRData: ErgastMRData;
}

export interface ErgastRace {
  season: string;
  round: string;
  Circuit: ErgastCircuit;
}

export interface ErgastRaceTable {
  Races: ErgastRace[];
}

export interface ErgastRacesMRData {
  RaceTable: ErgastRaceTable;
}

export interface ErgastRacesResponse {
  MRData: ErgastRacesMRData;
}

export interface WikimediaThumbnail {
  source: string;
  width: number;
  height: number;
}

export interface WikimediaPageSummary {
  thumbnail?: WikimediaThumbnail;
  originalimage?: WikimediaThumbnail;
}

export interface ErgastDriver {
  driverId: string;
  code?: string;
  givenName: string;
  familyName: string;
  nationality: string;
}

export interface ErgastConstructor {
  constructorId: string;
  name: string;
}

export interface ErgastFastestLap {
  rank: string;
  lap: string;
  Time?: { time: string };
  AverageSpeed?: { units: string; speed: string };
}

export interface ErgastResultRow {
  position: string;
  Driver: ErgastDriver;
  Constructor: ErgastConstructor;
  FastestLap?: ErgastFastestLap;
}

export interface ErgastQualifyingRow {
  position: string;
  Driver: ErgastDriver;
  Constructor: ErgastConstructor;
}

/** A past Grand Prix as returned by the circuit history endpoints. */
export interface ErgastHistoricRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  Circuit: ErgastCircuit;
  Results?: ErgastResultRow[];
  QualifyingResults?: ErgastQualifyingRow[];
}

export interface ErgastHistoricRacesResponse {
  MRData: { RaceTable: { Races: ErgastHistoricRace[] } };
}
