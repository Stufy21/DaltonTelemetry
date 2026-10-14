import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { defer, from, Observable, of, throwError, timer } from 'rxjs';
import { catchError, retry, switchMap, tap, timeout } from 'rxjs/operators';
import {
  OF1CarData,
  OF1ChampionshipDriver,
  OF1ChampionshipTeam,
  OF1Driver,
  OF1Interval,
  OF1Lap,
  OF1Location,
  OF1Pit,
  OF1Position,
  OF1RaceControl,
  OF1Session,
  OF1Stint,
  OF1TeamRadio,
  OF1Weather,
} from './openf1.model';
import { DEFAULT_OPENF1_BASE_URL, OpenF1Config } from './openf1-config';
import { Params, toQuery } from './openf1.query';
import { RateWindow } from './rate-window';
import { isServerUnavailable, SERVER_TIMEOUT_MS, ServerHealth } from './server-health';

/** The server's authenticated proxy (see src/server), used while a session is live. */
const RELAY_URL = '/api/openf1';

/**
 * The free OpenF1 tier allows 3 requests/second and 30 requests/minute. We stay below both
 * (24/min leaves headroom for other tabs and manual requests).
 */
const MIN_GAP_MS = 400;
const MAX_PER_MINUTE = 24;
const WINDOW_MS = 60_000;
const COOLDOWN_AFTER_429_MS = 15_000;

const SLOTS_STORAGE_KEY = 'openf1-request-slots';
const CACHE_NAME = 'openf1-v1';

@Injectable({ providedIn: 'root' })
export class OpenF1Service {
  private http = inject(HttpClient);
  private config = inject(OpenF1Config);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Request budget, persisted in localStorage so reloads and other tabs share it. */
  private readonly window = new RateWindow(
    { minGapMs: MIN_GAP_MS, maxPerWindow: MAX_PER_MINUTE, windowMs: WINDOW_MS },
    this.loadSlots(),
  );
  private cooldownUntil = 0;
  private viaRelay = false;
  /** Tracks the self-hosted server (when configured) so a dead one doesn't stall every request. */
  private readonly selfHostedHealth = new ServerHealth();

  /**
   * Route requests through the server's authenticated proxy instead of calling OpenF1 directly.
   * Used for live sessions, whose REST data needs a token the browser doesn't have. The server
   * paces its own requests, so the browser-side limiter is skipped.
   */
  useRelay(enabled: boolean): void {
    this.viaRelay = enabled;
  }

  getSessions(year: number): Observable<OF1Session[]> {
    return this.get<OF1Session>('sessions', { year });
  }

  /**
   * Every method takes `cache`: pass true for finished sessions to serve repeat reads from
   * the browser's Cache Storage instead of spending request budget.
   */
  getDrivers(sessionKey: number, cache = false): Observable<OF1Driver[]> {
    return this.get<OF1Driver>('drivers', { session_key: sessionKey }, cache);
  }

  /** `since` (ISO, exclusive) restricts the result to newer rows, used for live polling. */
  getPositions(sessionKey: number, since?: string, cache = false): Observable<OF1Position[]> {
    return this.get<OF1Position>('position', this.sinceParams(sessionKey, since), cache);
  }

  getIntervals(sessionKey: number, since?: string, cache = false): Observable<OF1Interval[]> {
    return this.get<OF1Interval>('intervals', this.sinceParams(sessionKey, since), cache);
  }

  getRaceControl(sessionKey: number, since?: string, cache = false): Observable<OF1RaceControl[]> {
    return this.get<OF1RaceControl>('race_control', this.sinceParams(sessionKey, since), cache);
  }

  getWeather(sessionKey: number, since?: string, cache = false): Observable<OF1Weather[]> {
    return this.get<OF1Weather>('weather', this.sinceParams(sessionKey, since), cache);
  }

  getTeamRadio(sessionKey: number, since?: string, cache = false): Observable<OF1TeamRadio[]> {
    return this.get<OF1TeamRadio>('team_radio', this.sinceParams(sessionKey, since), cache);
  }

  getPits(sessionKey: number, since?: string, cache = false): Observable<OF1Pit[]> {
    return this.get<OF1Pit>('pit', this.sinceParams(sessionKey, since), cache);
  }

  /** Laps are updated in place once finished, so live polling re-reads from `since` (inclusive). */
  getLaps(sessionKey: number, sinceInclusive?: string, cache = false): Observable<OF1Lap[]> {
    const params: Params = { session_key: sessionKey };
    if (sinceInclusive) params['date_start>='] = sinceInclusive;
    return this.get<OF1Lap>('laps', params, cache);
  }

  /** Drivers' standings entering a Race or Sprint (empty for other session types). */
  getChampionshipDrivers(sessionKey: number, cache = false): Observable<OF1ChampionshipDriver[]> {
    return this.get<OF1ChampionshipDriver>(
      'championship_drivers',
      { session_key: sessionKey },
      cache,
    );
  }

  getChampionshipTeams(sessionKey: number, cache = false): Observable<OF1ChampionshipTeam[]> {
    return this.get<OF1ChampionshipTeam>('championship_teams', { session_key: sessionKey }, cache);
  }

