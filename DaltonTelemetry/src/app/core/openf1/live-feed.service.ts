import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable } from 'rxjs';

/** One message of the live stream; `data` mirrors the matching REST row (plus `_id`/`_key`). */
export interface LiveEvent {
  /** e.g. `v1/position` */
  topic: string;
  data: Record<string, unknown>;
}

export type RelayState = 'off' | 'idle' | 'connecting' | 'live' | 'error';

/**
 * Client of the server's live relay (`/api/live/*`). The relay exists only when the server has
 * OpenF1 credentials; otherwise the app keeps polling the free API.
 */
@Injectable({ providedIn: 'root' })
export class LiveFeedService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private available?: Promise<boolean>;

  /** State of the relay's own connection to OpenF1, as last reported by the server. */
  readonly state = signal<RelayState>('off');
  readonly error = signal<string | null>(null);

  /** Whether the server has the relay configured. Asked once. */
  isAvailable(): Promise<boolean> {
    if (!this.isBrowser) return Promise.resolve(false);
    this.available ??= fetch('/api/live/status')
      // A static host answers unknown paths with the app's HTML page: that is "no relay", too.
      .then((r) =>
        r.ok && r.headers.get('content-type')?.includes('application/json')
          ? r.json()
          : { enabled: false },
      )
      .then((s: { enabled?: boolean }) => !!s.enabled)
      .catch(() => false);
    return this.available;
  }

  /** Batches of live events for the given topics; the connection is closed on unsubscribe. */
  stream(topics: string[]): Observable<LiveEvent[]> {
    return new Observable<LiveEvent[]>((subscriber) => {
      const source = new EventSource(
        `/api/live/stream?topics=${encodeURIComponent(topics.join(','))}`,
      );

      source.addEventListener('batch', (event) => {
        try {
          subscriber.next(JSON.parse((event as MessageEvent<string>).data) as LiveEvent[]);
        } catch {
          // a malformed batch is dropped; the next one carries on
        }
      });
      source.addEventListener('status', (event) => {
        try {
          const { state, error } = JSON.parse((event as MessageEvent<string>).data) as {
            state: RelayState;
            error: string | null;
          };
          this.state.set(state);
          this.error.set(error);
        } catch {
          // ignore
        }
      });
      // EventSource reconnects by itself; just surface that we're between connections.
      source.onerror = () => this.state.set('connecting');

      return () => source.close();
    });
  }
}
