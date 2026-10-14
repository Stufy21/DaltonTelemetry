import { TokenProvider } from './openf1-token';
import { Upstream, UpstreamConnector } from './upstream';

/** Topics mirror the REST endpoints, e.g. `v1/position`. */
export const LIVE_TOPICS = [
  'v1/position',
  'v1/intervals',
  'v1/laps',
  'v1/stints',
  'v1/pit',
  'v1/race_control',
  'v1/weather',
  'v1/team_radio',
  'v1/location',
  'v1/car_data',
];

export type RelayState = 'idle' | 'connecting' | 'live' | 'error';

export interface RelayEvent {
  topic: string;
  data: unknown;
}

export interface LiveRelayOptions {
  tokens: TokenProvider;
  username: string;
  connect: UpstreamConnector;
  topics?: string[];
  /** Messages are grouped and sent this often (live data arrives at tens of messages/second). */
  flushMs?: number;
  /** The upstream connection is closed this long after the last browser leaves. */
  idleMs?: number;
  /** First retry delay; it doubles after each consecutive failure up to `maxReconnectMs`. */
  reconnectMs?: number;
  maxReconnectMs?: number;
  heartbeatMs?: number;
}

interface Client {
  write: (chunk: string) => void;
  /** Topics this browser asked for; null means all of them. */
  topics: Set<string> | null;
}

const MAX_QUEUE = 20_000;

/**
 * One connection to OpenF1's live feed, shared by every connected browser. It only stays open
 * while someone is watching, renews the token before it expires (reconnecting with the new one),
 * and reconnects after failures. Browsers receive batches as Server-Sent Events.
 */
export class LiveRelay {
  private readonly topics: string[];
  private readonly flushMs: number;
  private readonly idleMs: number;
  private readonly reconnectMs: number;
  private readonly maxReconnectMs: number;
  private readonly heartbeatMs: number;

  private readonly clients = new Set<Client>();
  private queue: RelayEvent[] = [];
  private upstream: Upstream | null = null;
  private connecting = false;
  /** Identifies the current upstream connection, so late events from an old one are ignored. */
  private connectionId = 0;
  private failures = 0;
  private _state: RelayState = 'idle';
  private _error: string | null = null;

  private flushTimer?: ReturnType<typeof setInterval>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private renewTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private lastWrite = Date.now();

  constructor(private readonly options: LiveRelayOptions) {
    this.topics = options.topics ?? LIVE_TOPICS;
    this.flushMs = options.flushMs ?? 250;
    this.idleMs = options.idleMs ?? 60_000;
    this.reconnectMs = options.reconnectMs ?? 5_000;
    this.maxReconnectMs = options.maxReconnectMs ?? 5 * 60_000;
    this.heartbeatMs = options.heartbeatMs ?? 20_000;
  }

  get state(): RelayState {
    return this._state;
  }

  get error(): string | null {
    return this._error;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /** Registers a browser; returns the function that unregisters it. */
  addClient(write: (chunk: string) => void, topics?: string[]): () => void {
    const client: Client = { write, topics: topics?.length ? new Set(topics) : null };
    this.clients.add(client);
    clearTimeout(this.idleTimer);

    // Opening changes the state right away and tells every client (this one included); only
    // when nothing changes does the newcomer need the current status on its own.
    const opening = !this.upstream && !this.connecting;
    if (opening) void this.open();
    else client.write(this.statusChunk());
    this.flushTimer ??= setInterval(() => this.flush(), this.flushMs);

    return () => {
      this.clients.delete(client);
      if (!this.clients.size) {
        this.idleTimer = setTimeout(() => this.shutdown(), this.idleMs);
      }
    };
  }

  /** Stops everything; used on idle timeout and when the server exits. */
  shutdown(): void {
    clearTimeout(this.idleTimer);
    clearTimeout(this.renewTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.flushTimer);
    this.flushTimer = undefined;
    this.closeUpstream();
    this.queue = [];
    this.setState('idle');
  }

  private async open(): Promise<void> {
    this.connecting = true;
    this.setState('connecting');
    try {
      const token = await this.options.tokens.getToken();
      if (!this.clients.size) return;

      const id = ++this.connectionId;
      this.upstream = this.options.connect({
        username: this.options.username,
        token,
        topics: this.topics,
        onOpen: () => {
          if (id === this.connectionId) this.setState('live');
        },
        onMessage: (topic, payload) => {
          if (id === this.connectionId) this.enqueue(topic, payload);
        },
        onClose: (reason) => {
          if (id === this.connectionId) this.handleClose(reason);
        },
      });
      // The broker authenticates at connect time, so rotate before the token expires.
      this.renewTimer = setTimeout(() => this.rotate(), this.options.tokens.renewInMs);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    } finally {
      this.connecting = false;
    }
  }

  private rotate(): void {
    this.closeUpstream();
    if (this.clients.size) void this.open();
  }

  private handleClose(reason?: string): void {
    this.closeUpstream();
    this.options.tokens.invalidate();
    this.fail(reason ?? 'connection closed');
  }

  private fail(reason: string): void {
    this._error = reason;
    this.setState('error');
    clearTimeout(this.retryTimer);
    if (this.clients.size) {
      // Back off so bad credentials don't hammer OpenF1's token endpoint.
      const delay = Math.min(this.reconnectMs * 2 ** this.failures, this.maxReconnectMs);
      this.failures++;
      this.retryTimer = setTimeout(() => void this.open(), delay);
    }
  }

  private closeUpstream(): void {
    clearTimeout(this.renewTimer);
    const upstream = this.upstream;
    this.upstream = null;
    // Anything the old connection still reports is stale from here on.
    this.connectionId++;
    upstream?.close();
  }

  private enqueue(topic: string, payload: string): void {
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push({ topic, data });
  }

  private flush(): void {
    const now = Date.now();
    if (!this.queue.length) {
      if (now - this.lastWrite >= this.heartbeatMs) this.broadcast(': ping\n\n');
      return;
    }

    const batch = this.queue;
    this.queue = [];
    for (const client of this.clients) {
      const events = client.topics ? batch.filter((e) => client.topics?.has(e.topic)) : batch;
      if (events.length) client.write(`event: batch\ndata: ${JSON.stringify(events)}\n\n`);
    }
    this.lastWrite = now;
  }

  private setState(state: RelayState): void {
    if (state === this._state) return;
    this._state = state;
    if (state === 'live') {
      this._error = null;
      this.failures = 0;
    }
    this.broadcast(this.statusChunk());
  }

  private broadcast(chunk: string): void {
    for (const client of this.clients) client.write(chunk);
    this.lastWrite = Date.now();
  }

  private statusChunk(): string {
    return `event: status\ndata: ${JSON.stringify({ state: this._state, error: this._error })}\n\n`;
  }
}
