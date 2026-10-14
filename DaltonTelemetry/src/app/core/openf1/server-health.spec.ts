import { describe, expect, it } from 'vitest';
import { isServerUnavailable, ServerHealth } from './server-health';

describe('isServerUnavailable', () => {
  it('treats network failures, gateway errors and timeouts as the server being down', () => {
    expect(isServerUnavailable({ status: 0 })).toBe(true);
    expect(isServerUnavailable({ status: 502 })).toBe(true);
    expect(isServerUnavailable({ status: 530 })).toBe(true);
    expect(isServerUnavailable({ name: 'TimeoutError' })).toBe(true);
  });

  it('treats replies about the query as a working server', () => {
    for (const status of [200, 400, 401, 404, 422, 429]) {
      expect(isServerUnavailable({ status })).toBe(false);
    }
  });

  it('ignores values that are not errors', () => {
    for (const value of [null, undefined, 'boom', 500]) {
      expect(isServerUnavailable(value)).toBe(false);
    }
  });
});

describe('ServerHealth', () => {
  it('starts healthy', () => {
    expect(new ServerHealth(1000).isDown(0)).toBe(false);
  });

  it('is down for the retry period after a failure, then lets a request through', () => {
    const health = new ServerHealth(1000);
    health.markDown(5000);
    expect(health.isDown(5000)).toBe(true);
    expect(health.isDown(5999)).toBe(true);
    expect(health.isDown(6000)).toBe(false);
  });

  it('is healthy again once a request succeeds', () => {
    const health = new ServerHealth(1000);
    health.markDown(0);
    health.markUp();
    expect(health.isDown(1)).toBe(false);
  });
});
