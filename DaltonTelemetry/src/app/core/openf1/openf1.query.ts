export type Params = Record<string, string | number>;

/**
 * OpenF1 filters put the operator right before the value (`date>=2026-…`, `date<2026-…`), with
 * no `=` separator, which HttpParams can't produce. Keys ending in `<`, `>`, `<=` or `>=` are
 * therefore joined to their value as-is (ISO timestamps need no escaping).
 */
export function toQuery(params: Params): string {
  return Object.entries(params)
    .map(([key, value]) =>
      /[<>]=?$/.test(key)
        ? `${key}${value}`
        : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}
