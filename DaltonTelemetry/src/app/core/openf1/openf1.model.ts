export interface OF1Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
  is_cancelled: boolean;
}

export interface OF1Driver {
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string | null;
  team_colour: string | null;
  headshot_url: string | null;
}

export interface OF1Position {
  date: string;
  driver_number: number;
  position: number;
}

/** Gaps are numbers (seconds), strings such as "+1 LAP", or null when unknown. */
export type OF1Gap = number | string | null;

export interface OF1Interval {
  date: string;
  driver_number: number;
  gap_to_leader: OF1Gap;
  interval: OF1Gap;
}

export interface OF1Lap {
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
}

export interface OF1Stint {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number | null;
  compound: string | null;
  tyre_age_at_start: number | null;
}

export interface OF1Pit {
  date: string;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
}

export interface OF1RaceControl {
  date: string;
  driver_number: number | null;
  lap_number: number | null;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  message: string;
}

export interface OF1Weather {
  date: string;
  air_temperature: number;
  track_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  wind_speed: number;
  wind_direction: number;
}

export interface OF1TeamRadio {
  date: string;
  driver_number: number;
  recording_url: string;
}

/** Car coordinates on the circuit, in 1/10 m. */
export interface OF1Location {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
}

export interface OF1CarData {
  date: string;
  driver_number: number;
  /** km/h */
  speed: number;
  rpm: number;
  n_gear: number;
  /** 0-100 */
  throttle: number;
  /** 0 or 100 */
  brake: number;
}

/** Standings entering the race (`*_start`) and as they stand now (`*_current`). */
export interface OF1ChampionshipDriver {
  session_key: number;
  driver_number: number;
  position_start: number | null;
  position_current: number | null;
  points_start: number | null;
  points_current: number | null;
}

export interface OF1ChampionshipTeam {
  session_key: number;
  team_name: string;
  position_start: number | null;
  position_current: number | null;
  points_start: number | null;
  points_current: number | null;
}
