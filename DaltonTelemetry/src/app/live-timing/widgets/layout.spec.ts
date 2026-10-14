import { DEFAULT_LAYOUT, normalizeLayout } from './layout';

describe('normalizeLayout', () => {
  it('falls back to the default layout for junk input', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout('nope')).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({})).toEqual(DEFAULT_LAYOUT);
  });

  it('keeps a valid custom layout', () => {
    const layout = {
      main: ['leaderboard', 'telemetry'],
      side: ['feed', 'map'],
      hidden: [],
    };
    expect(normalizeLayout(layout)).toEqual(layout);
  });

  it('drops unknown ids and duplicates', () => {
    expect(
      normalizeLayout({
        main: ['leaderboard', 'bogus', 'map'],
        side: ['map', 'telemetry', 'feed'],
        hidden: [],
      }),
    ).toEqual({ main: ['leaderboard', 'map'], side: ['telemetry', 'feed'], hidden: [] });
  });

  it('restores widgets that are neither placed nor hidden to their default column', () => {
    expect(normalizeLayout({ main: [], side: ['map'], hidden: ['feed'] })).toEqual({
      main: ['leaderboard'],
      side: ['map', 'telemetry'],
      hidden: ['feed'],
    });
  });
});
