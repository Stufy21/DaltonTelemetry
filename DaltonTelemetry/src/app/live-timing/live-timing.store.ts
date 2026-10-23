import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { forkJoin, of, Subscription } from 'rxjs';
import { OpenF1Config } from '../core/openf1/openf1-config';
import { OpenF1Service } from '../core/openf1/openf1.service';
import { LiveEvent, LiveFeedService } from '../core/openf1/live-feed.service';
import { OF1Session, OF1Stint } from '../core/openf1/openf1.model';
import { clampDelay, DELAY_STORAGE_KEY, readStoredDelay } from './delay';
import { applyLiveBatch, stintKey } from './live-ingest';
import { pollCadence } from './polling';
import { LapSummary, Point, TimingDataset } from './timing-dataset';

const TICK_MS = 250;

/** A session is considered live from shortly before it starts to a while after the scheduled end. */
const LIVE_WINDOW_BEFORE_MS = 15 * 60_000;
const LIVE_WINDOW_AFTER_MS = 10 * 60_000;
const RECENT_LAPS_WINDOW_MS = 5 * 60_000;

/** Car coordinates are huge, so replay loads them in time windows around the playhead. */
const LOCATION_WINDOW_MS = 120_000;
const LOCATION_DEBOUNCE_MS = 500;
const LOCATION_RETRY_MS = 15_000;
/** Above this replay speed, windows would be consumed faster than the API budget allows. */
export const MAX_MAP_SPEED = 10;
/** Everything the page needs live except `car_data`, which only the telemetry widget wants. */
const STREAM_TOPICS = [
  'v1/position',
  'v1/intervals',
  'v1/laps',
  'v1/stints',
  'v1/pit',
  'v1/race_control',
  'v1/weather',
  'v1/team_radio',
  'v1/location',
];

export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 30, 60] as const;

type Cursor = 'positions' | 'intervals' | 'raceControl' | 'weather' | 'radio' | 'pits' | 'location';

const lastDate = (rows: { date: string }[], fallback?: string): string | undefined =>
  rows.reduce<string | undefined>(
    (max, r) => (!max || Date.parse(r.date) > Date.parse(max) ? r.date : max),
    fallback,
  );

/**
 * State for the live timing page: owns the dataset of the selected session and a clock
 * (wall time while following a live session, a seekable replay clock otherwise).
 * Provided by the page component, so each page instance gets its own copy.
 */
@Injectable()
export class LiveTimingStore {
  private api = inject(OpenF1Service);
  /** Polling cadence for the server in use (see polling.ts). */
  private readonly cadence = pollCadence(inject(OpenF1Config).selfHosted);
  private feed = inject(LiveFeedService);
  private destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private dataset = new TimingDataset();
  private version = signal(0);
  private loadSub?: Subscription;
  private pollSubs = new Set<Subscription>();
  /** Location window/outline requests: they outlive the live polling loop. */
  private workSubs = new Set<Subscription>();
  private pollTimers = new Set<ReturnType<typeof setTimeout>>();
  private lastTick = 0;
  /** Wall-clock anchor for the smooth render clock: `now` as of `wall` (performance.now). */
  private anchor = { now: 0, wall: 0 };
  /** Bumped on every session change/teardown so stale async work drops its results. */
  private generation = 0;
  private cursors: Partial<Record<Cursor, string>> = {};
  private radioEnabled = false;
  private relayAvailable = false;
  /** Stint documents by (driver, stint), so streamed updates can rebuild the full list. */
  private stintDocs = new Map<string, OF1Stint>();

  private loadedWindows = new Set<number>();
  private loadingWindows = new Set<number>();
  private failedWindows = new Map<number, number>();
  private wantedWindow: number | null = null;
  private windowTimer?: ReturnType<typeof setTimeout>;

  readonly years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
  readonly year = signal(this.years[0]);
  readonly sessions = signal<OF1Session[]>([]);
  readonly session = signal<OF1Session | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly liveError = signal<string | null>(null);
  readonly outline = signal<Point[]>([]);

