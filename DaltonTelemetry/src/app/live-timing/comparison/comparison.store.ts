import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { OF1CarData } from '../../core/openf1/openf1.model';
import { OpenF1Service } from '../../core/openf1/openf1.service';
import { LiveTimingStore } from '../live-timing.store';
import { buildTrace, Trace } from '../telemetry';
import { clickAt, NO_ZOOM, ZoomState } from './zoom';

const MAX_DRIVERS = 2;
const RECENT_LAPS = 5;
/** Wait for the clock/selection to settle so scrubbing doesn't fire a request per frame. */
const LOAD_DEBOUNCE_MS = 600;

/** What the telemetry compares: the same recent lap of both drivers, or each driver's best lap. */
export type CompareMode = 'recent' | 'best';

/** The lap whose telemetry is loaded for one driver; null when they have no such lap. */
interface LapTarget {
  driver: number;
  lap: number | null;
  window: { start: number; end: number } | null;
}

const sameTargets = (a: LapTarget[], b: LapTarget[]): boolean =>
  a.length === b.length &&
  a.every(
    (t, i) =>
      t.driver === b[i].driver &&
      t.lap === b[i].lap &&
      t.window?.start === b[i].window?.start &&
      t.window?.end === b[i].window?.end,
  );

export interface LapRow {
  lap: number;
  /** One entry per selected driver, in selection order. */
  times: { duration: number | null; pitOut: boolean }[];
}

/**
 * Driver comparison: which drivers are selected, which of their recent laps is shown, and the
 * telemetry traces for that lap. Provided by the page, next to LiveTimingStore.
 */
@Injectable()
export class ComparisonStore {
  private readonly timing = inject(LiveTimingStore);
  private readonly api = inject(OpenF1Service);

  readonly selected = signal<number[]>([]);
  /** Lap picked by the user; null follows the latest lap both drivers have completed. */
  readonly chosenLap = signal<number | null>(null);
  readonly mode = signal<CompareMode>('recent');
  /** Hovered position along the lap (0..1), shared by all charts. */
  readonly hover = signal<number | null>(null);
  private readonly zoomState = signal<ZoomState>(NO_ZOOM);
  /** The stretch of the lap the charts are zoomed to (the whole lap when null). */
  readonly zoom = computed(() => this.zoomState().zoom);
  /** Where the first click of a selection landed, while the second click is awaited. */
  readonly anchor = computed(() => this.zoomState().anchor);
  /** The bottom card shrinks to its header so the widgets underneath stay reachable. */
  readonly collapsed = signal(false);

  readonly traces = signal<Record<number, Trace | null>>({});
  /** Lap the current traces belong to (recent-laps mode; null when comparing best laps). */
  readonly tracedLap = signal<number | null>(null);
  /** Which mode the current traces were loaded in. */
  readonly tracedMode = signal<CompareMode>('recent');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly cache = new Map<string, Trace | null>();
  private timer?: ReturnType<typeof setTimeout>;
  private sub?: Subscription;
  private loadId = 0;

  readonly lapsByDriver = computed(() =>
    this.selected().map((driver) => ({
      driver,
      laps: this.timing.recentLaps(driver, RECENT_LAPS),
    })),
  );

  /** Union of the drivers' recent laps, newest first. */
  readonly lapRows = computed<LapRow[]>(() => {
    const perDriver = this.lapsByDriver();
    const numbers = new Set(perDriver.flatMap((d) => d.laps.map((l) => l.lap)));
    return [...numbers]
      .sort((a, b) => b - a)
      .map((lap) => ({
        lap,
        times: perDriver.map((d) => {
          const found = d.laps.find((l) => l.lap === lap);
          return { duration: found?.duration ?? null, pitOut: found?.pitOut ?? false };
        }),
      }));
  });

  readonly activeLap = computed<number | null>(() => {
    const rows = this.lapRows();
    if (!rows.length) return null;
    const chosen = this.chosenLap();
    if (chosen != null && rows.some((r) => r.lap === chosen)) return chosen;
    const common = rows.find((r) => r.times.every((t) => t.duration != null));
    return (common ?? rows[0]).lap;
  });

  /** Each selected driver's best lap so far, in selection order. */
  readonly bestLaps = computed(() =>
    this.selected().map((driver) => ({ driver, lap: this.timing.bestLapOf(driver) })),
  );

