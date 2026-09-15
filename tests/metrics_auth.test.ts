import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

function makeReq(opts: { authHeader?: string; headerKey?: string; queryKey?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.authHeader) {
    headers['authorization'] = opts.authHeader;
  }
  if (opts.headerKey) {
    headers['x-api-key'] = opts.headerKey;
  }
  return {
    headers,
    query: opts.queryKey ? { apiKey: opts.queryKey } : {},
  } as unknown as Request;
}

function makeRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

async function freshMiddleware(dappKeys: string, metricsToken: string) {
  process.env.DAPP_API_KEYS = dappKeys;
  process.env.METRICS_TOKEN = metricsToken;
  vi.resetModules();
  const mod = await import('../src/middleware/metrics_auth');
  return mod.metricsAuthMiddleware;
}

describe('metricsAuthMiddleware', () => {
  it('rejects with 401 when neither bearer token nor api key is provided', async () => {
    const middleware = await freshMiddleware('valid-app-key', 'secret-prom-token');
    const next = vi.fn() as NextFunction;
    const res = makeRes();

    middleware(makeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when an invalid bearer token is provided', async () => {
    const middleware = await freshMiddleware('valid-app-key', 'secret-prom-token');
    const next = vi.fn() as NextFunction;
    const res = makeRes();

    middleware(makeReq({ authHeader: 'Bearer wrong-token' }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts request when valid Bearer METRICS_TOKEN is provided', async () => {
    const middleware = await freshMiddleware('valid-app-key', 'secret-prom-token');
    const next = vi.fn() as NextFunction;
    const res = makeRes();

    middleware(makeReq({ authHeader: 'Bearer secret-prom-token' }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('accepts request when valid dapp API key is provided via X-API-Key header', async () => {
    const middleware = await freshMiddleware('valid-app-key', 'secret-prom-token');
    const next = vi.fn() as NextFunction;
    const res = makeRes();

    middleware(makeReq({ headerKey: 'valid-app-key' }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
