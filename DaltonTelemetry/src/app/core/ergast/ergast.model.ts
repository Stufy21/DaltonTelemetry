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
