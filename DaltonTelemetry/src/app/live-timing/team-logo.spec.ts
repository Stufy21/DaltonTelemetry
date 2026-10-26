import { teamLogoUrl } from './team-logo';

describe('teamLogoUrl', () => {
  it('points each team at its own logo on the F1 media CDN', () => {
    expect(teamLogoUrl('McLaren')).toContain('/2026/mclaren/2026mclarenlogo.webp');
    expect(teamLogoUrl('Red Bull Racing')).toContain('/2026/redbullracing/2026redbullracinglogo');
    expect(teamLogoUrl('Haas F1 Team')).toContain('/2026/haasf1team/2026haasf1teamlogo');
  });

  it('tells Racing Bulls from Red Bull', () => {
    expect(teamLogoUrl('Racing Bulls')).toContain('/racingbulls/');
    expect(teamLogoUrl('Red Bull Racing')).toContain('/redbullracing/');
  });

  it('has a one-colour version for dark backgrounds', () => {
    expect(teamLogoUrl('Mercedes', 'white')).toContain('/2026/mercedes/2026mercedeslogowhite.webp');
    expect(teamLogoUrl('Mercedes', 'colour')).toContain('/2026/mercedes/2026mercedeslogo.webp');
  });

  it('has nothing for a team it does not know or a missing name', () => {
    expect(teamLogoUrl('Somebody New')).toBeNull();
    expect(teamLogoUrl(null)).toBeNull();
  });
});
