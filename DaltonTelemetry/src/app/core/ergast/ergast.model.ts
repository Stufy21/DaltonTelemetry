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
