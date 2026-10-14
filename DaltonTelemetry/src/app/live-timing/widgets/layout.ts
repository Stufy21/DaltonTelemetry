export type WidgetId = 'leaderboard' | 'map' | 'telemetry' | 'feed';
export type ColumnId = 'main' | 'side';

export interface Layout {
  main: WidgetId[];
  side: WidgetId[];
  hidden: WidgetId[];
}

export const WIDGET_TITLES: Record<WidgetId, string> = {
  leaderboard: 'Leaderboard',
  map: 'Track map',
  telemetry: 'Telemetry',
  feed: 'Race control & radio',
};

export const WIDGET_ICONS: Record<WidgetId, string> = {
  leaderboard: 'format_list_numbered',
  map: 'map',
  telemetry: 'speed',
  feed: 'campaign',
};

export const DEFAULT_LAYOUT: Layout = {
  main: ['leaderboard'],
  side: ['map', 'telemetry', 'feed'],
  hidden: [],
};

const ALL: WidgetId[] = ['leaderboard', 'map', 'telemetry', 'feed'];
const isWidgetId = (v: unknown): v is WidgetId => ALL.includes(v as WidgetId);

/**
 * Makes any stored value a valid layout: unknown ids are dropped, duplicates removed, and any
 * widget that is neither placed nor hidden (e.g. added in a newer version) goes back to its
 * default column.
 */
export function normalizeLayout(raw: unknown): Layout {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof Layout, unknown>
  >;
  const seen = new Set<WidgetId>();
  const take = (value: unknown): WidgetId[] =>
    (Array.isArray(value) ? value : []).filter((id): id is WidgetId => {
      if (!isWidgetId(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  const hidden = take(source.hidden);
  const main = take(source.main);
  const side = take(source.side);

  for (const id of ALL) {
    if (seen.has(id)) continue;
    (DEFAULT_LAYOUT.main.includes(id) ? main : side).push(id);
  }
  return { main, side, hidden };
}
