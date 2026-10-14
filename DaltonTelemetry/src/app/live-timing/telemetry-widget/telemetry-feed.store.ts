import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { LiveFeedService } from '../../core/openf1/live-feed.service';
import { OpenF1Service } from '../../core/openf1/openf1.service';
import { OF1CarData } from '../../core/openf1/openf1.model';
import { ComparisonStore } from '../comparison/comparison.store';
import { LiveTimingStore } from '../live-timing.store';
import { Timed, TimedSeries } from '../timed-series';
import { MAX_INTERPOLATION_GAP_MS } from '../timing-dataset';

const WINDOW_MS = 120_000;
const DEBOUNCE_MS = 400;
const RETRY_MS = 15_000;
const LIVE_POLL_MS = 15_000;
/** A reading older than this is treated as missing rather than shown as current. */
const MAX_AGE_MS = 4_000;

export interface CarSample {
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
}

export interface Reading {
  driver: number;
  sample: CarSample | null;
}

/**
 * Sample between two readings: continuous channels are interpolated, while gear and brake are
 * discrete and keep the earlier value.
 */
function blend(prev: Timed<CarSample>, next: Timed<CarSample>, t: number): CarSample {
  const k = (t - prev.t) / (next.t - prev.t);
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    speed: mix(prev.v.speed, next.v.speed),
    rpm: mix(prev.v.rpm, next.v.rpm),
    throttle: mix(prev.v.throttle, next.v.throttle),
    gear: prev.v.gear,
    brake: prev.v.brake,
  };
}

/**
 * Car telemetry of the selected drivers at the playhead. In replay it loads 2-minute windows
 * around the clock; while following a live session it polls for new samples.
 */
@Injectable()
export class TelemetryFeedStore {
  private readonly timing = inject(LiveTimingStore);
  private readonly cmp = inject(ComparisonStore);
  private readonly api = inject(OpenF1Service);
  private readonly feed = inject(LiveFeedService);

  private readonly series = new Map<number, TimedSeries<CarSample>>();
  private readonly version = signal(0);
  private readonly loaded = new Set<string>();
  private readonly loading = new Set<string>();
  private readonly failedAt = new Map<string, number>();
  private pendingSignature = '';
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private cursors = new Map<number, number>();

  readonly readings = computed<Reading[]>(() => {
    this.version();
    const t = this.timing.mapTime();
    return this.cmp.selected().map((driver) => {
      const { prev, next } = this.series.get(driver)?.bracket(t) ?? {};
      if (!prev || t - prev.t > MAX_AGE_MS) return { driver, sample: null };
      return {
        driver,
        sample: next && next.t - prev.t <= MAX_INTERPOLATION_GAP_MS ? blend(prev, next, t) : prev.v,
      };
    });
  });

  constructor() {
    effect(() => {
      this.timing.session();
      untracked(() => this.reset());
    });

    // Replay: keep the window under the playhead loaded.
    effect(() => {
      const session = this.timing.session();
      const drivers = this.cmp.selected();
      const t = this.timing.mapSecond() * 1000;
      const live = this.timing.sessionLive() && this.timing.following();
      const paused = this.timing.mapPaused();
      const playing = this.timing.playing();
      untracked(() => {
        if (live || paused || !session || !drivers.length) return;
        this.ensureWindows(session.session_key, drivers, t, playing);
      });
    });

    // Live through the server relay: telemetry arrives as a stream, kept only for selected drivers.
    effect((onCleanup) => {
      const session = this.timing.session();
      const watching = this.cmp.selected().length > 0;
      if (!session || !watching || !this.timing.relayActive() || !this.timing.sessionLive()) return;

      const subscription = this.feed.stream(['v1/car_data']).subscribe((batch) => {
        const selected = untracked(() => this.cmp.selected());
        const rows = batch
          .map((e) => e.data as unknown as OF1CarData)
          .filter(
            (r) =>
              (r as unknown as { session_key: number }).session_key === session.session_key &&
              selected.includes(r.driver_number),
          );
        if (rows.length) this.ingest(rows);
      });
      onCleanup(() => subscription.unsubscribe());
    });

    // Live without a relay: poll for new samples while following.
    effect((onCleanup) => {
      const session = this.timing.session();
      const drivers = this.cmp.selected();
      if (this.timing.relayActive()) return;
      if (!session || !drivers.length || !(this.timing.sessionLive() && this.timing.following())) {
        return;
      }
      const poll = () => untracked(() => this.pollLive(session.session_key, drivers));
      poll();
      const id = setInterval(poll, LIVE_POLL_MS);
      onCleanup(() => clearInterval(id));
    });
  }

