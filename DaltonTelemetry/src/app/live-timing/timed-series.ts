export interface Timed<T> {
  t: number;
  v: T;
}

/** Time-ordered values with O(log n) "state as of time t" lookups. */
export class TimedSeries<T> {
  private items: Timed<T>[] = [];
  private unsorted = false;

  get length(): number {
    return this.items.length;
  }

  get lastTime(): number {
    return this.items.length ? this.sorted()[this.items.length - 1].t : -Infinity;
  }

  add(t: number, v: T): void {
    const last = this.items[this.items.length - 1];
    if (last && t < last.t) this.unsorted = true;
    this.items.push({ t, v });
  }

  /** Number of items with time <= t. */
  count(t: number): number {
    return upperBound(this.sorted(), t, (i) => i.t);
  }

  at(t: number): T | undefined {
    const n = this.count(t);
    return n > 0 ? this.items[n - 1].v : undefined;
  }

  /** The samples just before and just after t (either may be missing), for interpolation. */
  bracket(t: number): { prev?: Timed<T>; next?: Timed<T> } {
    const n = this.count(t);
    const items = this.sorted();
    return {
      prev: n > 0 ? items[n - 1] : undefined,
      next: n < items.length ? items[n] : undefined,
    };
  }

  /** All items in time order. */
  entries(): readonly Timed<T>[] {
    return this.sorted();
  }

  /** Like `at`, but also returns the sample's own timestamp (to judge staleness). */
  entryAt(t: number): { t: number; v: T } | undefined {
    const n = this.count(t);
    return n > 0 ? this.items[n - 1] : undefined;
  }

  /** The last `limit` items up to t, newest first. */
  latest(t: number, limit: number): T[] {
    const n = this.count(t);
    return this.items
      .slice(Math.max(0, n - limit), n)
      .reverse()
      .map((i) => i.v);
  }

  private sorted(): Timed<T>[] {
    if (this.unsorted) {
      this.items.sort((a, b) => a.t - b.t);
      this.unsorted = false;
    }
    return this.items;
  }
}

/** Number of elements whose key is <= target, for an array sorted ascending by key. */
export function upperBound<T>(arr: readonly T[], target: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(arr[mid]) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
