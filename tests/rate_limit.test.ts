import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

function makeReq(ip: string, apiKey?: string): Request {
  return {
    ip,
    headers: apiKey ? { 'x-api-key': apiKey } : {},
  } as unknown as Request;
}

function makeRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

async function freshMiddleware(maxRequests: number, windowMs: number) {
  process.env.RATE_LIMIT_MAX_REQUESTS = String(maxRequests);
  process.env.RATE_LIMIT_WINDOW_MS = String(windowMs);
  vi.resetModules();
  const mod = await import('../src/middleware/rate_limit');
  return mod.rateLimitMiddleware;
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the configured max, then blocks with 429', async () => {
    const middleware = await freshMiddleware(2, 60_000);
    const next = vi.fn() as NextFunction;

    middleware(makeReq('1.2.3.4'), makeRes(), next);
    middleware(makeReq('1.2.3.4'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const blockedRes = makeRes();
    middleware(makeReq('1.2.3.4'), blockedRes, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
  });

  it('gives independent quotas per API key rather than lumping every key behind one IP', async () => {
    // Safe to key by API key now that apiKeyMiddleware runs first on every route that uses
    // this and rejects anything not in the configured DAPP_API_KEYS set — see that
    // middleware's own tests for the "can't just send a fresh random key" coverage this
    // module used to need when keys weren't validated yet.
    const middleware = await freshMiddleware(1, 60_000);
    const next = vi.fn() as NextFunction;

    middleware(makeReq('5.6.7.8', 'key-one'), makeRes(), next);
    middleware(makeReq('5.6.7.8', 'key-two'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const blockedRes = makeRes();
    middleware(makeReq('5.6.7.8', 'key-one'), blockedRes, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(blockedRes.status).toHaveBeenCalledWith(429);
  });

  it('gives independent quotas to different IPs', async () => {
    const middleware = await freshMiddleware(1, 60_000);
    const next = vi.fn() as NextFunction;

    middleware(makeReq('10.0.0.1'), makeRes(), next);
    middleware(makeReq('10.0.0.2'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('resets the quota once the window has elapsed', async () => {
    vi.useFakeTimers();
    const middleware = await freshMiddleware(1, 1_000);
    const next = vi.fn() as NextFunction;

    middleware(makeReq('9.9.9.9'), makeRes(), next);
    const blockedRes = makeRes();
    middleware(makeReq('9.9.9.9'), blockedRes, next);
    expect(blockedRes.status).toHaveBeenCalledWith(429);

    vi.advanceTimersByTime(1_001);
    middleware(makeReq('9.9.9.9'), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
