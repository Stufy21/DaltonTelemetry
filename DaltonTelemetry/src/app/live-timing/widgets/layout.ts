export type WidgetId = 'leaderboard' | 'championship' | 'map' | 'telemetry' | 'feed';
export type ColumnId = 'main' | 'side' | 'third';
export const COLUMNS: ColumnId[] = ['main', 'side', 'third'];

export interface Layout {
  main: WidgetId[];
  side: WidgetId[];
  third: WidgetId[];
  hidden: WidgetId[];
}

export const WIDGET_TITLES: Record<WidgetId, string> = {
  leaderboard: 'Leaderboard',
  championship: 'Championship',
  map: 'Track map',
  telemetry: 'Telemetry',
  feed: 'Race control & radio',
};

export const WIDGET_ICONS: Record<WidgetId, string> = {
  leaderboard: 'format_list_numbered',
  championship: 'emoji_events',
  map: 'map',
  telemetry: 'speed',
  feed: 'campaign',
};

/** Three columns on a wide screen: standings | map and telemetry | race control and championship. */
export const DEFAULT_LAYOUT: Layout = {
  main: ['leaderboard'],
  side: ['map', 'telemetry'],
  third: ['feed', 'championship'],
  hidden: [],
};

export function defaultColumn(id: WidgetId): ColumnId {
  return COLUMNS.find((column) => DEFAULT_LAYOUT[column].includes(id)) ?? 'side';
}

export function cloneLayout(layout: Layout): Layout {
  return {
    main: [...layout.main],
    side: [...layout.side],
    third: [...layout.third],
    hidden: [...layout.hidden],
  };
}

const ALL: WidgetId[] = ['leaderboard', 'championship', 'map', 'telemetry', 'feed'];
const isWidgetId = (v: unknown): v is WidgetId => ALL.includes(v as WidgetId);

/**
 * Makes any stored value a valid layout: unknown ids are dropped, duplicates removed, and any
 * widget that is neither placed nor hidden (e.g. added in a newer version) goes back to its
 * default column, at its default position where the column is long enough.
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
  const layout: Layout = {
    hidden,
    main: take(source.main),
    side: take(source.side),
    third: take(source.third),
  };

  for (const id of ALL) {
    if (seen.has(id)) continue;
    const column = defaultColumn(id);
    const defaults = DEFAULT_LAYOUT[column];
    layout[column].splice(Math.min(defaults.indexOf(id), layout[column].length), 0, id);
  }
  return layout;
}
