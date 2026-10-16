import { DEFAULT_LAYOUT, cloneLayout, defaultColumn, normalizeLayout } from './layout';

describe('normalizeLayout', () => {
  it('falls back to the default layout for junk input', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout('nope')).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({})).toEqual(DEFAULT_LAYOUT);
  });

  it('keeps a valid custom layout', () => {
    const layout = {
      main: ['leaderboard', 'telemetry'],
      side: ['feed', 'championship', 'map'],
      third: [],
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
    ).toEqual({
      main: ['leaderboard', 'map'],
      side: ['telemetry', 'feed'],
      third: ['championship'],
      hidden: [],
    });
  });

  it('restores widgets that are neither placed nor hidden to their default column', () => {
    expect(normalizeLayout({ main: [], side: ['map'], hidden: ['feed'] })).toEqual({
      main: ['leaderboard'],
      side: ['map', 'telemetry'],
      third: ['championship'],
      hidden: ['feed'],
    });
  });

  it('puts a widget added by a newer version at its default place in an older saved layout', () => {
    expect(
      normalizeLayout({
        main: ['leaderboard'],
        side: ['map', 'telemetry'],
        third: ['feed'],
        hidden: [],
      }),
    ).toEqual(DEFAULT_LAYOUT);
  });
});

describe('defaultColumn', () => {
  it('maps every widget to the column it starts in', () => {
    expect(defaultColumn('leaderboard')).toBe('main');
    expect(defaultColumn('map')).toBe('side');
    expect(defaultColumn('telemetry')).toBe('side');
    expect(defaultColumn('feed')).toBe('third');
    expect(defaultColumn('championship')).toBe('third');
  });
});

describe('cloneLayout', () => {
  it('copies every column so edits do not leak into the original', () => {
    const copy = cloneLayout(DEFAULT_LAYOUT);
    copy.third.push('map');
    copy.hidden.push('feed');
    expect(DEFAULT_LAYOUT.third).toEqual(['feed', 'championship']);
    expect(DEFAULT_LAYOUT.hidden).toEqual([]);
  });
});
