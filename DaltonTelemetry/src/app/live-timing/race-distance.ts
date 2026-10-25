import { OF1Session } from '../core/openf1/openf1.model';

/**
 * Official lap length in metres by OpenF1 `circuit_key` (the keys of scripts/generate-circuit-
 * outlines.mjs). A race lasts the smallest number of whole laps that covers its distance, so the
 * length is all that is needed to know the total in advance; OpenF1 and the live feed we record
 * have no lap count. A few lengths (Madrid, Sepang) are set to what the 2026 races actually ran.
 */
const LAP_LENGTH_M: Record<number, number> = {
  2: 5891, // Silverstone
  4: 4381, // Hungaroring
  6: 4909, // Imola
  7: 7004, // Spa
  9: 5513, // Austin
  10: 5278, // Melbourne
  12: 5550, // Sepang
  14: 4309, // Interlagos
  15: 4657, // Barcelona
  19: 4318, // Red Bull Ring
  22: 3337, // Monaco
  23: 4361, // Montréal
  39: 5793, // Monza
  46: 5807, // Suzuka
  49: 5451, // Shanghai
  55: 4259, // Zandvoort
  61: 4927, // Marina Bay
  63: 5412, // Bahrain
  65: 4304, // Mexico City
  70: 5281, // Yas Marina
  144: 6003, // Baku
  149: 6174, // Jeddah
  150: 5419, // Lusail
  151: 5412, // Miami
  152: 6201, // Las Vegas
  153: 5400, // Madrid
};

const MONACO = 22;
const RACE_M = 305_000;
const MONACO_RACE_M = 260_000;
const SPRINT_M = 100_000;

/**
 * Laps a Race or Sprint is scheduled for, or null for other sessions and circuits not in the table.
 * A race that is shortened (red flag, time limit) ends earlier: once it is over the real count is
 * known and shown instead.
 */
export function scheduledLaps(session: OF1Session | null): number | null {
  if (!session || session.session_type !== 'Race' || session.circuit_key == null) return null;
  const length = LAP_LENGTH_M[session.circuit_key];
  if (!length) return null;
  const distance =
    session.session_name === 'Sprint'
      ? SPRINT_M
      : session.circuit_key === MONACO
        ? MONACO_RACE_M
        : RACE_M;
  return Math.ceil(distance / length);
}
