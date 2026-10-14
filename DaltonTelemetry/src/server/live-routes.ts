import { Router } from 'express';
import { LiveRelay } from './live-relay';
import { OpenF1Proxy } from './openf1-proxy';
import { TokenProvider } from './openf1-token';
import { connectMqtt, UpstreamConnector } from './upstream';

export interface LiveServices {
  relay: LiveRelay;
  proxy: OpenF1Proxy;
}

/**
 * Builds the live services from the environment, or null when no OpenF1 credentials are
 * configured (the app then falls back to the browser polling OpenF1's free historical API).
 */
export function createLiveServices(
  env: Record<string, string | undefined>,
  connect: UpstreamConnector = connectMqtt,
): LiveServices | null {
  const username = env['OPENF1_USERNAME'];
  const password = env['OPENF1_PASSWORD'];
  if (!username || !password) return null;

  const tokens = new TokenProvider({ username, password });
  return {
    relay: new LiveRelay({ tokens, username, connect }),
    proxy: new OpenF1Proxy({ tokens, maxPerMinute: Number(env['OPENF1_MAX_PER_MINUTE']) || 50 }),
  };
}

/** Routes: `/api/live/status`, `/api/live/stream` (SSE) and `/api/openf1/:endpoint` (REST proxy). */
export function createLiveRouter(services: LiveServices | null): Router {
  const router = Router();

  router.get('/api/live/status', (_req, res) => {
    res.json({
      enabled: !!services,
      state: services?.relay.state ?? 'off',
      error: services?.relay.error ?? null,
    });
  });

  router.get('/api/live/stream', (req, res) => {
    if (!services) {
      res.status(404).json({ error: 'Live relay is not configured' });
      return;
    }

    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // stop reverse proxies from buffering the stream
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const topics = typeof req.query['topics'] === 'string' ? req.query['topics'].split(',') : [];
    const remove = services.relay.addClient((chunk) => res.write(chunk), topics);
    req.on('close', remove);
  });

  router.get('/api/openf1/:endpoint', async (req, res) => {
    if (!services) {
      res.status(404).json({ error: 'Live relay is not configured' });
      return;
    }
    const query = req.originalUrl.split('?')[1] ?? '';
    const result = await services.proxy.get(req.params['endpoint'], query);
    res.status(result.status).type(result.contentType).send(result.body);
  });

  return router;
}
