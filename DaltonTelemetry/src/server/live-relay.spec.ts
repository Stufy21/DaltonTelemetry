import { LiveRelay } from './live-relay';
import { fakeConnector, fakeTokens } from './test-doubles';

/** Lets pending promises (the token request) settle. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const events = (chunks: string[]) =>
  chunks
    .filter((c) => c.startsWith('event: batch'))
    .flatMap((c) => JSON.parse(c.split('data: ')[1]) as { topic: string; data: unknown }[]);

const statuses = (chunks: string[]) =>
  chunks
    .filter((c) => c.startsWith('event: status'))
    .map((c) => JSON.parse(c.split('data: ')[1]).state as string);

describe('LiveRelay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(options: { renewInMs?: number } = {}) {
    const upstream = fakeConnector();
    const tokens = fakeTokens(options.renewInMs);
    const relay = new LiveRelay({
      tokens,
      username: 'me',
      connect: upstream.connect,
      flushMs: 100,
      idleMs: 1000,
      reconnectMs: 500,
      heartbeatMs: 5000,
    });
    return { relay, tokens, ...upstream };
  }

  it('stays closed until a browser connects, then connects with the token', async () => {
    const { relay, connections, tokens } = setup();
    expect(connections).toHaveLength(0);

    relay.addClient(() => undefined);
    await settle();

    expect(connections).toHaveLength(1);
    expect(connections[0].options.token).toBe('token-1');
    expect(connections[0].options.username).toBe('me');
    expect(connections[0].options.topics).toContain('v1/location');
    expect(tokens.getToken).toHaveBeenCalledTimes(1);
    relay.shutdown();
  });

  it('shares one upstream connection between browsers and batches messages', async () => {
    const { relay, connections, last } = setup();
    const a: string[] = [];
    const b: string[] = [];
    relay.addClient((c) => a.push(c));
    relay.addClient((c) => b.push(c));
    await settle();
    expect(connections).toHaveLength(1);

    last().open();
    last().emit('v1/position', { driver_number: 1, position: 1 });
    last().emit('v1/laps', { driver_number: 1, lap_number: 3 });
    expect(events(a)).toHaveLength(0); // nothing is sent until the flush

    vi.advanceTimersByTime(100);
    expect(events(a).map((e) => e.topic)).toEqual(['v1/position', 'v1/laps']);
    expect(events(b)).toEqual(events(a));
    expect(statuses(a)).toContain('live');
    relay.shutdown();
  });

  it('only sends each browser the topics it asked for', async () => {
    const { relay, last } = setup();
    const onlyLaps: string[] = [];
    const everything: string[] = [];
    relay.addClient((c) => onlyLaps.push(c), ['v1/laps']);
    relay.addClient((c) => everything.push(c));
    await settle();

    last().emit('v1/position', { p: 1 });
    last().emit('v1/laps', { l: 1 });
    vi.advanceTimersByTime(100);

    expect(events(onlyLaps).map((e) => e.topic)).toEqual(['v1/laps']);
    expect(events(everything).map((e) => e.topic)).toEqual(['v1/position', 'v1/laps']);
    relay.shutdown();
  });

  it('ignores payloads that are not JSON', async () => {
    const { relay, last } = setup();
    const out: string[] = [];
    relay.addClient((c) => out.push(c));
    await settle();
    last().options.onMessage('v1/laps', 'not json');
    last().emit('v1/laps', { ok: true });
    vi.advanceTimersByTime(100);
    expect(events(out)).toHaveLength(1);
    relay.shutdown();
  });

  it('closes the upstream connection after the last browser leaves', async () => {
    const { relay, last } = setup();
    const remove = relay.addClient(() => undefined);
    await settle();
    const connection = last();

    remove();
    vi.advanceTimersByTime(999);
    expect(connection.closed).toBe(false);
    vi.advanceTimersByTime(2);
    expect(connection.closed).toBe(true);
    expect(relay.state).toBe('idle');
  });

  it('keeps the connection if a browser comes back before the idle timeout', async () => {
    const { relay, connections, last } = setup();
    const remove = relay.addClient(() => undefined);
    await settle();
    remove();
    vi.advanceTimersByTime(500);
    relay.addClient(() => undefined);
    vi.advanceTimersByTime(5000);
    expect(last().closed).toBe(false);
    expect(connections).toHaveLength(1);
    relay.shutdown();
  });

  it('reconnects with a fresh token after the connection drops', async () => {
    const { relay, connections, tokens, last } = setup();
    const out: string[] = [];
    relay.addClient((c) => out.push(c));
    await settle();

    last().drop('boom');
    expect(relay.state).toBe('error');
    expect(relay.error).toBe('boom');
    expect(tokens.invalidate).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(connections).toHaveLength(2);
    expect(connections[1].options.token).toBe('token-2');
    last().open();
    expect(relay.state).toBe('live');
    expect(statuses(out)).toEqual(['connecting', 'error', 'connecting', 'live']);
    relay.shutdown();
  });

  it('rotates to a new token before the old one expires, ignoring late events from the old connection', async () => {
    const { relay, connections, last } = setup({ renewInMs: 10_000 });
    const out: string[] = [];
    relay.addClient((c) => out.push(c));
    await settle();
    const first = last();
    first.open();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(first.closed).toBe(true);
    expect(connections).toHaveLength(2);
    expect(connections[1].options.token).toBe('token-2');

    // the old connection reports its close and a stray message: neither may count
    first.drop();
    first.emit('v1/laps', { stale: true });
    vi.advanceTimersByTime(100);
    expect(relay.state).not.toBe('error');
    expect(events(out)).toHaveLength(0);
    relay.shutdown();
  });

  it('retries when the token request fails', async () => {
    const { relay, tokens, connections } = setup();
    tokens.getToken.mockRejectedValueOnce(new Error('HTTP 401'));
    relay.addClient(() => undefined);
    await settle();

    expect(relay.state).toBe('error');
    expect(relay.error).toBe('HTTP 401');
    expect(connections).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(500);
    expect(connections).toHaveLength(1);
    relay.shutdown();
  });

  it('backs off between failed attempts and starts over once connected', async () => {
    const { relay, tokens, connections, last } = setup();
    tokens.getToken.mockRejectedValue(new Error('HTTP 401'));
    relay.addClient(() => undefined);
    await settle();

    // reconnectMs is 500: retries come after 500, 1000, 2000 ms
    await vi.advanceTimersByTimeAsync(499);
    expect(tokens.getToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tokens.getToken).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(tokens.getToken).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(tokens.getToken).toHaveBeenCalledTimes(3);

    // credentials fixed: connect, then a later failure starts from the short delay again
    tokens.getToken.mockResolvedValue('good');
    await vi.advanceTimersByTimeAsync(2000);
    expect(connections).toHaveLength(1);
    last().open();
    last().drop('network');
    await vi.advanceTimersByTimeAsync(500);
    expect(connections).toHaveLength(2);
    relay.shutdown();
  });

  it('sends a heartbeat comment while the feed is quiet', async () => {
    const { relay } = setup();
    const out: string[] = [];
    relay.addClient((c) => out.push(c));
    await settle();
    vi.advanceTimersByTime(5000);
    expect(out).toContain(': ping\n\n');
    relay.shutdown();
  });
});
