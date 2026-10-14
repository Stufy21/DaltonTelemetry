import { TokenProvider } from './openf1-token';

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('TokenProvider', () => {
  it('requests a token with the credentials as a form post', async () => {
    const fetchFn = vi.fn(() => reply({ access_token: 'abc', expires_in: '3600' }));
    const tokens = new TokenProvider({ username: 'me@x.it', password: 'pw', fetchFn });

    expect(await tokens.getToken()).toBe('abc');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openf1.org/token');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toBe('username=me%40x.it&password=pw');
  });

  it('reuses a valid token and renews it shortly before expiry', async () => {
    let t = 0;
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => reply({ access_token: 'one', expires_in: '3600' }))
      .mockImplementationOnce(() => reply({ access_token: 'two', expires_in: '3600' }));
    const tokens = new TokenProvider({ username: 'u', password: 'p', fetchFn, now: () => t });

    expect(await tokens.getToken()).toBe('one');
    t = 30 * 60_000;
    expect(await tokens.getToken()).toBe('one');
    expect(tokens.renewInMs).toBe(25 * 60_000);
    t = 56 * 60_000; // inside the 5 minute renewal margin
    expect(await tokens.getToken()).toBe('two');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    const fetchFn = vi.fn(() => reply({ access_token: 'abc', expires_in: 3600 }));
    const tokens = new TokenProvider({ username: 'u', password: 'p', fetchFn });
    const results = await Promise.all([tokens.getToken(), tokens.getToken(), tokens.getToken()]);
    expect(results).toEqual(['abc', 'abc', 'abc']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fails clearly on bad credentials and can be invalidated', async () => {
    const bad = new TokenProvider({
      username: 'u',
      password: 'wrong',
      fetchFn: vi.fn(() => reply({ detail: 'nope' }, 401)),
    });
    await expect(bad.getToken()).rejects.toThrow('HTTP 401');

    const fetchFn = vi.fn(() => reply({ access_token: 'abc', expires_in: 3600 }));
    const tokens = new TokenProvider({ username: 'u', password: 'p', fetchFn });
    await tokens.getToken();
    tokens.invalidate();
    await tokens.getToken();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