  /** The selected session is happening right now (data keeps being polled). */
  readonly sessionLive = signal(false);
  /** The clock follows wall time; false once the user seeks into the past. */
  readonly following = signal(false);
  /** Live data arrives through the server relay (a stream) instead of by polling. */
  readonly relayActive = signal(false);
  readonly playing = signal(false);
  readonly speed = signal<number>(1);
  readonly now = signal(0);

  /**
   * How far the live view runs behind real time, in seconds, so it can be lined up with a TV
   * broadcast (and spoilers avoided). Saved in the browser.
   */
  readonly delay = signal(readStoredDelay(this.isBrowser ? localStorage : null));
  /** The most recent moment the live view may show: real time minus the delay. */
  readonly liveEdge = signal(0);

  readonly rangeStart = computed(() => Date.parse(this.session()?.date_start ?? '') || 0);
  readonly rangeEnd = computed(() => {
    const end = Date.parse(this.session()?.date_end ?? '') || 0;
    return this.sessionLive() ? Math.max(end, this.now()) : end;
  });
  readonly elapsed = computed(() => this.now() - this.rangeStart());

  /** The map is not refreshed while replaying faster than the API budget can feed it. */
  readonly mapPaused = computed(
    () => !this.following() && this.playing() && this.speed() > MAX_MAP_SPEED,
  );
  /** Clock for map and car telemetry; trails the live clock so cars move smoothly. */
  /**
   * `now` advanced every animation frame, so the map and gauges move continuously instead of
   * jumping on the 250 ms tick. Everything else keeps using `now`.
   */
  readonly smoothNow = signal(0);
  readonly mapTime = computed(
    () => this.smoothNow() - (this.following() ? this.cadence.mapLag : 0),
  );
  /** Whole seconds of mapTime: a stable trigger for loading data without reacting to every frame. */
  readonly mapSecond = computed(() => Math.floor(this.mapTime() / 1000));

  readonly hasData = computed(() => (this.version(), this.dataset.hasData));
  readonly rows = computed(() => (this.version(), this.dataset.rows(this.now())));
  /** The session's drivers by number (a copy, so dependents notice when they are (re)loaded). */
  readonly driversByNumber = computed(() => (this.version(), new Map(this.dataset.drivers)));
  /** In a live session, flags are only drawn up to the live edge, so the strip can't spoil. */
  readonly flagSegments = computed(
    () => (
      this.version(),
      this.dataset.flagSegments(
        this.sessionLive() ? Math.min(this.rangeEnd(), this.liveEdge()) : this.rangeEnd(),
      )
    ),
  );
  readonly cars = computed(() => (this.version(), this.dataset.cars(this.mapTime())));
  readonly trackStatus = computed(() => (this.version(), this.dataset.trackStatus(this.now())));
  readonly lap = computed(() => (this.version(), this.dataset.leaderLap(this.now())));
  readonly weather = computed(() => (this.version(), this.dataset.weather.at(this.now())));
  readonly messages = computed(
    () => (this.version(), this.dataset.raceControl.latest(this.now(), 60)),
  );
  readonly radio = computed(() =>
    (this.version(), this.dataset.radio.latest(this.now(), 40)).map((r) => ({
      ...r,
      acronym: this.dataset.drivers.get(r.driver_number)?.name_acronym ?? `#${r.driver_number}`,
      name: this.dataset.drivers.get(r.driver_number)?.full_name ?? null,
      headshot: this.dataset.drivers.get(r.driver_number)?.headshot_url ?? null,
      colour: this.dataset.drivers.get(r.driver_number)?.team_colour ?? '888888',
    })),
  );
  /** Only Race/Sprint have a meaningful total, and only once the session is over. */
  readonly totalLaps = computed(() => {
    this.version();
    const type = this.session()?.session_type;
    const finished = !this.sessionLive() && !this.loading();
    return finished && (type === 'Race' || type === 'Sprint') ? this.dataset.maxLap || null : null;
  });

  /** Last completed laps of a driver at the current clock time (reactive when read in a computed). */
  recentLaps(driver: number, count: number): LapSummary[] {
    this.version();
    return this.dataset.recentLaps(driver, this.now(), count);
  }

