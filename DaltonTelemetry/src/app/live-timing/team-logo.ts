/**
 * Team logos come from the F1 media CDN, the same place the official site loads them from, so no
 * image is stored in the project. A team that is not listed (or whose logo fails to load) is shown
 * by its colour instead.
 */
const SEASON = 2026;
const CDN = 'https://media.formula1.com/image/upload/c_fit,h_64/q_auto/v1740000000/common/f1';

/** Name as the F1 feed gives it, then the CDN's folder for that team. */
const TEAM_SLUGS: { match: string; slug: string }[] = [
  { match: 'mclaren', slug: 'mclaren' },
  { match: 'mercedes', slug: 'mercedes' },
  { match: 'red bull', slug: 'redbullracing' },
  { match: 'ferrari', slug: 'ferrari' },
  { match: 'williams', slug: 'williams' },
  { match: 'racing bulls', slug: 'racingbulls' },
  { match: 'aston martin', slug: 'astonmartin' },
  { match: 'haas', slug: 'haasf1team' },
  { match: 'alpine', slug: 'alpine' },
  { match: 'audi', slug: 'audi' },
  { match: 'cadillac', slug: 'cadillac' },
];

/** `white` is the one-colour version for dark backgrounds; the full-colour one suits light ones. */
export type LogoVariant = 'colour' | 'white';

export function teamLogoUrl(
  teamName: string | null,
  variant: LogoVariant = 'colour',
): string | null {
  const name = (teamName ?? '').toLowerCase();
  const team = TEAM_SLUGS.find((t) => name.includes(t.match));
  if (!team) return null;
  const file = `${SEASON}${team.slug}logo${variant === 'white' ? 'white' : ''}`;
  return `${CDN}/${SEASON}/${team.slug}/${file}.webp`;
}
