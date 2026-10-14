import { vi } from 'vitest';
import { TokenProvider } from './openf1-token';
import { Upstream, UpstreamOptions } from './upstream';

/** A fake live connection that tests drive by hand. */
export class FakeUpstream implements Upstream {
  closed = false;
  constructor(readonly options: UpstreamOptions) {}
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.options.onOpen();
  }
  emit(topic: string, data: unknown): void {
    this.options.onMessage(topic, JSON.stringify(data));
  }
  drop(reason?: string): void {
    this.options.onClose(reason);
  }
}

export function fakeConnector() {
  const connections: FakeUpstream[] = [];
  const connect = (options: UpstreamOptions) => {
    const upstream = new FakeUpstream(options);
    connections.push(upstream);
    return upstream;
  };
  return { connect, connections, last: () => connections[connections.length - 1] };
}

/** A token provider that needs no network. */
export function fakeTokens(renewInMs = 3_300_000) {
  let n = 0;
  const tokens = {
    getToken: vi.fn(async () => `token-${++n}`),
    invalidate: vi.fn(),
    get renewInMs() {
      return renewInMs;
    },
  };
  return tokens as unknown as TokenProvider & typeof tokens;
}
