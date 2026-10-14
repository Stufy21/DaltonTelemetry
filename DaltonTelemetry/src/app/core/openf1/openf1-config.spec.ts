import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENF1_BASE_URL, resolveOpenF1BaseUrl } from './openf1-config';

describe('resolveOpenF1BaseUrl', () => {
  it('uses the public API when nothing is configured', () => {
    for (const raw of [undefined, null, '', '   ', 42]) {
      expect(resolveOpenF1BaseUrl(raw)).toEqual({ url: DEFAULT_OPENF1_BASE_URL, custom: false });
    }
  });

  it('appends /v1 to a server origin', () => {
    expect(resolveOpenF1BaseUrl('https://f1.example.com')).toEqual({
      url: 'https://f1.example.com/v1',
      custom: true,
    });
    expect(resolveOpenF1BaseUrl(' https://f1.example.com/ ').url).toBe('https://f1.example.com/v1');
  });

  it('keeps a /v1 that is already there and any path prefix', () => {
    expect(resolveOpenF1BaseUrl('https://f1.example.com/v1/').url).toBe(
      'https://f1.example.com/v1',
    );
    expect(resolveOpenF1BaseUrl('http://localhost:8000/openf1').url).toBe(
      'http://localhost:8000/openf1/v1',
    );
  });

  it('is not custom when it points at the public API', () => {
    expect(resolveOpenF1BaseUrl('https://api.openf1.org').custom).toBe(false);
  });

  it('ignores values that are not http(s) URLs', () => {
    for (const raw of ['not a url', 'ftp://f1.example.com', 'javascript:alert(1)']) {
      expect(resolveOpenF1BaseUrl(raw)).toEqual({ url: DEFAULT_OPENF1_BASE_URL, custom: false });
    }
  });
});