  /**
   * The lap to trace for each driver. Compared by value, so the load below only restarts when a
   * lap really changes and not every time the live data refreshes.
   */
  private readonly targets = computed<LapTarget[]>(
    () => {
      if (this.mode() === 'best') {
        return this.bestLaps().map(({ driver, lap }) => ({
          driver,
          lap: lap?.lap ?? null,
          window: lap ? { start: lap.start, end: lap.end } : null,
        }));
      }
      const lap = this.activeLap();
      const lapsOf = new Map(this.lapsByDriver().map((d) => [d.driver, d.laps]));
      return this.selected().map((driver) => ({
        driver,
        lap,
        window: lapsOf.get(driver)?.find((l) => l.lap === lap) ?? null,
      }));
    },
    { equal: sameTargets },
  );

  constructor() {
    // A different session means different drivers and laps.
    effect(() => {
      this.timing.session();
      untracked(() => this.clear());
    });

    effect(() => {
      const targets = this.targets();
      const mode = this.mode();
      const paused = this.timing.mapPaused();
      untracked(() => this.scheduleLoad(targets, mode, paused));
    });
  }

  toggle(driver: number): void {
    this.selected.update((list) => {
      if (list.includes(driver)) return list.filter((d) => d !== driver);
      return [...list, driver].slice(-MAX_DRIVERS);
    });
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  swap(): void {
    this.selected.update((list) => [...list].reverse());
  }

  /** A click on any chart: the first one starts a selection, the second zooms to it. */
  selectAt(position: number): void {
    this.zoomState.update((state) => clickAt(state, position));
  }

  cancelSelection(): void {
    this.zoomState.update((state) => ({ ...state, anchor: null }));
  }

  resetZoom(): void {
    this.zoomState.set(NO_ZOOM);
  }

  clear(): void {
    this.resetZoom();
    this.selected.set([]);
    this.chosenLap.set(null);
    this.mode.set('recent');
    this.hover.set(null);
    this.traces.set({});
    this.tracedLap.set(null);
    this.error.set(null);
    this.collapsed.set(false);
    this.cancel();
  }

  setMode(mode: CompareMode): void {
    this.mode.set(mode);
  }

  chooseLap(lap: number): void {
    this.chosenLap.update((current) => (current === lap ? null : lap));
  }

  followLatest(): void {
    this.chosenLap.set(null);
  }

  private cancel(): void {
    clearTimeout(this.timer);
    this.sub?.unsubscribe();
    this.loadId++;
    this.loading.set(false);
  }

  private scheduleLoad(targets: LapTarget[], mode: CompareMode, paused: boolean): void {
    clearTimeout(this.timer);
    if (!targets.some((t) => t.lap != null)) return;
    // Above the playback speed the API budget can feed, keep showing what was loaded last.
    if (paused && this.tracedMode() === mode && Object.keys(this.traces()).length) return;
    this.timer = setTimeout(() => this.load(targets, mode), LOAD_DEBOUNCE_MS);
  }

  private load(targets: LapTarget[], mode: CompareMode): void {
    const session = this.timing.session();
    if (!session) return;

    this.sub?.unsubscribe();
    const id = ++this.loadId;
    const live = this.timing.sessionLive();
    const keyOf = (t: LapTarget) => `${session.session_key}:${t.driver}:${t.lap}`;

    const known: Record<number, Trace | null> = {};
    const requests: Record<number, Observable<OF1CarData[]>> = {};

    for (const target of targets) {
      if (target.lap != null && this.cache.has(keyOf(target))) {
        known[target.driver] = this.cache.get(keyOf(target)) ?? null;
      } else if (target.lap == null || !target.window) {
        known[target.driver] = null;
      } else {
        requests[target.driver] = this.api
          .getCarData(
            session.session_key,
            target.driver,
            new Date(target.window.start).toISOString(),
            new Date(target.window.end).toISOString(),
            !live,
          )
          .pipe(catchError(() => of<OF1CarData[]>([])));
      }
    }

    const apply = (traces: Record<number, Trace | null>) => {
      if (id !== this.loadId) return;
      this.traces.set({ ...known, ...traces });
      this.tracedLap.set(mode === 'recent' ? (targets[0]?.lap ?? null) : null);
      this.tracedMode.set(mode);
      this.loading.set(false);
    };

    if (!Object.keys(requests).length) return apply({});

    this.loading.set(true);
    this.error.set(null);
    this.sub = forkJoin(requests).subscribe((rows) => {
      const built: Record<number, Trace | null> = {};
      for (const [driver, data] of Object.entries(rows)) {
        const trace = buildTrace(data);
        built[Number(driver)] = trace;
        const target = targets.find((t) => t.driver === Number(driver));
        // Cache only traces that were actually built, so a failed request is retried.
        if (trace && target) this.cache.set(keyOf(target), trace);
      }
      this.error.set(
        Object.values(built).every((t) => !t)
          ? `No telemetry available for ${mode === 'best' ? 'these laps' : 'this lap'}.`
          : null,
      );
      apply(built);
    });
  }
}
