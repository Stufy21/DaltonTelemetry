import { OF1Driver } from '../core/openf1/openf1.model';
import { distinctTeamColour, withDistinctColour } from './team-colours';

const driver = (team_name: string, team_colour: string | null): OF1Driver => ({
  driver_number: 1,
  broadcast_name: 'X',
  full_name: 'X',
  name_acronym: 'X',
  team_name,
  team_colour,
  headshot_url: null,
});

describe('team colours', () => {
  it('keeps the feed colour for teams that already stand out', () => {
    expect(distinctTeamColour('Ferrari', 'ED1131')).toBe('ED1131');
    expect(distinctTeamColour('Haas F1 Team', '9C9FA2')).toBe('9C9FA2');
    expect(distinctTeamColour('McLaren', null)).toBeNull();
  });

  it('gives Audi and Cadillac their own colours, whatever the feed says', () => {
    expect(distinctTeamColour('Audi', 'F50537')).not.toBe('F50537');
    expect(distinctTeamColour('Cadillac', '909090')).not.toBe('909090');
    expect(distinctTeamColour('AUDI F1 TEAM', null)).toBe(distinctTeamColour('Audi', 'F50537'));
  });

  it('no two teams of the 2026 grid end up with the same colour', () => {
    const feed: Record<string, string> = {
      Alpine: '00A1E8',
      Mercedes: '00D7B6',
      Williams: '1868DB',
      'Aston Martin': '229971',
      'Red Bull Racing': '4781D7',
      'Racing Bulls': '6C98FF',
      Cadillac: '909090',
      'Haas F1 Team': '9C9FA2',
      Ferrari: 'ED1131',
      McLaren: 'F47600',
      Audi: 'F50537',
    };
    const colours = Object.entries(feed).map(([team, c]) => distinctTeamColour(team, c));
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('only copies a driver when its colour changes', () => {
    const ferrari = driver('Ferrari', 'ED1131');
    expect(withDistinctColour(ferrari)).toBe(ferrari);
    const audi = driver('Audi', 'F50537');
    expect(withDistinctColour(audi)).not.toBe(audi);
    expect(withDistinctColour(audi).team_colour).toBe(distinctTeamColour('Audi', 'F50537'));
  });
});