  getStints(sessionKey: number, cache = false): Observable<OF1Stint[]> {
    return this.get<OF1Stint>('stints', { session_key: sessionKey }, cache);
  }

  /** Car coordinates in [from, to) (ISO), optionally for a single driver. */
  getLocation(
    sessionKey: number,
    from: string,
    to?: string,
    driver?: number,
    cache = false,
  ): Observable<OF1Location[]> {
    const params: Params = { session_key: sessionKey, 'date>=': from };
    if (to) params['date<'] = to;
    if (driver != null) params['driver_number'] = driver;
    return this.get<OF1Location>('location', params, cache);
  }

  /** Car telemetry (speed, throttle, brake, gear, rpm) of one driver in [from, to). */
  getCarData(
    sessionKey: number,
    driver: number,
    from: string,
    to: string,
    cache = false,
  ): Observable<OF1CarData[]> {
    return this.get<OF1CarData>(
      'car_data',
      { session_key: sessionKey, driver_number: driver, 'date>=': from, 'date<': to },
      cache,
    );
  }

  /** Coordinates strictly after `since`, used for live polling. */
  getLocationSince(sessionKey: number, since: string): Observable<OF1Location[]> {
    return this.get<OF1Location>('location', { session_key: sessionKey, 'date>': since });
  }

  private sinceParams(sessionKey: number, since?: string): Params {
    const params: Params = { session_key: sessionKey };
    if (since) params['date>'] = since;
    return params;
  }

  private get<T>(endpoint: string, params: Params, cache = false): Observable<T[]> {
    const path = `${endpoint}?${toQuery(params)}`;
    if (this.viaRelay) return this.request<T>(`${RELAY_URL}/${path}`, true, cache);

    const publicRequest = () => this.request<T>(`${DEFAULT_OPENF1_BASE_URL}/${path}`, false, cache);
    if (!this.config.selfHosted) return publicRequest();

    // Prefer the self-hosted server, but fall back to the public API while it is unreachable
    // (that serves finished sessions; live ones need the self-hosted server).
    if (this.selfHostedHealth.isDown()) return publicRequest();
    return this.request<T>(`${this.config.baseUrl}/${path}`, true, cache, SERVER_TIMEOUT_MS).pipe(
      tap(() => this.selfHostedHealth.markUp()),
      catchError((err) => {
        if (!isServerUnavailable(err)) return throwError(() => err);
        console.warn('Self-hosted OpenF1 server unavailable, using the public API for a while.');
        this.selfHostedHealth.markDown();
        return publicRequest();
      }),
    );
  }

  /**
   * One GET. `unlimited` skips the browser-side limiter (the server's proxy and a self-hosted
   * OpenF1 pace themselves; only the public API needs it). `timeoutMs` bounds the wait.
   */
  private request<T>(
    url: string,
    unlimited: boolean,
    cache: boolean,
    timeoutMs?: number,
  ): Observable<T[]> {
    const network$ = defer(() => timer(unlimited ? 0 : this.reserveSlot())).pipe(
      switchMap(() => {
        const request$ = this.http.get<T[]>(url);
        return timeoutMs ? request$.pipe(timeout(timeoutMs)) : request$;
      }),
      retry({
        count: 2,
        delay: (err: HttpErrorResponse) => {
          if (err.status !== 429) return throwError(() => err);
          this.cooldownUntil = Date.now() + COOLDOWN_AFTER_429_MS;
          return timer(COOLDOWN_AFTER_429_MS);
        },
      }),
      // OpenF1 answers 404 when a query has no rows (e.g. no new data yet).
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of([] as T[]) : throwError(() => err),
      ),
    );

    if (!cache || !this.isBrowser || typeof caches === 'undefined') return network$;

    return from(this.readCache<T>(url)).pipe(
      switchMap((hit) =>
        hit ? of(hit) : network$.pipe(tap((data) => void this.writeCache(url, data))),
      ),
    );
  }

  /** Time to wait (ms) before a request may be sent without breaching either rate limit. */
  private reserveSlot(): number {
    const now = Date.now();
    const at = this.window.reserve(now, this.cooldownUntil);
    this.saveSlots();
    return at - now;
  }

  private loadSlots(): number[] {
    if (!this.isBrowser) return [];
    try {
      const raw = JSON.parse(localStorage.getItem(SLOTS_STORAGE_KEY) ?? '[]') as number[];
      return raw.filter((s) => typeof s === 'number' && s > Date.now() - WINDOW_MS).sort();
    } catch {
      return [];
    }
  }

  private saveSlots(): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(this.window.scheduled));
    } catch {
      // storage unavailable: the in-memory limiter still applies
    }
  }

  private async readCache<T>(url: string): Promise<T[] | null> {
    try {
      const response = await (await caches.open(CACHE_NAME)).match(url);
      return response ? ((await response.json()) as T[]) : null;
    } catch {
      return null;
    }
  }

  private async writeCache<T>(url: string, data: T[]): Promise<void> {
    try {
      await (await caches.open(CACHE_NAME)).put(url, new Response(JSON.stringify(data)));
    } catch {
      // quota exceeded or storage blocked: just skip caching
    }
  }
}
