import { ALLOWED_ENDPOINTS, OpenF1Proxy } from './openf1-proxy';
import { fakeTokens } from './test-doubles';

const ok = (body: string, status = 200) =>
  Promise.resolve(new Response(body, { status, headers: { 'content-type': 'application/json' } }));

describe('OpenF1Proxy', () => {
  it('forwards the raw query with the bearer token', async () => {
    const fetchFn = vi.fn(() => ok('[{"x":1}]'));
    const proxy = new OpenF1Proxy({ tokens: fakeTokens(), fetchFn, maxPerMinute: 1000 });

    const result = await proxy.get('location', 'session_key=1&date>=2026-10-11T12:00:00Z');

    expect(result).toMatchObject({ status: 200, body: '[{"x":1}]' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openf1.org/v1/location?session_key=1&date>=2026-10-11T12:00:00Z');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer token-1');
  });

  it('refuses endpoints that are not OpenF1 data', async () => {
    const fetchFn = vi.fn();
    const proxy = new OpenF1Proxy({ tokens: fakeTokens(), fetchFn });
    expect((await proxy.get('token', '')).status).toBe(404);
    expect((await proxy.get('../admin', '')).status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(ALLOWED_ENDPOINTS.has('car_data')).toBe(true);
  });

  it('shares concurrent identical requests and caches briefly', async () => {
    let now = 0;
    const fetchFn = vi.fn(() => ok('[]'));
    const proxy = new OpenF1Proxy({
      tokens: fakeTokens(),
      fetchFn,
      now: () => now,
      cacheMs: 5000,
      maxPerMinute: 1000,
    });

    await Promise.all([proxy.get('laps', 'session_key=1'), proxy.get('laps', 'session_key=1')]);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    now = 4000;
    await proxy.get('laps', 'session_key=1');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    now = 6000;
    await proxy.get('laps', 'session_key=1');
    expect(fetchFn).toHaveBeenCalledTimes(2);

    await proxy.get('laps', 'session_key=2'); // different query: not shared
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('passes OpenF1 errors through without caching them, and drops a rejected token', async () => {
    const tokens = fakeTokens();
    const fetchFn = vi.fn(() => ok('{"detail":"Unauthorized"}', 401));
    const proxy = new OpenF1Proxy({ tokens, fetchFn, maxPerMinute: 1000 });

    expect((await proxy.get('laps', 'session_key=1')).status).toBe(401);
    expect(tokens.invalidate).toHaveBeenCalled();
    await proxy.get('laps', 'session_key=1');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('answers 502 when the token cannot be obtained or OpenF1 is down', async () => {
    const tokens = fakeTokens();
    tokens.getToken.mockRejectedValueOnce(new Error('token request failed (HTTP 401)'));
    const proxy = new OpenF1Proxy({ tokens, fetchFn: vi.fn(() => ok('[]')), maxPerMinute: 1000 });
    const bad = await proxy.get('laps', 'a=1');
    expect(bad.status).toBe(502);
    expect(bad.body).toContain('HTTP 401');

    const down = new OpenF1Proxy({
      tokens: fakeTokens(),
      fetchFn: vi.fn(() => Promise.reject(new Error('ECONNRESET'))),
      maxPerMinute: 1000,
    });
    expect((await down.get('laps', 'a=2')).status).toBe(502);
  });
});
