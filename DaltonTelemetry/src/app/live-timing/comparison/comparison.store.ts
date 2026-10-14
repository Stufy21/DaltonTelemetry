import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { OF1CarData } from '../../core/openf1/openf1.model';
import { OpenF1Service } from '../../core/openf1/openf1.service';
import { LiveTimingStore } from '../live-timing.store';
import { buildTrace, Trace } from '../telemetry';

const MAX_DRIVERS = 2;
const RECENT_LAPS = 5;
/** Wait for the clock/selection to settle so scrubbing doesn't fire a request per frame. */
const LOAD_DEBOUNCE_MS = 600;

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
  /** Hovered position along the lap (0..1), shared by all charts. */
  readonly hover = signal<number | null>(null);
  /** The bottom card shrinks to its header so the widgets underneath stay reachable. */
  readonly collapsed = signal(false);

  readonly traces = signal<Record<number, Trace | null>>({});
  /** Lap the current traces belong to. */
  readonly tracedLap = signal<number | null>(null);
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

  constructor() {
    // A different session means different drivers and laps.
    effect(() => {
      this.timing.session();
      untracked(() => this.clear());
    });

    effect(() => {
      const lap = this.activeLap();
      const drivers = this.selected();
      const paused = this.timing.mapPaused();
      untracked(() => this.scheduleLoad(lap, drivers, paused));
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

  clear(): void {
    this.selected.set([]);
    this.chosenLap.set(null);
    this.hover.set(null);
    this.traces.set({});
    this.tracedLap.set(null);
    this.error.set(null);
    this.collapsed.set(false);
    this.cancel();
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

  private scheduleLoad(lap: number | null, drivers: number[], paused: boolean): void {
    clearTimeout(this.timer);
    if (!drivers.length || lap == null) return;
    // Above the playback speed the API budget can feed, keep showing the last lap loaded.
    if (paused && this.tracedLap() != null) return;
    this.timer = setTimeout(() => this.load(lap, drivers), LOAD_DEBOUNCE_MS);
  }

  private load(lap: number, drivers: number[]): void {
    const session = this.timing.session();
    if (!session) return;

    this.sub?.unsubscribe();
    const id = ++this.loadId;
    const live = this.timing.sessionLive();
    const lapsOf = new Map(this.lapsByDriver().map((d) => [d.driver, d.laps]));
    const keyOf = (driver: number) => `${session.session_key}:${driver}:${lap}`;

    const known: Record<number, Trace | null> = {};
    const requests: Record<number, Observable<OF1CarData[]>> = {};

    for (const driver of drivers) {
      const window = lapsOf.get(driver)?.find((l) => l.lap === lap);
      if (this.cache.has(keyOf(driver))) {
        known[driver] = this.cache.get(keyOf(driver)) ?? null;
      } else if (!window) {
        known[driver] = null;
      } else {
        requests[driver] = this.api
          .getCarData(
            session.session_key,
            driver,
            new Date(window.start).toISOString(),
            new Date(window.end).toISOString(),
            !live,
          )
          .pipe(catchError(() => of<OF1CarData[]>([])));
      }
    }

    const apply = (traces: Record<number, Trace | null>) => {
      if (id !== this.loadId) return;
      this.traces.set({ ...known, ...traces });
      this.tracedLap.set(lap);
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
        // Cache only traces that were actually built, so a failed request is retried.
        if (trace) this.cache.set(keyOf(Number(driver)), trace);
      }
      this.error.set(
        Object.values(built).every((t) => !t) ? 'No telemetry available for this lap.' : null,
      );
      apply(built);
    });
  }
}
