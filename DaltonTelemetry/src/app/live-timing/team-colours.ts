import { OF1Driver } from '../core/openf1/openf1.model';

/**
 * The F1 feed gives some teams almost the same colour (Audi's red next to Ferrari's, Cadillac's
 * grey next to Haas'), which makes cars, bars and rings impossible to tell apart. These teams get
 * a colour of their own; every other team keeps the colour from the feed. Hex without `#`.
 */
const DISTINCT_COLOURS: { team: string; colour: string }[] = [
  { team: 'audi', colour: 'FF3D9A' },
  { team: 'cadillac', colour: 'E6B800' },
];

export function distinctTeamColour(
  teamName: string | null,
  feedColour: string | null,
): string | null {
  const name = (teamName ?? '').toLowerCase();
  return DISTINCT_COLOURS.find((d) => name.includes(d.team))?.colour ?? feedColour;
}

export function withDistinctColour(driver: OF1Driver): OF1Driver {
  const colour = distinctTeamColour(driver.team_name, driver.team_colour);
  return colour === driver.team_colour ? driver : { ...driver, team_colour: colour };
}