  private reset(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.series.clear();
    this.loaded.clear();
    this.loading.clear();
    this.failedAt.clear();
    this.cursors.clear();
    this.pendingSignature = '';
    this.version.update((v) => v + 1);
  }

  private ensureWindows(sessionKey: number, drivers: number[], t: number, playing: boolean): void {
    const start = this.timing.rangeStart();
    const index = Math.floor((t - start) / WINDOW_MS);
    const fraction = ((t - start) % WINDOW_MS) / WINDOW_MS;
    const indices = playing && fraction > 0.6 ? [index, index + 1] : [index];

    const missing: { driver: number; index: number }[] = [];
    for (const driver of drivers) {
      for (const i of indices) {
        const key = `${driver}:${i}`;
        if (this.loaded.has(key) || this.loading.has(key)) continue;
        if (Date.now() - (this.failedAt.get(key) ?? 0) < RETRY_MS) continue;
        missing.push({ driver, index: i });
      }
    }
    if (!missing.length) {
      this.pendingSignature = '';
      return;
    }

    // Debounce so dragging the timeline doesn't request every window it passes over.
    const signature = missing.map((m) => `${m.driver}:${m.index}`).join(',');
    if (signature === this.pendingSignature) return;
    this.pendingSignature = signature;
    clearTimeout(this.timer);
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      for (const m of missing) this.loadWindow(sessionKey, m.driver, m.index, start, generation);
    }, DEBOUNCE_MS);
  }

  private loadWindow(
    sessionKey: number,
    driver: number,
    index: number,
    start: number,
    generation: number,
  ): void {
    const key = `${driver}:${index}`;
    if (this.loading.has(key) || this.loaded.has(key)) return;
    this.loading.add(key);
    const from = start + index * WINDOW_MS;
    this.api
      .getCarData(
        sessionKey,
        driver,
        new Date(from).toISOString(),
        new Date(from + WINDOW_MS).toISOString(),
        !this.timing.sessionLive(),
      )
      .subscribe({
        next: (rows) => {
          if (generation !== this.generation) return;
          this.loading.delete(key);
          this.loaded.add(key);
          this.ingest(rows);
        },
        error: () => {
          if (generation !== this.generation) return;
          this.loading.delete(key);
          this.failedAt.set(key, Date.now());
          this.pendingSignature = '';
        },
      });
  }

  private pollLive(sessionKey: number, drivers: number[]): void {
    const generation = this.generation;
    for (const driver of drivers) {
      const from = this.cursors.get(driver) ?? Date.now() - 2 * LIVE_POLL_MS;
      this.api
        .getCarData(
          sessionKey,
          driver,
          new Date(from).toISOString(),
          new Date(Date.now() + 60_000).toISOString(),
        )
        .subscribe({
          next: (rows) => {
            if (generation !== this.generation) return;
            this.ingest(rows);
            const newest = rows.reduce((max, r) => Math.max(max, Date.parse(r.date)), 0);
            if (newest) this.cursors.set(driver, newest + 1);
          },
          error: () => undefined,
        });
    }
  }

  private ingest(rows: OF1CarData[]): void {
    for (const r of rows) {
      let series = this.series.get(r.driver_number);
      if (!series) this.series.set(r.driver_number, (series = new TimedSeries<CarSample>()));
      series.add(Date.parse(r.date), {
        speed: r.speed,
        rpm: r.rpm,
        gear: r.n_gear,
        throttle: r.throttle,
        brake: r.brake,
      });
    }
    this.version.update((v) => v + 1);
  }
}
