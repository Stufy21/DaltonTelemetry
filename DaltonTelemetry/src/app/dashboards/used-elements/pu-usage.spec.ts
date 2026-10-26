import { PuDriverUsage, PuPenalty } from './pu-elements.model';
import { overLimit, penaltiesByDriver, teamColour, usageState } from './pu-usage';

const driver = (used: Partial<PuDriverUsage['used']>): PuDriverUsage => ({
  car: 6,
  driver: 'Isack Hadjar',
  team: 'Red Bull Racing RB Ford',
  used: { ICE: 1, TC: 1, EXH: 1, 'MGU-K': 1, ES: 1, 'PU-CE': 1, 'PU-ANC': 1, ...used },
  new: [],
});

describe('usageState', () => {
  it('tells apart within, on and over the allowance', () => {
    expect(usageState(3, 4)).toBe('ok');
    expect(usageState(4, 4)).toBe('at');
    expect(usageState(5, 4)).toBe('over');
  });
});

describe('overLimit', () => {
  it('lists the parts above their own allowance with the excess', () => {
    const over = overLimit(driver({ ICE: 8, ES: 4, 'PU-ANC': 6 }));
    expect(over).toEqual([
      { key: 'ICE', extra: 4 },
      { key: 'ES', extra: 1 },
    ]);
  });

  it('is empty for a driver within every allowance', () => {
    expect(overLimit(driver({ ICE: 4, 'PU-ANC': 6 }))).toEqual([]);
  });
});

describe('penaltiesByDriver', () => {
  const drop = (car: number, places: number | null, decision = 'Drop'): PuPenalty => ({
    car,
    driver: `Car ${car}`,
    places,
    decision,
    document: null,
  });

  it('adds up the decisions of one car and puts the heaviest first', () => {
    const rows = penaltiesByDriver([drop(43, 10), drop(5, 20), drop(5, 60)]);
    expect(rows.map((r) => [r.car, r.places])).toEqual([
      [5, 80],
      [43, 10],
    ]);
  });

  it('keeps a decision that is not a drop of places as text', () => {
    const [row] = penaltiesByDriver([drop(5, null, 'Start from the pit lane')]);
    expect(row.places).toBe(0);
    expect(row.other).toEqual(['Start from the pit lane']);
  });
});

describe('teamColour', () => {
  it('matches the team before the engine maker', () => {
    expect(teamColour('McLaren Mercedes')).toBe('#FF8000');
    expect(teamColour('Atlassian Williams Mercedes')).toBe('#64C4FF');
    expect(teamColour('Haas Ferrari')).toBe('#B6BABD');
    expect(teamColour('Cadillac Ferrari')).toBe('#E6B800');
  });

  it('falls back to grey for a team it does not know', () => {
    expect(teamColour('Somebody New')).toBe('#8A8F98');
  });
});