  constructor() {
    // Surface the relay's own connection problems the way polling errors are shown.
    effect(() => {
      if (!this.relayActive()) return;
      const state = this.feed.state();
      const error = this.feed.error();
      this.liveError.set(
        state === 'error'
          ? `Live feed unavailable${error ? `: ${error}` : ''}`
          : state === 'connecting'
            ? 'Connecting to the live feed…'
            : null,
      );
    });
  }

  start(): void {
    const timer = setInterval(() => this.tick(), TICK_MS);
    const frame = () => {
      const rate = this.following() ? 1 : this.playing() ? this.speed() : 0;
      const t = this.anchor.now + (performance.now() - this.anchor.wall) * rate;
      this.smoothNow.set(Math.min(t, Math.max(this.rangeEnd(), this.now())));
      raf = requestAnimationFrame(frame);
    };
    let raf = requestAnimationFrame(frame);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      this.cancelWork();
    });
    // Learn whether the server offers a live relay before the first session is chosen.
    void this.feed.isAvailable().then((available) => {
      this.relayAvailable = available;
      this.loadYear(this.year());
    });
  }

  loadYear(year: number): void {
    this.year.set(year);
    this.error.set(null);
    this.api.getSessions(year).subscribe({
      next: (sessions) => {
        const started = sessions
          .filter(
            (s) =>
              !s.is_cancelled && Date.parse(s.date_start) <= Date.now() + LIVE_WINDOW_BEFORE_MS,
          )
          .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start));
        this.sessions.set(started);
        if (started.length) this.selectSession(started[0]);
        else {
          this.session.set(null);
          this.error.set(`No sessions available for ${year}.`);
        }
      },
      error: (err) => this.error.set(this.describe(err, 'Could not load the session list.')),
    });
  }

  selectSession(session: OF1Session): void {
    this.cancelWork();
    const generation = this.generation;
    this.dataset = new TimingDataset();
    this.cursors = {};
    this.radioEnabled = false;
    this.loadedWindows.clear();
    this.loadingWindows.clear();
    this.failedWindows.clear();
    this.wantedWindow = null;
    this.outline.set([]);
    this.session.set(session);
    this.error.set(null);
    this.liveError.set(null);
    this.loading.set(true);
    this.playing.set(false);
    this.sessionLive.set(false);
    this.following.set(false);
    this.setNow(Date.parse(session.date_start));
    this.version.update((v) => v + 1);

    const key = session.session_key;
    const t = Date.now();
    const live =
      t >= Date.parse(session.date_start) - LIVE_WINDOW_BEFORE_MS &&
      t <= Date.parse(session.date_end) + LIVE_WINDOW_AFTER_MS;
    // Finished sessions never change, so they can be served from the browser cache.
    const cache = !live;
    // A live session's REST data needs the server's token, and updates arrive by stream.
    const relay = live && this.relayAvailable;
    this.api.useRelay(relay);
    this.relayActive.set(relay);

    this.loadSub = forkJoin({
      drivers: this.api.getDrivers(key, cache),
      positions: this.api.getPositions(key, undefined, cache),
      intervals: this.api.getIntervals(key, undefined, cache),
      laps: this.api.getLaps(key, undefined, cache),
      stints: this.api.getStints(key, cache),
      pits: this.api.getPits(key, undefined, cache),
      raceControl: this.api.getRaceControl(key, undefined, cache),
      weather: this.api.getWeather(key, undefined, cache),
    }).subscribe({
      next: (d) => {
        const ds = this.dataset;
        ds.setDrivers(d.drivers);
        ds.addPositions(d.positions);
        ds.addIntervals(d.intervals);
        ds.mergeLaps(d.laps);
        ds.setStints(d.stints);
        this.stintDocs = new Map(
          d.stints.map((st) => [`${st.driver_number}:${st.stint_number}`, st]),
        );
        ds.addPits(d.pits);
        ds.addRaceControl(d.raceControl);
        ds.addWeather(d.weather);
        this.cursors = {
          positions: lastDate(d.positions),
          intervals: lastDate(d.intervals),
          raceControl: lastDate(d.raceControl),
          weather: lastDate(d.weather),
          pits: lastDate(d.pits),
          location: new Date(t - this.cadence.mapLag * 2).toISOString(),
        };

        this.sessionLive.set(live);
        this.following.set(live);
        this.liveEdge.set(t - this.delay() * 1000);
        this.setNow(live ? this.liveEdge() : Date.parse(session.date_end));
        this.loading.set(false);
        this.version.update((v) => v + 1);
        this.loadOutline(generation, cache);
        if (relay) this.startStream(key, generation);
        else if (live) this.startPolling(key, generation);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.describe(err, 'Could not load the session data.'));
      },
    });
  }

  /** Team radio is rarely published and costs a request, so it is fetched on demand. */
  enableRadio(): void {
    const session = this.session();
    if (this.radioEnabled || !session) return;
    this.radioEnabled = true;
    const generation = this.generation;
    this.api.getTeamRadio(session.session_key, undefined, !this.sessionLive()).subscribe({
      next: (rows) => {
        if (generation !== this.generation) return;
        this.dataset.addRadio(rows);
        this.cursors.radio = lastDate(rows);
        this.version.update((v) => v + 1);
      },
      error: () => (this.radioEnabled = false),
    });
  }

  togglePlay(): void {
    if (this.following()) return;
    if (this.playing()) {
      // Freeze exactly where the render clock is, so pausing doesn't step back to the last tick.
      this.setNow(Math.min(this.smoothNow(), this.rangeEnd()));
    } else {
      this.setNow(this.now() >= this.rangeEnd() ? this.rangeStart() : this.now());
    }
    this.playing.update((p) => !p);
  }

  seek(t: number): void {
    this.following.set(false);
    // a live session can't be scrubbed past the live edge, which would show what hasn't aired yet
    const end = this.sessionLive() ? Math.min(this.rangeEnd(), this.liveEdge()) : this.rangeEnd();
    this.setNow(Math.min(Math.max(t, this.rangeStart()), end));
  }

  jumpToStart(): void {
    this.seek(this.rangeStart());
  }

  jumpToEnd(): void {
    this.seek(this.rangeEnd());
    this.playing.set(false);
  }

  goLive(): void {
    this.playing.set(false);
    this.following.set(true);
    this.liveEdge.set(Date.now() - this.delay() * 1000);
    this.setNow(this.liveEdge());
  }

  /** Runs the live view `seconds` behind real time (0 to 600). */
  setDelay(seconds: number): void {
    const delay = clampDelay(seconds);
    this.delay.set(delay);
    if (this.isBrowser) {
      try {
        localStorage.setItem(DELAY_STORAGE_KEY, String(delay));
      } catch {
        // storage unavailable: the delay just won't be remembered
      }
    }
    this.liveEdge.set(Date.now() - delay * 1000);
    if (this.following()) this.setNow(this.liveEdge());
  }

  /** Sets the clock and re-anchors the render clock, so interpolation continues from here. */
  private setNow(t: number): void {
    this.now.set(t);
    this.anchor = { now: t, wall: performance.now() };
  }

  private tick(): void {
    const t = Date.now();
    const dt = this.lastTick ? t - this.lastTick : 0;
    this.lastTick = t;
    const edge = t - this.delay() * 1000;
    this.liveEdge.set(edge);

    if (this.following()) {
      this.setNow(edge);
    } else if (this.playing()) {
      const next = this.now() + dt * this.speed();
      if (next >= this.rangeEnd()) {
        this.setNow(this.rangeEnd());
        this.playing.set(false);
      } else {
        this.setNow(next);
      }
    }

    const session = this.session();
    // the delayed view still has to play out the end of the session before live mode stops
    if (
      this.sessionLive() &&
      session &&
      edge > Date.parse(session.date_end) + LIVE_WINDOW_AFTER_MS
    ) {
      this.sessionLive.set(false);
      this.following.set(false);
      this.stopPolling();
    }

    this.requestLocationWindow();
  }

  /* ── Location (car dots) ─────────────────────────────────── */

  private windowOf(t: number): number {
    return Math.floor((t - this.rangeStart()) / LOCATION_WINDOW_MS);
  }

  /**
   * Makes sure the location window under the playhead (and the next one, when playing) is
   * loaded. Debounced so dragging the timeline doesn't fire a request per pixel. While following
   * a live session the polling loop feeds the map instead.
   */
  private requestLocationWindow(): void {
    if (!this.session() || this.loading() || (this.sessionLive() && this.following())) return;
    if (this.mapPaused()) return;

    const current = this.windowOf(this.mapTime());
    const fraction =
      ((this.mapTime() - this.rangeStart()) % LOCATION_WINDOW_MS) / LOCATION_WINDOW_MS;
    const wanted =
      this.loadedWindows.has(current) && this.playing() && fraction > 0.6 ? current + 1 : current;

    if (this.loadedWindows.has(wanted) || this.loadingWindows.has(wanted)) {
      this.wantedWindow = null;
      return;
    }
    if (Date.now() - (this.failedWindows.get(wanted) ?? 0) < LOCATION_RETRY_MS) return;
    if (this.wantedWindow === wanted) return;

    this.wantedWindow = wanted;
    clearTimeout(this.windowTimer);
    const generation = this.generation;
    this.windowTimer = setTimeout(() => this.loadWindow(wanted, generation), LOCATION_DEBOUNCE_MS);
  }

  private loadWindow(index: number, generation: number): void {
    const session = this.session();
    if (!session || generation !== this.generation || this.loadingWindows.has(index)) return;

    const from = this.rangeStart() + index * LOCATION_WINDOW_MS;
    // Never ask for the future of a live session: those rows don't exist yet.
    const to = from + LOCATION_WINDOW_MS;
    this.loadingWindows.add(index);
    const sub = this.api
      .getLocation(
        session.session_key,
        new Date(from).toISOString(),
        new Date(to).toISOString(),
        undefined,
        !this.sessionLive(),
      )
      .subscribe({
        next: (rows) => {
          this.workSubs.delete(sub);
          if (generation !== this.generation) return;
          this.loadingWindows.delete(index);
          this.loadedWindows.add(index);
          this.dataset.addLocations(rows);
          this.version.update((v) => v + 1);
        },
        error: () => {
          this.workSubs.delete(sub);
          this.loadingWindows.delete(index);
          this.failedWindows.set(index, Date.now());
          this.wantedWindow = null;
        },
      });
    this.workSubs.add(sub);
  }

  /** Fetches one clean lap of one car, which traces the circuit. Retried after later polls. */
  private loadOutline(generation: number, cache: boolean): void {
    const session = this.session();
    const lap = this.dataset.referenceLap();
    if (!session || !lap || this.outline().length) return;

    const sub = this.api
      .getLocation(session.session_key, lap.from, lap.to, lap.driver, cache)
      .subscribe({
        next: (rows) => {
          if (generation !== this.generation) return;
          this.outline.set(
            rows
              .filter((r) => !(r.x === 0 && r.y === 0 && r.z === 0))
              .map((r) => ({ x: r.x, y: r.y })),
          );
        },
        error: () => undefined,
      });
    this.workSubs.add(sub);
  }

  /* ── Live polling ─────────────────────────────────── */

  private startPolling(key: number, generation: number): void {
    const alive = () => generation === this.generation && this.sessionLive();

    const schedule = (fn: () => void, ms: number) => {
      const handle = setTimeout(() => {
        this.pollTimers.delete(handle);
        fn();
      }, ms);
      this.pollTimers.add(handle);
    };

    const fast = () => {
      if (!alive()) return;
      const c = this.cursors;
      const lapsSince = new Date(Date.now() - RECENT_LAPS_WINDOW_MS).toISOString();
      const sub = forkJoin({
        positions: this.api.getPositions(key, c.positions),
        intervals: this.api.getIntervals(key, c.intervals),
        laps: this.api.getLaps(key, lapsSince),
        location: this.api.getLocationSince(key, c.location as string),
      }).subscribe({
        next: (d) => {
          this.pollSubs.delete(sub);
          if (!alive()) return;
          this.dataset.addPositions(d.positions);
          this.dataset.addIntervals(d.intervals);
          this.dataset.mergeLaps(d.laps);
          this.dataset.addLocations(d.location);
          this.cursors.positions = lastDate(d.positions, c.positions);
          this.cursors.intervals = lastDate(d.intervals, c.intervals);
          this.cursors.location = lastDate(d.location, c.location);
          this.liveError.set(null);
          this.version.update((v) => v + 1);
          this.loadOutline(generation, false);
          schedule(fast, this.cadence.fast);
        },
        error: (err) => {
          this.pollSubs.delete(sub);
          this.liveError.set(this.describe(err, 'Live feed interrupted, retrying…'));
          schedule(fast, this.cadence.fast);
        },
      });
      this.pollSubs.add(sub);
    };

    const slow = () => {
      if (!alive()) return;
      const c = this.cursors;
      const sub = forkJoin({
        raceControl: this.api.getRaceControl(key, c.raceControl),
        weather: this.api.getWeather(key, c.weather),
        pits: this.api.getPits(key, c.pits),
        stints: this.api.getStints(key),
        radio: this.radioEnabled ? this.api.getTeamRadio(key, c.radio) : of([]),
      }).subscribe({
        next: (d) => {
          this.pollSubs.delete(sub);
          if (!alive()) return;
          this.dataset.addRaceControl(d.raceControl);
          this.dataset.addWeather(d.weather);
          this.dataset.addPits(d.pits);
          this.dataset.setStints(d.stints);
          this.dataset.addRadio(d.radio);
          this.cursors.raceControl = lastDate(d.raceControl, c.raceControl);
          this.cursors.weather = lastDate(d.weather, c.weather);
          this.cursors.pits = lastDate(d.pits, c.pits);
          this.cursors.radio = lastDate(d.radio, c.radio);
          this.version.update((v) => v + 1);
          schedule(slow, this.cadence.slow);
        },
        error: () => {
          this.pollSubs.delete(sub);
          schedule(slow, this.cadence.slow);
        },
      });
      this.pollSubs.add(sub);
    };

    fast();
    // Offset the slow loop so both groups don't hit the limiter in the same instant.
    schedule(slow, this.cadence.slow);
  }

  /* ── Live stream (server relay) ─────────────────── */

  private startStream(key: number, generation: number): void {
    const sub = this.feed.stream(STREAM_TOPICS).subscribe((batch) => {
      if (generation === this.generation && this.sessionLive()) this.ingest(batch, key);
    });
    this.pollSubs.add(sub);
  }

  /** Applies one batch of streamed rows to the dataset. */
  private ingest(batch: LiveEvent[], sessionKey: number): void {
    const { changed, lapsChanged } = applyLiveBatch(
      this.dataset,
      this.stintDocs,
      batch,
      sessionKey,
    );
    if (!changed) return;
    this.version.update((v) => v + 1);
    // The circuit outline needs one completed lap; try again as laps arrive.
    if (lapsChanged) this.loadOutline(this.generation, false);
  }

  private stopPolling(): void {
    for (const s of this.pollSubs) s.unsubscribe();
    this.pollSubs.clear();
    for (const h of this.pollTimers) clearTimeout(h);
    this.pollTimers.clear();
  }

  private cancelWork(): void {
    this.generation++;
    this.loadSub?.unsubscribe();
    clearTimeout(this.windowTimer);
    for (const sub of this.workSubs) sub.unsubscribe();
    this.workSubs.clear();
    this.stopPolling();
  }

  private describe(err: { status?: number }, fallback: string): string {
    if (err.status === 401 || err.status === 403) {
      return 'OpenF1 requires an authenticated account for real-time data. Pick a finished session to replay it.';
    }
    if (err.status === 429) {
      return 'OpenF1 rate limit reached (free tier: 30 requests/minute). Wait a minute and reload; finished sessions are cached once loaded.';
    }
    return fallback;
  }
}
