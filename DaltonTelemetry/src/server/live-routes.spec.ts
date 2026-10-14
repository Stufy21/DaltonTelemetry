import express from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { createLiveRouter, createLiveServices } from './live-routes';
import { LiveRelay } from './live-relay';
import { OpenF1Proxy } from './openf1-proxy';
import { fakeConnector, fakeTokens } from './test-doubles';

function serve(services: ReturnType<typeof createLiveServices>) {
  const app = express();
  app.use(createLiveRouter(services));
  return new Promise<{ url: string; server: Server }>((resolve) => {
    const server = app.listen(0, () =>
      resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }),
    );
  });
}

describe('live routes', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

  it('is disabled without credentials', () => {
    expect(createLiveServices({})).toBeNull();
    expect(createLiveServices({ OPENF1_USERNAME: 'me' })).toBeNull();
    expect(createLiveServices({ OPENF1_USERNAME: 'me', OPENF1_PASSWORD: 'pw' })).not.toBeNull();
  });

  it('reports that live is off and refuses the stream and proxy', async () => {
    const started = await serve(null);
    server = started.server;

    expect(await (await fetch(`${started.url}/api/live/status`)).json()).toEqual({
      enabled: false,
      state: 'off',
      error: null,
    });
    expect((await fetch(`${started.url}/api/live/stream`)).status).toBe(404);
    expect((await fetch(`${started.url}/api/openf1/laps?session_key=1`)).status).toBe(404);
  });

  it('streams batches from the relay to a real HTTP client as Server-Sent Events', async () => {
    const upstream = fakeConnector();
    const tokens = fakeTokens();
    const relay = new LiveRelay({
      tokens,
      username: 'me',
      connect: upstream.connect,
      flushMs: 20,
    });
    const proxy = new OpenF1Proxy({ tokens, fetchFn: vi.fn() });
    const started = await serve({ relay, proxy });
    server = started.server;

    const controller = new AbortController();
    const response = await fetch(`${started.url}/api/live/stream?topics=v1/laps`, {
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    // wait for the relay to connect upstream, then push data through it
    await vi.waitFor(() => expect(upstream.connections).toHaveLength(1));
    upstream.last().open();
    upstream.last().emit('v1/position', { ignored: true });
    upstream.last().emit('v1/laps', { driver_number: 4, lap_number: 7 });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes('lap_number')) {
      received += decoder.decode((await reader.read()).value);
    }
    controller.abort();

    expect(received).toContain('event: status');
    expect(received).toContain('event: batch');
    expect(received).toContain('"driver_number":4');
    expect(received).not.toContain('ignored'); // filtered by topic
    relay.shutdown();
  });

  it('proxies REST calls with the account token', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response('[{"lap":1}]', { headers: { 'content-type': 'application/json' } }),
      ),
    );
    const tokens = fakeTokens();
    const relay = new LiveRelay({ tokens, username: 'me', connect: fakeConnector().connect });
    const proxy = new OpenF1Proxy({ tokens, fetchFn, maxPerMinute: 1000 });
    const started = await serve({ relay, proxy });
    server = started.server;

    const response = await fetch(
      `${started.url}/api/openf1/laps?session_key=9&date_start>=2026-01-01T00:00:00Z`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ lap: 1 }]);
    const [url] = fetchFn.mock.calls[0] as unknown as [string];
    expect(url).toContain('/v1/laps?session_key=9&date_start');
  });
});
